import { output } from "../lib/output.js";
import { formatTable } from "../lib/table.js";
import { palette, bboxText } from "../lib/style.js";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image, CommandOptions } from "../types.js";

export function findSheet(data: DrawingSet, selector: string): Sheet | undefined {
  return (data.sheets ?? []).find(
    (s) =>
      s.sheetNumber.toLowerCase() === selector.toLowerCase() ||
      String(s.pageIndex) === selector
  );
}

export async function page(
  data: DrawingSet,
  selector: string,
  opts: CommandOptions = {}
): Promise<void> {
  const sheet = findSheet(data, selector);
  if (!sheet) {
    console.error(`Error: No sheet matching "${selector}". Try a sheet number or page index.`);
    process.exit(1);
  }

  if (opts.format === "json") {
    await output(sheet, opts);
    return;
  }

  printPage(sheet, data);
}

export type RefResolver = (id: string) => string;

export function buildRefResolver(data: DrawingSet): RefResolver {
  const map = new Map<string, string>();
  for (const s of data.sheets ?? []) {
    map.set(s["@id"], `Sheet ${s.sheetNumber} — ${s.title} (page ${s.pageIndex})`);
    const where = `${s.sheetNumber}, page ${s.pageIndex}`;
    for (const d of s.drawings ?? []) {
      const name = d.label ?? d.title ?? d["@id"];
      map.set(d["@id"], `${name} (${where})`);
      for (const l of d.layers) {
        map.set(l["@id"], `Layer ${l.name} (${s.sheetNumber} › ${name})`);
        for (const i of l.items ?? []) {
          const label = typeof i.data.label === "string" && i.data.label ? i.data.label : i.itemType;
          map.set(i["@id"], `${label} (${s.sheetNumber} › ${name} › ${l.name})`);
        }
      }
    }
    for (const t of s.tables ?? []) map.set(t["@id"], `Table ${t.label ?? t.title ?? "Untitled Table"} (${where})`);
    for (const n of s.notes ?? []) map.set(n["@id"], `Note "${oneLine(n.content, 40)}" (${where})`);
    for (const img of s.images ?? []) map.set(img["@id"], `Image ${img.caption ?? img.role} (${where})`);
  }
  return (id: string) => map.get(id) ?? id;
}

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function printPage(sheet: Sheet, data: DrawingSet): void {
  const resolve = buildRefResolver(data);
  const c = palette();

  printSheetHeader(sheet);

  const drawings = sheet.drawings ?? [];
  const tables = sheet.tables ?? [];
  const notes = sheet.notes ?? [];
  const images = sheet.images ?? [];

  for (const drawing of drawings) {
    printDrawing(drawing, resolve);
  }

  if (tables.length > 0) {
    console.log(`\n  ${c.heading("Tables")} (${tables.length}):`);
    for (const table of tables) {
      printTable(table);
    }
  }

  if (notes.length > 0) {
    console.log(`\n  ${c.heading("Notes")} (${notes.length}):`);
    for (const note of notes) {
      printNote(note);
    }
  }

  if (images.length > 0) {
    console.log(`\n  ${c.heading("Images")} (${images.length}):`);
    for (const image of images) {
      printImage(image);
    }
  }

  console.log();
}

/** The ═══ banner with "Sheet A101 — Title (page 0)". */
export function sheetHeaderLines(sheet: Sheet): string[] {
  const c = palette();
  const rule = c.dim("═".repeat(60));
  return [`\n${rule}`, `  ${c.bold(`Sheet ${sheet.sheetNumber} — ${sheet.title}`)} (page ${sheet.pageIndex})`, rule];
}

function printSheetHeader(sheet: Sheet): void {
  for (const line of sheetHeaderLines(sheet)) console.log(line);
}

/** " [plan, 1/4\" = 1'-0\"]" in the dim color, or "" when the drawing has neither. */
export function drawingMeta(d: Drawing): string {
  const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
  return meta ? ` ${palette().dim(`[${meta}]`)}` : "";
}

/** "→ " in the dim color, for reference lines. */
export function arrow(): string {
  return `${palette().dim("→")} `;
}

function printDrawing(d: Drawing, resolve: RefResolver): void {
  const c = palette();
  console.log(`\n  ${c.heading("Drawing:")} ${d.label ?? d.title}${drawingMeta(d)}`);
  console.log(`    id:   ${c.dim(d["@id"])}`);
  console.log(`    bbox: ${bboxText(d.bbox)}`);
  if (d.references?.length) {
    for (const ref of d.references) {
      console.log(`    ${arrow()}${resolve(ref)}`);
    }
  }

  for (const layer of d.layers) {
    printLayer(layer, resolve);
  }
}

function printLayer(l: Layer, resolve: RefResolver): void {
  const items = l.items ?? [];
  console.log(`\n    ${palette().layer("Layer:")} ${l.name} (${items.length} items)`);
  if (l.bbox) console.log(`      bbox: ${bboxText(l.bbox)}`);

  for (const item of items) {
    printItem(item, resolve);
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/** "[THING]" in the tag color. */
export function itemTypeTag(item: Item): string {
  return palette().tag(`[${item.itemType.toUpperCase()}]`);
}

/** `refTag(i)` labels the i-th reference, e.g. "[r1] ", so explore can jump to it. */
export function printItem(item: Item, resolve: RefResolver, refTag: (i: number) => string = () => ""): void {
  const c = palette();
  const label = item.data.label ?? item["@id"];
  console.log(`\n      ${itemTypeTag(item)} ${formatValue(label)}`);
  console.log(`        id:   ${c.dim(item["@id"])}`);
  if (item.bbox) console.log(`        bbox: ${bboxText(item.bbox)}`);

  const dataEntries = Object.entries(item.data).filter(([k]) => k !== "label");
  if (dataEntries.length > 0) {
    console.log(`        data:`);
    for (const [key, value] of dataEntries) {
      console.log(`          ${key}: ${formatValue(value)}`);
    }
  }

  if (item.references?.length) {
    item.references.forEach((ref, i) => {
      console.log(`        ${arrow()}${refTag(i)}${resolve(ref)}`);
    });
  }
}

export function printTable(t: Table): void {
  const c = palette();
  console.log(`\n    ${c.bold(t.label ?? t.title ?? "Untitled Table")}`);
  console.log(`      id: ${c.dim(t["@id"])}`);
  if (t.bbox) console.log(`      bbox: ${bboxText(t.bbox)}`);
  const width = Math.max(30, (process.stdout.columns || 100) - 7);
  for (const line of formatTable(t.content, width)) {
    console.log(`      ${line.replace(/[┌┬┐├┼┤└┴┘─│]+/g, (m) => c.dim(m))}`);
  }
}

export function printNote(n: Note): void {
  console.log(`\n    ${palette().heading("Note:")} ${palette().dim(n["@id"])}`);
  if (n.bbox) console.log(`      bbox: ${bboxText(n.bbox)}`);
  for (const line of n.content.split("\n")) {
    console.log(`      ${line}`);
  }
}

export function printImage(img: Image): void {
  const c = palette();
  console.log(`\n    ${c.tag(`[IMAGE:${img.role}]`)} ${img.caption ?? img["@id"]}`);
  console.log(`      id:   ${c.dim(img["@id"])}`);
  console.log(`      bbox: ${bboxText(img.bbox)}`);
}
