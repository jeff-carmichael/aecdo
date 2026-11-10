import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
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
  plainValue,
  bboxText,
  type RefResolver,
} from "./page.js";
import { parseTable } from "../lib/table.js";
import {
  ASSISTANTS,
  assistantForMention,
  availableRoutes,
  createLlmModels,
  getCustomEndpoint,
  pickRoute,
  resolveModel,
  routeLabel,
  routesFor,
  type AssistantInfo,
  type AssistantName,
} from "../lib/llm.js";
import { createAssistantSession, type AssistantSession } from "../lib/assistant.js";
import {
  findSourcePdf,
  sourcePdfCandidates,
  sourcePdfCandidatesWithReasons,
  unionBBox,
  type BBox,
} from "../lib/pdf-page.js";
import type { MarkupSession } from "./markups.js";
import type { MutableModels } from "@earendil-works/pi-ai";
import type { DrawingSet, Sheet, Drawing, Layer, Item, Table, Note, Image } from "../types.js";

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
  return `${`[r${i + 1}]`} `;
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

  /** True when "back" has somewhere to return to. */
  get canGoBack(): boolean {
    return this.stack.length > 1;
  }

  /** Where the user is, as the prompt and history name it, e.g. "A101 › First Floor Plan". */
  location(): string {
    return this.where(this.view);
  }

  /** Every sheet as a row, for finding one from anywhere. */
  allSheetRows(): ScreenRow[] {
    return (this.data.sheets ?? []).map((s) => ({ label: s.sheetNumber, note: s.title, command: s.sheetNumber, sheet: s }));
  }

  /** Opens a sheet on top of where the user is, so "back" returns there. */
  openSheetFromAnywhere(sheet: Sheet): void {
    this.go({ kind: "sheet", sheet });
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
  screenModel(sheet?: Sheet): ScreenModel {
    return withDetails(this.details, () => this.model(sheet ? { kind: "sheet", sheet } : this.view));
  }

  private model(v: Place): ScreenModel {
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
        const body = fields.map(([k, value]) => `${fieldName(k).padEnd(keyWidth)}   ${plainValue(value)}`);
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
          return { title: t.label ?? t.title ?? "Untitled Table", subtitle: `Table ${where}`, sections: [], body: parseTable(t.content).map((row) => row.join(" | ")) };
        }
        if (e.kind === "note") {
          return { title: "Note", subtitle: `Note ${where}`, sections: [], body: e.value.content.split("\n") };
        }
        const img = e.value;
        return {
          title: img.caption ?? img.role,
          subtitle: `${img.role[0].toUpperCase()}${img.role.slice(1)} ${where}`,
          sections: [],
          body: ["Outlined on the PDF page."],
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

  /** What the PDF pane outlines: the current sheet's page and what is open on it. */
  viewTarget(): ViewTarget | { error: string } {
    const v = this.view;
    switch (v.kind) {
      case "sheets":
      case "group":
        return { error: "Open a sheet first." };
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
      fn();
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
    if (kind !== "sheets" && kind !== "group") rows.push(["details", "show or hide ids and coordinates"]);
    rows.push(["ls", "show this list again"]);

    const width = Math.max(...rows.map(([cmd]) => cmd.length));
    this.log();
    for (const [cmd, what] of rows) this.log(`  ${cmd.padEnd(width)}   ${what}`);
    this.log();
    this.log(`  Type one and press Enter.`);
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
    if (/^\/?view\b/i.test(answer)) {
      this.log('"view" can\'t be run from here; use the show_page tool instead.');
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
    const place = this.placeOf(id);
    if (!place) {
      this.log(`${raw} points to ${id}, which isn't in this file.`);
      return;
    }
    this.log(`\n  Jumped to ${this.resolve(id)}. "back" returns.`);
    this.go(place, "push", `${raw.toLowerCase()} from ${this.where(this.view)}`);
  }

  /** Where the sheet, drawing, layer, item, table, note, or image with this `@id` is. */
  private placeOf(id: string): Place | undefined {
    this.refIndex ??= buildRefIndex(this.data);
    const t = this.refIndex.get(id);
    if (!t) return undefined;
    const { sheet, drawing, layer, item, entry } = t;
    if (drawing && layer && item) return { kind: "item", sheet, drawing, layer, item };
    if (drawing && layer) return { kind: "layer", sheet, drawing, layer };
    if (drawing) return { kind: "drawing", sheet, drawing };
    if (entry && entry.kind !== "drawing") return { kind: "entry", sheet, entry };
    return { kind: "sheet", sheet };
  }

  /** Opens whatever has this `@id`, on top of where the user is, so "back" returns. False if it isn't in the set. */
  openById(id: string): boolean {
    const place = this.placeOf(id);
    if (!place) return false;
    this.go(place);
    return true;
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
    this.log(`  ${text}`);
    this.log();
  }

  private renderGroups(groups: SheetGroup[]): void {
    this.log(`\n  ${this.setTitle()}`);
    this.log(`  ${`${plural(this.data.sheets?.length ?? 0, "sheet")} in ${groups.length} groups`}\n`);
    const numberWidth = String(groups.length).length;
    const prefixWidth = Math.max(...groups.map((g) => (g.prefix || "-").length));
    groups.forEach((g, i) => {
      const name = g.prefix ? `${g.prefix.padEnd(prefixWidth)}  ${g.name ?? ""}` : `${"-".padEnd(prefixWidth)}  Other`;
      this.log(`  ${String(i + 1).padStart(numberWidth)}  ${name}  ${plural(g.sheets.length, "sheet")}`);
    });
    this.log();
    this.hint("groups", 'Type a number or letter (like A) to see those sheets, then press Enter. Type "help" for more.');
  }

  private renderSheets(sheets: Sheet[], group?: SheetGroup): void {
    this.log();
    if (group) {
      this.log(`  ${groupLabel(group)}`);
      this.log(`  ${plural(sheets.length, "sheet")}\n`);
    } else {
      this.log(`  ${this.setTitle()}`);
      this.log(`  ${plural(sheets.length, "sheet")}\n`);
    }
    const numberWidth = String(sheets.length).length;
    const sheetWidth = Math.max(...sheets.map((s) => s.sheetNumber.length));
    let prefix: string | undefined;
    sheets.forEach((s, i) => {
      const p = sheetPrefix(s.sheetNumber);
      if (prefix !== undefined && p !== prefix) this.log();
      prefix = p;
      this.log(`  ${String(i + 1).padStart(numberWidth)}  ${s.sheetNumber.padEnd(sheetWidth)}  ${s.title}`);
    });
    this.log();
    this.hint("sheets", 'Type a number or sheet number (like A101) and press Enter to open it. Type "help" for more.');
  }

  private renderSheet(sheet: Sheet): void {
    for (const line of sheetHeaderLines(sheet)) this.log(line);

    const entries = sheetEntries(sheet);
    if (entries.length === 0) {
      this.log('\n  Nothing was found on this sheet. Look at the PDF page, or type "up" to go back.\n');
      return;
    }

    const width = String(entries.length).length;
    const described = entries.map(describeEntry);
    const nameWidth = Math.min(50, Math.max(...described.filter(([, note]) => note).map(([name]) => name.length), 0));
    let current: SheetEntry["kind"] | undefined;
    entries.forEach((entry, i) => {
      if (entry.kind !== current) {
        current = entry.kind;
        this.log(`\n  ${GROUP_TITLES[current]}`);
      }
      const [name, note] = described[i];
      const after = note ? `  ${" ".repeat(Math.max(0, nameWidth - name.length))}${note}` : "";
      this.log(`  ${String(i + 1).padStart(width)}  ${name}${after}`);
    });
    this.log();
    this.hint("sheet", 'Type a number to open it, or "up" to go back.');
  }

  /** A list of named rows with a dim count or note after each, numbered from 1. */
  private numbered(rows: [name: string, note?: string][]): void {
    const width = String(rows.length).length;
    const nameWidth = Math.min(50, Math.max(...rows.map(([n]) => n.length)));
    rows.forEach(([name, note], i) => {
      const after = note ? `  ${" ".repeat(Math.max(0, nameWidth - name.length))}${note}` : "";
      this.log(`  ${String(i + 1).padStart(width)}  ${name}${after}`);
    });
  }

  private renderDrawing(sheet: Sheet, drawing: Drawing): void {
    const kind = [drawing.drawingType, drawing.scale].filter(Boolean).join(", ");
    this.log(`\n  ${drawingName(drawing)}`);
    this.log(`  ${`${kind ? `${kind[0].toUpperCase()}${kind.slice(1)}, on` : "On"} ${sheet.sheetNumber}`}`);
    if (this.details) {
      this.log(`  ${`id    ${drawing["@id"]}`}`);
      this.log(`  bbox  ${bboxText(drawing.bbox)}`);
    }

    if (drawing.layers.length === 0) {
      this.log("\n  Nothing was found in this drawing.\n");
    } else {
      this.log(`\n  Layers`);
      this.numbered(drawing.layers.map((layer) => [layer.name, plural(layer.items?.length ?? 0, "item")]));
    }

    const refs = drawing.references ?? [];
    if (refs.length) {
      this.log(`\n  Links to other drawings  ${linkNote(refs.length)}`);
      refs.forEach((ref, i) => this.log(`  ${arrow()}${refTag(i)}${this.resolve(ref)}`));
    }
    this.refs = { view: this.view, ids: refs };
    this.log();
    this.hint("drawing", drawing.layers.length ? 'Type a number to open a layer, or "up" to go back.' : 'Type "up" to go back.');
  }

  private renderLayer(sheet: Sheet, drawing: Drawing, layer: Layer): void {
    const items = layer.items ?? [];
    this.log(`\n  ${layer.name}`);
    this.log(`  ${`${plural(items.length, "item")} on ${drawingName(drawing)}, ${sheet.sheetNumber}`}`);
    if (this.details && layer.bbox) this.log(`  bbox  ${bboxText(layer.bbox)}`);

    if (items.length === 0) {
      this.log("\n  Nothing was found on this layer.\n");
      return;
    }
    this.log();
    if (this.details) {
      items.forEach((item, i) => this.log(`  ${String(i + 1).padStart(String(items.length).length)}  ${itemTypeTag(item)} ${truncate(itemName(item))}`));
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
  return `${info.label} isn't set up yet. Open Settings (press ",") to add ${list}.`;
}

const SETUP_WAYS = {
  anthropic: "an Anthropic API key",
  openai: "a ChatGPT sign-in or OpenAI API key",
  "amazon-bedrock": "Amazon Bedrock",
  custom: "a custom endpoint",
  openrouter: "OpenRouter",
} as const;

/** Where the assistant's answer goes: the terminal for the typed prompt, the chat panel in full screen or the app. */
/** Which model an @mention uses and how it's reached. */
export interface AiModel {
  /** The model family, e.g. "Claude". */
  label: string;
  /** The model and how it's reached, e.g. "claude-sonnet-5-5 via Anthropic", or "not set up". */
  detail?: string;
  /** The other @names that are set up, e.g. ["@chatgpt"]. */
  others: string[];
}

export interface AssistantOutput {
  write(text: string): void;
  print(line?: string): void;
  confirm(question: string): Promise<boolean>;
}

export interface AssistantBridgeOptions {
  data: DrawingSet;
  filePath: string;
  explorer: Explorer;
  out: AssistantOutput;
  markups?: MarkupSession;
  /** Called after each move the assistant makes, so the screen can show it. */
  onNavigate?: () => void;
  /** Shows the open place on the PDF page (the app zooms its PDF pane). */
  showPage?: () => Promise<string>;
  /** Called when the assistant starts using a tool. */
  onTool?: (name: string, args: unknown) => void;
  /** Models to use instead of the ones set up with "aecdo configure ai" (tests). */
  models?: MutableModels;
}

/** Runs @mentions: one conversation per model family, kept for the session. */
export class AssistantBridge {
  private models?: MutableModels;
  private sessions = new Map<AssistantName, AssistantSession>();
  active?: AssistantSession;
  private setUpNames?: AssistantName[];

  constructor(private opts: AssistantBridgeOptions) {
    this.models = opts.models;
  }

  /**
   * Forgets what's set up after the settings change. Conversations already started keep their model;
   * the next @mention of another family uses the new settings.
   */
  reload(): void {
    if (this.opts.models) return;
    this.models = undefined;
    this.setUpNames = undefined;
  }

  /** The model families that have a way to reach them set up, in the usual order. */
  async setUp(): Promise<AssistantName[]> {
    if (this.setUpNames) return this.setUpNames;
    if (!nodeSupportsAssistant()) return (this.setUpNames = []);
    this.models ??= await createLlmModels();
    const names = Object.keys(ASSISTANTS) as AssistantName[];
    const routes = await Promise.all(names.map((n) => availableRoutes(this.models!, n)));
    return (this.setUpNames = names.filter((_, i) => routes[i].length > 0));
  }

  /** Which model @name uses and how it's reached, without starting a conversation. */
  async describe(name: AssistantName): Promise<AiModel> {
    const info = ASSISTANTS[name];
    const setUp = await this.setUp();
    const others = setUp.filter((n) => n !== name).map((n) => `@${n}`);
    if (!this.models || !setUp.includes(name)) return { label: info.label, detail: "not set up", others };
    const route = await pickRoute(this.models, name);
    if (!route) return { label: info.label, detail: "not set up", others };
    return { label: info.label, detail: `${route.modelId} via ${routeLabel(route.route, await getCustomEndpoint())}`, others };
  }

  async run(mention: Mention): Promise<void> {
    const info = mention.assistant;
    const print = (line = "") => this.opts.out.print(line);
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

    const { data, filePath, explorer, out, markups, onNavigate, onTool, showPage } = this.opts;
    this.models ??= await createLlmModels();
    const route = await pickRoute(this.models, info.name);
    if (!route) {
      out.print(notSetUpMessage(info));
      return undefined;
    }
    const model = resolveModel(this.models, info.name, route);
    out.print(`  ${info.label} via ${routeLabel(route.route, await getCustomEndpoint())} (${route.modelId})`);
    const session = await createAssistantSession(
      {
        data,
        filePath,
        cwd: process.cwd(),
        view: {
          context: () => explorer.context(),
          navigate: (command) => {
            const result = explorer.navigate(command);
            onNavigate?.();
            return result;
          },
        },
        showPage,
        markups,
        write: (text) => out.write(text),
        print: (line) => out.print(line),
        confirm: (q) => out.confirm(q),
        onTool,
      },
      info,
      this.models,
      model
    );
    this.sessions.set(info.name, session);
    return session;
  }
}

export interface PdfLocatorDeps {
  exists?: (path: string) => boolean;
  /** File names in a folder, for the "can't find the PDF" hint. */
  listDir?: (dir: string) => string[];
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Finds the source PDF for a drawing set, and says where it looked when it can't. */
export class PdfLocator {
  constructor(
    private data: DrawingSet,
    private filePath: string,
    private explicitPdf?: string,
    private deps: PdfLocatorDeps = {}
  ) {}

  /** The source PDF: an explicit path, or one found next to the JSON-LD. */
  locatePdf(pdfArg?: string): { path?: string; looked: string[] } {
    const exists = this.deps.exists;
    if (pdfArg) {
      const looked = sourcePdfCandidates(this.filePath, this.data, pdfArg);
      return { path: findSourcePdf(looked, exists), looked };
    }
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
        if (pdfs.every((p) => owner(p))) lines.push(`Check that you opened the .jsonld you meant to.`);
      }
    }
    return lines;
  }
}

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const compact = (s: string): string => words(s).join("");

/**
 * The sheets a search finds: sheet numbers that start with what was typed ("a1" finds A101), or else
 * sheets where each typed word starts a word of the number or title.
 */
export function findSheetRows(rows: ScreenRow[], filter: string): ScreenRow[] {
  const query = words(filter);
  if (!query.length) return rows;
  const byNumber = rows.filter((r) => compact(r.label).startsWith(query.join("")));
  return byNumber.length ? byNumber : rows.filter((r) => startsWords(query, r));
}

/** Each typed word must start a word of the sheet number or title. */
function startsWords(query: string[], row: ScreenRow): boolean {
  const all = [...words(row.label), ...words(row.note ?? "")];
  return query.every((q) => all.some((w) => w.startsWith(q)));
}
