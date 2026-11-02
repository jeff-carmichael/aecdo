import { createInterface } from "node:readline";
import { readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { isValid } from "./validate.js";
import {
  printPage,
  printItem,
  printTable,
  printNote,
  printImage,
  buildRefResolver,
  sheetHeaderLines,
  itemTypeTag,
  itemName,
  withDetails,
  linkNote,
  fieldName,
  arrow,
  type RefResolver,
} from "./page.js";
import { palette, withPalette, bboxText, PLAIN } from "../lib/style.js";
import { sheets as sheetsCmd } from "./sheets.js";
import { formatTable, wrapText } from "../lib/table.js";
import { Screen } from "../lib/screen.js";
import { ExploreApp } from "./explore-app.js";
import {
  ASSISTANTS,
  assistantForMention,
  createLlmModels,
  getCustomEndpoint,
  pickRoute,
  resolveModel,
  routeLabel,
  routesFor,
  type AssistantInfo,
  type AssistantName,
} from "../lib/llm.js";
import { enableMentionHighlight, colorEnabled, completeMention, stylePrompt } from "../lib/mention-highlight.js";
import { createAssistantSession, type AssistantSession } from "../lib/assistant.js";
import {
  findSourcePdf,
  renderPageView,
  sourcePdfCandidates,
  sourcePdfCandidatesWithReasons,
  unionBBox,
  type BBox,
  type PageViewRequest,
  type PageViewResult,
} from "../lib/page-view.js";
import { openWithDefaultApp } from "../lib/open.js";
import { MarkupSession, parseMarkupsCommand } from "./markups.js";
import type { MutableModels } from "@earendil-works/pi-ai";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image, CommandOptions } from "../types.js";

type SheetEntry =
  | { kind: "drawing"; value: Drawing }
  | { kind: "table"; value: Table }
  | { kind: "note"; value: Note }
  | { kind: "image"; value: Image };

type DetailEntry = Exclude<SheetEntry, { kind: "drawing" }>;

/** A place in the tree. Items, tables, notes, and images are places too, so "back" returns to them. */
type Place =
  | { kind: "sheets" }
  | { kind: "group"; group: SheetGroup }
  | { kind: "sheet"; sheet: Sheet }
  | { kind: "drawing"; sheet: Sheet; drawing: Drawing }
  | { kind: "layer"; sheet: Sheet; drawing: Drawing; layer: Layer }
  | { kind: "item"; sheet: Sheet; drawing: Drawing; layer: Layer; item: Item }
  | { kind: "entry"; sheet: Sheet; entry: DetailEntry };

/** A place on the history stack; `via` says how it was reached when that was a reference jump. */
type View = Place & { via?: string };

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

function drawingSummary(d: Drawing): Record<string, unknown> {
  return { "@id": d["@id"], label: drawingName(d), drawingType: d.drawingType };
}

export function sheetEntries(sheet: Sheet): SheetEntry[] {
  return [
    ...(sheet.drawings ?? []).map((value) => ({ kind: "drawing" as const, value })),
    ...(sheet.tables ?? []).map((value) => ({ kind: "table" as const, value })),
    ...(sheet.notes ?? []).map((value) => ({ kind: "note" as const, value })),
    ...(sheet.images ?? []).map((value) => ({ kind: "image" as const, value })),
  ];
}

