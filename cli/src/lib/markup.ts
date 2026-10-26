import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { PDFArray, PDFDocument, PDFFont, PDFPage, PDFRef, PDFDict, PDFContext } from "pdf-lib";
import { bboxToUserSpace, displaySize, type BBox, type Box } from "./page-view.js";

type PdfLib = typeof import("pdf-lib");

export const MARKUP_KINDS = ["cloud", "callout", "note"] as const;
export type MarkupKind = (typeof MARKUP_KINDS)[number];

/** A markup to add to the PDF. Coordinates are like bbox: PDF points from the top-left of the page as displayed. */
export interface Markup {
  id: string;
  kind: MarkupKind;
  pageIndex: number;
  sheetNumber: string;
  /** What the markup is about: the cloud's outline, the callout's target, or where the note is pinned. */
  bbox: BBox;
  text: string;
  /** Human-readable target, e.g. "item Door 209B". */
  label?: string;
  /** The AECDO `@id` of the target, stored in the annotation so it can be traced back. */
  itemId?: string;
  /** Where the callout's text box or the note's icon goes (top-left corner); placed automatically when absent. */
  at?: [number, number];
}

export interface SavedMarkup {
  pageIndex: number;
  kind: MarkupKind | "other";
  text: string;
  name: string;
  itemId?: string;
}

export const MARKUP_AUTHOR = "aecdo assistant";
export const MARKUP_NAME_PREFIX = "aecdo-";
const ITEM_KEY = "AECDO_Item";
const SUBJECTS: Record<MarkupKind, string> = { cloud: "Cloud", callout: "Callout", note: "Note" };

export function newMarkupId(): string {
  return `${MARKUP_NAME_PREFIX}${randomUUID()}`;
}

/** `plans.pdf` → `plans-markups.pdf`, next to it. */
export function markupCopyPath(pdfPath: string): string {
  const ext = extname(pdfPath) || ".pdf";
  return join(dirname(pdfPath), `${basename(pdfPath, extname(pdfPath))}-markups${ext}`);
}

type Matrix = [number, number, number, number, number, number];

/**
 * Maps "display-up" coordinates (x right, y up, from the bottom-left of the page as displayed) into
 * the page's user space. Drawing appearances in display-up space keeps text upright on rotated sheets.
 */
export function displayUpToUser(crop: Box, rotation: number): Matrix {
  const { x, y, width: w, height: h } = crop;
  switch (normalizeRotation(rotation)) {
    case 90:
      return [0, 1, -1, 0, x + w, y];
    case 180:
      return [-1, 0, 0, -1, x + w, y + h];
    case 270:
      return [0, -1, 1, 0, x, y + h];
    default:
      return [1, 0, 0, 1, x, y];
  }
}

function normalizeRotation(rotation: number): number {
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

function apply(m: Matrix, px: number, py: number): [number, number] {
  return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** How far each scallop bulges out, as a fraction of its width. */
const CLOUD_BULGE = 0.35;

/** A scalloped outline around a rectangle, as path operators, arcs bulging outward. */
export function cloudPath(x0: number, y0: number, x1: number, y1: number, arc: number): string {
  const pts: [number, number][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / arc));
    for (let i = 0; i < count; i++) pts.push([ax + ((bx - ax) * i) / count, ay + ((by - ay) * i) / count]);
  };
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x1, y1, x0, y1);
  edge(x0, y1, x0, y0);
  pts.push(pts[0]);
  const ops = [`${n(pts[0][0])} ${n(pts[0][1])} m`];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    // Counter-clockwise path, so (dy, -dx) points outward. Both handles lean out to make a round bump.
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ox = ((by - ay) / len) * len * CLOUD_BULGE * (4 / 3);
    const oy = (-(bx - ax) / len) * len * CLOUD_BULGE * (4 / 3);
    ops.push(`${n(ax + ox)} ${n(ay + oy)} ${n(bx + ox)} ${n(by + oy)} ${n(bx)} ${n(by)} c`);
  }
  return ops.join("\n");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

