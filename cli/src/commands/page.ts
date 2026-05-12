import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image } from "../types.js";

type RefResolver = (id: string) => string;

function buildRefResolver(data: DrawingSet): RefResolver {
  const map = new Map<string, string>();
  for (const s of data.sheets ?? []) {
    map.set(s["@id"], `Sheet ${s.sheetNumber} — ${s.title} (page ${s.pageIndex})`);
    for (const d of s.drawings ?? []) {
      map.set(d["@id"], `${d.title} (${s.sheetNumber}, page ${s.pageIndex})`);
    }
  }
  return (id: string) => map.get(id) ?? id;
}

export function printPage(sheet: Sheet, data: DrawingSet): void {
  const resolve = buildRefResolver(data);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Sheet ${sheet.sheetNumber} — ${sheet.title} (page ${sheet.pageIndex})`);
  console.log(`${"═".repeat(60)}`);

  const drawings = sheet.drawings ?? [];
  const tables = sheet.tables ?? [];
  const notes = sheet.notes ?? [];
  const images = sheet.images ?? [];

  for (const drawing of drawings) {
    printDrawing(drawing, resolve);
  }

  if (tables.length > 0) {
    console.log(`\n  Tables (${tables.length}):`);
    for (const table of tables) {
      printTable(table);
    }
  }

  if (notes.length > 0) {
    console.log(`\n  Notes (${notes.length}):`);
    for (const note of notes) {
      printNote(note);
    }
  }

  if (images.length > 0) {
    console.log(`\n  Images (${images.length}):`);
    for (const image of images) {
      printImage(image);
    }
  }

  console.log();
}

function printDrawing(d: Drawing, resolve: RefResolver): void {
  const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
  console.log(`\n  Drawing: ${d.title}${meta ? ` [${meta}]` : ""}`);
  console.log(`    id:   ${d["@id"]}`);
  console.log(`    bbox: [${d.bbox.join(", ")}]`);
  if (d.references?.length) {
    for (const ref of d.references) {
      console.log(`    → ${resolve(ref)}`);
    }
  }

  for (const layer of d.layers) {
    printLayer(layer, resolve);
  }
}

function printLayer(l: Layer, resolve: RefResolver): void {
  const items = l.items ?? [];
  console.log(`\n    Layer: ${l.name} (${items.length} items)`);
  if (l.bbox) console.log(`      bbox: [${l.bbox.join(", ")}]`);

  for (const item of items) {
    printItem(item, resolve);
  }
}

function printItem(item: Item, resolve: RefResolver): void {
  const typeTag = item.itemType.toUpperCase();
  const label = (item.data as Record<string, unknown>).label ?? item["@id"];
  console.log(`\n      [${typeTag}] ${label}`);
  console.log(`        id:   ${item["@id"]}`);
  if (item.bbox) console.log(`        bbox: [${item.bbox.join(", ")}]`);

  const dataEntries = Object.entries(item.data).filter(([k]) => k !== "label");
  if (dataEntries.length > 0) {
    console.log(`        data:`);
    for (const [key, value] of dataEntries) {
      console.log(`          ${key}: ${value}`);
    }
  }

  if (item.references?.length) {
    for (const ref of item.references) {
      console.log(`        → ${resolve(ref)}`);
    }
  }
}

function printTable(t: Table): void {
  console.log(`\n    ${t.title ?? "Untitled Table"}`);
  console.log(`      id: ${t["@id"]}`);
  if (t.bbox) console.log(`      bbox: [${t.bbox.join(", ")}]`);
  console.log(`      ┌${"─".repeat(50)}┐`);
  for (const row of t.content.split("\n")) {
    console.log(`      │ ${row.padEnd(49)}│`);
  }
  console.log(`      └${"─".repeat(50)}┘`);
}

function printNote(n: Note): void {
  console.log(`\n    Note: ${n["@id"]}`);
  if (n.bbox) console.log(`      bbox: [${n.bbox.join(", ")}]`);
  for (const line of n.content.split("\n")) {
    console.log(`      ${line}`);
  }
}

function printImage(img: Image): void {
  console.log(`\n    [IMAGE:${img.role}] ${img.caption ?? img["@id"]}`);
  console.log(`      id:   ${img["@id"]}`);
  console.log(`      bbox: [${img.bbox.join(", ")}]`);
}
