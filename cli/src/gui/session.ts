import { basename, dirname } from "node:path";
import { existsSync } from "node:fs";
import { Explorer, PageViewer, AssistantBridge, parseMention, notSetUpMessage, sheetEntries, buildRefIndex, groupSheets, SHEET_GROUP_THRESHOLD, type ScreenModel, type ViewTarget, type AssistantOutput } from "../commands/explore.js";
import { findSheetRows } from "../commands/explore-app.js";
import { MarkupSession, type MarkupRequest } from "../commands/markups.js";
import { fieldName, plainValue } from "../commands/page.js";
import { stripAnsi } from "../lib/tui.js";
import { parseTable } from "../lib/table.js";
import { findSourcePdf, sourcePdfCandidates, unionBBox, type BBox } from "../lib/page-view.js";
import { listPdfs } from "../lib/picker.js";
import { ASSISTANTS, type AssistantName } from "../lib/llm.js";
import { MARKUP_KINDS, type Markup, type MarkupKind } from "../lib/markup.js";
import type { DrawingSet, Sheet } from "../types.js";

/** Something on the page a row or box points at. */
export interface PageBox {
  bbox: BBox;
  pageIndex: number;
  id?: string;
  kind?: string;
}

export interface GuiRow {
  label: string;
  note?: string;
  command: string;
  box?: PageBox;
}

export interface GuiSection {
  heading?: string;
  note?: string;
  rows: GuiRow[];
}

/** One level of the breadcrumb; `command` goes there. */
export interface Crumb {
  label: string;
  commands: string[];
}

/** What the app shows for the current place. */
export interface GuiState {
  location: string;
  kind: string;
  canGoBack: boolean;
  details: boolean;
  title: string;
  subtitle: string;
  crumbs: Crumb[];
  /** Free text lines (notes, images, empty sheets). */
  body?: string[];
  /** Field name and value for an item. */
  fields?: [string, string][];
  /** Header row first. */
  table?: string[][];
  sections: GuiSection[];
  sheet?: { sheetNumber: string; title: string; pageIndex: number };
  /** What the PDF pane outlines in red. */
  target?: { pageIndex: number; label: string; bbox?: BBox; id?: string };
  /** A complaint or note from the last command, e.g. "Jumped to …". */
  message?: string;
  /** Bumped whenever the place changes, so the app can ignore stale replies. */
  seq: number;
}

export interface SheetIndexEntry {
  /** Sheet number */
  n: string;
  /** Title */
  t: string;
  /** Page index */
  p: number;
  /** Group index, when the set is big enough to group */
  g?: number;
}

export interface PdfInfo {
  available: boolean;
  name?: string;
  /** Changes when the file to show changes (a PDF picked, markups saved). */
  version: number;
  /** True when showing <name>-markups.pdf with saved markups. */
  savedCopy?: boolean;
  /** Why the PDF wasn't found, and PDFs in the folder to pick from. */
  missing?: string[];
  choices?: string[];
}

export interface BootInfo {
  file: string;
  path: string;
  title: string;
  sheets: SheetIndexEntry[];
  groups?: { prefix: string; name: string; count: number }[];
  pdf: PdfInfo;
  state: GuiState;
  mentions: { name: AssistantName; label: string; words: string[] }[];
  markupKinds: readonly MarkupKind[];
}

export type ChatRole = "user" | "assistant" | "status" | "tool";

export interface ChatEntry {
  role: ChatRole;
  text: string;
}

export interface ThreadInfo {
  id: string;
  title: string;
  model: AssistantName;
  modelLabel: string;
  busy: boolean;
  entries: ChatEntry[];
}

/** Events the app hears about over the event stream. */
export type GuiEvent =
  | { type: "state" }
  | { type: "focus" }
  | { type: "markups" }
  | { type: "pdf" }
  | { type: "toast"; text: string; level?: "info" | "warn" }
  | { type: "chat"; thread: string; op: "entry"; entry: ChatEntry }
  | { type: "chat"; thread: string; op: "delta"; text: string }
  | { type: "chat"; thread: string; op: "thread"; info: Omit<ThreadInfo, "entries"> }
  | { type: "confirm"; id: string; question: string; thread?: string };