interface PageGeometry {
  crop: Box;
  rotation: number;
  width: number;
  height: number;
  /** Shorter side of the page, used to size markups so they look the same on letter and ARCH E. */
  scale: number;
  toUser: Matrix;
}

function geometry(page: PDFPage): PageGeometry {
  const crop = page.getCropBox();
  const rotation = normalizeRotation(page.getRotation().angle);
  const { width, height } = displaySize(crop, rotation);
  return { crop, rotation, width, height, scale: Math.min(width, height), toUser: displayUpToUser(crop, rotation) };
}

/** Display box (top-left, y down) → annotation /Rect in user space. */
function userRect(g: PageGeometry, b: BBox): [number, number, number, number] {
  const r = bboxToUserSpace(b, g.crop, g.rotation);
  return [r.x, r.y, r.x + r.width, r.y + r.height];
}

function pad(b: BBox, by: number): BBox {
  return [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Standard 14 fonts only cover WinAnsi; anything else becomes "?" rather than failing the save. */
function encodable(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

interface Built {
  dict: Record<string, unknown>;
  ap: string;
  rect: [number, number, number, number];
  /** Values that must be PDF strings; ctx.obj would turn plain strings into names. */
  strings?: Record<string, string>;
  fonts?: boolean;
  /** The appearance is already in user space rather than display-up space. */
  userSpace?: boolean;
}

function buildCloud(g: PageGeometry, m: Markup): Built {
  const stroke = Math.max(1.5, g.scale / 600);
  const arc = clamp(g.scale / 45, 10, 48);
  const outline = pad(m.bbox, arc * 0.25 + stroke);
  const [x0, v0, x1, v1] = outline;
  const y0 = g.height - v1;
  const y1 = g.height - v0;
  const rect = userRect(g, pad(outline, arc * CLOUD_BULGE + stroke + 1));
  const corners = [apply(g.toUser, x0, y0), apply(g.toUser, x1, y0), apply(g.toUser, x1, y1), apply(g.toUser, x0, y1)].flat();
  return {
    rect,
    dict: { Subtype: "Polygon", Vertices: corners, BE: { S: "C", I: 1 }, IT: "PolygonCloud", C: [1, 0, 0], BS: { W: stroke, S: "S" } },
    ap: `1 0 0 RG ${n(stroke)} w 1 J 1 j\n${cloudPath(x0, y0, x1, y1, arc)}\nS`,
  };
}

function buildNote(g: PageGeometry, m: Markup): Built {
  const size = clamp(g.scale / 70, 16, 36);
  const [left, top] = m.at ?? [m.bbox[2], m.bbox[1] - size];
  const v = clamp(top, 0, g.height - size);
  // Viewers draw note icons upright from the top-left corner of /Rect (NoRotate), so the icon is
  // drawn in plain user space with that corner on the spot it should mark.
  const [x, top0] = apply(g.toUser, clamp(left, 0, g.width - size), g.height - v);
  const y = top0 - size;
  const line = (f: number) => `${n(x + size * 0.2)} ${n(y + size * f)} m ${n(x + size * 0.8)} ${n(y + size * f)} l`;
  return {
    rect: [x, y, x + size, top0],
    userSpace: true,
    dict: { Subtype: "Text", Name: "Comment", Open: false, C: [1, 0.82, 0], F: 28 },
    ap: [
      `1 0.82 0 rg 0.35 0.25 0 RG ${n(size / 24)} w`,
      `${n(x + 0.5)} ${n(y + 0.5)} ${n(size - 1)} ${n(size - 1)} re B`,
      `${n(size / 16)} w ${line(0.7)} ${line(0.5)} ${line(0.3)} S`,
    ].join("\n"),
  };
}

function buildCallout(g: PageGeometry, m: Markup, font: PDFFont): Built {
  const size = Math.round(clamp(g.scale / 120, 8, 24));
  const inset = size * 0.4;
  const leading = size * 1.2;
  const stroke = Math.max(1, g.scale / 900);
  const lines = wrap(encodable(font, m.text), font, size, size * 24);
  const w = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size))) + inset * 2;
  const h = lines.length * leading + inset * 2;
  const gap = size * 3;
  const [bx0, bv0, bx1, bv1] = m.bbox;

  let left: number;
  let top: number;
  if (m.at) {
    [left, top] = m.at;
  } else {
    left = bx1 + gap + w <= g.width ? bx1 + gap : bx0 - gap - w;
    top = bv0 - gap - h >= 0 ? bv0 - gap - h : bv1 + gap;
  }
  left = clamp(left, 0, g.width - w);
  top = clamp(top, 0, g.height - h);
  const box: BBox = [left, top, left + w, top + h];

  // Leader from the nearest point of the target to the nearest point of the text box.
  const cx = (box[0] + box[2]) / 2;
  const cv = (box[1] + box[3]) / 2;
  const tip: [number, number] = [clamp(cx, bx0, bx1), clamp(cv, bv0, bv1)];
  const end: [number, number] = [clamp(tip[0], box[0], box[2]), clamp(tip[1], box[1], box[3])];
  const up = (p: [number, number]): [number, number] => [p[0], g.height - p[1]];
  const [tx, ty] = up(tip);
  const [ex, ey] = up(end);
  const hasLeader = Math.hypot(ex - tx, ey - ty) > 1;

  const ops = [`1 1 1 rg 1 0 0 RG ${n(stroke)} w`, `${n(box[0])} ${n(g.height - box[3])} ${n(w)} ${n(h)} re B`];
  if (hasLeader) {
    const len = Math.hypot(ex - tx, ey - ty);
    const ux = (ex - tx) / len;
    const uy = (ey - ty) / len;
    const head = size * 0.8;
    const side = (s: number): string => `${n(tx + head * (ux * 0.87 - uy * 0.5 * s))} ${n(ty + head * (uy * 0.87 + ux * 0.5 * s))}`;
    ops.push(`${n(tx)} ${n(ty)} m ${n(ex)} ${n(ey)} l S`, `${side(1)} m ${n(tx)} ${n(ty)} l ${side(-1)} l S`);
  }
  ops.push("BT 0 0 0 rg", `/Helv ${size} Tf ${n(leading)} TL`, `${n(box[0] + inset)} ${n(g.height - box[1] - inset - size)} Td`);
  lines.forEach((l, i) => ops.push(`${i ? "T* " : ""}${font.encodeText(l).toString()} Tj`));
  ops.push("ET");

  const span = [Math.min(box[0], tip[0]), Math.min(box[1], tip[1]), Math.max(box[2], tip[0]), Math.max(box[3], tip[1])] as BBox;
  const rect = userRect(g, pad(span, size));
  const inner = userRect(g, box);
  const line = hasLeader ? [...apply(g.toUser, tx, ty), ...apply(g.toUser, ex, ey)] : undefined;
  return {
    rect,
    fonts: true,
    strings: { DA: `0 0 0 rg /Helv ${size} Tf`, DS: `font: Helvetica ${size}pt; color: #000000` },
    dict: {
      Subtype: "FreeText",
      IT: "FreeTextCallout",
      Q: 0,
      ...(line ? { CL: line, LE: "OpenArrow" } : {}),
      RD: [inner[0] - rect[0], inner[1] - rect[1], rect[2] - inner[2], rect[3] - inner[3]],
      BS: { W: stroke, S: "S" },
      ...(g.rotation ? { Rotate: g.rotation } : {}),
    },
    ap: ops.join("\n"),
  };
}

