import { createInterface } from "node:readline";
import { validate } from "./validate.js";
import {
  findSheet,
  printPage,
  printItem,
  printTable,
  printNote,
  printImage,
  buildRefResolver,
  type RefResolver,
} from "./page.js";
import { sheets as sheetsCmd } from "./sheets.js";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image, CommandOptions } from "../types.js";

type View =
  | { kind: "sheets" }
  | { kind: "sheet"; sheet: Sheet }
  | { kind: "drawing"; sheet: Sheet; drawing: Drawing }
  | { kind: "layer"; sheet: Sheet; drawing: Drawing; layer: Layer };

type SheetEntry =
  | { kind: "drawing"; value: Drawing }
  | { kind: "table"; value: Table }
  | { kind: "note"; value: Note }
  | { kind: "image"; value: Image };

const ITEM_PREVIEW_LIMIT = 60;

function truncate(text: string, max = ITEM_PREVIEW_LIMIT): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function drawingName(d: Drawing): string {
  return d.label ?? d.title ?? d["@id"];
}

function itemLabel(item: Item): string {
  const label = item.data.label;
  return typeof label === "string" && label ? label : item["@id"];
}

export function sheetEntries(sheet: Sheet): SheetEntry[] {
  return [
    ...(sheet.drawings ?? []).map((value) => ({ kind: "drawing" as const, value })),
    ...(sheet.tables ?? []).map((value) => ({ kind: "table" as const, value })),
    ...(sheet.notes ?? []).map((value) => ({ kind: "note" as const, value })),
    ...(sheet.images ?? []).map((value) => ({ kind: "image" as const, value })),
  ];
}

function describeEntry(entry: SheetEntry): string {
  switch (entry.kind) {
    case "drawing": {
      const d = entry.value;
      const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
      const itemCount = d.layers.reduce((n, l) => n + (l.items?.length ?? 0), 0);
      return `${drawingName(d)}${meta ? ` [${meta}]` : ""} — ${plural(d.layers.length, "layer")}, ${plural(itemCount, "item")}`;
    }
    case "table": {
      const t = entry.value;
      const rows = t.content.split("\n").filter((r) => r.trim()).length;
      return `${t.label ?? t.title ?? "Untitled Table"} — ${plural(rows, "row")}`;
    }
    case "note":
      return truncate(entry.value.content);
    case "image":
      return `[${entry.value.role}] ${entry.value.caption ?? entry.value["@id"]}`;
  }
}

const GROUP_TITLES: Record<SheetEntry["kind"], string> = {
  drawing: "Drawings",
  table: "Tables",
  note: "Notes",
  image: "Images",
};

export class Explorer {
  private stack: View[] = [{ kind: "sheets" }];
  private resolve: RefResolver;

  constructor(
    private data: DrawingSet,
    private log: (line?: string) => void = console.log
  ) {
    this.resolve = buildRefResolver(data);
  }

  get view(): View {
    return this.stack[this.stack.length - 1];
  }

  prompt(): string {
    const v = this.view;
    const parts: string[] = [];
    if (v.kind !== "sheets") parts.push(v.sheet.sheetNumber);
    if (v.kind === "drawing" || v.kind === "layer") parts.push(drawingName(v.drawing));
    if (v.kind === "layer") parts.push(v.layer.name);
    return parts.length ? `${parts.join(" › ")}> ` : "sheet> ";
  }

  render(): void {
    const v = this.view;
    switch (v.kind) {
      case "sheets":
        return this.renderSheets();
      case "sheet":
        return this.renderSheet(v.sheet);
      case "drawing":
        return this.renderDrawing(v.sheet, v.drawing);
      case "layer":
        return this.renderLayer(v.layer);
    }
  }

  help(): void {
    this.log();
    if (this.view.kind === "sheets") {
      this.log("  Enter a sheet number or page index to open it.");
    } else {
      this.log("  Enter a number from the list to dive in.");
      this.log('  "back" (or "..") goes up a level, "top" returns to the sheet list.');
    }
    if (this.view.kind === "sheet") this.log('  "all" prints everything on this sheet.');
    this.log('  "ls" reprints the current list, "quit" exits.');
    this.log();
  }

  /** Returns false when the user asked to quit. */
  handle(input: string): boolean {
    const answer = input.trim();
    if (!answer) return true;
    const cmd = answer.toLowerCase();

    if (cmd === "quit" || cmd === "q" || cmd === "exit") return false;
    if (cmd === "help" || cmd === "?") {
      this.help();
      return true;
    }
    if (cmd === "list" || cmd === "ls") {
      this.render();
      return true;
    }
    if (cmd === "back" || cmd === ".." || cmd === "b" || cmd === "up") {
      if (this.stack.length > 1) this.stack.pop();
      this.render();
      return true;
    }
    if (cmd === "top" || cmd === "home") {
      this.stack = [{ kind: "sheets" }];
      this.render();
      return true;
    }

    const v = this.view;
    if (v.kind === "sheets") {
      this.openSheet(answer);
      return true;
    }

    if (v.kind === "sheet" && cmd === "all") {
      printPage(v.sheet, this.data);
      return true;
    }

    const index = /^\d+$/.test(answer) ? Number(answer) : NaN;
    switch (v.kind) {
      case "sheet":
        this.selectSheetEntry(v.sheet, index, answer);
        break;
      case "drawing":
        this.selectLayer(v.sheet, v.drawing, index, answer);
        break;
      case "layer":
        this.selectItem(v.layer, index, answer);
        break;
    }
    return true;
  }

