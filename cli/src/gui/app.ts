import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { getConfigDir, processingAvailable } from "../lib/config.js";
import { listJsonld, listPdfs } from "../lib/files.js";
import { defaultResultPath, runJob, JobFailedError, type JobOptions } from "../commands/process.js";
import { statusLine } from "../lib/progress.js";
import { isValid } from "../commands/validate.js";
import { openWithDefaultApp } from "../lib/open.js";
import { chooseFolder } from "../lib/folder-dialog.js";
import { GuiSettings } from "./settings.js";
import { NOTE_EXTENSIONS, resolveInCwd } from "../lib/assistant.js";
import { SPREADSHEET_EXTENSIONS } from "../lib/spreadsheet.js";
import type { AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import { GuiSession, type BootInfo, type GuiEvent, type GuiSessionOptions } from "./session.js";
import type { DrawingSet } from "../types.js";

export interface GuiAppOptions {
  cwd: string;
  /** --pdf: the source PDF for the first set opened. */
  pdf?: string;
  schema?: string;
  /** Where recently opened sets are remembered (default ~/.aecdo/gui.json). */
  settingsPath?: string;
  bridge?: GuiSessionOptions["bridge"];
  /** Where settings are saved; tests point these at a temporary folder. */
  llmPath?: string;
  configDir?: string;
  /** Opens sign-in pages and files the assistant wrote; tests replace it. */
  openUrl?: (url: string) => void;
  /** Makes a folder the process's working folder too, which the assistant works in (off in tests). */
  chdir?: boolean;
  /** Shows the system's folder picker; tests replace it. */
  chooseFolder?: (start: string) => Promise<string | null | undefined>;
  /** Whether the app offers to process PDFs (default: off until the DrawingBot API launches). */
  processing?: boolean;
  /** Uploads a PDF and waits for its JSON-LD; tests replace it. */
  runJob?: (path: string, opts: JobOptions) => Promise<{ content: string }>;
}

/** What `~/.aecdo/gui.json` remembers. */
interface Remembered {
  recent: string[];
  folders: string[];
}

/** A PDF in the current folder with no drawing set next to it yet. */
export interface HomePdf {
  name: string;
  /** The latest progress while it's being processed. */
  status?: string;
}

export interface HomeInfo {
  cwd: string;
  files: string[];
  /** Empty while processing PDFs is coming soon. */
  pdfs: HomePdf[];
  /** Whether DrawingBot API credentials are saved, so a PDF can be processed. */
  canProcess: boolean;
  recent: string[];
  /** Recently used folders, other than the current one. */
  folders: string[];
}

const RECENT_LIMIT = 10;

/** Reads and parses a .jsonld drawing set, with messages fit to show the user. */
export async function loadDrawingSet(path: string): Promise<DrawingSet> {
  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch (err) {
    throw new Error(`Could not read "${path}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text) as DrawingSet;
  } catch (err) {
    throw new Error(`Invalid JSON in "${basename(path)}": ${(err as Error).message}`);
  }
}

/** The app's state across the sets it opens: the open session, the event stream, questions waiting for an answer. */
export class GuiApp {
  session?: GuiSession;
  /** Set once a page has connected to the event stream. */
  everConnected = false;
  private clients = new Set<(event: GuiEvent) => void>();
  private confirms = new Map<string, (ok: boolean) => void>();
  private prompts = new Map<string, { resolve: (value: string) => void; reject: (err: Error) => void }>();
  readonly settings: GuiSettings;
  private confirmSeq = 0;
  /** PDFs being processed, by full path, with their latest progress. */
  private jobs = new Map<string, string>();
  private usedPdfOption = false;
  private quitWith!: (reason: string) => void;
  readonly quitting: Promise<string>;
  /** The folder the app works in: its home screen lists it, and the assistant writes there. */
  cwd: string;

  constructor(private opts: GuiAppOptions) {
    this.cwd = opts.cwd;
    this.quitting = new Promise((res) => (this.quitWith = res));
    this.settings = new GuiSettings(this.interaction(), { llmPath: opts.llmPath, configDir: opts.configDir, processing: opts.processing });
  }

  get processing(): boolean {
    return this.opts.processing ?? processingAvailable();
  }

  /** How sign-ins ask their questions and show links: as dialogs in the app. */
  private interaction(): AuthInteraction {
    return {
      prompt: (p) => this.prompt(p),
      notify: (event) => {
        switch (event.type) {
          case "auth_url":
            (this.opts.openUrl ?? openWithDefaultApp)(event.url);
            this.emit({ type: "auth", text: event.instructions ?? "Finish signing in in your browser. If it didn't open, use this link:", url: event.url });
            break;
          case "device_code":
            this.emit({ type: "auth", text: `Enter code ${event.userCode} at the link below.`, url: event.verificationUri, code: event.userCode });
            break;
          case "info":
          case "progress":
            this.emit({ type: "toast", text: event.message });
            break;
        }
      },
    };
  }

  /** Asks for text, a secret, or a choice in the app; rejects when cancelled. */
  prompt(p: AuthPrompt): Promise<string> {
    if (this.clients.size === 0) return Promise.reject(new Error("Cancelled"));
    const id = `p${++this.confirmSeq}`;
    const kind = p.type === "select" ? "select" : p.type === "secret" ? "secret" : "text";
    return new Promise((resolve, reject) => {
      this.prompts.set(id, { resolve, reject });
      p.signal?.addEventListener(
        "abort",
        () => {
          if (!this.prompts.delete(id)) return;
          this.emit({ type: "prompt-cancel", id });
          reject(new Error("aborted"));
        },
        { once: true }
      );
      this.emit({
        type: "prompt",
        id,
        kind,
        message: p.message,
        ...("placeholder" in p && p.placeholder ? { placeholder: p.placeholder } : {}),
        ...(p.type === "select" ? { options: p.options.map((o) => ({ id: o.id, label: o.label, ...(o.description ? { description: o.description } : {}) })) } : {}),
      });
    });
  }

  /** The page's answer to a prompt; null means cancelled. */
  answerPrompt(id: string, value: string | null): void {
    const pending = this.prompts.get(id);
    this.prompts.delete(id);
    if (!pending) return;
    if (value === null) pending.reject(new Error("Cancelled"));
    else pending.resolve(value);
  }

  /** Runs a settings change and lets the open chats and the page know. */
  async changeSettings(fn: (s: GuiSettings) => Promise<string>): Promise<string> {
    const message = await fn(this.settings);
    this.session?.aiSettingsChanged();
    this.emit({ type: "settings" });
    return message;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  emit(event: GuiEvent): void {
    for (const send of this.clients) send(event);
  }

  subscribe(send: (event: GuiEvent) => void): () => void {
    this.everConnected = true;
    this.clients.add(send);
    return () => this.clients.delete(send);
  }

  /** Asks the user yes or no in the app. */
  confirm(question: string, thread?: string): Promise<boolean> {
    if (this.clients.size === 0) return Promise.resolve(false);
    const id = `c${++this.confirmSeq}`;
    return new Promise((res) => {
      this.confirms.set(id, res);
      this.emit({ type: "confirm", id, question, ...(thread ? { thread } : {}) });
    });
  }

  answer(id: string, ok: boolean): void {
    const res = this.confirms.get(id);
    this.confirms.delete(id);
    res?.(ok);
  }

  /**
   * Opens a file:// link from a chat in its default app (Excel, a text editor, …). Only the kinds
   * of file the assistant writes, and only in the current folder, since the link text comes from the AI.
   */
  async openFile(url: string): Promise<string> {
    let path: string;
    try {
      path = fileURLToPath(url);
    } catch {
      throw new Error("That isn't a file link.");
    }
    const full = resolveInCwd(this.cwd, path, [...SPREADSHEET_EXTENSIONS, ...NOTE_EXTENSIONS]);
    if (!(await stat(full).catch(() => undefined))?.isFile()) throw new Error(`${basename(full)} isn't there.`);
    (this.opts.openUrl ?? openWithDefaultApp)(full);
    return full;
  }

  /** A path typed in the app, relative to the current folder; "~" is the home folder. */
  private fullPath(path: string): string {
    return resolve(this.cwd, path.replace(/^~(?=$|[\\/])/, homedir()));
  }

  async open(path: string): Promise<BootInfo> {
    const full = this.fullPath(path);
    if (/\.pdf$/i.test(full)) {
      throw new Error(
        this.processing
          ? `${basename(full)} is a PDF. Pick it under "PDFs to process" to turn it into a drawing set.`
          : `${basename(full)} is a PDF. Open its .jsonld drawing set instead; turning PDFs into drawing sets in the app is coming soon.`
      );
    }
    const data = await loadDrawingSet(full);
    if (!Array.isArray(data.sheets)) throw new Error(`${basename(full)} has no sheets to show.`);
    this.session?.stopAll();
    // --pdf belongs to the set named on the command line, not to ones opened later.
    const pdf = this.usedPdfOption ? undefined : this.opts.pdf;
    this.usedPdfOption = true;
    this.session = new GuiSession(data, full, {
      pdf,
      emit: (e) => this.emit(e),
      confirm: (q, thread) => this.confirm(q, thread),
      bridge: this.opts.bridge,
    });
    await this.remember({ file: full, folder: this.cwd });
    void this.checkValid(data, full);
    return this.session.boot();
  }

  private async checkValid(data: DrawingSet, path: string): Promise<void> {
    try {
      if (await isValid(data, this.opts.schema)) return;
    } catch {
      return;
    }
    if (this.session?.filePath !== path) return;
    this.emit({
      type: "toast",
      level: "warn",
      text: `Some of ${basename(path)} doesn't match the AECDO format, so parts may be missing. Run "aecdo validate ${basename(path)}" to see what's wrong.`,
    });
  }

  private settingsPath(): string {
    return this.opts.settingsPath ?? join(getConfigDir(), "gui.json");
  }

  private async remembered(): Promise<Remembered> {
    try {
      const saved = JSON.parse(await readFile(this.settingsPath(), "utf-8")) as Partial<Record<keyof Remembered, unknown>>;
      const strings = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : []);
      return { recent: strings(saved.recent), folders: strings(saved.folders) };
    } catch {
      return { recent: [], folders: [] };
    }
  }

  async recent(): Promise<string[]> {
    return (await this.remembered()).recent;
  }

  /** The folder used last, where the app starts when opened from its icon. */
  async lastFolder(): Promise<string | undefined> {
    for (const folder of (await this.remembered()).folders) {
      if ((await stat(folder).catch(() => undefined))?.isDirectory()) return folder;
    }
    return undefined;
  }

  private async remember(used: { file?: string; folder?: string }): Promise<void> {
    try {
      const saved = await this.remembered();
      const bump = (list: string[], item?: string) => (item ? [item, ...list.filter((p) => p !== item)].slice(0, RECENT_LIMIT) : list);
      const next: Remembered = { recent: bump(saved.recent, used.file), folders: bump(saved.folders, used.folder) };
      const file = this.settingsPath();
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, JSON.stringify(next, null, 2) + "\n");
    } catch {
      // remembering recent files is a convenience
    }
  }

  /** Works in another folder from now on, like "Open Folder" in an editor. */
  async openFolder(path: string): Promise<HomeInfo> {
    const full = this.fullPath(path);
    if (!(await stat(full).catch(() => undefined))?.isDirectory()) throw new Error(`${full} isn't a folder.`);
    if (this.opts.chdir) process.chdir(full);
    this.cwd = full;
    await this.remember({ folder: full });
    return this.home();
  }

  /**
   * Asks for a folder with the system's picker. Resolves the new home screen, "cancelled", or
   * "unavailable" when there's no picker (Linux without zenity or kdialog), so the page asks for a path.
   */
  async pickFolder(): Promise<HomeInfo | "cancelled" | "unavailable"> {
    const picked = await (this.opts.chooseFolder ?? chooseFolder)(this.cwd);
    if (picked === undefined) return "unavailable";
    if (picked === null) return "cancelled";
    return this.openFolder(picked);
  }

  /** Whether a path is a folder rather than a set, for the home screen's path box. */
  async isFolder(path: string): Promise<boolean> {
    return Boolean((await stat(this.fullPath(path)).catch(() => undefined))?.isDirectory());
  }

  async home(): Promise<HomeInfo> {
    let files: string[] = [];
    try {
      files = await listJsonld(this.cwd);
    } catch {
      // an unreadable folder lists nothing
    }
    const saved = await this.remembered();
    return {
      cwd: this.cwd,
      files,
      pdfs: await this.pdfsToProcess(files),
      canProcess: this.processing && (await this.settings.apiConfigured()),
      recent: saved.recent,
      folders: saved.folders.filter((f) => f !== this.cwd),
    };
  }

  /** PDFs in the current folder without a .jsonld of the same name, and ones being processed. */
  private async pdfsToProcess(sets: string[]): Promise<HomePdf[]> {
    if (!this.processing) return [];
    let names: string[] = [];
    try {
      names = await listPdfs(this.cwd);
    } catch {
      return [];
    }
    const done = new Set(sets.map((f) => f.toLowerCase()));
    return names
      .map((name) => ({ name, status: this.jobs.get(join(this.cwd, name)) }))
      .filter((p) => p.status !== undefined || !done.has(basename(defaultResultPath(p.name)).toLowerCase()))
      .map((p) => (p.status === undefined ? { name: p.name } : p));
  }

  /**
   * Starts turning a PDF in the current folder into a drawing set, saved next to it as
   * `<name>.jsonld` like `aecdo process`. Progress comes as "process" events; the page asks
   * first, since the PDF is uploaded.
   */
  async process(name: string): Promise<void> {
    if (!this.processing) throw new Error("Turning PDFs into drawing sets is coming soon.");
    if (!(await this.settings.apiConfigured())) throw new Error("Add your DrawingBot API credentials in Settings first.");
    const pdf = this.fullPath(name);
    if (!/\.pdf$/i.test(pdf) || !(await stat(pdf).catch(() => undefined))?.isFile()) throw new Error(`${basename(pdf)} isn't a PDF in this folder.`);
    if (this.jobs.has(pdf)) throw new Error(`${basename(pdf)} is already being processed.`);
    const file = basename(pdf);
    const update = (status: string) => {
      this.jobs.set(pdf, status);
      this.emit({ type: "process", file, status });
    };
    update("Uploading");
    void (this.opts.runJob ?? runJob)(pdf, { onStatus: (s) => update(statusLine(s).replace(/^Status: /, "")) })
      .then(async ({ content }) => {
        const out = defaultResultPath(pdf);
        await writeFile(out, content + "\n", "utf-8");
        this.jobs.delete(pdf);
        this.emit({ type: "process", file, done: out });
      })
      .catch((err: Error) => {
        this.jobs.delete(pdf);
        const text = err instanceof JobFailedError ? err.lines.map((l) => l.trim()).join("; ") : err.message;
        this.emit({ type: "process", file, error: `Couldn't process ${file}: ${text}` });
      });
  }

  quit(reason: string): void {
    this.session?.stopAll();
    for (const id of [...this.confirms.keys()]) this.answer(id, false);
    for (const id of [...this.prompts.keys()]) this.answerPrompt(id, null);
    this.quitWith(reason);
  }
}