/** Adds one markup to `page` as a PDF annotation with its own appearance, returning the annotation's ref. */
export function addMarkupAnnotation(lib: PdfLib, doc: PDFDocument, page: PDFPage, markup: Markup, font: PDFFont, now = new Date()): PDFRef {
  const { PDFName, PDFString, PDFHexString, PDFArray } = lib;
  const ctx = doc.context;
  const g = geometry(page);
  const built =
    markup.kind === "cloud" ? buildCloud(g, markup) : markup.kind === "note" ? buildNote(g, markup) : buildCallout(g, markup, font);

  const m = g.toUser;
  const ap = ctx.flateStream(built.userSpace ? built.ap : `q ${m.map(n).join(" ")} cm\n${built.ap}\nQ`, {
    Type: "XObject",
    Subtype: "Form",
    BBox: built.rect,
    ...(built.fonts ? { Resources: { Font: { Helv: font.ref } } } : {}),
  });
  const date = PDFString.fromDate(now);
  const dict = ctx.obj({
    Type: "Annot",
    Rect: built.rect,
    F: 4,
    ...built.dict,
  });
  dict.set(PDFName.of("T"), PDFHexString.fromText(MARKUP_AUTHOR));
  dict.set(PDFName.of("Subj"), PDFHexString.fromText(SUBJECTS[markup.kind]));
  dict.set(PDFName.of("Contents"), PDFHexString.fromText(markup.text));
  dict.set(PDFName.of("NM"), PDFString.of(markup.id));
  dict.set(PDFName.of("M"), date);
  dict.set(PDFName.of("CreationDate"), date);
  dict.set(PDFName.of("P"), page.ref);
  dict.set(PDFName.of("AP"), ctx.obj({ N: ctx.register(ap) }));
  for (const [key, value] of Object.entries(built.strings ?? {})) dict.set(PDFName.of(key), PDFString.of(value));
  if (markup.itemId) dict.set(PDFName.of(ITEM_KEY), PDFString.of(markup.itemId));
  const ref = ctx.register(dict);

  let annots = page.node.lookup(PDFName.of("Annots"));
  if (!(annots instanceof PDFArray)) {
    annots = ctx.obj([]);
    page.node.set(PDFName.of("Annots"), annots);
  }
  (annots as PDFArray).push(ref);
  return ref;
}

