import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { DrawingSet } from "../types.js";
import type { Markup } from "./markup.js";

export type BBox = [number, number, number, number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where to look for the PDF a JSON-LD file came from: an explicit path, `plans.pdf` next to
 * `plans.jsonld` (what `aecdo process` writes), or the set's `filename` next to the JSON-LD or
 * in the current folder.
 */
export function sourcePdfCandidates(jsonldPath: string, data: DrawingSet, explicit?: string, cwd = process.cwd()): string[] {
  if (explicit) return [resolve(cwd, explicit)];
  const out: string[] = [];
  const isFile = !jsonldPath.startsWith("job:");
  if (isFile) {
    const stem = join(dirname(jsonldPath), basename(jsonldPath, extname(jsonldPath)));
    out.push(`${stem}.pdf`, `${stem}.PDF`);
  }
  if (data.filename) {
    const name = basename(data.filename);
    if (isFile) out.push(join(dirname(jsonldPath), name));
    out.push(resolve(cwd, name));
  }
  return [...new Set(out)];
}

export function findSourcePdf(candidates: string[], exists: (p: string) => boolean = existsSync): string | undefined {
  return candidates.find((p) => exists(p));
}

/**
 * Converts a bbox measured in PDF points from the top-left of the page as displayed (crop box,
 * after /Rotate) into the page's own user-space rectangle, which is what drawing operators use.
 */
export function bboxToUserSpace(bbox: BBox, page: Box, rotation: number): Box {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const { x, y, width: w, height: h } = page;
  const map = (u: number, v: number): [number, number] => {
    switch (r) {
      case 90:
        return [x + v, y + u];
      case 180:
        return [x + w - u, y + v];
      case 270:
        return [x + w - v, y + h - u];
      default:
        return [x + u, y + h - v];
    }
  };
  const [ax, ay] = map(bbox[0], bbox[1]);
  const [bx, by] = map(bbox[2], bbox[3]);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Size of the page as displayed, in points. */
export function displaySize(page: Box, rotation: number): { width: number; height: number } {
  const turned = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return turned ? { width: page.height, height: page.width } : { width: page.width, height: page.height };
}

export function bboxFitsPage(bbox: BBox, size: { width: number; height: number }, slack = 1): boolean {
  return bbox[0] >= -slack && bbox[1] >= -slack && bbox[2] <= size.width + slack && bbox[3] <= size.height + slack;
}

export function unionBBox(boxes: (BBox | undefined)[]): BBox | undefined {
  const present = boxes.filter((b): b is BBox => Array.isArray(b) && b.length === 4);
  if (present.length === 0) return undefined;
  return [
    Math.min(...present.map((b) => b[0])),
    Math.min(...present.map((b) => b[1])),
    Math.max(...present.map((b) => b[2])),
    Math.max(...present.map((b) => b[3])),
  ];
}

export interface PageViewRequest {
  pdfPath: string;
  pageIndex: number;
  bbox?: BBox;
  /** File name stem for the output, e.g. the sheet number. */
  name: string;
  outDir?: string;
  /** Unsaved markups to draw on the page, so they can be checked before saving. */
  markups?: Markup[];
}

export interface PageViewResult {
  /** The file to open: a PNG when a rasterizer is installed, otherwise a one-page PDF. */
  path: string;
  pdfPath: string;
  pngPath?: string;
  pageCount: number;
  /** Set when the bbox falls outside the page, which usually means it is in other units. */
  outsidePage?: { width: number; height: number };
}

export function defaultViewDir(): string {
  return join(tmpdir(), "aecdo-view");
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "page";
}

/** Copies one page into a new PDF, outlines `bbox` in red, and rasterizes it when it can. */
export async function renderPageView(req: PageViewRequest): Promise<PageViewResult> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const src = await PDFDocument.load(await readFile(req.pdfPath), { ignoreEncryption: true, updateMetadata: false });
  const pageCount = src.getPageCount();
  if (req.pageIndex < 0 || req.pageIndex >= pageCount) {
    throw new Error(`Page index ${req.pageIndex} is out of range; ${basename(req.pdfPath)} has ${pageCount} page${pageCount === 1 ? "" : "s"}.`);
  }

  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [req.pageIndex]);
  out.addPage(page);

  let outsidePage: PageViewResult["outsidePage"];
  if (req.bbox) {
    const crop = page.getCropBox();
    const rotation = page.getRotation().angle;
    const size = displaySize(crop, rotation);
    if (!bboxFitsPage(req.bbox, size)) outsidePage = size;
    const rect = bboxToUserSpace(req.bbox, crop, rotation);
    const stroke = Math.max(1.5, Math.min(size.width, size.height) / 300);
    page.drawRectangle({
      ...rect,
      borderColor: rgb(0.9, 0, 0),
      borderWidth: stroke,
      color: rgb(1, 0, 0),
      opacity: 0.08,
      borderOpacity: 1,
    });
  }

  if (req.markups?.length) {
    const lib = await import("pdf-lib");
    const { addMarkupAnnotation } = await import("./markup.js");
    const font = await out.embedFont(lib.StandardFonts.Helvetica);
    for (const m of req.markups) addMarkupAnnotation(lib, out, page, m, font);
  }

  const outDir = req.outDir ?? defaultViewDir();
  await mkdir(outDir, { recursive: true });
  const stem = join(outDir, safeName(req.bbox ? `${req.name}-${req.bbox.map((n) => Math.round(n)).join("_")}` : req.name));
  const pdfPath = `${stem}.pdf`;
  await writeFile(pdfPath, await out.save());

  const longSide = Math.max(page.getWidth(), page.getHeight());
  const pngPath = rasterize(pdfPath, stem, rasterDpi(longSide));
  return { path: pngPath ?? pdfPath, pdfPath, pngPath, pageCount, outsidePage };
}

const MAX_RASTER_PIXELS = 4000;

/** Keeps the long side of the image near 4000 px so big sheets stay sharp but open quickly. */
export function rasterDpi(longSidePoints: number): number {
  return Math.max(36, Math.min(200, Math.floor((MAX_RASTER_PIXELS * 72) / longSidePoints)));
}

// Poppler or MuPDF, if installed. The one-page PDF is the fallback, so a missing tool is fine.
function rasterize(pdfPath: string, stem: string, dpi: number): string | undefined {
  const png = `${stem}.png`;
  rmSync(png, { force: true });
  const attempts: [string, string[]][] = [
    ["pdftoppm", ["-png", "-r", String(dpi), "-singlefile", pdfPath, stem]],
    ["mutool", ["draw", "-q", "-r", String(dpi), "-o", png, pdfPath, "1"]],
  ];
  for (const [cmd, args] of attempts) {
    const result = spawnSync(cmd, args, { stdio: "ignore", timeout: 60_000 });
    if (result.status === 0 && existsSync(png)) return png;
  }
  return undefined;
}
