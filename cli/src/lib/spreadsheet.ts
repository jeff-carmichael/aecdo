import { readFile, writeFile, readdir } from "node:fs/promises";
import { extname } from "node:path";
import { readZip, writeZip, type ZipEntry } from "./zip.js";

export type CellValue = string | number | boolean | null;

export interface CellUpdate {
  ref: string;
  value: CellValue;
}

export interface SheetData {
  /** Every sheet (tab) in the file. CSV/TSV files have one, named after the format. */
  sheets: string[];
  sheet: string;
  rows: CellValue[][];
}

export const SPREADSHEET_EXTENSIONS = [".xlsx", ".csv", ".tsv"];

export function isSpreadsheet(path: string): boolean {
  return SPREADSHEET_EXTENSIONS.includes(extname(path).toLowerCase());
}

export async function listSpreadsheets(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && isSpreadsheet(e.name) && !e.name.startsWith("~$"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function readSpreadsheet(path: string, sheet?: string): Promise<SheetData> {
  if (isXlsx(path)) return Workbook.parse(await readFile(path)).read(sheet);
  const text = await readFile(path, "utf-8");
  const name = delimitedName(path);
  if (sheet && sheet !== name) throw new Error(`${name.toUpperCase()} files have a single sheet`);
  return { sheets: [name], sheet: name, rows: parseDelimited(stripBom(text), delimiterFor(path)) };
}

export async function writeCells(path: string, updates: CellUpdate[], sheet?: string): Promise<void> {
  if (isXlsx(path)) {
    const wb = Workbook.parse(await readFile(path));
    wb.setCells(updates, sheet);
    await writeFile(path, wb.toBuffer());
    return;
  }
  await editDelimited(path, (rows) => {
    for (const { ref, value } of updates) {
      const { row, col } = parseRef(ref);
      while (rows.length <= row) rows.push([]);
      const target = rows[row];
      while (target.length <= col) target.push("");
      target[col] = value;
    }
  });
}

/** Appends rows after the last non-empty row and returns the 1-based number of the first new row. */
export async function appendRows(path: string, rows: CellValue[][], sheet?: string): Promise<number> {
  if (isXlsx(path)) {
    const wb = Workbook.parse(await readFile(path));
    const first = wb.lastRow(sheet) + 1;
    wb.setCells(rowsToUpdates(rows, first), sheet);
    await writeFile(path, wb.toBuffer());
    return first;
  }
  let first = 1;
  await editDelimited(path, (existing) => {
    while (existing.length && existing[existing.length - 1].every((v) => v === "" || v === null)) existing.pop();
    first = existing.length + 1;
    existing.push(...rows);
  });
  return first;
}

export async function createSpreadsheet(path: string, rows: CellValue[][]): Promise<void> {
  if (isXlsx(path)) {
    const wb = Workbook.parse(newWorkbook());
    wb.setCells(rowsToUpdates(rows, 1));
    await writeFile(path, wb.toBuffer(), { flag: "wx" });
    return;
  }
  await writeFile(path, formatDelimited(rows, delimiterFor(path), "\n"), { encoding: "utf-8", flag: "wx" });
}

function rowsToUpdates(rows: CellValue[][], firstRow: number): CellUpdate[] {
  const updates: CellUpdate[] = [];
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value !== null && value !== "") updates.push({ ref: formatRef(firstRow - 1 + r, c), value });
    })
  );
  return updates;
}

function isXlsx(path: string): boolean {
  return extname(path).toLowerCase() === ".xlsx";
}

// ---------- cell references ----------

export function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Za-z]{1,3})([1-9]\d{0,6})$/.exec(ref.trim());
  if (!m) throw new Error(`Invalid cell reference "${ref}" (expected something like B3)`);
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