export interface GuiSessionOptions {
  pdf?: string;
  emit: (event: GuiEvent) => void;
  confirm: (question: string, thread?: string) => Promise<boolean>;
  /** Makes the assistant for a chat thread; tests pass a fake. */
  bridge?: (out: AssistantOutput, hooks: BridgeHooks) => ChatBridge;
}

/** What a chat thread needs from the assistant (AssistantBridge in the app). */
export type ChatBridge = Pick<AssistantBridge, "run" | "setUp" | "describe" | "active">;

export interface BridgeHooks {
  onNavigate: () => void;
  onTool: (name: string, args: unknown) => void;
  showPage: () => Promise<string>;
}

const MAX_ENTRY_CHARS = 200_000;

class ChatThread {
  entries: ChatEntry[] = [];
  busy = false;
  title = "New chat";

  readonly bridge: ChatBridge;

  constructor(
    readonly id: string,
    public model: AssistantName,
    makeBridge: (thread: ChatThread) => ChatBridge
  ) {
    this.bridge = makeBridge(this);
  }

  info(): Omit<ThreadInfo, "entries"> {
    return { id: this.id, title: this.title, model: this.model, modelLabel: ASSISTANTS[this.model].label, busy: this.busy };
  }
}

/** Pending markups that tell the app when they change. */
class GuiMarkups extends MarkupSession {
  onChange: () => void = () => undefined;

  override async add(req: MarkupRequest): Promise<Markup> {
    const m = await super.add(req);
    this.onChange();
    return m;
  }

  override drop(index: number): Markup {
    const m = super.drop(index);
    this.onChange();
    return m;
  }
}

function toolNote(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k]) : "");
  switch (name) {
    case "navigate":
      return `Moving to ${s("command")}`;
    case "read_sheet":
      return `Reading ${s("sheet")}`;
    case "list_sheets":
      return s("filter") ? `Looking for sheets matching "${s("filter")}"` : "Listing sheets";
    case "show_page":
      return "Showing it on the PDF";
    case "add_markup":
      return `Adding a ${s("kind") || "markup"}`;
    case "list_markups":
      return "Checking markups";
    case "remove_markup":
      return "Removing a markup";
    case "append_note":
      return `Writing to ${s("file") || "notes.md"}`;
    default:
      return s("file") ? `${name.replace(/_/g, " ")} ${s("file")}` : name.replace(/_/g, " ");
  }
}

/** One open drawing set in the app: navigation, the PDF, markups, and chat threads. */
export class GuiSession {
  readonly explorer: Explorer;
  readonly markups: GuiMarkups;
  private viewer: PageViewer;
  private log: string[] = [];
  private pdfPath?: string;
  private pdfVersion = 1;
  private refIndex?: ReturnType<typeof buildRefIndex>;
  private threads = new Map<string, ChatThread>();
  private threadSeq = 0;
  private seq = 0;
  private defaultModel?: Promise<AssistantName>;

  constructor(
    readonly data: DrawingSet,
    readonly filePath: string,
    private opts: GuiSessionOptions
  ) {
    this.explorer = new Explorer(data, (line = "") => this.log.push(line), { fileName: basename(filePath) });
    this.viewer = new PageViewer(data, filePath, opts.pdf);
    this.pdfPath = findSourcePdf(sourcePdfCandidates(filePath, data, opts.pdf));
    this.markups = new GuiMarkups(data, {
      locatePdf: () => ({ path: this.pdfPath, looked: sourcePdfCandidates(filePath, data, opts.pdf) }),
      target: () => this.explorer.viewTarget(),
      confirm: (q) => opts.confirm(q),
      log: () => undefined,
    });
    this.markups.onChange = () => opts.emit({ type: "markups" });
  }

  get sheets(): Sheet[] {
    return this.data.sheets ?? [];
  }