/** Page size as displayed, in points, so tools can check a bbox before saving. */
export async function pdfPageSizes(pdfPath: string): Promise<{ width: number; height: number }[]> {
  const doc = await loadPdf(await import("pdf-lib"), await readFile(pdfPath), pdfPath);
  return doc.getPages().map((p) => {
    const g = geometry(p);
    return { width: g.width, height: g.height };
  });
}

async function loadPdf(lib: PdfLib, bytes: Uint8Array, path: string): Promise<PDFDocument> {
  try {
    return await lib.PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof lib.EncryptedPDFError) {
      throw new Error(`${basename(path)} is encrypted or password-protected, so aecdo can't add markups to it.`);
    }
    throw err;
  }
}

interface Tail {
  startxref: number;
  xrefStream: boolean;
  size: number;
}

const latin1 = (bytes: Uint8Array, from = 0, to = bytes.length) => Buffer.from(bytes.buffer, bytes.byteOffset + from, to - from).toString("latin1");

function readTail(bytes: Uint8Array): Tail {
  const tail = latin1(bytes, Math.max(0, bytes.length - 2048));
  const at = tail.lastIndexOf("startxref");
  const m = at >= 0 ? /startxref\s+(\d+)/.exec(tail.slice(at)) : null;
  if (!m) throw new Error("the PDF has no startxref, so it can't be updated in place");
  const startxref = Number(m[1]);
  if (startxref >= bytes.length) throw new Error("the PDF's startxref points past the end of the file");
  const section = latin1(bytes, startxref);
  const xrefStream = !/^\s*xref\b/.test(section.slice(0, 32));
  const size = /\/Size\s+(\d+)/.exec(section);
  if (!size) throw new Error("couldn't read the PDF's trailer");
  return { startxref, xrefStream, size: Number(size[1]) };
}

/** Prepares a loaded document for an incremental update: new objects must not reuse numbers held by object streams. */
function reserveObjectNumbers(ctx: PDFContext, tail: Tail): number {
  ctx.largestObjectNumber = Math.max(ctx.largestObjectNumber, tail.size - 1);
  return ctx.largestObjectNumber + 1;
}

function runs(nums: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const num of nums) {
    const last = out.at(-1);
    if (last && last[0] + last[1] === num) last[1]++;
    else out.push([num, 1]);
  }
  return out;
}

