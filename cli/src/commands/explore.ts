import { createInterface } from "node:readline";
import { basename } from "node:path";
import { validate } from "./validate.js";
import {
  findSheet,
  printPage,
  printItem,
  printTable,
  printNote,
  printImage,
  buildRefResolver,
  sheetHeaderLines,
  drawingMeta,
  itemTypeTag,
  arrow,
  type RefResolver,
} from "./page.js";
import { palette, withPalette, bboxText, PLAIN } from "../lib/style.js";
import { sheets as sheetsCmd } from "./sheets.js";
import {
  ASSISTANTS,
  assistantForMention,
  createLlmModels,
  isAssistantConfigured,
  isProviderConfigured,
  resolveAssistantModel,
  type AssistantInfo,
  type AssistantName,
} from "../lib/llm.js";
import { enableMentionHighlight, colorEnabled, completeMention, stylePrompt } from "../lib/mention-highlight.js";
import { createAssistantSession, type AssistantSession } from "../lib/assistant.js";
import {
  findSourcePdf,
  renderPageView,
  sourcePdfCandidates,
  unionBBox,
  type BBox,
  type PageViewRequest,
  type PageViewResult,
} from "../lib/page-view.js";
import { openWithDefaultApp } from "../lib/open.js";
import { bannerEnabled, renderBanner } from "../lib/banner.js";
import { MarkupSession, parseMarkupsCommand } from "./markups.js";
import type { MutableModels } from "@earendil-works/pi-ai";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image, CommandOptions } from "../types.js";

type View =
  | { kind: "sheets" }
  | { kind: "group"; group: SheetGroup }
  | { kind: "sheet"; sheet: Sheet }
  | { kind: "drawing"; sheet: Sheet; drawing: Drawing }
  | { kind: "layer"; sheet: Sheet; drawing: Drawing; layer: Layer };

type SheetEntry =
  | { kind: "drawing"; value: Drawing }
  | { kind: "table"; value: Table }
  | { kind: "note"; value: Note }
  | { kind: "image"; value: Image };

export interface ViewTarget {
  sheet: Sheet;
  /** What the red box outlines, e.g. "drawing Ground Floor Plan". */
  label: string;
  bbox?: BBox;
  /** The AECDO `@id` of what is outlined. */
  id?: string;
  /** True when nothing is selected on a sheet, so there is no box to draw. */
  wholePage?: boolean;
}

const VIEW_COMMANDS = new Set(["view", "/view"]);

/** Parses "view" or "/view [pdf path]". */
export function parseViewCommand(input: string): { pdf?: string } | null {
  const m = /^(\S+)(?:\s+([\s\S]+))?$/.exec(input.trim());
  if (!m || !VIEW_COMMANDS.has(m[1].toLowerCase())) return null;
  const pdf = m[2]?.trim().replace(/^(["'])(.*)\1$/, "$2");
  return pdf ? { pdf } : {};
}

/** Above this many sheets, the sheet list shows groups by sheet-number prefix first. */
export const SHEET_GROUP_THRESHOLD = 25;

/** US National CAD Standard discipline designators. */
const DISCIPLINES: Record<string, string> = {
  G: "General",
  H: "Hazardous Materials",
  V: "Survey / Mapping",
  B: "Geotechnical",
  W: "Civil Works",
  C: "Civil",
  L: "Landscape",
  S: "Structural",
  A: "Architectural",
  I: "Interiors",
  Q: "Equipment",
  F: "Fire Protection",
  FP: "Fire Protection",
  FA: "Fire Alarm",
  P: "Plumbing",
  D: "Process",
  M: "Mechanical",
  E: "Electrical",
  T: "Telecommunications",
  R: "Resource",
  X: "Other Disciplines",
  Z: "Contractor / Shop Drawings",
  O: "Operations",
};

export interface SheetGroup {
  /** Leading letters of the sheet number, upper-cased; "" when there are none. */
  prefix: string;
  name?: string;
  sheets: Sheet[];
}

export function sheetPrefix(sheetNumber: string): string {
  return /^\s*([A-Za-z]+)/.exec(sheetNumber)?.[1].toUpperCase() ?? "";
}

function disciplineName(prefix: string): string | undefined {
  return DISCIPLINES[prefix] ?? DISCIPLINES[prefix[0]];
}

/** Groups sheets by sheet-number prefix, in the order each prefix first appears. */
export function groupSheets(sheets: Sheet[]): SheetGroup[] {
  const groups = new Map<string, SheetGroup>();
  for (const sheet of sheets) {
    const prefix = sheetPrefix(sheet.sheetNumber);
    let group = groups.get(prefix);
    if (!group) {
      group = { prefix, name: prefix ? disciplineName(prefix) : "Other", sheets: [] };
      groups.set(prefix, group);
    }
    group.sheets.push(sheet);
  }
  return [...groups.values()];
}

function groupLabel(g: SheetGroup): string {
  if (!g.prefix) return g.name ?? "Other";
  return g.name ? `${g.prefix} - ${g.name}` : g.prefix;
}

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
      const itemCount = d.layers.reduce((n, l) => n + (l.items?.length ?? 0), 0);
      return `${drawingName(d)}${drawingMeta(d)} — ${plural(d.layers.length, "layer")}, ${plural(itemCount, "item")}`;
    }
    case "table": {
      const t = entry.value;
      const rows = t.content.split("\n").filter((r) => r.trim()).length;
      return `${t.label ?? t.title ?? "Untitled Table"} — ${plural(rows, "row")}`;
    }
    case "note":
      return truncate(entry.value.content);
    case "image":
      return `${palette().tag(`[${entry.value.role}]`)} ${entry.value.caption ?? entry.value["@id"]}`;
  }
}