  async boot(): Promise<BootInfo> {
    const sheets = this.sheets;
    const groups = sheets.length > SHEET_GROUP_THRESHOLD ? groupSheets(sheets) : [];
    const groupOf = new Map<Sheet, number>();
    groups.forEach((g, i) => g.sheets.forEach((s) => groupOf.set(s, i)));
    return {
      file: basename(this.filePath),
      path: this.filePath,
      title: this.explorer.sheetPane().title,
      sheets: sheets.map((s) => ({ n: s.sheetNumber, t: s.title, p: s.pageIndex, ...(groupOf.has(s) ? { g: groupOf.get(s) } : {}) })),
      ...(groups.length > 1 ? { groups: groups.map((g) => ({ prefix: g.prefix, name: g.name ?? "Other", count: g.sheets.length })) } : {}),
      pdf: await this.pdfInfo(),
      state: this.state(),
      mentions: Object.values(ASSISTANTS).map((a) => ({ name: a.name, label: a.label, words: a.mentions })),
      markupKinds: MARKUP_KINDS,
    };
  }

  /** The PDF the pane shows: the copy with saved markups when there is one, else the source. */
  pdfFile(): string | undefined {
    if (!this.pdfPath) return undefined;
    return this.markups.savedCopy() ?? this.pdfPath;
  }