function objectBytes(obj: { sizeInBytes(): number; copyBytesInto(b: Uint8Array, o: number): number }): Uint8Array {
  const buf = new Uint8Array(obj.sizeInBytes());
  obj.copyBytesInto(buf, 0);
  return buf;
}

/**
 * Appends changed and new objects to the original bytes as a PDF incremental update, leaving every
 * original byte (and so any digital signature) as it was.
 */
export function incrementalUpdate(lib: PdfLib, original: Uint8Array, doc: PDFDocument, tail: Tail, firstNew: number, changed: PDFRef[]): Uint8Array {
  const ctx = doc.context;
  const touched = new Set(changed.map((r) => r.objectNumber));
  const objects = ctx
    .enumerateIndirectObjects()
    .filter(([ref]) => ref.objectNumber >= firstNew || touched.has(ref.objectNumber))
    .sort(([a], [b]) => a.objectNumber - b.objectNumber);

  const chunks: Uint8Array[] = [];
  const last = original[original.length - 1];
  let offset = original.length;
  if (last !== 0x0a && last !== 0x0d) {
    chunks.push(Buffer.from("\n"));
    offset++;
  }
  const entries: { num: number; gen: number; offset: number }[] = [];
  for (const [ref, obj] of objects) {
    const chunk = Buffer.concat([Buffer.from(`${ref.objectNumber} ${ref.generationNumber} obj\n`), objectBytes(obj), Buffer.from("\nendobj\n")]);
    entries.push({ num: ref.objectNumber, gen: ref.generationNumber, offset });
    chunks.push(chunk);
    offset += chunk.length;
  }

  const { Root, Info, ID } = ctx.trailerInfo;
  if (!Root) throw new Error("the PDF has no document catalog");
  if (tail.xrefStream) {
    const xrefNum = ctx.largestObjectNumber + 1;
    entries.push({ num: xrefNum, gen: 0, offset });
    const rows = new Uint8Array(entries.length * 7);
    entries.forEach((e, i) => {
      rows.set([1, (e.offset >>> 24) & 255, (e.offset >>> 16) & 255, (e.offset >>> 8) & 255, e.offset & 255, (e.gen >> 8) & 255, e.gen & 255], i * 7);
    });
    const stream = ctx.flateStream(rows, {
      Type: "XRef",
      Size: xrefNum + 1,
      W: [1, 4, 2],
      Index: runs(entries.map((e) => e.num)).flat(),
      Prev: tail.startxref,
    });
    stream.dict.set(lib.PDFName.of("Root"), Root);
    if (Info) stream.dict.set(lib.PDFName.of("Info"), Info);
    if (ID) stream.dict.set(lib.PDFName.of("ID"), ID);
    chunks.push(Buffer.concat([Buffer.from(`${xrefNum} 0 obj\n`), objectBytes(stream), Buffer.from(`\nendobj\nstartxref\n${offset}\n%%EOF\n`)]));
  } else {
    const byNum = new Map(entries.map((e) => [e.num, e]));
    let xref = "xref\n";
    for (const [start, count] of runs(entries.map((e) => e.num))) {
      xref += `${start} ${count}\n`;
      for (let num = start; num < start + count; num++) {
        const e = byNum.get(num)!;
        xref += `${String(e.offset).padStart(10, "0")} ${String(e.gen).padStart(5, "0")} n\r\n`;
      }
    }
    const trailer = ctx.obj({ Size: ctx.largestObjectNumber + 1, Prev: tail.startxref });
    trailer.set(lib.PDFName.of("Root"), Root);
    if (Info) trailer.set(lib.PDFName.of("Info"), Info);
    if (ID) trailer.set(lib.PDFName.of("ID"), ID);
    chunks.push(Buffer.concat([Buffer.from(xref + "trailer\n"), objectBytes(trailer), Buffer.from(`\nstartxref\n${offset}\n%%EOF\n`)]));
  }
  return Buffer.concat([original, ...chunks]);
}

/** Records how to undo one save. */
export interface SaveRecord {
  path: string;
  count: number;
  /** Size before the save; undefined when the save created the file. */
  sizeBefore?: number;
  sizeAfter: number;
  sha256: string;
  /** True when the update was written as a full rewrite because the incremental one didn't load back. */
  rewritten?: boolean;
}

