import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { getConfigDir } from "../lib/config.js";
import { listJsonld } from "../lib/picker.js";
import { isValid } from "../commands/validate.js";
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
}

export interface HomeInfo {
  cwd: string;
  files: string[];
  recent: string[];
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
  private confirmSeq = 0;
  private usedPdfOption = false;
  private quitWith!: (reason: string) => void;
  readonly quitting: Promise<string>;

  constructor(private opts: GuiAppOptions) {
    this.quitting = new Promise((res) => (this.quitWith = res));
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

  async open(path: string): Promise<BootInfo> {
    const full = resolve(this.opts.cwd, path);
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
    void this.remember(full);
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

  async recent(): Promise<string[]> {
    try {
      const saved = JSON.parse(await readFile(this.settingsPath(), "utf-8")) as { recent?: unknown };
      return Array.isArray(saved.recent) ? saved.recent.filter((p): p is string => typeof p === "string") : [];
    } catch {
      return [];
    }
  }

  private async remember(path: string): Promise<void> {
    try {
      const recent = [path, ...(await this.recent()).filter((p) => p !== path)].slice(0, RECENT_LIMIT);
      const file = this.settingsPath();
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, JSON.stringify({ recent }, null, 2) + "\n");
    } catch {
      // remembering recent files is a convenience
    }
  }

  async home(): Promise<HomeInfo> {
    let files: string[] = [];
    try {
      files = await listJsonld(this.opts.cwd);
    } catch {
      // an unreadable folder lists nothing
    }
    return { cwd: this.opts.cwd, files, recent: await this.recent() };
  }

  quit(reason: string): void {
    this.session?.stopAll();
    for (const id of [...this.confirms.keys()]) this.answer(id, false);
    this.quitWith(reason);
  }
}