export function columnName(col: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function formatRef(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

// ---------- CSV / TSV ----------

function delimiterFor(path: string): string {
  return extname(path).toLowerCase() === ".tsv" ? "\t" : ",";
}

function delimitedName(path: string): string {
  return extname(path).toLowerCase().slice(1);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function editDelimited(path: string, edit: (rows: CellValue[][]) => void): Promise<void> {
  const raw = await readFile(path, "utf-8");
  const bom = raw.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const text = stripBom(raw);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rows: CellValue[][] = parseDelimited(text, delimiterFor(path));
  edit(rows);
  await writeFile(path, bom + formatDelimited(rows, delimiterFor(path), eol), "utf-8");
}

export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function formatDelimited(rows: CellValue[][], delimiter = ",", eol = "\n"): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const needsQuotes = new RegExp(`["\\r\\n${delimiter === "\t" ? "\\t" : delimiter}]|^\\s|\\s$`);
  return rows
    .map((row) => {
      const cells = [...row];
      while (cells.length < width) cells.push("");
      return cells
        .map((v) => {
          const s = v === null ? "" : String(v);
          return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delimiter);
    })
    .map((line) => line + eol)
    .join("");
}

// ---------- XLSX ----------
// Edits are made directly in the sheet XML so that styles, formulas, charts and
// everything else in the workbook survive untouched.

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    return String.fromCodePoint(lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10));
  });
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = decodeXml(m[3] ?? m[4]);
  return out;
}

function textOf(xml: string, p: string): string {
  const withoutPhonetic = xml.replace(new RegExp(`<${p}rPh\\b[\\s\\S]*?</${p}rPh>`, "g"), "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(new RegExp(`<${p}t\\b[^>]*?(?:/>|>([\\s\\S]*?)</${p}t>)`, "g"))) {
    out += decodeXml(m[1] ?? "");
  }
  return out;
}

interface SheetRef {
  name: string;
  path: string;
}

interface CellXml {
  col: number;
  xml: string;
}

interface RowXml {
  row: number;
  open: string;
  cells: CellXml[];
}

class Workbook {
  private files: Map<string, Buffer>;
  private order: string[];
  private sheetRefs: SheetRef[];
  private shared: string[];

  private constructor(entries: ZipEntry[]) {
    this.files = new Map(entries.map((e) => [e.name, e.data]));
    this.order = entries.map((e) => e.name);
    this.sheetRefs = this.parseSheets();
    this.shared = this.parseSharedStrings();
  }

  static parse(buf: Buffer | ZipEntry[]): Workbook {
    return new Workbook(Array.isArray(buf) ? buf : readZip(buf));
  }

  toBuffer(): Buffer {
    return writeZip(this.order.map((name) => ({ name, data: this.files.get(name)! })));
  }

  read(sheet?: string): SheetData {
    const ref = this.sheet(sheet);
    const { rows } = this.sheetRows(ref);
    const grid: CellValue[][] = [];
    for (const r of rows) {
      const values: CellValue[] = [];
      for (const c of r.cells) {
        const v = this.cellValue(c.xml);
        if (v === null) continue;
        while (values.length < c.col) values.push(null);
        values[c.col] = v;
      }
      if (!values.length) continue;
      while (grid.length < r.row) grid.push([]);
      grid[r.row] = values;
    }
    return { sheets: this.sheetRefs.map((s) => s.name), sheet: ref.name, rows: grid };
  }

  lastRow(sheet?: string): number {
    const { rows } = this.sheetRows(this.sheet(sheet));
    let last = 0;
    for (const r of rows) if (r.cells.some((c) => this.cellValue(c.xml) !== null)) last = r.row + 1;
    return last;
  }