  private openSheet(selector: string): void {
    const sheet = findSheet(this.data, selector);
    if (!sheet) {
      this.log(`No sheet matching "${selector}". Try a sheet number or page index.`);
      return;
    }
    this.stack.push({ kind: "sheet", sheet });
    this.render();
  }

  private selectSheetEntry(sheet: Sheet, index: number, raw: string): void {
    const entries = sheetEntries(sheet);
    const entry = entries[index - 1];
    if (!entry) {
      this.log(`No entry "${raw}". Pick 1–${entries.length}, or "back".`);
      return;
    }
    switch (entry.kind) {
      case "drawing":
        this.stack.push({ kind: "drawing", sheet, drawing: entry.value });
        this.render();
        return;
      case "table":
        printTable(entry.value);
        break;
      case "note":
        printNote(entry.value);
        break;
      case "image":
        printImage(entry.value);
        break;
    }
    this.log();
  }

  private selectLayer(sheet: Sheet, drawing: Drawing, index: number, raw: string): void {
    const layer = drawing.layers[index - 1];
    if (!layer) {
      this.log(`No layer "${raw}". Pick 1–${drawing.layers.length}, or "back".`);
      return;
    }
    this.stack.push({ kind: "layer", sheet, drawing, layer });
    this.render();
  }

  private selectItem(layer: Layer, index: number, raw: string): void {
    const items = layer.items ?? [];
    const item = items[index - 1];
    if (!item) {
      this.log(`No item "${raw}". Pick 1–${items.length}, or "back".`);
      return;
    }
    printItem(item, this.resolve);
    this.log();
  }

  private renderSheets(): void {
    this.log();
    for (const s of this.data.sheets ?? []) {
      this.log(`  ${s.sheetNumber} - ${s.title} (page ${s.pageIndex})`);
    }
    this.log();
  }

  private renderSheet(sheet: Sheet): void {
    this.log(`\n${"═".repeat(60)}`);
    this.log(`  Sheet ${sheet.sheetNumber} — ${sheet.title} (page ${sheet.pageIndex})`);
    this.log(`${"═".repeat(60)}`);

    const entries = sheetEntries(sheet);
    if (entries.length === 0) {
      this.log("\n  This sheet has no drawings, tables, notes, or images.\n");
      return;
    }

    let current: SheetEntry["kind"] | undefined;
    entries.forEach((entry, i) => {
      if (entry.kind !== current) {
        current = entry.kind;
        const count = entries.filter((e) => e.kind === current).length;
        this.log(`\n  ${GROUP_TITLES[current]} (${count}):`);
      }
      this.log(`    ${String(i + 1).padStart(2)}. ${describeEntry(entry)}`);
    });
    this.log();
  }

  private renderDrawing(sheet: Sheet, drawing: Drawing): void {
    const meta = [drawing.drawingType, drawing.scale].filter(Boolean).join(", ");
    this.log(`\n  Drawing: ${drawingName(drawing)}${meta ? ` [${meta}]` : ""} (sheet ${sheet.sheetNumber})`);
    this.log(`    id:   ${drawing["@id"]}`);
    this.log(`    bbox: [${drawing.bbox.join(", ")}]`);
    for (const ref of drawing.references ?? []) {
      this.log(`    → ${this.resolve(ref)}`);
    }

    if (drawing.layers.length === 0) {
      this.log("\n  No layers.\n");
      return;
    }
    this.log(`\n  Layers (${drawing.layers.length}):`);
    drawing.layers.forEach((layer, i) => {
      this.log(`    ${String(i + 1).padStart(2)}. ${layer.name} — ${plural(layer.items?.length ?? 0, "item")}`);
    });
    this.log();
  }

  private renderLayer(layer: Layer): void {
    const items = layer.items ?? [];
    this.log(`\n  Layer: ${layer.name}`);
    if (layer.bbox) this.log(`    bbox: [${layer.bbox.join(", ")}]`);

    if (items.length === 0) {
      this.log("\n  No items.\n");
      return;
    }
    this.log(`\n  Items (${items.length}):`);
    items.forEach((item, i) => {
      this.log(`    ${String(i + 1).padStart(2)}. [${item.itemType.toUpperCase()}] ${truncate(itemLabel(item))}`);
    });
    this.log();
  }
}

export async function explore(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  if (opts.format === "json" || !process.stdin.isTTY) {
    await sheetsCmd(data, filePath, opts);
    return;
  }

  const valid = await validate(data, filePath, opts);
  if (!valid) {
    console.log("\nFile has validation errors. Continuing anyway…\n");
  }

  if ((data.sheets ?? []).length === 0) {
    console.log("\nNo sheets found.");
    return;
  }

  const explorer = new Explorer(data);
  explorer.render();
  explorer.help();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  let running = true;
  while (running) {
    running = explorer.handle(await ask(explorer.prompt()));
  }

  rl.close();
}
