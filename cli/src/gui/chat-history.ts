import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { ASSISTANTS, type AssistantName } from "../lib/llm.js";

// Saved like Claude Code's sessions: one folder per drawing set under ~/.aecdo/projects, named
// after the set's path, holding one <chat id>.jsonl per chat. Each line is one JSON event,
// appended as it happens, so a chat survives a crash up to its last finished line.

export type ChatRole = "user" | "assistant" | "status" | "tool";

export interface ChatEntry {
  role: ChatRole;
  text: string;
}

/** A message in a model's own transcript, replayed when a chat is reopened. */
export type ModelMessage = AgentMessage;

export type ChatRecord =
  | { type: "chat"; set: string }
  | { type: "title"; title: string }
  | { type: "model"; model: AssistantName }
  | { type: "entry"; role: ChatRole; text: string }
  | { type: "message"; model: AssistantName; message: ModelMessage };

export interface SavedChatSummary {
  id: string;
  title: string;
  model: AssistantName;
  created: string;
  updated: string;
  /** Questions asked. */
  questions: number;
}

export interface SavedChat extends SavedChatSummary {
  entries: ChatEntry[];
  messages: Partial<Record<AssistantName, ModelMessage[]>>;
}

const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_DIR_NAME = 200;

/** The folder name for a set: its path with everything but letters and digits made "-", as Claude Code does. */
export function setDirName(setPath: string): string {
  const name = setPath.replace(/[^a-zA-Z0-9]/g, "-");
  if (name.length <= MAX_DIR_NAME) return name;
  const hash = createHash("sha256").update(setPath).digest("hex").slice(0, 12);
  return `${name.slice(0, MAX_DIR_NAME - 13)}-${hash}`;
}

export function isChatId(id: string): boolean {
  return CHAT_ID.test(id);
}

/** The saved chats of one drawing set. */
export class ChatStore {
  readonly dir: string;
  private writes = new Map<string, Promise<void>>();

  constructor(
    root: string,
    readonly setPath: string
  ) {
    this.dir = join(root, setDirName(setPath));
  }

  private file(id: string): string {
    if (!isChatId(id)) throw new Error(`No saved chat ${id}`);
    return join(this.dir, `${id}.jsonl`);
  }

  /** Appends events to a chat's file in order; the first write starts the file. */
  append(id: string, records: ChatRecord[]): Promise<void> {
    if (!records.length) return this.writes.get(id) ?? Promise.resolve();
    const timestamp = new Date().toISOString();
    const lines = records.map((r) => `${JSON.stringify({ ...r, sessionId: id, timestamp })}\n`).join("");
    const prev = this.writes.get(id) ?? Promise.resolve();
    const next = prev.then(async () => {
      await mkdir(this.dir, { recursive: true });
      await appendFile(this.file(id), lines, { encoding: "utf-8", mode: 0o600 });
    });
    const settled = next.catch(() => undefined);
    this.writes.set(id, settled);
    return next;
  }

  /** Waits for every write started so far. */
  async flushed(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  async load(id: string): Promise<SavedChat | undefined> {
    let raw: string;
    try {
      await this.writes.get(id);
      raw = await readFile(this.file(id), "utf-8");
    } catch {
      return undefined;
    }
    return replay(id, raw);
  }

  /** The set's saved chats, most recent first. */
  async list(): Promise<SavedChatSummary[]> {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith(".jsonl") && isChatId(n.slice(0, -6)));
    } catch {
      return [];
    }
    const chats = await Promise.all(names.map((n) => this.load(n.slice(0, -6))));
    return chats
      .filter((c): c is SavedChat => Boolean(c && c.questions > 0))
      .map(({ id, title, model, created, updated, questions }) => ({ id, title, model, created, updated, questions }))
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }
}

/** Rebuilds a chat from its lines; a line cut short by a crash is skipped. */
export function replay(id: string, raw: string): SavedChat {
  const chat: SavedChat = { id, title: "New chat", model: "claude", created: "", updated: "", questions: 0, entries: [], messages: {} };
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let r: (ChatRecord & { timestamp?: string }) | undefined;
    try {
      r = JSON.parse(line) as ChatRecord & { timestamp?: string };
    } catch {
      continue;
    }
    if (typeof r?.timestamp === "string") {
      chat.created ||= r.timestamp;
      chat.updated = r.timestamp;
    }
    switch (r?.type) {
      case "title":
        if (typeof r.title === "string") chat.title = r.title;
        break;
      case "model":
        if (r.model in ASSISTANTS) chat.model = r.model;
        break;
      case "entry":
        if (typeof r.text !== "string") break;
        chat.entries.push({ role: r.role, text: r.text });
        if (r.role === "user") chat.questions++;
        break;
      case "message":
        if (r.model in ASSISTANTS && typeof (r.message as { role?: unknown } | undefined)?.role === "string") (chat.messages[r.model] ??= []).push(r.message);
        break;
    }
  }
  return chat;
}