  setCells(updates: CellUpdate[], sheet?: string): void {
    const ref = this.sheet(sheet);
    const { xml, prefix, rows, start, end } = this.sheetRows(ref);
    const p = prefix;

    for (const { ref: cellRef, value } of updates) {
      const { row, col } = parseRef(cellRef);
      let r = rows.find((x) => x.row === row);
      if (!r) {
        r = { row, open: `<${p}row r="${row + 1}">`, cells: [] };
        rows.push(r);
        rows.sort((a, b) => a.row - b.row);
      }
      r.open = r.open.replace(/\sspans="[^"]*"/, "");
      const existing = r.cells.find((c) => c.col === col);
      if (existing && new RegExp(`<${p}f\\b`).test(existing.xml)) {
        throw new Error(`Cell ${formatRef(row, col)} on "${ref.name}" holds a formula; not overwriting it`);
      }
      const style = existing ? /\ss="(\d+)"/.exec(existing.xml.slice(0, existing.xml.indexOf(">") + 1)) : null;
      const cell = { col, xml: this.cellXml(p, formatRef(row, col), value, style?.[1]) };
      if (existing) existing.xml = cell.xml;
      else {
        r.cells.push(cell);
        r.cells.sort((a, b) => a.col - b.col);
      }
    }

    const body = rows
      .map((r) => (r.cells.length ? `${r.open.replace(/\/>$/, ">")}${r.cells.map((c) => c.xml).join("")}</${p}row>` : r.open))
      .join("");
    let next = `${xml.slice(0, start)}<${p}sheetData>${body}</${p}sheetData>${xml.slice(end)}`;

    let maxRow = 0;
    let maxCol = 0;
    for (const r of rows) {
      for (const c of r.cells) {
        maxRow = Math.max(maxRow, r.row);
        maxCol = Math.max(maxCol, c.col);
      }
    }
    next = next.replace(new RegExp(`<${p}dimension\\b[^>]*/>`), `<${p}dimension ref="A1:${formatRef(maxRow, maxCol)}"/>`);
    this.files.set(ref.path, Buffer.from(next, "utf-8"));
    this.requestRecalc();
  }

  private cellXml(p: string, ref: string, value: CellValue, style?: string): string {
    const s = style ? ` s="${style}"` : "";
    if (value === null || value === "") return `<${p}c r="${ref}"${s}/>`;
    if (typeof value === "number" && Number.isFinite(value)) return `<${p}c r="${ref}"${s}><${p}v>${value}</${p}v></${p}c>`;
    if (typeof value === "boolean") return `<${p}c r="${ref}"${s} t="b"><${p}v>${value ? 1 : 0}</${p}v></${p}c>`;
    return `<${p}c r="${ref}"${s} t="inlineStr"><${p}is><${p}t xml:space="preserve">${encodeXml(String(value))}</${p}t></${p}is></${p}c>`;
  }

  private cellValue(cellXml: string): CellValue {
    const p = /^<(\w+:)?c\b/.exec(cellXml)?.[1] ?? "";
    const head = cellXml.slice(0, cellXml.indexOf(">") + 1);
    const type = attrs(head).t;
    const v = new RegExp(`<${p}v\\b[^>]*>([\\s\\S]*?)</${p}v>`).exec(cellXml)?.[1];
    switch (type) {
      case "s":
        return v === undefined ? null : (this.shared[Number(v)] ?? null);
      case "inlineStr": {
        const is = new RegExp(`<${p}is\\b[^>]*>([\\s\\S]*?)</${p}is>`).exec(cellXml)?.[1];
        return is === undefined ? null : textOf(is, p);
      }
      case "b":
        return v === undefined ? null : v.trim() === "1";
      case "str":
      case "e":
        return v === undefined ? null : decodeXml(v);
      default: {
        if (v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : decodeXml(v);
      }
    }
  }

  private sheet(name?: string): SheetRef {
    if (!this.sheetRefs.length) throw new Error("Workbook has no sheets");
    if (!name) return this.sheetRefs[0];
    const found = this.sheetRefs.find((s) => s.name === name) ?? this.sheetRefs.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!found) throw new Error(`No sheet named "${name}". Sheets: ${this.sheetRefs.map((s) => s.name).join(", ")}`);
    return found;
  }

  private text(path: string): string {
    const data = this.files.get(path);
    if (!data) throw new Error(`Workbook is missing ${path}`);
    return data.toString("utf-8");
  }

