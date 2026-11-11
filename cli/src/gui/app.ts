import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join, resolve } from "node:path";
import { getConfigDir } from "../lib/config.js";
import { listJsonld } from "../lib/files.js";
import { isValid } from "../commands/validate.js";
import { openWithDefaultApp } from "../lib/open.js";
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
  private prompts = new Map<string, { resolve: (value: string) => void; reject: (err: Error) => void }>();
  readonly settings: GuiSettings;
  private confirmSeq = 0;
  private usedPdfOption = false;
  private quitWith!: (reason: string) => void;
  readonly quitting: Promise<string>;

  constructor(private opts: GuiAppOptions) {
    this.quitting = new Promise((res) => (this.quitWith = res));
    this.settings = new GuiSettings(this.interaction(), { llmPath: opts.llmPath, configDir: opts.configDir });
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
    const full = resolveInCwd(this.opts.cwd, path, [...SPREADSHEET_EXTENSIONS, ...NOTE_EXTENSIONS]);
    if (!(await stat(full).catch(() => undefined))?.isFile()) throw new Error(`${basename(full)} isn't there.`);
    (this.opts.openUrl ?? openWithDefaultApp)(full);
    return full;
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
    await this.remember(full);
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
    for (const id of [...this.prompts.keys()]) this.answerPrompt(id, null);
    this.quitWith(reason);
  }
}