interface RefTarget {
  sheet: Sheet;
  drawing?: Drawing;
  layer?: Layer;
  item?: Item;
  entry?: SheetEntry;
}

/** Where each `@id` in the set lives, so a reference can be opened. */
export function buildRefIndex(data: DrawingSet): Map<string, RefTarget> {
  const index = new Map<string, RefTarget>();
  for (const sheet of data.sheets ?? []) {
    index.set(sheet["@id"], { sheet });
    for (const entry of sheetEntries(sheet)) index.set(entry.value["@id"], { sheet, entry });
    for (const drawing of sheet.drawings ?? []) {
      index.set(drawing["@id"], { sheet, drawing });
      for (const layer of drawing.layers) {
        index.set(layer["@id"], { sheet, drawing, layer });
        for (const item of layer.items ?? []) index.set(item["@id"], { sheet, drawing, layer, item });
      }
    }
  }
  return index;
}

const REF_COMMAND = /^r(\d*)$/i;

function refTag(i: number): string {
  return `${palette().bold(`[r${i + 1}]`)} `;
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
  private selection?: { view: View; label: string; bbox?: BBox; id?: string };
  /** The references shown with [r1], [r2] tags, and the view they belong to. */
  private refs?: { view: View; ids: string[] };
  private refIndex: Map<string, RefTarget>;
  /** Set when the set has too many sheets to list flat. */
  private groups?: SheetGroup[];

  constructor(
    private data: DrawingSet,
    private log: (line?: string) => void = console.log
  ) {
    this.resolve = buildRefResolver(data);
    this.refIndex = buildRefIndex(data);
    const sheets = data.sheets ?? [];
    if (sheets.length > SHEET_GROUP_THRESHOLD) {
      const groups = groupSheets(sheets);
      if (groups.length > 1) this.groups = groups;
    }
  }

  get view(): View {
    return this.stack[this.stack.length - 1];
  }

  prompt(): string {
    const v = this.view;
    if (v.kind === "group") return `${v.group.prefix || "other"} sheets> `;
    const parts: string[] = [];
    if (v.kind !== "sheets") parts.push(v.sheet.sheetNumber);
    if (v.kind === "drawing" || v.kind === "layer") parts.push(drawingName(v.drawing));
    if (v.kind === "layer") parts.push(v.layer.name);
    return parts.length ? `${parts.join(" › ")}> ` : "sheet> ";
  }

  render(): void {
    const v = this.view;
    this.refs = undefined;
    switch (v.kind) {
      case "sheets":
        return this.groups ? this.renderGroups(this.groups) : this.renderSheets(this.data.sheets ?? []);
      case "group":
        return this.renderSheets(v.group.sheets, v.group);
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
        return { view: this.groups ? "sheet groups" : "sheet list", location, listing };
      case "group":
        return { view: "sheet group", location, listing, group: groupLabel(v.group) };
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

  /** What "view" should show: the current sheet's page, outlining the current selection or level. */
  viewTarget(): ViewTarget | { error: string } {
    const v = this.view;
    if (v.kind === "sheets" || v.kind === "group") return { error: "Open a sheet first, then type \"view\"." };
    const sel = this.selection?.view === v ? this.selection : undefined;
    if (sel) return { sheet: v.sheet, label: sel.label, bbox: sel.bbox, id: sel.id };
    switch (v.kind) {
      case "sheet":
        return { sheet: v.sheet, label: `sheet ${v.sheet.sheetNumber}`, wholePage: true };
      case "drawing":
        return { sheet: v.sheet, label: `drawing ${drawingName(v.drawing)}`, bbox: v.drawing.bbox, id: v.drawing["@id"] };
      case "layer":
        return {
          sheet: v.sheet,
          label: `layer ${v.layer.name}`,
          id: v.layer["@id"],
          bbox: v.layer.bbox ?? unionBBox((v.layer.items ?? []).map((i) => i.bbox)),
        };
    }
  }

  private select(label: string, bbox: BBox | undefined, id?: string): void {
    this.selection = { view: this.view, label, bbox, id };
  }

  private capture(fn: () => void): string[] {
    const lines: string[] = [];
    const log = this.log;
    const refs = this.refs;
    this.log = (line = "") => lines.push(line);
    try {
      withPalette(PLAIN, fn);
    } finally {
      this.log = log;
      this.refs = refs;
    }
    return lines;
  }

  help(): void {
    this.log();
    const kind = this.view.kind;
    if (kind === "sheets" && this.groups) {
      this.log("  Enter a group number or prefix (e.g. \"A\") to list its sheets, or a sheet number to open it.");
    } else if (kind === "sheets" || kind === "group") {
      this.log("  Enter a sheet number or page index to open it.");
      if (kind === "group") this.log('  "back" (or "..") returns to the sheet groups.');
    } else {
      this.log("  Enter a number from the list to dive in.");
      this.log('  "back" (or "..") goes up a level, "top" returns to the sheet list.');
      this.log('  "r1", "r2", … jump to a reference (the lines marked "→ [r1]"); "back" comes back.');
    }
    if (this.view.kind === "sheet") this.log('  "all" prints everything on this sheet.');
    if (kind !== "sheets" && kind !== "group") {
      this.log('  "view" opens this page from the PDF with the current selection outlined in red.');
      this.log('  "markups" lists markups the assistant proposed; "markups save" writes them to a copy of the PDF.');
    }
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
    if (parseViewCommand(answer)) {
      this.log('"view" can\'t be run from here; the assistant uses its show_page tool instead.');
      return true;
    }
    if (parseMarkupsCommand(answer)) {
      this.log('"markups" can\'t be run from here; the user types it to review and save markups.');
      return true;
    }
    if (cmd === "list" || cmd === "ls") {
      this.render();
      return true;
    }
    if (cmd === "back" || cmd === ".." || cmd === "b" || cmd === "up") {
      if (this.stack.length > 1) this.stack.pop();
      this.selection = undefined;
      this.render();
      return true;
    }
    if (cmd === "top" || cmd === "home") {
      this.stack = [{ kind: "sheets" }];
      this.selection = undefined;
      this.render();
      return true;
    }

    const v = this.view;
    const ref = REF_COMMAND.exec(answer);
    if (ref && v.kind !== "sheets" && v.kind !== "group") {
      this.jump(ref[1] ? Number(ref[1]) : undefined, answer);
      return true;
    }
    if (v.kind === "sheets" && this.groups) {
      this.openGroup(this.groups, answer);
      return true;
    }
    if (v.kind === "sheets" || v.kind === "group") {
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

  /** Picks a group by its number in the list or its prefix; a sheet number opens that sheet directly. */
  private openGroup(groups: SheetGroup[], selector: string): void {
    const sel = selector.trim().toLowerCase();
    const group = /^\d+$/.test(sel)
      ? groups[Number(sel) - 1]
      : groups.find((g) => (g.prefix || "other").toLowerCase() === sel || g.name?.toLowerCase() === sel);
    if (group) {
      this.stack.push({ kind: "group", group });
      this.render();
      return;
    }
    if (!/^\d+$/.test(sel)) {
      const sheet = (this.data.sheets ?? []).find((s) => s.sheetNumber.toLowerCase() === sel);
      if (sheet) {
        this.stack.push({ kind: "sheet", sheet });
        this.render();
        return;
      }
    }
    this.log(`No group "${selector}". Pick 1–${groups.length}, a prefix such as "${groups[0].prefix || "other"}", or a sheet number.`);
  }

  private selectSheetEntry(sheet: Sheet, index: number, raw: string): void {
    const entries = sheetEntries(sheet);
    const entry = entries[index - 1];
    if (!entry) {
      this.log(`No entry "${raw}". Pick 1–${entries.length}, or "back".`);
      return;
    }
    this.openEntry(sheet, entry);
  }

  private openEntry(sheet: Sheet, entry: SheetEntry): void {
    switch (entry.kind) {
      case "drawing":
        this.stack.push({ kind: "drawing", sheet, drawing: entry.value });
        this.render();
        return;
      case "table":
        this.lastShown = entry.value;
        this.select(`table ${entry.value.label ?? entry.value.title ?? "Untitled Table"}`, entry.value.bbox, entry.value["@id"]);
        printTable(entry.value);
        break;
      case "note":
        this.lastShown = entry.value;
        this.select(`note "${truncate(entry.value.content, 40)}"`, entry.value.bbox, entry.value["@id"]);
        printNote(entry.value);
        break;
      case "image":
        this.lastShown = entry.value;
        this.select(`image ${entry.value.caption ?? entry.value.role}`, entry.value.bbox, entry.value["@id"]);
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
    this.showItem(item);
  }

  private showItem(item: Item): void {
    this.lastShown = item;
    this.select(`item ${truncate(itemLabel(item), 40)}`, item.bbox, item["@id"]);
    printItem(item, this.resolve, refTag);
    this.refs = { view: this.view, ids: item.references ?? [] };
    this.log();
  }

  /** Opens the n-th reference on screen; the jump goes on the stack, so "back" returns. */
  private jump(n: number | undefined, raw: string): void {
    const ids = this.refs?.view === this.view ? this.refs.ids : [];
    if (ids.length === 0) {
      this.log('No references here to jump to. They show as "→ [r1] …" on drawings and items.');
      return;
    }
    if (n === undefined && ids.length > 1) {
      this.log(`Pick one of r1–r${ids.length}.`);
      return;
    }
    const id = ids[(n ?? 1) - 1];
    if (!id) {
      this.log(`No reference "${raw}". Pick r1–r${ids.length}, or "back".`);
      return;
    }
    const t = this.refIndex.get(id);
    if (!t) {
      this.log(`${raw} points to ${id}, which isn't in this file.`);
      return;
    }

    this.selection = undefined;
    const { sheet, drawing, layer } = t;
    if (drawing && layer) {
      this.stack.push({ kind: "layer", sheet, drawing, layer });
    } else if (drawing) {
      this.stack.push({ kind: "drawing", sheet, drawing });
    } else {
      this.stack.push({ kind: "sheet", sheet });
    }
    if (t.item) {
      this.log(`\n  Jumped to ${this.resolve(id)}. "back" returns.`);
      this.showItem(t.item);
    } else if (t.entry) {
      this.log(`\n  Jumped to ${this.resolve(id)}. "back" returns.`);
      this.openEntry(sheet, t.entry);
    } else {
      this.render();
    }
  }

  private renderGroups(groups: SheetGroup[]): void {
    this.log(`\n  ${palette().heading("Sheet groups")} (${plural(this.data.sheets?.length ?? 0, "sheet")}):`);
    groups.forEach((g, i) => {
      this.log(`    ${String(i + 1).padStart(2)}. ${palette().bold(groupLabel(g))} (${plural(g.sheets.length, "sheet")})`);
    });
    this.log();
  }

  private renderSheets(sheets: Sheet[], group?: SheetGroup): void {
    this.log();
    if (group) this.log(`  ${palette().heading(groupLabel(group))} (${plural(sheets.length, "sheet")}):\n`);
    for (const s of sheets) {
      this.log(`  ${palette().bold(s.sheetNumber)} - ${s.title} ${palette().dim(`(page ${s.pageIndex})`)}`);
    }
    this.log();
  }

  private renderSheet(sheet: Sheet): void {
    for (const line of sheetHeaderLines(sheet)) this.log(line);

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
        this.log(`\n  ${palette().heading(GROUP_TITLES[current])} (${count}):`);
      }
      this.log(`    ${String(i + 1).padStart(2)}. ${describeEntry(entry)}`);
    });
    this.log();
  }

  private renderDrawing(sheet: Sheet, drawing: Drawing): void {
    const c = palette();
    this.log(`\n  ${c.heading("Drawing:")} ${drawingName(drawing)}${drawingMeta(drawing)} (sheet ${sheet.sheetNumber})`);
    this.log(`    id:   ${c.dim(drawing["@id"])}`);
    this.log(`    bbox: ${bboxText(drawing.bbox)}`);
    const refs = drawing.references ?? [];
    refs.forEach((ref, i) => this.log(`    ${arrow()}${refTag(i)}${this.resolve(ref)}`));
    this.refs = { view: this.view, ids: refs };

    if (drawing.layers.length === 0) {
      this.log("\n  No layers.\n");
      return;
    }
    this.log(`\n  ${c.layer("Layers")} (${drawing.layers.length}):`);
    drawing.layers.forEach((layer, i) => {
      this.log(`    ${String(i + 1).padStart(2)}. ${layer.name} — ${plural(layer.items?.length ?? 0, "item")}`);
    });
    this.log();
  }

  private renderLayer(layer: Layer): void {
    const items = layer.items ?? [];
    const c = palette();
    this.log(`\n  ${c.layer("Layer:")} ${layer.name}`);
    if (layer.bbox) this.log(`    bbox: ${bboxText(layer.bbox)}`);

    if (items.length === 0) {
      this.log("\n  No items.\n");
      return;
    }
    this.log(`\n  ${c.heading("Items")} (${items.length}):`);
    items.forEach((item, i) => {
      this.log(`    ${String(i + 1).padStart(2)}. ${itemTypeTag(item)} ${truncate(itemLabel(item))}`);
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

export async function notSetUpMessage(models: MutableModels, info: AssistantInfo): Promise<string> {
  const run = 'Run "aecdo configure ai" to sign in or add an API key.';
  if (info.shortcut) return `@${info.name} goes through OpenRouter, which isn't set up yet. ${run}`;
  const viaOpenRouter =
    info.provider !== "openrouter" && (await isProviderConfigured(models, "openrouter").catch(() => false))
      ? " Or ask @openrouter (@or), which is already set up."
      : "";
  return `${info.label} isn't set up yet. ${run}${viaOpenRouter}`;
}

class AssistantBridge {
  private models?: MutableModels;
  private sessions = new Map<AssistantName, AssistantSession>();
  active?: AssistantSession;

  constructor(
    private data: DrawingSet,
    private filePath: string,
    private explorer: Explorer,
    private ask: (q: string) => Promise<string>,
    private viewer?: PageViewer,
    private markups?: MarkupSession
  ) {}

  async run(mention: Mention): Promise<void> {
    const info = mention.assistant;
    if (!info) {
      const names = Object.values(ASSISTANTS).map((a) => `@${a.name}`).join(", ");
      console.log(`Unknown assistant "@${mention.word}". Try one of ${names}.`);
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
      console.log(await notSetUpMessage(this.models, info));
      return undefined;
    }
    const model = await resolveAssistantModel(this.models, info.name);
    const session = await createAssistantSession(
      {
        data: this.data,
        filePath: this.filePath,
        cwd: process.cwd(),
        view: this.explorer,
        showPage: this.viewer ? async () => (await this.viewer!.show(this.explorer)).join("\n") : undefined,
        markups: this.markups,
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

export interface PageViewerDeps {
  /** Pending markups to draw, and the copy that holds saved ones. */
  markups?: Pick<MarkupSession, "pendingOn" | "savedCopy">;
  render?: (req: PageViewRequest) => Promise<PageViewResult>;
  open?: (path: string) => void;
  exists?: (path: string) => boolean;
  log?: (line?: string) => void;
}

/** Handles "view" in explore: finds the source PDF, renders the page with the red box, opens it. */
export class PageViewer {
  private pdfPath?: string;

  constructor(
    private data: DrawingSet,
    private filePath: string,
    private explicitPdf?: string,
    private deps: PageViewerDeps = {}
  ) {}

  /** Prints what happened and returns the same lines, so the assistant can report them. */
  async show(explorer: Explorer, pdfArg?: string): Promise<string[]> {
    const lines: string[] = [];
    const print = this.deps.log ?? console.log;
    const log = (line: string) => {
      lines.push(line);
      print(line);
    };
    const target = explorer.viewTarget();
    if ("error" in target) {
      log(target.error);
      return lines;
    }

    const pdf = this.locatePdf(pdfArg);
    if (!pdf.path) {
      log(pdfArg ? `Can't find "${pdfArg}".` : "Can't find the source PDF for this drawing set. Looked for:");
      if (!pdfArg) for (const c of pdf.looked) log(`  ${c}`);
      log('Type "view <path to pdf>", or start explore with --pdf <file>.');
      return lines;
    }

    if (!target.bbox && !target.wholePage) {
      log(`No bounding box for ${target.label}; showing the whole page.`);
    }

    const pending = this.deps.markups?.pendingOn(target.sheet.pageIndex) ?? [];
    const saved = pdfArg ? undefined : this.deps.markups?.savedCopy();
    try {
      const result = await (this.deps.render ?? renderPageView)({
        pdfPath: saved ?? pdf.path,
        pageIndex: target.sheet.pageIndex,
        bbox: target.bbox,
        name: target.sheet.sheetNumber,
        ...(pending.length ? { markups: pending } : {}),
      });
      this.pdfPath = pdf.path;
      if (saved) log(`Showing saved markups from ${basename(saved)}.`);
      if (pending.length) log(`Showing ${pending.length} pending markup${pending.length === 1 ? "" : "s"} (not saved yet; "markups save" writes them).`);
      if (result.outsidePage) {
        const { width, height } = result.outsidePage;
        log(`Note: the box [${target.bbox!.join(", ")}] runs past the page (${Math.round(width)} × ${Math.round(height)} pt), so it may be in different units.`);
      }
      const what = target.bbox ? ` with ${target.label} in red` : "";
      log(`Opening sheet ${target.sheet.sheetNumber} (page ${target.sheet.pageIndex}) of ${basename(pdf.path)}${what}:`);
      log(`  ${result.path}`);
      (this.deps.open ?? openWithDefaultApp)(result.path);
    } catch (err) {
      log(`Couldn't render the page: ${(err as Error).message}`);
    }
    return lines;
  }

  /** The source PDF "view" uses: an explicit path, the last one used, or one found next to the JSON-LD. */
  locatePdf(pdfArg?: string): { path?: string; looked: string[] } {
    const exists = this.deps.exists;
    if (pdfArg) {
      const looked = sourcePdfCandidates(this.filePath, this.data, pdfArg);
      return { path: findSourcePdf(looked, exists), looked };
    }
    if (this.pdfPath) return { path: this.pdfPath, looked: [this.pdfPath] };
    const looked = sourcePdfCandidates(this.filePath, this.data, this.explicitPdf);
    return { path: findSourcePdf(looked, exists), looked };
  }
}

export async function explore(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  if (opts.format === "json" || !process.stdin.isTTY) {
    await sheetsCmd(data, filePath, opts);
    return;
  }

  if (bannerEnabled()) {
    const name = data.filename || basename(filePath);
    console.log(`\n${renderBanner({ name, sheets: data.sheets?.length ?? 0 }, process.stdout.columns || 80).join("\n")}`);
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

  const rl = createInterface({ input: process.stdin, output: process.stdout, completer: completeMention });
  let editing = false;
  const ask = (q: string) =>
    new Promise<string>((res) => {
      editing = true;
      rl.question(q, (answer) => {
        editing = false;
        res(answer);
      });
    });
  const color = colorEnabled();
  if (color) enableMentionHighlight(rl, () => editing);
  const confirm = async (q: string) => /^y(es)?$/i.test((await ask(q)).trim());
  const viewerDeps: PageViewerDeps = {};
  const viewer = new PageViewer(data, filePath, opts.pdf, viewerDeps);
  const markups = new MarkupSession(data, { locatePdf: () => viewer.locatePdf(), target: () => explorer.viewTarget(), confirm });
  viewerDeps.markups = markups;
  const assistant = new AssistantBridge(data, filePath, explorer, ask, viewer, markups);

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
    const input = await ask(color ? stylePrompt(explorer.prompt()) : explorer.prompt());
    const mention = parseMention(input);
    if (mention) {
      await assistant.run(mention);
      continue;
    }
    const view = parseViewCommand(input);
    if (view) {
      await viewer.show(explorer, view.pdf);
      continue;
    }
    const markupCmd = parseMarkupsCommand(input);
    if (markupCmd) {
      await markups.run(markupCmd.action, markupCmd.args);
      continue;
    }
    running = explorer.handle(input);
    if (!running) await markups.beforeQuit();
  }

  rl.close();
}