  private parseSheets(): SheetRef[] {
    const workbook = this.text("xl/workbook.xml");
    const rels = this.files.has("xl/_rels/workbook.xml.rels") ? this.text("xl/_rels/workbook.xml.rels") : "";
    const targets = new Map<string, string>();
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      const a = attrs(m[0]);
      if (a.Id && a.Target) targets.set(a.Id, a.Target);
    }
    const sheets: SheetRef[] = [];
    for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
      const a = attrs(m[0]);
      const rid = Object.entries(a).find(([k]) => k === "r:id" || k.endsWith(":id"))?.[1];
      const target = rid ? targets.get(rid) : undefined;
      if (!a.name || !target) continue;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, "/");
      if (this.files.has(path)) sheets.push({ name: a.name, path });
    }
    return sheets;
  }

  private parseSharedStrings(): string[] {
    const path = "xl/sharedStrings.xml";
    if (!this.files.has(path)) return [];
    const xml = this.text(path);
    const p = /<(\w+:)?sst\b/.exec(xml)?.[1] ?? "";
    return [...xml.matchAll(new RegExp(`<${p}si\\b[^>]*?(?:/>|>([\\s\\S]*?)</${p}si>)`, "g"))].map((m) => textOf(m[1] ?? "", p));
  }

  private sheetRows(ref: SheetRef): { xml: string; prefix: string; rows: RowXml[]; start: number; end: number } {
    const xml = this.text(ref.path);
    const m = /<(\w+:)?sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1?sheetData>)/.exec(xml);
    if (!m) throw new Error(`Sheet "${ref.name}" has no cell data section`);
    const prefix = m[1] ?? "";
    const rows: RowXml[] = [];
    let implicitRow = 0;
    for (const rm of (m[2] ?? "").matchAll(new RegExp(`<${prefix}row\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${prefix}row>)`, "g"))) {
      const open = rm[0].slice(0, rm[0].indexOf(">") + 1);
      const rAttr = attrs(open).r;
      const row = rAttr ? Number(rAttr) - 1 : implicitRow;
      implicitRow = row + 1;
      const cells: CellXml[] = [];
      let implicitCol = 0;
      for (const cm of (rm[2] ?? "").matchAll(new RegExp(`<${prefix}c\\b[^>]*?(?:/>|>[\\s\\S]*?</${prefix}c>)`, "g"))) {
        const cAttr = attrs(cm[0].slice(0, cm[0].indexOf(">") + 1)).r;
        const col = cAttr ? parseRef(cAttr).col : implicitCol;
        implicitCol = col + 1;
        const xmlWithRef = cAttr ? cm[0] : cm[0].replace(new RegExp(`^<${prefix}c\\b`), `<${prefix}c r="${formatRef(row, col)}"`);
        cells.push({ col, xml: xmlWithRef });
      }
      rows.push({ row, open: rAttr ? open : open.replace(new RegExp(`^<${prefix}row\\b`), `<${prefix}row r="${row + 1}"`), cells });
    }
    return { xml, prefix, rows, start: m.index, end: m.index + m[0].length };
  }

  private requestRecalc(): void {
    const path = "xl/workbook.xml";
    let xml = this.text(path);
    const p = /<(\w+:)?workbook\b/.exec(xml)?.[1] ?? "";
    const calc = new RegExp(`<${p}calcPr\\b[^>]*?/?>`).exec(xml);
    if (calc) {
      if (/fullCalcOnLoad=/.test(calc[0])) return;
      xml = xml.replace(calc[0], calc[0].replace(/\s*(\/?)>$/, ' fullCalcOnLoad="1"$1>'));
    } else {
      const after = ["oleSize", "customWorkbookViews", "pivotCaches", "smartTagPr", "smartTagTypes", "webPublishing", "fileRecoveryPr", "webPublishObjects", "extLst"];
      const anchor = new RegExp(`<${p}(?:${after.join("|")})\\b|</${p}workbook>`).exec(xml);
      if (!anchor) return;
      xml = `${xml.slice(0, anchor.index)}<${p}calcPr fullCalcOnLoad="1"/>${xml.slice(anchor.index)}`;
    }
    this.files.set(path, Buffer.from(xml, "utf-8"));
  }
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function newWorkbook(): ZipEntry[] {
  const file = (name: string, body: string): ZipEntry => ({ name, data: Buffer.from(XML_HEAD + body, "utf-8") });
  return [
    file(
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"
    ),
    file(
      "_rels/.rels",
      `<Relationships xmlns="${NS_PKG_REL}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"
    ),
    file(
      "xl/workbook.xml",
      `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    file(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${NS_PKG_REL}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"
    ),
    file("xl/worksheets/sheet1.xml", `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><dimension ref="A1"/><sheetData/></worksheet>`),
    file(
      "xl/styles.xml",
      `<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>"
    ),
  ];
}