/** A sheet entry's name and a short dim note after it, such as the drawing's scale. */
function describeEntry(entry: SheetEntry): [string, string?] {
  switch (entry.kind) {
    case "drawing": {
      const d = entry.value;
      return [drawingName(d), [d.drawingType, d.scale].filter(Boolean).join(", ") || undefined];
    }
    case "table": {
      const t = entry.value;
      const rows = t.content.split("\n").filter((r) => r.trim()).length;
      return [t.label ?? t.title ?? "Untitled Table", plural(rows, "row")];
    }
    case "note":
      return [truncate(entry.value.content)];
    case "image":
      return [truncate(entry.value.caption ?? entry.value.role), entry.value.role];
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

function entryTitle(entry: DetailEntry): string {
  switch (entry.kind) {
    case "table":
      return entry.value.label ?? entry.value.title ?? "Untitled Table";
    case "note":
      return `note "${truncate(entry.value.content, 40)}"`;
    case "image":
      return entry.value.caption ?? entry.value.role;
  }
}

function samePlace(a: Place, b: Place): boolean {
  if (a.kind !== b.kind) return false;
  const x = a as Partial<Record<string, unknown>> & { entry?: DetailEntry };
  const y = b as Partial<Record<string, unknown>> & { entry?: DetailEntry };
  return (
    x.group === y.group &&
    x.sheet === y.sheet &&
    x.drawing === y.drawing &&
    x.layer === y.layer &&
    x.item === y.item &&
    x.entry?.value === y.entry?.value
  );
}

/** How many earlier places the assistant is told about. */
const HISTORY_FOR_ASSISTANT = 6;
const HISTORY_LIMIT = 20;

/** One selectable line in the full-screen view; `command` is what typing it at the prompt would do. */
export interface ScreenRow {
  label: string;
  note?: string;
  command: string;
  sheet?: Sheet;
}

export interface ScreenSection {
  heading?: string;
  note?: string;
  rows: ScreenRow[];
}

/** A screen's content as data: a title, a "where" line, free text, then selectable rows. */
export interface ScreenModel {
  title: string;
  subtitle: string;
  body?: string[];
  sections: ScreenSection[];
}

const ITEM_KIND_NAMES: Record<Item["itemType"], string> = { tag: "Tag", thing: "Element", area: "Area" };

export interface ExplorerOptions {
  /** The .jsonld file name, shown above the sheet list. */
  fileName?: string;
}

export class Explorer {
  private stack: View[] = [{ kind: "sheets" }];
  private resolve: RefResolver;
  /** The references shown with [r1], [r2] tags, and the view they belong to. */
  private refs?: { view: View; ids: string[] };
  private refIndex?: Map<string, RefTarget>;
  /** Set when the set has too many sheets to list flat. */
  private groups?: SheetGroup[];
  /** Places visited in order, newest last, including ones "back" has since left. */
  private visited: { location: string; via?: string }[] = [];
  /** Which one-time hints have been shown. */
  private hinted = new Set<string>();
  /** Whether ids and coordinates are shown; "details" toggles it. */
  private details = false;

  constructor(
    private data: DrawingSet,
    private log: (line?: string) => void = console.log,
    private opts: ExplorerOptions = {}
  ) {
    this.resolve = buildRefResolver(data);
    const sheets = data.sheets ?? [];
    if (sheets.length > SHEET_GROUP_THRESHOLD) {
      const groups = groupSheets(sheets);
      if (groups.length > 1) this.groups = groups;
    }
    this.moved();
  }

  get view(): View {
    return this.stack[this.stack.length - 1];
  }

  get showingDetails(): boolean {
    return this.details;
  }

  private path(v: Place): string[] {
    switch (v.kind) {
      case "sheets":
      case "group":
        return [];
      case "sheet":
        return [v.sheet.sheetNumber];
      case "drawing":
        return [v.sheet.sheetNumber, drawingName(v.drawing)];
      case "layer":
        return [v.sheet.sheetNumber, drawingName(v.drawing), v.layer.name];
      case "item":
        return [v.sheet.sheetNumber, drawingName(v.drawing), v.layer.name, truncate(itemName(v.item), 30)];
      case "entry":
        return [v.sheet.sheetNumber, truncate(entryTitle(v.entry), 30)];
    }
  }

  /** Where a place is, as the prompt shows it, e.g. "A101 › First Floor Plan › Doors". */
  private where(v: Place): string {
    if (v.kind === "sheets") return this.groups ? "sheet groups" : "sheet list";
    if (v.kind === "group") return `${groupLabel(v.group)} sheets`;
    return this.path(v).join(" › ");
  }

  prompt(): string {
    const v = this.view;
    if (v.kind === "group") return `${v.group.prefix || "other"} sheets> `;
    const parts = this.path(v);
    return parts.length ? `${parts.join(" › ")}> ` : "sheet> ";
  }

  render(): void {
    withDetails(this.details, () => this.renderView());
  }

  /** The set's name and the list the sheet pane shows: groups, one group's sheets, or every sheet. */
  sheetPane(): { title: string; rows: ScreenRow[]; current?: string } {
    const v = this.view;
    const current = v.kind === "sheets" || v.kind === "group" ? undefined : v.sheet.sheetNumber;
    const sheetRow = (s: Sheet): ScreenRow => ({ label: s.sheetNumber, note: s.title, command: s.sheetNumber, sheet: s });
    if (v.kind === "group") return { title: this.setTitle(), rows: v.group.sheets.map(sheetRow) };
    if (this.groups && v.kind === "sheets") {
      return {
        title: this.setTitle(),
        rows: this.groups.map((g, i) => ({ label: g.prefix || "-", note: `${g.name ?? "Other"} (${g.sheets.length})`, command: String(i + 1) })),
      };
    }
    const parent = current ? this.groups?.find((g) => g.sheets.some((s) => s.sheetNumber === current)) : undefined;
    return { title: this.setTitle(), rows: (parent?.sheets ?? this.data.sheets ?? []).map(sheetRow), current };
  }

  /** What the main pane shows for the current place (or for `sheet`, as a preview), without printing. */
  screenModel(width = 80, sheet?: Sheet): ScreenModel {
    return withDetails(this.details, () => this.model(sheet ? { kind: "sheet", sheet } : this.view, width));
  }

  private model(v: Place, width: number): ScreenModel {
    const rows = <T>(list: T[], toRow: (x: T, i: number) => ScreenRow) => list.map(toRow);
    const links = (refs: string[], heading: string): ScreenSection[] =>
      refs.length ? [{ heading, rows: rows(refs, (ref, i) => ({ label: this.resolve(ref), command: `r${i + 1}` })) }] : [];
    switch (v.kind) {
      case "sheets":
      case "group": {
        const sheets = v.kind === "group" ? v.group.sheets : (this.data.sheets ?? []);
        const sections: ScreenSection[] = [];
        for (const s of sheets) {
          const name = disciplineName(sheetPrefix(s.sheetNumber)) ?? "Other";
          if (sections.at(-1)?.heading !== name) sections.push({ heading: name, rows: [] });
          sections.at(-1)!.rows.push({ label: s.sheetNumber, note: s.title, command: s.sheetNumber });
        }
        return { title: v.kind === "group" ? groupLabel(v.group) : this.setTitle(), subtitle: plural(sheets.length, "sheet"), sections };
      }
      case "sheet": {
        const sections: ScreenSection[] = [];
        sheetEntries(v.sheet).forEach((entry, i) => {
          const heading = GROUP_TITLES[entry.kind];
          if (sections.at(-1)?.heading !== heading) sections.push({ heading, rows: [] });
          const [label, note] = describeEntry(entry);
          sections.at(-1)!.rows.push({ label, note, command: String(i + 1) });
        });
        const empty = sections.length ? undefined : ["Nothing was found on this sheet. Press v to look at the PDF page."];
        return { title: `${v.sheet.sheetNumber}  ${v.sheet.title}`, subtitle: `PDF page ${v.sheet.pageIndex + 1}`, sections, body: empty };
      }
      case "drawing": {
        const d = v.drawing;
        const kind = [d.drawingType, d.scale].filter(Boolean).join(", ");
        const layers: ScreenSection = {
          heading: "Layers",
          rows: rows(d.layers, (l, i) => ({ label: l.name, note: plural(l.items?.length ?? 0, "item"), command: String(i + 1) })),
        };
        return {
          title: drawingName(d),
          subtitle: `${kind ? `${kind[0].toUpperCase()}${kind.slice(1)}, on` : "On"} ${v.sheet.sheetNumber}`,
          body: this.details ? [`id    ${d["@id"]}`, `bbox  [${d.bbox.join(", ")}]`] : undefined,
          sections: [...(d.layers.length ? [layers] : []), ...links(d.references ?? [], "Links to other drawings")],
        };
      }
      case "layer": {
        const items = v.layer.items ?? [];
        return {
          title: v.layer.name,
          subtitle: `${plural(items.length, "item")} on ${drawingName(v.drawing)}, ${v.sheet.sheetNumber}`,
          body: this.details && v.layer.bbox ? [`bbox  [${v.layer.bbox.join(", ")}]`] : undefined,
          sections: [{ rows: rows(items, (item, i) => ({ label: truncate(itemName(item), 80), note: this.details ? `[${item.itemType.toUpperCase()}]` : undefined, command: String(i + 1) })) }],
        };
      }
      case "item": {
        const item = v.item;
        const fields = Object.entries(item.data).filter(([k]) => k !== "label");
        const keyWidth = Math.max(0, ...fields.map(([k]) => fieldName(k).length));
        const body = fields.flatMap(([k, value]) => {
          const text = typeof value === "string" ? value : Array.isArray(value) && value.every((x) => typeof x !== "object") ? value.join(", ") : JSON.stringify(value);
          return wrapText(text, Math.max(20, width - keyWidth - 5)).map((line, i) => `${i === 0 ? fieldName(k).padEnd(keyWidth) : " ".repeat(keyWidth)}   ${line}`);
        });
        if (this.details) body.push("", `id    ${item["@id"]}`, `type  ${item.itemType}`, ...(item.bbox ? [`bbox  [${item.bbox.join(", ")}]`] : []));
        return {
          title: itemName(item),
          subtitle: `${ITEM_KIND_NAMES[item.itemType]} on ${v.layer.name}, ${drawingName(v.drawing)}, ${v.sheet.sheetNumber}`,
          body: body.length ? body : ["Nothing else was read for this item."],
          sections: links(item.references ?? [], "Related"),
        };
      }
      case "entry": {
        const e = v.entry;
        const where = `on ${v.sheet.sheetNumber}`;
        if (e.kind === "table") {
          const t = e.value;
          return { title: t.label ?? t.title ?? "Untitled Table", subtitle: `Table ${where}`, sections: [], body: formatTable(t.content, Math.max(30, width - 2)) };
        }
        if (e.kind === "note") {
          return { title: "Note", subtitle: `Note ${where}`, sections: [], body: e.value.content.split("\n").flatMap((l) => wrapText(l, Math.max(20, width - 2))) };
        }
        const img = e.value;
        return {
          title: img.caption ?? img.role,
          subtitle: `${img.role[0].toUpperCase()}${img.role.slice(1)} ${where}`,
          sections: [],
          body: ["Press v to see it on the PDF page."],
        };
      }
    }
  }

  private renderView(): void {
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
        return this.renderLayer(v.sheet, v.drawing, v.layer);
      case "item":
        printItem(v.item, this.resolve, refTag, this.log, `${v.layer.name}, ${drawingName(v.drawing)}, ${v.sheet.sheetNumber}`);
        this.refs = { view: v, ids: v.item.references ?? [] };
        this.log();
        return;
      case "entry":
        if (v.entry.kind === "table") printTable(v.entry.value, this.log);
        else if (v.entry.kind === "note") printNote(v.entry.value, this.log);
        else printImage(v.entry.value, this.log);
        this.log();
        return;
    }
  }

  /** The current view as structured data, for the AI assistant, with how the user got here. */
  context(): Record<string, unknown> {
    const v = this.view;
    const location = this.where(v);
    const listing = this.capture(() => this.render()).join("\n").trim();
    return { ...this.viewContext(v, location, listing), ...this.historyContext() };
  }

  private viewContext(v: View, location: string, listing: string): Record<string, unknown> {
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
          drawing: drawingSummary(v.drawing),
          layer: v.layer,
        };
      case "item":
        return {
          view: "item",
          location,
          listing,
          sheet: sheetHeader(v.sheet),
          drawing: drawingSummary(v.drawing),
          layer: { "@id": v.layer["@id"], name: v.layer.name },
          item: v.item,
        };
      case "entry":
        return { view: v.entry.kind, location, listing, sheet: sheetHeader(v.sheet), [v.entry.kind]: v.entry.value };
    }
  }

  /** The last few places visited and whether this one was reached by following a reference. */
  private historyContext(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this.view.via) out.arrivedVia = `followed reference ${this.view.via}`;
    const earlier = this.visited.slice(0, -1).slice(-HISTORY_FOR_ASSISTANT);
    if (earlier.length) {
      out.recentlyVisited = earlier.map((p) => (p.via ? `${p.location} (followed reference ${p.via})` : p.location));
    }
    const prev = this.stack.at(-2);
    if (prev) out.backGoesTo = this.where(prev);
    return out;
  }

  /** Runs a command for the assistant; the user sees the same output as if they typed it. */
  navigate(command: string): Record<string, unknown> {
    this.handle(command);
    return this.context();
  }

  /** What "view" should show: the current sheet's page, outlining what is open. */
  viewTarget(): ViewTarget | { error: string } {
    const v = this.view;
    switch (v.kind) {
      case "sheets":
      case "group":
        return { error: "Open a sheet first, then type \"view\"." };
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
      case "item":
        return { sheet: v.sheet, label: `item ${truncate(itemName(v.item), 40)}`, bbox: v.item.bbox, id: v.item["@id"] };
      case "entry": {
        const e = v.entry;
        const label = e.kind === "note" ? entryTitle(e) : `${e.kind} ${entryTitle(e)}`;
        return { sheet: v.sheet, label, bbox: e.value.bbox, id: e.value["@id"] };
      }
    }
  }

  private capture(fn: () => void): string[] {
    const lines: string[] = [];
    const log = this.log;
    const refs = this.refs;
    const hinted = new Set(this.hinted);
    this.log = (line = "") => lines.push(line);
    try {
      withPalette(PLAIN, fn);
    } finally {
      this.log = log;
      this.refs = refs;
      this.hinted = hinted;
    }
    return lines;
  }

  help(): void {
    const kind = this.view.kind;
    const rows: [string, string][] = [];
    if (kind === "sheets" && this.groups) {
      rows.push(["3 or A", "see one group of sheets"], ["A101", "open a sheet by its sheet number"]);
    } else if (kind === "sheets" || kind === "group") {
      rows.push(["4 or A101", "open a sheet"]);
      if (kind === "group") rows.push(["up", "go back to the groups"]);
    } else {
      rows.push(
        ["1, 2, 3 …", "open something from the list"],
        ["up", "go up one level"],
        ["back", "go back to where you just were"],
        ["top", "go back to the sheet list"],
        ["r1, r2 …", 'follow a link to another sheet (shown as "→ [r1]")']
      );
    }
    if (kind === "sheet" || kind === "entry") rows.push(["all", "show everything on this sheet at once"]);
    if (kind !== "sheets" && kind !== "group") {
      rows.push(["view", "open this page of the PDF, outlined in red"], ["markups", "review markups the AI suggested, then save them"]);
    }
    if (kind !== "sheets" && kind !== "group") rows.push(["details", "show or hide ids and coordinates"]);
    rows.push(["ls", "show this list again"], ["@claude …", "ask the AI a question (or @chatgpt …)"], ["quit", "close explore"]);

    const c = palette();
    const width = Math.max(...rows.map(([cmd]) => cmd.length));
    this.log();
    for (const [cmd, what] of rows) this.log(`  ${c.bold(cmd.padEnd(width))}   ${what}`);
    this.log();
    this.log(`  ${c.dim("Type one and press Enter.")}`);
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
    if (cmd === "details") {
      this.details = !this.details;
      this.log(this.details ? '\n  Showing ids and coordinates. Type "details" again to hide them.' : "\n  Hiding ids and coordinates.");
      this.render();
      return true;
    }
    if (cmd === "list" || cmd === "ls") {
      this.render();
      return true;
    }
    if (cmd === "back" || cmd === "b") {
      if (this.stack.length > 1) {
        this.stack.pop();
        this.moved();
      }
      this.render();
      return true;
    }
    if (cmd === "up" || cmd === "..") {
      this.up();
      return true;
    }
    if (cmd === "top" || cmd === "home") {
      this.stack = [{ kind: "sheets" }];
      this.moved();
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
      this.openSheet(answer, v.kind === "group" ? v.group.sheets : (this.data.sheets ?? []));
      return true;
    }

    if ((v.kind === "sheet" || v.kind === "entry") && cmd === "all") {
      withDetails(this.details, () => printPage(v.sheet, this.data, this.resolve));
      return true;
    }

    const index = /^\d+$/.test(answer) ? Number(answer) : NaN;
    switch (v.kind) {
      case "sheet":
        this.selectSheetEntry(v.sheet, index, answer, "push");
        break;
      case "entry":
        this.selectSheetEntry(v.sheet, index, answer, "replace");
        break;
      case "drawing":
        this.selectLayer(v.sheet, v.drawing, index, answer);
        break;
      case "layer":
        this.selectItem(v.sheet, v.drawing, v.layer, index, answer, "push");
        break;
      case "item":
        this.selectItem(v.sheet, v.drawing, v.layer, index, answer, "replace");
        break;
    }
    return true;
  }

  /** The place one level up the tree from `v`. */
  private parentOf(v: Place): Place | undefined {
    switch (v.kind) {
      case "sheets":
        return undefined;
      case "group":
        return { kind: "sheets" };
      case "sheet": {
        const group = this.groups?.find((g) => g.sheets.includes(v.sheet));
        return group ? { kind: "group", group } : { kind: "sheets" };
      }
      case "drawing":
      case "entry":
        return { kind: "sheet", sheet: v.sheet };
      case "layer":
        return { kind: "drawing", sheet: v.sheet, drawing: v.drawing };
      case "item":
        return { kind: "layer", sheet: v.sheet, drawing: v.drawing, layer: v.layer };
    }
  }

  /**
   * Goes to the parent in the tree, which is what the prompt shows. When that is where the user
   * came from, it's the same as "back"; after a jump it walks up the target's tree instead, and
   * "back" still returns to where the jump started.
   */
  private up(): void {
    const parent = this.parentOf(this.view);
    if (!parent) {
      this.render();
      return;
    }
    const prev = this.stack.at(-2);
    if (prev && samePlace(prev, parent)) this.stack.pop();
    else this.stack[this.stack.length - 1] = parent;
    this.moved();
    this.render();
  }

  private go(place: Place, mode: "push" | "replace" = "push", via?: string): void {
    const view: View = via ? { ...place, via } : place;
    if (samePlace(this.view, place)) {
      this.render();
      return;
    }
    if (mode === "replace" && this.stack.length > 1) this.stack[this.stack.length - 1] = view;
    else this.stack.push(view);
    this.moved();
    this.render();
  }

  private moved(): void {
    const location = this.where(this.view);
    const via = this.view.via;
    const last = this.visited.at(-1);
    if (last?.location === location && last.via === via) return;
    this.visited.push(via ? { location, via } : { location });
    if (this.visited.length > HISTORY_LIMIT) this.visited.shift();
  }

  /**
   * Opens a sheet by its sheet number or its number in the list shown (1 is the first).
   * An exact sheet number wins, so a sheet numbered "1" still opens by name.
   */
  private openSheet(selector: string, shown: Sheet[]): void {
    const sel = selector.trim().toLowerCase();
    const byNumber = shown.find((s) => s.sheetNumber.toLowerCase() === sel) ?? (this.data.sheets ?? []).find((s) => s.sheetNumber.toLowerCase() === sel);
    const sheet = byNumber ?? (/^\d+$/.test(sel) ? shown[Number(sel) - 1] : undefined);
    if (!sheet) {
      this.log(`No sheet "${selector}". Type a number from 1 to ${shown.length}, or a sheet number like ${shown[0]?.sheetNumber ?? "A101"}.`);
      return;
    }
    this.go({ kind: "sheet", sheet });
  }

  /** Picks a group by its number in the list or its prefix; a sheet number opens that sheet directly. */
  private openGroup(groups: SheetGroup[], selector: string): void {
    const sel = selector.trim().toLowerCase();
    const group = /^\d+$/.test(sel)
      ? groups[Number(sel) - 1]
      : groups.find((g) => (g.prefix || "other").toLowerCase() === sel || g.name?.toLowerCase() === sel);
    if (group) {
      this.go({ kind: "group", group });
      return;
    }
    if (!/^\d+$/.test(sel)) {
      const sheet = (this.data.sheets ?? []).find((s) => s.sheetNumber.toLowerCase() === sel);
      if (sheet) {
        this.go({ kind: "sheet", sheet });
        return;
      }
    }
    this.log(`No group "${selector}". Type a number from 1 to ${groups.length}, a letter like ${groups[0].prefix || "other"}, or a sheet number.`);
  }

  /** From a sheet, an entry opens below it; from an open table, note, or image, it takes its place. */
  private selectSheetEntry(sheet: Sheet, index: number, raw: string, mode: "push" | "replace"): void {
    const entries = sheetEntries(sheet);
    const entry = entries[index - 1];
    if (!entry) {
      this.log(`No entry "${raw}". Pick 1–${entries.length}, or "up".`);
      return;
    }
    this.go(entry.kind === "drawing" ? { kind: "drawing", sheet, drawing: entry.value } : { kind: "entry", sheet, entry }, mode);
  }

  private selectLayer(sheet: Sheet, drawing: Drawing, index: number, raw: string): void {
    const layer = drawing.layers[index - 1];
    if (!layer) {
      this.log(`No layer "${raw}". Pick 1–${drawing.layers.length}, or "up".`);
      return;
    }
    this.go({ kind: "layer", sheet, drawing, layer });
  }

  /** From a layer, an item opens below it; from an open item, another item of the layer takes its place. */
  private selectItem(sheet: Sheet, drawing: Drawing, layer: Layer, index: number, raw: string, mode: "push" | "replace"): void {
    const items = layer.items ?? [];
    const item = items[index - 1];
    if (!item) {
      this.log(`No item "${raw}". Pick 1–${items.length}, or "up".`);
      return;
    }
    this.go({ kind: "item", sheet, drawing, layer, item }, mode);
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
    this.refIndex ??= buildRefIndex(this.data);
    const t = this.refIndex.get(id);
    if (!t) {
      this.log(`${raw} points to ${id}, which isn't in this file.`);
      return;
    }

    const { sheet, drawing, layer, item, entry } = t;
    let place: Place;
    if (drawing && layer && item) place = { kind: "item", sheet, drawing, layer, item };
    else if (drawing && layer) place = { kind: "layer", sheet, drawing, layer };
    else if (drawing) place = { kind: "drawing", sheet, drawing };
    else if (entry && entry.kind !== "drawing") place = { kind: "entry", sheet, entry };
    else place = { kind: "sheet", sheet };
    this.log(`\n  Jumped to ${this.resolve(id)}. "back" returns.`);
    this.go(place, "push", `${raw.toLowerCase()} from ${this.where(this.view)}`);
  }

  /** What the team calls the set: the PDF's name without the extension or underscores. */
  private setTitle(): string {
    const pdf = this.data.filename ? basename(this.data.filename).replace(/\.pdf$/i, "").replace(/_+/g, " ").trim() : "";
    return pdf || this.opts.fileName || "Drawing set";
  }

  /** A one-line nudge shown the first time each kind of list appears. */
  private hint(key: string, text: string): void {
    if (this.hinted.has(key)) return;
    this.hinted.add(key);
    this.log(`  ${palette().dim(text)}`);
    this.log();
  }

  private renderGroups(groups: SheetGroup[]): void {
    const c = palette();
    this.log(`\n  ${c.bold(this.setTitle())}`);
    this.log(`  ${c.dim(`${plural(this.data.sheets?.length ?? 0, "sheet")} in ${groups.length} groups`)}\n`);
    const numberWidth = String(groups.length).length;
    const prefixWidth = Math.max(...groups.map((g) => (g.prefix || "-").length));
    groups.forEach((g, i) => {
      const name = g.prefix ? `${g.prefix.padEnd(prefixWidth)}  ${g.name ?? ""}` : `${"-".padEnd(prefixWidth)}  Other`;
      this.log(`  ${c.dim(String(i + 1).padStart(numberWidth))}  ${c.bold(name)}  ${c.dim(plural(g.sheets.length, "sheet"))}`);
    });
    this.log();
    this.hint("groups", 'Type a number or letter (like A) to see those sheets, then press Enter. Type "help" for more.');
  }

  private renderSheets(sheets: Sheet[], group?: SheetGroup): void {
    const c = palette();
    this.log();
    if (group) {
      this.log(`  ${c.bold(groupLabel(group))}`);
      this.log(`  ${c.dim(plural(sheets.length, "sheet"))}\n`);
    } else {
      this.log(`  ${c.bold(this.setTitle())}`);
      this.log(`  ${c.dim(plural(sheets.length, "sheet"))}\n`);
    }
    const numberWidth = String(sheets.length).length;
    const sheetWidth = Math.max(...sheets.map((s) => s.sheetNumber.length));
    let prefix: string | undefined;
    sheets.forEach((s, i) => {
      const p = sheetPrefix(s.sheetNumber);
      if (prefix !== undefined && p !== prefix) this.log();
      prefix = p;
      this.log(`  ${c.dim(String(i + 1).padStart(numberWidth))}  ${c.bold(s.sheetNumber.padEnd(sheetWidth))}  ${s.title}`);
    });
    this.log();
    this.hint("sheets", 'Type a number or sheet number (like A101) and press Enter to open it. Type "help" for more.');
  }

  private renderSheet(sheet: Sheet): void {
    for (const line of sheetHeaderLines(sheet)) this.log(line);

    const entries = sheetEntries(sheet);
    if (entries.length === 0) {
      this.log('\n  Nothing was found on this sheet. Type "view" to look at the PDF page, or "up" to go back.\n');
      return;
    }

    const c = palette();
    const width = String(entries.length).length;
    const described = entries.map(describeEntry);
    const nameWidth = Math.min(50, Math.max(...described.filter(([, note]) => note).map(([name]) => name.length), 0));
    let current: SheetEntry["kind"] | undefined;
    entries.forEach((entry, i) => {
      if (entry.kind !== current) {
        current = entry.kind;
        this.log(`\n  ${c.bold(GROUP_TITLES[current])}`);
      }
      const [name, note] = described[i];
      const after = note ? `  ${" ".repeat(Math.max(0, nameWidth - name.length))}${c.dim(note)}` : "";
      this.log(`  ${c.dim(String(i + 1).padStart(width))}  ${name}${after}`);
    });
    this.log();
    this.hint("sheet", 'Type a number to open it, "view" to see the PDF page, or "up" to go back.');
  }

  /** A list of named rows with a dim count or note after each, numbered from 1. */
  private numbered(rows: [name: string, note?: string][]): void {
    const c = palette();
    const width = String(rows.length).length;
    const nameWidth = Math.min(50, Math.max(...rows.map(([n]) => n.length)));
    rows.forEach(([name, note], i) => {
      const after = note ? `  ${" ".repeat(Math.max(0, nameWidth - name.length))}${c.dim(note)}` : "";
      this.log(`  ${c.dim(String(i + 1).padStart(width))}  ${name}${after}`);
    });
  }

  private renderDrawing(sheet: Sheet, drawing: Drawing): void {
    const c = palette();
    const kind = [drawing.drawingType, drawing.scale].filter(Boolean).join(", ");
    this.log(`\n  ${c.bold(drawingName(drawing))}`);
    this.log(`  ${c.dim(`${kind ? `${kind[0].toUpperCase()}${kind.slice(1)}, on` : "On"} ${sheet.sheetNumber}`)}`);
    if (this.details) {
      this.log(`  ${c.dim(`id    ${drawing["@id"]}`)}`);
      this.log(`  ${c.dim("bbox")}  ${bboxText(drawing.bbox)}`);
    }

    if (drawing.layers.length === 0) {
      this.log("\n  Nothing was found in this drawing.\n");
    } else {
      this.log(`\n  ${c.bold("Layers")}`);
      this.numbered(drawing.layers.map((layer) => [layer.name, plural(layer.items?.length ?? 0, "item")]));
    }

    const refs = drawing.references ?? [];
    if (refs.length) {
      this.log(`\n  ${c.bold("Links to other drawings")}  ${c.dim(linkNote(refs.length))}`);
      refs.forEach((ref, i) => this.log(`  ${arrow()}${refTag(i)}${this.resolve(ref)}`));
    }
    this.refs = { view: this.view, ids: refs };
    this.log();
    this.hint("drawing", drawing.layers.length ? 'Type a number to open a layer, or "up" to go back.' : 'Type "up" to go back.');
  }

  private renderLayer(sheet: Sheet, drawing: Drawing, layer: Layer): void {
    const items = layer.items ?? [];
    const c = palette();
    this.log(`\n  ${c.bold(layer.name)}`);
    this.log(`  ${c.dim(`${plural(items.length, "item")} on ${drawingName(drawing)}, ${sheet.sheetNumber}`)}`);
    if (this.details && layer.bbox) this.log(`  ${c.dim("bbox")}  ${bboxText(layer.bbox)}`);

    if (items.length === 0) {
      this.log("\n  Nothing was found on this layer.\n");
      return;
    }
    this.log();
    if (this.details) {
      items.forEach((item, i) => this.log(`  ${c.dim(String(i + 1).padStart(String(items.length).length))}  ${itemTypeTag(item)} ${truncate(itemName(item))}`));
    } else {
      this.numbered(items.map((item) => [truncate(itemName(item))]));
    }
    this.log();
    this.hint("layer", 'Type a number to see what was read for it, or "up" to go back.');
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

/** Lists the ways to set up a model family, e.g. "an Anthropic API key, Amazon Bedrock, a custom endpoint, or OpenRouter". */
export function notSetUpMessage(info: AssistantInfo): string {
  const ways = routesFor(info.name).map((r) => SETUP_WAYS[r]);
  const list = ways.length > 1 ? `${ways.slice(0, -1).join(", ")}, or ${ways[ways.length - 1]}` : ways[0];
  return `${info.label} isn't set up yet. Run "aecdo configure ai" to add ${list}.`;
}

const SETUP_WAYS = {
  anthropic: "an Anthropic API key",
  openai: "a ChatGPT sign-in or OpenAI API key",
  "amazon-bedrock": "Amazon Bedrock",
  custom: "a custom endpoint",
  openrouter: "OpenRouter",
} as const;

/** Where the assistant's answer goes: the terminal for the typed prompt, the chat panel in full screen. */
interface AssistantOutput {
  write(text: string): void;
  print(line?: string): void;
  confirm(question: string): Promise<boolean>;
}

class AssistantBridge {
  private models?: MutableModels;
  private sessions = new Map<AssistantName, AssistantSession>();
  active?: AssistantSession;

  constructor(
    private data: DrawingSet,
    private filePath: string,
    private explorer: Explorer,
    private out: AssistantOutput,
    private viewer?: PageViewer,
    private markups?: MarkupSession
  ) {}

  async run(mention: Mention): Promise<void> {
    const info = mention.assistant;
    const print = (line = "") => this.out.print(line);
    if (!info) {
      const names = Object.values(ASSISTANTS).map((a) => `@${a.name}`).join(", ");
      print(`Unknown assistant "@${mention.word}". Try one of ${names}.`);
      return;
    }
    if (!mention.text) {
      print(`Ask something after @${info.name}, e.g. "@${info.name} summarize this sheet".`);
      return;
    }
    if (!nodeSupportsAssistant()) {
      print(`The AI assistant needs Node.js 22.19 or newer (you have ${process.versions.node}), or the standalone aecdo binary.`);
      return;
    }

    try {
      const session = await this.session(info);
      if (!session) return;
      this.active = session;
      print();
      await session.ask(mention.text);
      print();
    } catch (err) {
      print(`\n${info.label}: ${(err as Error).message}`);
    } finally {
      this.active = undefined;
    }
  }

  private async session(info: AssistantInfo): Promise<AssistantSession | undefined> {
    const existing = this.sessions.get(info.name);
    if (existing) return existing;

    this.models ??= await createLlmModels();
    const route = await pickRoute(this.models, info.name);
    if (!route) {
      this.out.print(notSetUpMessage(info));
      return undefined;
    }
    const model = resolveModel(this.models, info.name, route);
    this.out.print(palette().dim(`  ${info.label} via ${routeLabel(route.route, await getCustomEndpoint())} (${route.modelId})`));
    const session = await createAssistantSession(
      {
        data: this.data,
        filePath: this.filePath,
        cwd: process.cwd(),
        view: this.explorer,
        showPage: this.viewer ? async () => (await this.viewer!.show(this.explorer)).join("\n") : undefined,
        markups: this.markups,
        write: (text) => this.out.write(text),
        print: (line) => this.out.print(line),
        confirm: (q) => this.out.confirm(q),
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
  /** File names in a folder, for the "can't find the PDF" hint. */
  listDir?: (dir: string) => string[];
  log?: (line?: string) => void;
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
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
      for (const line of this.missingPdfLines(pdfArg)) log(line);
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
      log(`Opening sheet ${target.sheet.sheetNumber} (PDF page ${target.sheet.pageIndex + 1}) of ${basename(pdf.path)}${what}:`);
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

  /** Says which .jsonld is open, each path tried and why, and which PDFs are in that folder. */
  missingPdfLines(pdfArg?: string): string[] {
    const file = this.filePath.startsWith("job:") ? this.filePath : basename(this.filePath);
    const tried = sourcePdfCandidatesWithReasons(this.filePath, this.data, pdfArg ?? this.explicitPdf);
    const shown = tried.filter((c) => !(c.path.endsWith(".PDF") && tried.some((o) => o.path === `${c.path.slice(0, -4)}.pdf`)));
    const lines = [
      pdfArg ? `Can't find "${pdfArg}". Looked for:` : `Can't find the source PDF for ${file}. Looked for:`,
      ...shown.map((c) => `  ${c.path}  (${c.reason})`),
    ];
    if (!this.filePath.startsWith("job:")) {
      const dir = dirname(this.filePath);
      const names = (this.deps.listDir ?? listDir)(dir);
      const lower = new Set(names.map((n) => n.toLowerCase()));
      const pdfs = names.filter((n) => n.toLowerCase().endsWith(".pdf") && !shown.some((c) => basename(c.path) === n));
      // A PDF named like another .jsonld in the folder most likely belongs to that set.
      const owner = (pdf: string) => {
        const jsonld = `${pdf.slice(0, -4)}.jsonld`;
        return lower.has(jsonld.toLowerCase()) ? jsonld : undefined;
      };
      if (pdfs.length) {
        const more = pdfs.length > 5 ? `, and ${pdfs.length - 5} more` : "";
        const label = (p: string) => (owner(p) ? `${p} (goes with ${owner(p)})` : p);
        lines.push(`PDFs in that folder: ${pdfs.slice(0, 5).map(label).join(", ")}${more}.`);
        const free = pdfs.find((p) => !owner(p));
        if (free) {
          const example = relative(process.cwd(), join(dir, free)) || free;
          lines.push(`If one of them goes with ${file}, type "view ${example.includes(" ") ? `"${example}"` : example}".`);
        } else {
          lines.push(`Check that you opened the .jsonld you meant to.`);
        }
      }
    }
    lines.push('Type "view <path to pdf>", or start explore with --pdf <file>.');
    return lines;
  }
}

/** Full screen needs a real terminal big enough for two lines of chrome plus a list. */
export function useFullScreen(opts: CommandOptions, env = process.env, out: NodeJS.WriteStream = process.stdout): boolean {
  if (opts.classic || env.AECDO_EXPLORE === "classic" || env.TERM === "dumb") return false;
  return Boolean(out.isTTY && process.stdin.isTTY) && (out.columns ?? 0) >= 50 && (out.rows ?? 0) >= 12;
}

/** Asks one question on the normal terminal; Ctrl+C answers "". */
function questionOnce(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((res) => {
    rl.on("SIGINT", () => {
      process.stdout.write("\n");
      rl.close();
      res("");
    });
    rl.question(q, (answer) => {
      rl.close();
      res(answer);
    });
  });
}

async function exploreFullScreen(data: DrawingSet, filePath: string, opts: CommandOptions): Promise<void> {
  let sink: (line: string) => void = () => undefined;
  const explorer = new Explorer(data, (line = "") => sink(line), { fileName: basename(filePath) });
  const screen = new Screen();
  const ask = (q: string) => questionOnce(q);
  const confirm = async (q: string) => /^y(es)?$/i.test((await ask(q)).trim());
  // The chat lives in `app`, created below; nothing calls these before then.
  const chat: AssistantOutput = {
    write: (text) => app.chatWrite(text),
    print: (line = "") => app.chatPrint(line),
    confirm: (q) => (screen.suspended ? confirm(q) : app.chatConfirm(q)),
  };
  const viewerDeps: PageViewerDeps = { log: (line = "") => chat.print(line) };
  const viewer = new PageViewer(data, filePath, opts.pdf, viewerDeps);
  const markups = new MarkupSession(data, { locatePdf: () => viewer.locatePdf(), target: () => explorer.viewTarget(), confirm });
  viewerDeps.markups = markups;
  const assistant = new AssistantBridge(data, filePath, explorer, chat, viewer, markups);
  const c = palette();
  let lastAssistant = "claude";

  const app: ExploreApp = new ExploreApp(explorer, screen, {
    collect: (fn) => {
      const lines: string[] = [];
      const previous = sink;
      sink = (line) => lines.push(line);
      try {
        fn();
      } finally {
        sink = previous;
      }
      return lines;
    },
    view: async () => {
      const lines: string[] = [];
      const previous = viewerDeps.log;
      viewerDeps.log = (line = "") => lines.push(line);
      try {
        await viewer.show(explorer);
      } finally {
        viewerDeps.log = previous;
      }
      return lines;
    },
    ask: async (text) => {
      // A question without @name goes to whichever assistant was asked last.
      const mention = parseMention(text.startsWith("@") ? text : `@${lastAssistant} ${text}`)!;
      if (mention.assistant) lastAssistant = mention.assistant.name;
      await assistant.run(mention);
    },
    stopAsking: () => assistant.active?.abort(),
    markups: async () => {
      for (;;) {
        console.log();
        await markups.run("list", []);
        const answer = (await ask(c.dim('\nType "save", "undo", or "remove 2" — or press Enter to go back: '))).trim();
        if (!answer) return;
        const cmd = parseMarkupsCommand(`markups ${answer}`);
        if (cmd) await markups.run(cmd.action, cmd.args);
      }
    },
    hasPendingMarkups: () => markups.pending.length > 0,
    beforeQuit: () => markups.beforeQuit(),
  });

  screen.start(
    (str, key) => app.handleKey(str, key),
    () => app.redraw()
  );
  try {
    await app.run();
  } finally {
    screen.stop();
  }
}

/** Bold cyan, the same accent the pickers use, so the prompt is the one colored thing to look for. */
const PROMPT_COLOR = "\x1b[1;36m";

export async function explore(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  if (opts.format === "json" || !process.stdin.isTTY) {
    await sheetsCmd(data, filePath, opts);
    return;
  }

  if (!(await isValid(data, opts.schema))) {
    const name = filePath.startsWith("job:") ? "this file" : basename(filePath);
    console.log(`\n  ${palette().warn(`Some of ${name} doesn't match the AECDO format, so parts may be missing.`)}`);
    console.log(`  ${palette().dim(`Run "aecdo validate ${name}" to see what's wrong.`)}`);
  }

  if ((data.sheets ?? []).length === 0) {
    console.log("\n  This file has no sheets to show.");
    return;
  }

  if (useFullScreen(opts)) {
    await exploreFullScreen(data, filePath, opts);
    return;
  }

  const explorer = new Explorer(data, console.log, { fileName: basename(filePath) });
  explorer.render();

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
  const assistant = new AssistantBridge(
    data,
    filePath,
    explorer,
    { write: (text) => process.stdout.write(text), print: (line = "") => console.log(line), confirm },
    viewer,
    markups
  );

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
    const input = await ask(color ? stylePrompt(explorer.prompt(), PROMPT_COLOR) : explorer.prompt());
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