  async pdfInfo(): Promise<PdfInfo> {
    const file = this.pdfFile();
    if (file) return { available: true, name: basename(file), version: this.pdfVersion, ...(file !== this.pdfPath ? { savedCopy: true } : {}) };
    let choices: string[] = [];
    if (!this.filePath.startsWith("job:")) {
      try {
        choices = await listPdfs(dirname(this.filePath));
      } catch {
        // an unreadable folder just means nothing to pick from
      }
    }
    // The PDF pane offers the folder's PDFs as buttons, so drop explore's typed-command advice.
    const missing = this.viewer.missingPdfLines().filter((l) => !/^(Type "view|If one of them goes with)/.test(l));
    return { available: false, version: this.pdfVersion, missing, choices };
  }

  /** Uses another PDF for this set; a bare name is looked up next to the .jsonld. */
  async setPdf(path: string): Promise<PdfInfo> {
    const found = findSourcePdf(sourcePdfCandidates(this.filePath, this.data, path));
    if (!found || !existsSync(found)) throw new Error(`Can't find "${path}".`);
    this.pdfPath = found;
    this.pdfVersion++;
    return this.pdfInfo();
  }

  private pdfChanged(): void {
    this.pdfVersion++;
    this.opts.emit({ type: "pdf" });
  }

  /** Runs explore commands ("3", "up", "back", "r1", "A101", …) in order. */
  command(commands: string[]): GuiState {
    return this.move(() => {
      for (const c of commands) this.explorer.handle(c);
    });
  }

  openSheet(sheetNumber: string): GuiState {
    const sheet = this.sheets.find((s) => s.sheetNumber === sheetNumber);
    if (!sheet) return { ...this.state(), message: `No sheet "${sheetNumber}".` };
    return this.move(() => this.explorer.openSheetFromAnywhere(sheet));
  }

  openId(id: string): GuiState {
    return this.move(() => {
      if (!this.explorer.openById(id)) this.log.push(`Nothing with id ${id} in this file.`);
    });
  }

  private move(fn: () => void): GuiState {
    const before = this.explorer.view;
    this.log = [];
    fn();
    const lines = this.log.map((l) => l.trim()).filter(Boolean);
    this.log = [];
    let message: string | undefined;
    if (this.explorer.view !== before) {
      this.seq++;
      message = lines.find((l) => l.startsWith("Jumped to"))?.replace(/ "back" returns\.$/, " Press ← to come back.");
    } else {
      message = lines[0];
    }
    return { ...this.state(), ...(message ? { message } : {}) };
  }

  /** "/" in the sheet list: the sheet numbers that match, best first. */
  find(query: string): string[] {
    return findSheetRows(this.explorer.allSheetRows(), query).map((r) => r.label);
  }

  /** A sheet's contents without opening it, for moving through the sheet list. */
  preview(sheetNumber: string): GuiState | undefined {
    const sheet = this.sheets.find((s) => s.sheetNumber === sheetNumber);
    if (!sheet) return undefined;
    const model = this.explorer.screenModel(100, sheet);
    return {
      ...this.fromModel(model),
      location: sheet.sheetNumber,
      kind: "preview",
      canGoBack: this.explorer.canGoBack,
      details: this.explorer.showingDetails,
      crumbs: [],
      sections: this.decorate(model.sections, { kind: "sheet", sheet }),
      sheet: { sheetNumber: sheet.sheetNumber, title: sheet.title, pageIndex: sheet.pageIndex },
      target: { pageIndex: sheet.pageIndex, label: `sheet ${sheet.sheetNumber}` },
      seq: this.seq,
    };
  }

  state(): GuiState {
    const e = this.explorer;
    const v = e.view;
    const model = e.screenModel(100);
    const target = e.viewTarget();
    const state: GuiState = {
      ...this.fromModel(model),
      location: e.location(),
      kind: v.kind,
      canGoBack: e.canGoBack,
      details: e.showingDetails,
      crumbs: this.crumbs(),
      sections: this.decorate(model.sections, v),
      seq: this.seq,
    };
    if (!("error" in target)) {
      const t: ViewTarget = target;
      state.sheet = { sheetNumber: t.sheet.sheetNumber, title: t.sheet.title, pageIndex: t.sheet.pageIndex };
      state.target = { pageIndex: t.sheet.pageIndex, label: t.label, ...(t.bbox ? { bbox: t.bbox } : {}), ...(t.id ? { id: t.id } : {}) };
    }
    if (v.kind === "item") {
      const fields = Object.entries(v.item.data).filter(([k]) => k !== "label").map(([k, value]): [string, string] => [fieldName(k), plainValue(value)]);
      if (e.showingDetails) {
        fields.push(["Id", v.item["@id"]], ["Type", v.item.itemType]);
        if (v.item.bbox) fields.push(["Bbox", `[${v.item.bbox.join(", ")}]`]);
      }
      state.fields = fields;
      state.body = fields.length ? undefined : ["Nothing else was read for this item."];
    } else if (v.kind === "entry" && v.entry.kind === "table") {
      state.table = parseTable(v.entry.value.content);
      state.body = e.showingDetails ? [`id    ${v.entry.value["@id"]}`] : undefined;
    }
    return state;
  }

  private fromModel(m: ScreenModel): Pick<GuiState, "title" | "subtitle" | "body"> {
    return { title: m.title, subtitle: m.subtitle, ...(m.body ? { body: m.body } : {}) };
  }

  /** The path to here, each part a way back up to it. */
  private crumbs(): Crumb[] {
    const v = this.explorer.view;
    if (v.kind === "sheets") return [];
    const parts = v.kind === "group" ? [] : this.explorer.location().split(" › ");
    const crumbs: Crumb[] = [{ label: "Sheets", commands: ["top"] }];
    parts.forEach((label, i) => crumbs.push({ label, commands: Array<string>(parts.length - 1 - i).fill("up") }));
    return crumbs;
  }

  /** Adds where each row is on the page, so moving through a list can outline it on the PDF. */
  private decorate(sections: ScreenModel["sections"], v: Explorer["view"]): GuiSection[] {
    const boxFor = this.rowBoxes(v);
    return sections.map((s) => ({
      ...(s.heading ? { heading: s.heading } : {}),
      ...(s.note ? { note: s.note } : {}),
      rows: s.rows.map((r) => {
        const box = boxFor(r.command);
        return { label: r.label, ...(r.note ? { note: r.note } : {}), command: r.command, ...(box ? { box } : {}) };
      }),
    }));
  }

  private rowBoxes(v: Explorer["view"]): (command: string) => PageBox | undefined {
    const at = (bbox: BBox | undefined, pageIndex: number, id?: string, kind?: string): PageBox | undefined =>
      bbox ? { bbox, pageIndex, ...(id ? { id } : {}), ...(kind ? { kind } : {}) } : undefined;
    const byNumber = (command: string) => (/^\d+$/.test(command) ? Number(command) - 1 : -1);
    const refs = (ids: string[]) => (command: string) => {
      const m = /^r(\d+)$/.exec(command);
      const id = m ? ids[Number(m[1]) - 1] : undefined;
      if (!id) return undefined;
      this.refIndex ??= buildRefIndex(this.data);
      const t = this.refIndex.get(id);
      if (!t) return undefined;
      const thing = t.item ?? t.layer ?? t.drawing ?? t.entry?.value;
      const bbox = thing && "bbox" in thing ? thing.bbox : undefined;
      return at(bbox, t.sheet.pageIndex, id, "link");
    };
    switch (v.kind) {
      case "sheet":
      case "entry": {
        const entries = sheetEntries(v.sheet);
        return (c) => {
          const e = entries[byNumber(c)];
          return e ? at(e.value.bbox, v.sheet.pageIndex, e.value["@id"], e.kind) : undefined;
        };
      }
      case "drawing": {
        const layers = v.drawing.layers;
        const linked = refs(v.drawing.references ?? []);
        return (c) => {
          const l = layers[byNumber(c)];
          if (l) return at(l.bbox ?? unionBBox((l.items ?? []).map((i) => i.bbox)), v.sheet.pageIndex, l["@id"], "layer");
          return linked(c);
        };
      }
      case "layer":
      case "item": {
        const items = v.layer.items ?? [];
        const linked = v.kind === "item" ? refs(v.item.references ?? []) : () => undefined;
        return (c) => {
          const it = items[byNumber(c)];
          if (it) return at(it.bbox, v.sheet.pageIndex, it["@id"], it.itemType);
          return linked(c);
        };
      }
      default:
        return () => undefined;
    }
  }

  // ── Markups ──────────────────────────────────────────────

  async markupsInfo(): Promise<{ pending: (Markup & { describe: string })[]; listing: string[] }> {
    let listing: string[];
    try {
      listing = await this.markups.listing();
    } catch (err) {
      listing = [(err as Error).message];
    }
    return { pending: this.markups.pending.map((m) => ({ ...m, describe: this.markups.describe(m) })), listing };
  }

  async markupsAction(action: string, inPlace = false, index?: number): Promise<string> {
    const m = this.markups;
    let result: string;
    switch (action) {
      case "save":
        result = await m.save(inPlace);
        break;
      case "undo":
        result = await m.undo();
        break;
      case "remove":
        result = await m.remove(inPlace);
        break;
      case "drop":
        result = `Dropped ${m.describe(m.drop(index ?? 0))}`;
        break;
      case "clear": {
        const n = m.pending.length;
        m.pending.length = 0;
        result = `Discarded ${n} pending markup${n === 1 ? "" : "s"}.`;
        break;
      }
      default:
        throw new Error(`Unknown markups action "${action}"`);
    }
    this.opts.emit({ type: "markups" });
    if (action !== "drop" && action !== "clear") this.pdfChanged();
    // The typed command in explore is the Markups panel's u key here.
    return result.replace(/"markups undo" (takes|puts) them back\./, "Press m, then u, to undo.");
  }

  async addMarkup(req: MarkupRequest): Promise<string> {
    const m = await this.markups.add(req);
    return `Added ${this.markups.describe(m)}`;
  }

  // ── Chat threads ─────────────────────────────────────────

  private makeBridge(thread: () => ChatThread): ChatBridge {
    const emitEntry = (entry: ChatEntry) => this.opts.emit({ type: "chat", thread: thread().id, op: "entry", entry });
    const out: AssistantOutput = {
      write: (text) => {
        const t = thread();
        const last = t.entries.at(-1);
        if (last?.role === "assistant" && last.text.length < MAX_ENTRY_CHARS) last.text += text;
        else t.entries.push({ role: "assistant", text });
        this.opts.emit({ type: "chat", thread: t.id, op: "delta", text });
      },
      print: (line = "") => {
        const text = stripAnsi(line).trim();
        if (!text) return;
        const entry: ChatEntry = { role: "status", text };
        thread().entries.push(entry);
        emitEntry(entry);
      },
      confirm: (q) => this.opts.confirm(q.replace(/\s*\[y\/N\]\s*$/i, ""), thread().id),
    };
    const hooks: BridgeHooks = {
      onNavigate: () => {
        this.seq++;
        this.opts.emit({ type: "state" });
      },
      onTool: (name, args) => {
        const entry: ChatEntry = { role: "tool", text: toolNote(name, args) };
        thread().entries.push(entry);
        emitEntry(entry);
      },
      showPage: () => Promise.resolve(this.showPage()),
    };
    if (this.opts.bridge) return this.opts.bridge(out, hooks);
    return new AssistantBridge({
      data: this.data,
      filePath: this.filePath,
      explorer: this.explorer,
      out,
      markups: this.markups,
      surface: "app",
      ...hooks,
    });
  }

  private showPage(): string {
    const t = this.explorer.viewTarget();
    if ("error" in t) return t.error.replace(/, then type "view"/, "");
    if (!this.pdfPath) return this.viewer.missingPdfLines().join("\n");
    this.opts.emit({ type: "focus" });
    const what = t.bbox ? `, zoomed to ${t.label} outlined in red` : "";
    return `Showing sheet ${t.sheet.sheetNumber} (PDF page ${t.sheet.pageIndex + 1})${what}, in the PDF pane.`;
  }

  /** The model new threads start with: the first one set up. */
  private firstModel(): Promise<AssistantName> {
    this.defaultModel ??= this.makeBridge(() => {
      throw new Error("not a thread");
    })
      .setUp()
      .then((names) => names[0] ?? "claude");
    return this.defaultModel;
  }

  async assistants(): Promise<{ name: AssistantName; label: string; detail: string }[]> {
    const probe = this.makeBridge(() => {
      throw new Error("not a thread");
    });
    const names = Object.keys(ASSISTANTS) as AssistantName[];
    return Promise.all(names.map(async (name) => ({ name, ...(await probe.describe(name)) }))).then((list) =>
      list.map(({ name, label, detail }) => ({ name, label, detail: detail ?? "" }))
    );
  }

  async newThread(model?: AssistantName): Promise<ThreadInfo> {
    const id = `t${++this.threadSeq}`;
    const thread = new ChatThread(id, model ?? (await this.firstModel()), (t) => this.makeBridge(() => t));
    this.threads.set(id, thread);
    return { ...thread.info(), entries: thread.entries };
  }

  threadList(): ThreadInfo[] {
    return [...this.threads.values()].map((t) => ({ ...t.info(), entries: t.entries }));
  }

  closeThread(id: string): void {
    const t = this.threads.get(id);
    t?.bridge.active?.abort();
    this.threads.delete(id);
  }

  stop(id: string): void {
    this.threads.get(id)?.bridge.active?.abort();
  }

  /** Sends a message in a thread; "@gemini" alone switches the thread's model. Resolves when the answer is done. */
  async send(id: string, text: string): Promise<void> {
    const t = this.threads.get(id);
    if (!t) throw new Error(`No chat ${id}`);
    if (t.busy) throw new Error("Still answering; press Esc to stop it first.");
    const trimmed = text.trim();
    if (!trimmed) return;
    const mention = parseMention(trimmed.startsWith("@") ? trimmed : `@${t.model} ${trimmed}`)!;
    const emitThread = () => this.opts.emit({ type: "chat", thread: t.id, op: "thread", info: t.info() });
    const say = (entry: ChatEntry) => {
      t.entries.push(entry);
      this.opts.emit({ type: "chat", thread: t.id, op: "entry", entry });
    };

    if (mention.assistant) t.model = mention.assistant.name;
    if (mention.assistant && !mention.text) {
      const ai = await t.bridge.describe(mention.assistant.name);
      emitThread();
      say({ role: "status", text: ai.detail === "not set up" ? notSetUpMessage(mention.assistant) : `Questions in this chat now go to ${ai.label}${ai.detail ? ` (${ai.detail})` : ""}.` });
      return;
    }

    say({ role: "user", text: trimmed });
    if (t.title === "New chat") t.title = mention.text.length > 40 ? `${mention.text.slice(0, 39)}…` : mention.text || t.title;
    t.busy = true;
    emitThread();
    try {
      await t.bridge.run(mention);
    } finally {
      t.busy = false;
      emitThread();
    }
  }

  /** Stops every answer in progress, e.g. before closing. */
  stopAll(): void {
    for (const t of this.threads.values()) t.bridge.active?.abort();
  }
}