export interface SaveOptions {
  /** The PDF to start from when `outPath` doesn't exist yet. */
  sourcePdf: string;
  outPath: string;
  markups: Markup[];
  now?: Date;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Writes to a temp file and renames it over the target, so a failure never leaves a half-written PDF. */
async function replaceFile(path: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${path}.aecdo-tmp`;
  await writeFile(tmp, bytes);
  try {
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new Error(`${basename(path)} is open in another program or read-only. Close it (e.g. in Bluebeam or Acrobat) and try again.`);
    }
    throw err;
  }
}

async function update(path: string, base: Uint8Array, edit: (lib: PdfLib, doc: PDFDocument) => PDFRef[] | Promise<PDFRef[]>, allowRewrite: boolean): Promise<{ bytes: Uint8Array; rewritten: boolean }> {
  const lib = await import("pdf-lib");
  const doc = await loadPdf(lib, base, path);
  const tail = readTail(base);
  const firstNew = reserveObjectNumbers(doc.context, tail);
  const changed = await edit(lib, doc);
  const bytes = incrementalUpdate(lib, base, doc, tail, firstNew, changed);
  try {
    const check = await lib.PDFDocument.load(bytes, { updateMetadata: false });
    if (check.getPageCount() !== doc.getPageCount()) throw new Error("page count changed");
    if (changed.some((ref) => !check.context.lookup(ref))) throw new Error("an updated object is missing");
    return { bytes, rewritten: false };
  } catch (err) {
    if (!allowRewrite) throw new Error(`couldn't append to this PDF's structure (${(err as Error).message})`);
    return { bytes: await doc.save({ useObjectStreams: false }), rewritten: true };
  }
}

function annotsRef(lib: PdfLib, page: PDFPage): PDFRef {
  const raw = page.node.get(lib.PDFName.of("Annots"));
  return raw instanceof lib.PDFRef ? raw : page.ref;
}

/**
 * Adds markups to `outPath`, starting from `sourcePdf` when it doesn't exist yet. The original bytes are
 * kept and the markups appended as an incremental update.
 */
export async function saveMarkups(opts: SaveOptions): Promise<SaveRecord> {
  if (opts.markups.length === 0) throw new Error("There are no markups to save.");
  const exists = existsSync(opts.outPath);
  const base = await readFile(exists ? opts.outPath : opts.sourcePdf);
  const inPlace = exists || opts.outPath === opts.sourcePdf;
  const { bytes, rewritten } = await update(
    opts.outPath,
    base,
    async (lib, doc) => {
      const pages = doc.getPages();
      const font = await doc.embedFont(lib.StandardFonts.Helvetica);
      await font.embed();
      const changed: PDFRef[] = [];
      for (const markup of opts.markups) {
        const page = pages[markup.pageIndex];
        if (!page) throw new Error(`Page index ${markup.pageIndex} is out of range; the PDF has ${pages.length} pages.`);
        const before = annotsRef(lib, page);
        addMarkupAnnotation(lib, doc, page, markup, font, opts.now);
        changed.push(before, annotsRef(lib, page));
      }
      return changed;
    },
    !inPlace
  );
  await replaceFile(opts.outPath, bytes);
  return {
    path: opts.outPath,
    count: opts.markups.length,
    sizeBefore: exists ? base.length : undefined,
    sizeAfter: bytes.length,
    sha256: sha256(bytes),
    rewritten,
  };
}

/** Takes back a save if the file is still exactly what it wrote. */
export async function undoSave(record: SaveRecord): Promise<void> {
  if (!existsSync(record.path)) throw new Error(`${basename(record.path)} no longer exists.`);
  const bytes = await readFile(record.path);
  if (bytes.length !== record.sizeAfter || sha256(bytes) !== record.sha256) {
    throw new Error(`${basename(record.path)} has changed since the markups were saved (maybe edited in Bluebeam or Acrobat). Use "markups remove" to take out aecdo's markups instead.`);
  }
  if (record.sizeBefore === undefined) {
    await rm(record.path);
    return;
  }
  if (record.rewritten) throw new Error("This save rewrote the file, so it can't be undone exactly. Use \"markups remove\".");
  await replaceFile(record.path, bytes.subarray(0, record.sizeBefore));
}

