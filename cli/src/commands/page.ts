import { output } from "../lib/output.js";
import { parseTable } from "../lib/table.js";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image, CommandOptions } from "../types.js";

export function bboxText(bbox: readonly number[]): string {
  return `[${bbox.join(", ")}]`;
}

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

type Log = (line?: string) => void;

export function printPage(sheet: Sheet, data: DrawingSet, resolve: RefResolver = buildRefResolver(data), log: Log = console.log): void {
  for (const line of sheetHeaderLines(sheet)) log(line);

  for (const drawing of sheet.drawings ?? []) printDrawing(drawing, resolve, log);

  const tables = sheet.tables ?? [];
  const notes = sheet.notes ?? [];
  const images = sheet.images ?? [];
  if (tables.length) log(`\n  Tables (${tables.length}):`);
  for (const t of tables) printTable(t, log);
  if (notes.length) log(`\n  Notes (${notes.length}):`);
  for (const n of notes) printNote(n, log);
  if (images.length) log(`\n  Images (${images.length}):`);
  for (const img of images) printImage(img, log);

  log();
}

/** "A101  First Floor Plan", then the 1-based PDF page people see in a PDF viewer. */
export function sheetHeaderLines(sheet: Sheet): string[] {
  return ["", `  ${sheet.sheetNumber}  ${sheet.title}`, `  PDF page ${sheet.pageIndex + 1}`];
}

let details = true;

/** Runs `fn` with ids and bbox coordinates printed or not: on for `page`; the app and the assistant turn it off unless asked. */
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

export function plainValue(value: unknown): string {
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

/** How to follow `count` links: "type r1 to open it" or "type r1 to r4 to open one". */
export function linkNote(count: number): string {
  return count === 1 ? "type r1 to open it" : `type r1 to r${count} to open one`;
}

/** " [plan, 1/4\" = 1'-0\"]", or "" when the drawing has neither. */
function drawingMeta(d: Drawing): string {
  const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
  return meta ? ` [${meta}]` : "";
}

function printDrawing(d: Drawing, resolve: RefResolver, log: Log): void {
  log(`\n  Drawing: ${d.label ?? d.title}${drawingMeta(d)}`);
  if (details) {
    log(`    id:   ${d["@id"]}`);
    log(`    bbox: ${bboxText(d.bbox)}`);
  }
  for (const ref of d.references ?? []) log(`    → ${resolve(ref)}`);
  for (const layer of d.layers) printLayer(layer, resolve, log);
}

function printLayer(l: Layer, resolve: RefResolver, log: Log): void {
  const items = l.items ?? [];
  log(`\n    Layer: ${l.name} (${items.length} items)`);
  if (l.bbox && details) log(`      bbox: ${bboxText(l.bbox)}`);
  for (const item of items) printItem(item, resolve, undefined, log);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/** "[THING]". */
export function itemTypeTag(item: Item): string {
  return `[${item.itemType.toUpperCase()}]`;
}

/**
 * `refTag(i)` labels the i-th reference, e.g. "[r1] ", so the assistant can jump to it.
 * Without details, prints the name, `where` it is, and the extracted fields as a two-column list.
 */
export function printItem(
  item: Item,
  resolve: RefResolver,
  refTag: (i: number) => string = () => "",
  log: Log = console.log,
  where?: string
): void {
  if (!details) {
    log(`\n  ${itemName(item)}`);
    log(`  ${where ? `${ITEM_KINDS[item.itemType]} on ${where}` : ITEM_KINDS[item.itemType]}`);
    const fields = Object.entries(item.data).filter(([k]) => k !== "label");
    if (fields.length) {
      const width = Math.max(...fields.map(([k]) => fieldName(k).length));
      log();
      for (const [key, value] of fields) log(`  ${fieldName(key).padEnd(width)}   ${plainValue(value)}`);
    }
    const refs = item.references ?? [];
    if (refs.length) {
      const tagged = refTag(0) !== "";
      log(`\n  Related${tagged ? `  ${linkNote(refs.length)}` : ""}`);
      refs.forEach((ref, i) => log(`  → ${refTag(i)}${resolve(ref)}`));
    }
    return;
  }
  const label = item.data.label ?? item["@id"];
  log(`\n      ${itemTypeTag(item)} ${formatValue(label)}`);
  log(`        id:   ${item["@id"]}`);
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
      log(`        → ${refTag(i)}${resolve(ref)}`);
    });
  }
}

export function printTable(t: Table, log: Log = console.log): void {
  log(`\n    ${t.label ?? t.title ?? "Untitled Table"}`);
  if (details) {
    log(`      id: ${t["@id"]}`);
    if (t.bbox) log(`      bbox: ${bboxText(t.bbox)}`);
  }
  const rows = parseTable(t.content);
  if (rows.length === 0) log("      (empty table)");
  for (const row of rows) log(`      ${row.join(" | ")}`);
}

export function printNote(n: Note, log: Log = console.log): void {
  if (!details) {
    log(`\n    Note`);
  } else {
    log(`\n    Note: ${n["@id"]}`);
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

export function printImage(img: Image, log: Log = console.log): void {
  if (!details) {
    log(`\n    ${img.caption ?? IMAGE_ROLES[img.role]}`);
    log(`    ${IMAGE_ROLES[img.role]}.`);
    return;
  }
  log(`\n    [IMAGE:${img.role}] ${img.caption ?? img["@id"]}`);
  log(`      id:   ${img["@id"]}`);
  log(`      bbox: ${bboxText(img.bbox)}`);
}
