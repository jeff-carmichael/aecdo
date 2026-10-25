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
import {
  ASSISTANTS,
  assistantForMention,
  createLlmModels,
  isAssistantConfigured,
  resolveAssistantModel,
  type AssistantInfo,
  type AssistantName,
} from "../lib/llm.js";
import { enableMentionHighlight, colorEnabled } from "../lib/mention-highlight.js";
import { createAssistantSession, type AssistantSession } from "../lib/assistant.js";
import type { MutableModels } from "@earendil-works/pi-ai";
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

function sheetHeader(s: Sheet): Record<string, unknown> {
  return { sheetNumber: s.sheetNumber, title: s.title, pageIndex: s.pageIndex };
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
  private lastShown: unknown;

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

  /** The current view as structured data, for the AI assistant. */
  context(): Record<string, unknown> {
    const v = this.view;
    const location = this.prompt().replace(/> $/, "");
    const listing = this.capture(() => this.render()).join("\n").trim();
    switch (v.kind) {
      case "sheets":
        return { view: "sheet list", location, listing };
      case "sheet":
        return { view: "sheet", location, listing, sheet: v.sheet };
      case "drawing":
        return { view: "drawing", location, listing, sheet: sheetHeader(v.sheet), drawing: v.drawing };
      case "layer":
        return {
          view: "layer",
          location,
          listing,
          sheet: sheetHeader(v.sheet),
          drawing: { "@id": v.drawing["@id"], label: drawingName(v.drawing), drawingType: v.drawing.drawingType },
          layer: v.layer,
        };
    }
  }

  /** Runs a command for the assistant; the user sees the same output as if they typed it. */
  navigate(command: string): Record<string, unknown> {
    this.lastShown = undefined;
    this.handle(command);
    const ctx = this.context();
    return this.lastShown === undefined ? ctx : { ...ctx, shown: this.lastShown };
  }

  private capture(fn: () => void): string[] {
    const lines: string[] = [];
    const log = this.log;
    this.log = (line = "") => lines.push(line);
    try {
      fn();
    } finally {
      this.log = log;
    }
    return lines;
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
    this.log('  "@claude …" or "@chatgpt …" asks an AI assistant about this view.');
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
        this.lastShown = entry.value;
        printTable(entry.value);
        break;
      case "note":
        this.lastShown = entry.value;
        printNote(entry.value);
        break;
      case "image":
        this.lastShown = entry.value;
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
    this.lastShown = item;
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

export interface Mention {
  word: string;
  assistant?: AssistantInfo;
  text: string;
}

/** Parses "@claude what is on this sheet?" style input. */
export function parseMention(input: string): Mention | null {
  const m = /^@([a-z]+)\b[\s,:]*([\s\S]*)$/i.exec(input.trim());
  if (!m) return null;
  return { word: m[1], assistant: assistantForMention(m[1]), text: m[2].trim() };
}

export function nodeSupportsAssistant(version = process.versions.node, isBun = "bun" in process.versions): boolean {
  if (isBun) return true;
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 19);
}

class AssistantBridge {
  private models?: MutableModels;
  private sessions = new Map<AssistantName, AssistantSession>();
  active?: AssistantSession;

  constructor(
    private data: DrawingSet,
    private filePath: string,
    private explorer: Explorer,
    private ask: (q: string) => Promise<string>
  ) {}

  async run(mention: Mention): Promise<void> {
    const info = mention.assistant;
    if (!info) {
      const names = Object.values(ASSISTANTS).map((a) => `@${a.name}`).join(" or ");
      console.log(`Unknown assistant "@${mention.word}". Try ${names}.`);
      return;
    }
    if (!mention.text) {
      console.log(`Ask something after @${info.name}, e.g. "@${info.name} summarize this sheet".`);
      return;
    }
    if (!nodeSupportsAssistant()) {
      console.log(`The AI assistant needs Node.js 22.19 or newer (you have ${process.versions.node}), or the standalone aecdo binary.`);
      return;
    }

    try {
      const session = await this.session(info);
      if (!session) return;
      this.active = session;
      console.log();
      await session.ask(mention.text);
      console.log();
    } catch (err) {
      console.log(`\n${info.label}: ${(err as Error).message}`);
    } finally {
      this.active = undefined;
    }
  }

  private async session(info: AssistantInfo): Promise<AssistantSession | undefined> {
    const existing = this.sessions.get(info.name);
    if (existing) return existing;

    this.models ??= await createLlmModels();
    if (!(await isAssistantConfigured(this.models, info.name))) {
      console.log(`${info.label} isn't set up yet. Run "aecdo configure ai" to sign in or add an API key.`);
      return undefined;
    }
    const model = await resolveAssistantModel(this.models, info.name);
    const session = await createAssistantSession(
      {
        data: this.data,
        filePath: this.filePath,
        cwd: process.cwd(),
        view: this.explorer,
        write: (text) => process.stdout.write(text),
        print: (line) => console.log(line),
        confirm: async (q) => /^y(es)?$/i.test((await this.ask(q)).trim()),
      },
      info,
      this.models,
      model
    );
    this.sessions.set(info.name, session);
    return session;
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
  let editing = false;
  const ask = (q: string) =>
    new Promise<string>((res) => {
      editing = true;
      rl.question(q, (answer) => {
        editing = false;
        res(answer);
      });
    });
  if (colorEnabled()) enableMentionHighlight(rl, () => editing);
  const assistant = new AssistantBridge(data, filePath, explorer, ask);

  let closed = false;
  rl.on("close", () => (closed = true));
  rl.on("SIGINT", () => {
    if (assistant.active) {
      assistant.active.abort();
      console.log("\n(stopped)");
      return;
    }
    rl.close();
    process.exit(130);
  });

  let running = true;
  while (running && !closed) {
    const input = await ask(explorer.prompt());
    const mention = parseMention(input);
    if (mention) {
      await assistant.run(mention);
      continue;
    }
    running = explorer.handle(input);
  }

  rl.close();
}