function annotName(lib: PdfLib, dict: PDFDict): string | undefined {
  const nm = dict.lookup(lib.PDFName.of("NM"));
  return nm instanceof lib.PDFString || nm instanceof lib.PDFHexString ? nm.decodeText() : undefined;
}

function annotText(lib: PdfLib, dict: PDFDict, key: string): string | undefined {
  const v = dict.lookup(lib.PDFName.of(key));
  return v instanceof lib.PDFString || v instanceof lib.PDFHexString ? v.decodeText() : undefined;
}

const KIND_BY_SUBTYPE: Record<string, MarkupKind> = { Polygon: "cloud", FreeText: "callout", Text: "note" };

/** The markups aecdo saved into a PDF earlier (matched by their `aecdo-` name). */
export async function listSavedMarkups(pdfPath: string): Promise<SavedMarkup[]> {
  const lib = await import("pdf-lib");
  const doc = await loadPdf(lib, await readFile(pdfPath), pdfPath);
  const out: SavedMarkup[] = [];
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookup(lib.PDFName.of("Annots"));
    if (!(annots instanceof lib.PDFArray)) return;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i);
      if (!(dict instanceof lib.PDFDict)) continue;
      const name = annotName(lib, dict);
      if (!name?.startsWith(MARKUP_NAME_PREFIX)) continue;
      const subtype = dict.lookup(lib.PDFName.of("Subtype"));
      const kind = subtype instanceof lib.PDFName ? KIND_BY_SUBTYPE[subtype.decodeText()] : undefined;
      out.push({ pageIndex, kind: kind ?? "other", text: annotText(lib, dict, "Contents") ?? "", name, itemId: annotText(lib, dict, ITEM_KEY) });
    }
  });
  return out;
}

/**
 * Removes every markup aecdo added (and replies people attached to them), leaving everyone else's.
 * Written as an incremental update, like a save.
 */
export async function removeSavedMarkups(pdfPath: string): Promise<{ removed: number; record?: SaveRecord }> {
  const base = await readFile(pdfPath);
  let removed = 0;
  const { bytes, rewritten } = await update(
    pdfPath,
    base,
    (lib, doc) => {
      const changed: PDFRef[] = [];
      for (const page of doc.getPages()) {
        const annots = page.node.lookup(lib.PDFName.of("Annots"));
        if (!(annots instanceof lib.PDFArray)) continue;
        const ours = new Set<string>();
        const entries = annots.asArray().map((raw, i) => ({ raw, dict: annots.lookup(i) }));
        for (const { raw, dict } of entries) {
          if (dict instanceof lib.PDFDict && annotName(lib, dict)?.startsWith(MARKUP_NAME_PREFIX) && raw instanceof lib.PDFRef) ours.add(raw.tag);
        }
        if (ours.size === 0) continue;
        const keep = entries.filter(({ raw, dict }) => {
          if (raw instanceof lib.PDFRef && ours.has(raw.tag)) return false;
          if (!(dict instanceof lib.PDFDict)) return true;
          const parent = dict.get(lib.PDFName.of("IRT")) ?? dict.get(lib.PDFName.of("Parent"));
          return !(parent instanceof lib.PDFRef && ours.has(parent.tag));
        });
        removed += entries.length - keep.length;
        const ref = annotsRef(lib, page);
        const next = doc.context.obj(keep.map((e) => e.raw));
        if (ref === page.ref) page.node.set(lib.PDFName.of("Annots"), next);
        else doc.context.assign(ref, next);
        changed.push(ref);
      }
      return changed;
    },
    false
  );
  if (removed === 0) return { removed };
  await replaceFile(pdfPath, bytes);
  return { removed, record: { path: pdfPath, count: removed, sizeBefore: base.length, sizeAfter: bytes.length, sha256: sha256(bytes), rewritten } };
}
