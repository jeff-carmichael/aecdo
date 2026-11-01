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

/** Labels are built on the first lookup, so a big set costs nothing until a reference is shown. */
export function buildRefResolver(data: DrawingSet): RefResolver {
  let map: Map<string, string> | undefined;
  return (id: string) => (map ??= refLabels(data)).get(id) ?? id;
}

function refLabels(data: DrawingSet): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of data.sheets ?? []) {
    map.set(s["@id"], `Sheet ${s.sheetNumber} — ${s.title} (PDF page ${s.pageIndex + 1})`);
    const where = `${s.sheetNumber}, PDF page ${s.pageIndex + 1}`;
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
  return map;
}

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function printPage(sheet: Sheet, data: DrawingSet, resolve: RefResolver = buildRefResolver(data)): void {
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

/** "A101  First Floor Plan" in bold, then the 1-based PDF page people see in a PDF viewer. */
export function sheetHeaderLines(sheet: Sheet): string[] {
  const c = palette();
  return ["", `  ${c.bold(`${sheet.sheetNumber}  ${sheet.title}`)}`, `  ${c.dim(`PDF page ${sheet.pageIndex + 1}`)}`];
}

function printSheetHeader(sheet: Sheet): void {
  for (const line of sheetHeaderLines(sheet)) console.log(line);
}

let details = true;

/** Whether ids and bbox coordinates are printed. On for `page` and the assistant; explore turns it off unless asked. */
export function showDetails(): boolean {
  return details;
}

export function withDetails<T>(on: boolean, fn: () => T): T {
  const previous = details;
  details = on;
  try {
    return fn();
  } finally {
    details = previous;
  }
}

const ITEM_KINDS: Record<Item["itemType"], string> = { tag: "Tag", thing: "Element", area: "Area" };

/** "roomName" or "room_name" → "Room name". */
export function fieldName(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function plainValue(value: unknown): string {
  if (Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) return value.join(", ");
  return formatValue(value);
}

/** What to call an item when it has no label: the first short text in its data, or its kind. */
export function itemName(item: Item): string {
  const label = item.data.label;
  if (typeof label === "string" && label) return label;
  const text = Object.values(item.data).find((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 40);
  return text ? `${ITEM_KINDS[item.itemType]} ${text}` : `Unnamed ${ITEM_KINDS[item.itemType].toLowerCase()}`;
}

/** How to follow `count` links in explore: "type r1 to open it" or "type r1 to r4 to open one". */
export function linkNote(count: number): string {
  return count === 1 ? "type r1 to open it" : `type r1 to r${count} to open one`;
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
  if (details) {
    console.log(`    id:   ${c.dim(d["@id"])}`);
    console.log(`    bbox: ${bboxText(d.bbox)}`);
  }
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
  if (l.bbox && details) console.log(`      bbox: ${bboxText(l.bbox)}`);

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

/**
 * `refTag(i)` labels the i-th reference, e.g. "[r1] ", so explore can jump to it.
 * Without details, prints the name, `where` it is, and the extracted fields as a two-column list.
 */
export function printItem(
  item: Item,
  resolve: RefResolver,
  refTag: (i: number) => string = () => "",
  log: (line?: string) => void = console.log,
  where?: string
): void {
  const c = palette();
  if (!details) {
    log(`\n  ${c.bold(itemName(item))}`);
    log(`  ${c.dim(where ? `${ITEM_KINDS[item.itemType]} on ${where}` : ITEM_KINDS[item.itemType])}`);
    const fields = Object.entries(item.data).filter(([k]) => k !== "label");
    if (fields.length) {
      const width = Math.max(...fields.map(([k]) => fieldName(k).length));
      log();
      for (const [key, value] of fields) log(`  ${c.dim(fieldName(key).padEnd(width))}   ${plainValue(value)}`);
    }
    const refs = item.references ?? [];
    if (refs.length) {
      const tagged = refTag(0) !== "";
      log(`\n  ${c.bold("Related")}${tagged ? `  ${c.dim(linkNote(refs.length))}` : ""}`);
      refs.forEach((ref, i) => log(`  ${arrow()}${refTag(i)}${resolve(ref)}`));
    }
    return;
  }
  const label = item.data.label ?? item["@id"];
  log(`\n      ${itemTypeTag(item)} ${formatValue(label)}`);
  log(`        id:   ${c.dim(item["@id"])}`);
  if (item.bbox) log(`        bbox: ${bboxText(item.bbox)}`);

  const dataEntries = Object.entries(item.data).filter(([k]) => k !== "label");
  if (dataEntries.length > 0) {
    log(`        data:`);
    for (const [key, value] of dataEntries) {
      log(`          ${key}: ${formatValue(value)}`);
    }
  }

  if (item.references?.length) {
    item.references.forEach((ref, i) => {
      log(`        ${arrow()}${refTag(i)}${resolve(ref)}`);
    });
  }
}

export function printTable(t: Table, log: (line?: string) => void = console.log): void {
  const c = palette();
  log(`\n    ${c.bold(t.label ?? t.title ?? "Untitled Table")}`);
  if (details) {
    log(`      id: ${c.dim(t["@id"])}`);
    if (t.bbox) log(`      bbox: ${bboxText(t.bbox)}`);
  }
  const width = Math.max(30, (process.stdout.columns || 100) - 7);
  for (const line of formatTable(t.content, width)) {
    log(`      ${line.replace(/[┌┬┐├┼┤└┴┘─│]+/g, (m) => c.dim(m))}`);
  }
}

export function printNote(n: Note, log: (line?: string) => void = console.log): void {
  if (!details) {
    log(`\n    ${palette().bold("Note")}`);
  } else {
    log(`\n    ${palette().heading("Note:")} ${palette().dim(n["@id"])}`);
    if (n.bbox) log(`      bbox: ${bboxText(n.bbox)}`);
  }
  for (const line of n.content.split("\n")) {
    log(`      ${line}`);
  }
}

const IMAGE_ROLES: Record<Image["role"], string> = {
  logo: "Logo",
  photo: "Photo",
  "detail-raster": "Scanned detail",
  diagram: "Diagram",
  other: "Image",
};

export function printImage(img: Image, log: (line?: string) => void = console.log): void {
  const c = palette();
  if (!details) {
    log(`\n    ${c.bold(img.caption ?? IMAGE_ROLES[img.role])}`);
    log(`    ${c.dim(`${IMAGE_ROLES[img.role]}. Type "view" to see it on the page.`)}`);
    return;
  }
  log(`\n    ${c.tag(`[IMAGE:${img.role}]`)} ${img.caption ?? img["@id"]}`);
  log(`      id:   ${c.dim(img["@id"])}`);
  log(`      bbox: ${bboxText(img.bbox)}`);
}
