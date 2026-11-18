import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import type { Client, OAuthClientProvider, OAuthDiscoveryState, Tool } from "@modelcontextprotocol/client";
import { getConfigDir, readJsonFile, writePrivateJson } from "./config.js";
import { setDirName } from "../gui/chat-history.js";

/**
 * An MCP connector, in the `mcpServers` shape Claude Desktop and Claude Code use: a program to start
 * (`command`) or a URL. `note` and `everywhere` are ours.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  /** What the user says the connector is for, told to the AI with each of its tools. */
  note?: string;
  /** On in every folder that hasn't picked its own servers. */
  everywhere?: boolean;
}

interface McpFile {
  mcpServers?: Record<string, McpServerConfig>;
}

/** What a folder turned on, kept per user in ~/.aecdo/projects/<folder>/mcp.json. */
interface FolderChoices {
  on: string[];
  /** For servers from the folder's .mcp.json: the definition the user turned on, so a changed one goes off. */
  approved?: Record<string, string>;
}

export const FOLDER_MCP_FILE = ".mcp.json";

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  /** "settings" when the user added it, "folder" when it comes from the folder's .mcp.json. */
  source: "settings" | "folder";
  on: boolean;
}

export interface FolderServers {
  /** The folder whose choices apply: the nearest one, from the open folder up, with choices or a .mcp.json. */
  folder: string;
  servers: McpServerEntry[];
  /** The folder's .mcp.json, when it has one. */
  sharedFile?: string;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/;

/** Where connectors and their sign-ins are kept; tests point it at a temporary folder. */
export class McpConfig {
  constructor(private dir = getConfigDir()) {}

  get path(): string {
    return join(this.dir, "mcp.json");
  }

  get authPath(): string {
    return join(this.dir, "mcp-auth.json");
  }

  private choicesPath(folder: string): string {
    return join(this.dir, "projects", setDirName(folder), "mcp.json");
  }

  async servers(): Promise<Record<string, McpServerConfig>> {
    return (await readJsonFile<McpFile>(this.path, {})).mcpServers ?? {};
  }

  async saveServer(name: string, config: McpServerConfig): Promise<void> {
    if (!NAME.test(name)) throw new Error("Give the connector a short name: letters, digits, spaces, - _ or . (up to 40).");
    checkConfig(config);
    const file = await readJsonFile<McpFile>(this.path, {});
    file.mcpServers = { ...file.mcpServers, [name]: config };
    await writePrivateJson(this.path, file);
  }

  async removeServer(name: string): Promise<void> {
    const file = await readJsonFile<McpFile>(this.path, {});
    const config = file.mcpServers?.[name];
    if (!config) throw new Error(`There's no connector called ${name}.`);
    delete file.mcpServers![name];
    await writePrivateJson(this.path, file);
    if (config.url) await new McpAuthStore(this.authPath).forget(config.url);
  }

  /** The servers the assistant can use in `cwd`, and which are on there. */
  async folderServers(cwd: string): Promise<FolderServers> {
    let folder = cwd;
    for (let dir = cwd; ; dir = dirname(dir)) {
      if (existsSync(this.choicesPath(dir)) || existsSync(join(dir, FOLDER_MCP_FILE))) {
        folder = dir;
        break;
      }
      if (dirname(dir) === dir) break;
    }
    const choices = await readJsonFile<FolderChoices | undefined>(this.choicesPath(folder), undefined);
    const sharedFile = join(folder, FOLDER_MCP_FILE);
    const shared = existsSync(sharedFile) ? ((await readJsonFile<McpFile>(sharedFile, {})).mcpServers ?? {}) : {};
    const own = await this.servers();

    const servers: McpServerEntry[] = Object.entries(own).map(([name, config]) => ({
      name,
      config,
      source: "settings",
      on: choices ? choices.on.includes(name) : Boolean(config.everywhere),
    }));
    for (const [name, config] of Object.entries(shared)) {
      if (name in own || !isUsable(config)) continue;
      const on = Boolean(choices?.on.includes(name) && choices.approved?.[name] === definitionHash(config));
      servers.push({ name, config: sharedConfig(config), source: "folder", on });
    }
    return { folder, servers, ...(existsSync(sharedFile) ? { sharedFile } : {}) };
  }

  /** Turns a server on or off for the folder `cwd` belongs to. */
  async setOn(cwd: string, name: string, on: boolean): Promise<FolderServers> {
    const current = await this.folderServers(cwd);
    const entry = current.servers.find((s) => s.name === name);
    if (!entry) throw new Error(`There's no connector called ${name} here.`);
    const path = this.choicesPath(current.folder);
    const choices = await readJsonFile<FolderChoices>(path, { on: current.servers.filter((s) => s.on).map((s) => s.name) });
    choices.on = choices.on.filter((n) => n !== name);
    if (on) choices.on.push(name);
    if (entry.source === "folder") {
      choices.approved = { ...choices.approved };
      if (on) choices.approved[name] = definitionHash(await this.sharedDefinition(current.folder, name));
      else delete choices.approved[name];
    }
    await writePrivateJson(path, choices);
    return this.folderServers(cwd);
  }

  private async sharedDefinition(folder: string, name: string): Promise<McpServerConfig> {
    return (await readJsonFile<McpFile>(join(folder, FOLDER_MCP_FILE), {})).mcpServers?.[name] ?? {};
  }
}

function isUsable(config: McpServerConfig): boolean {
  return Boolean(config && typeof config === "object" && (typeof config.url === "string" || typeof config.command === "string"));
}

function checkConfig(config: McpServerConfig): void {
  if (config.url) {
    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      throw new Error("That URL isn't valid.");
    }
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("The URL needs to start with https:// (http:// only for this computer).");
  } else if (!config.command?.trim()) {
    throw new Error("Enter the server's URL or the command that starts it.");
  }
}

/**
 * A server from a shared folder file: only what defines it. Headers and env are dropped because a
 * shared file must not carry anyone's keys, and each person signs in with their own account.
 */
function sharedConfig(config: McpServerConfig): McpServerConfig {
  const { command, args, url, note } = config;
  return { ...(url ? { url } : { command, ...(Array.isArray(args) ? { args: args.map(String) } : {}) }), ...(typeof note === "string" ? { note } : {}) };
}

function definitionHash(config: McpServerConfig): string {
  const { command, args, url } = config;
  return createHash("sha256").update(JSON.stringify({ command, args, url })).digest("hex").slice(0, 16);
}

/** How a server is reached, for showing: its URL, or its command line. */
export function serverTarget(config: McpServerConfig): string {
  return config.url ?? [config.command ?? "", ...(config.args ?? [])].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" ");
}

/** Splits a command line typed in Settings into the program and its arguments; "quotes" keep spaces. */
export function splitCommand(line: string): { command: string; args: string[] } {
  const parts = [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const [command = "", ...args] = parts;
  return { command, args };
}

// ── Sign-ins ─────────────────────────────────────────

interface SavedAuth {
  client?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  verifier?: string;
  discovery?: OAuthDiscoveryState;
}

/** Sign-ins for connectors, by server URL, in ~/.aecdo/mcp-auth.json. Shared folder servers use the same sign-in as ones in Settings. */
export class McpAuthStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private path: string) {}

  async get(url: string): Promise<SavedAuth> {
    return (await readJsonFile<Record<string, SavedAuth>>(this.path, {}))[url] ?? {};
  }

  update(url: string, change: (saved: SavedAuth) => SavedAuth | undefined): Promise<void> {
    const next = this.chain.then(async () => {
      const all = await readJsonFile<Record<string, SavedAuth>>(this.path, {});
      const value = change(all[url] ?? {});
      if (value) all[url] = value;
      else delete all[url];
      await writePrivateJson(this.path, all);
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  forget(url: string): Promise<void> {
    return this.update(url, () => undefined);
  }

  async signedIn(url: string): Promise<boolean> {
    return Boolean((await this.get(url)).tokens);
  }
}

export interface SignInUi {
  /** Opens the sign-in page in the browser. */
  openUrl(url: string): void;
  /** Tells the user what's happening, with the link in case the browser didn't open. */
  notify(text: string, url?: string): void;
}

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

/** Catches the browser's redirect back to aecdo on 127.0.0.1 after the user signs in. */
class LoopbackCallback {
  private server?: Server;
  private state = randomBytes(16).toString("base64url");
  redirectUrl = "";
  readonly params: Promise<URLSearchParams>;
  private resolve!: (p: URLSearchParams) => void;
  private reject!: (e: Error) => void;

  constructor(private serverName: string) {
    this.params = new Promise((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
    this.params.catch(() => undefined);
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const ok = url.searchParams.get("state") === this.state && url.searchParams.has("code");
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
      const message = ok ? `Signed in to ${this.serverName}. You can close this tab and go back to aecdo.` : `Sign-in to ${this.serverName} didn't finish${error ? `: ${error}` : ""}.`;
      res.end(`<!doctype html><meta charset="utf-8"><title>aecdo</title><p style="font:16px system-ui;margin:3em">${escapeHtml(message)}</p>`);
      if (ok) this.resolve(url.searchParams);
      else this.reject(new Error(`Sign-in to ${this.serverName} didn't finish${error ? `: ${error}` : ""}.`));
    });
    this.server = server;
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
    this.redirectUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
    setTimeout(() => this.reject(new Error(`Sign-in to ${this.serverName} timed out.`)), SIGN_IN_TIMEOUT_MS).unref();
  }

  getState(): string {
    return this.state;
  }

  close(): void {
    this.server?.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

type DiscoveryProvider = OAuthClientProvider & {
  saveDiscoveryState(state: OAuthDiscoveryState): Promise<void>;
  discoveryState(): Promise<OAuthDiscoveryState | undefined>;
};

/** The library does the OAuth steps; this keeps what it needs between them, and opens the browser. */
function authProvider(store: McpAuthStore, url: string, name: string, ui: SignInUi, callback?: LoopbackCallback): DiscoveryProvider {
  return {
    get redirectUrl() {
      return callback?.redirectUrl;
    },
    get clientMetadata() {
      return {
        client_name: "aecdo",
        client_uri: "https://github.com/jeff-carmichael/aecdo",
        redirect_uris: callback ? [callback.redirectUrl] : [],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    ...(callback ? { state: () => callback.getState() } : {}),
    clientInformation: async () => (await store.get(url)).client as never,
    saveClientInformation: (client) => store.update(url, (s) => ({ ...s, client: client })),
    tokens: async () => (await store.get(url)).tokens as never,
    saveTokens: (tokens) => store.update(url, (s) => ({ ...s, tokens: tokens })),
    saveCodeVerifier: (verifier) => store.update(url, (s) => ({ ...s, verifier })),
    codeVerifier: async () => {
      const v = (await store.get(url)).verifier;
      if (!v) throw new Error("The sign-in was interrupted. Try again.");
      return v;
    },
    saveDiscoveryState: (discovery) => store.update(url, (s) => ({ ...s, discovery })),
    discoveryState: async () => (await store.get(url)).discovery,
    invalidateCredentials: (scope) =>
      store.update(url, (s) => {
        if (scope === "all") return undefined;
        const next = { ...s };
        if (scope === "client") delete next.client;
        if (scope === "tokens") delete next.tokens;
        if (scope === "verifier") delete next.verifier;
        if (scope === "discovery") delete next.discovery;
        return next;
      }),
    redirectToAuthorization: (authorizationUrl) => {
      if (!callback) throw new NeedsSignIn(name);
      ui.openUrl(authorizationUrl.href);
      ui.notify(`Sign in to ${name} in your browser. If it didn't open, use this link:`, authorizationUrl.href);
    },
  };
}

/** A server that needs the user to sign in before its tools can be used. */
export class NeedsSignIn extends Error {
  constructor(readonly server: string) {
    super(`${server} needs you to sign in. Open Settings, find it under Connectors, and press Sign in.`);
  }
}

// ── Connections and tools ─────────────────────────────

interface Connection {
  key: string;
  client: Client;
  tools: Tool[];
}

export interface McpHubOptions {
  config: McpConfig;
  ui: SignInUi;
  version: string;
}

/** The app's connections to connectors, started when a chat first needs them and kept until the app quits. */
export class McpHub {
  private connections = new Map<string, Promise<Connection>>();
  readonly auth: McpAuthStore;

  constructor(private opts: McpHubOptions) {
    this.auth = new McpAuthStore(opts.config.authPath);
  }

  /** Signs in to a server in the browser, then connects to it. */
  async signIn(name: string, config: McpServerConfig): Promise<string> {
    if (!config.url) throw new Error(`${name} runs on this computer and needs no sign-in.`);
    this.drop(name);
    const { StreamableHTTPClientTransport, UnauthorizedError } = await import("@modelcontextprotocol/client");
    const callback = new LoopbackCallback(name);
    await callback.start();
    try {
      // A client registered for an earlier sign-in has another redirect port; register again.
      await this.auth.update(config.url, (s) => ({ ...s, client: undefined, verifier: undefined }));
      const provider = authProvider(this.auth, config.url, name, this.opts.ui, callback);
      const transport = new StreamableHTTPClientTransport(new URL(config.url), { authProvider: provider, ...requestInit(config) });
      const client = await this.newClient();
      try {
        await client.connect(transport);
        await client.close();
        return `${name} didn't ask for a sign-in; it's ready.`;
      } catch (err) {
        if (!(err instanceof UnauthorizedError)) throw err;
      }
      await transport.finishAuth(await callback.params);
      await this.connection(name, config);
      return `Signed in to ${name}.`;
    } finally {
      callback.close();
    }
  }

  async signOut(name: string, config: McpServerConfig): Promise<string> {
    this.drop(name);
    if (config.url) await this.auth.forget(config.url);
    return `Signed out of ${name}.`;
  }

  /** Connects (or reuses the connection) and lists the server's tools. */
  async connection(name: string, config: McpServerConfig): Promise<Connection> {
    const key = JSON.stringify(config);
    const existing = this.connections.get(name);
    if (existing) {
      const c = await existing.catch(() => undefined);
      if (c?.key === key) return c;
      this.drop(name);
    }
    const started = this.connect(name, config, key);
    this.connections.set(name, started);
    started.catch(() => {
      if (this.connections.get(name) === started) this.connections.delete(name);
    });
    return started;
  }

  private async connect(name: string, config: McpServerConfig, key: string): Promise<Connection> {
    const sdk = await import("@modelcontextprotocol/client");
    const client = await this.newClient();
    if (config.url) {
      const auth = hasAuthHeader(config) ? {} : { authProvider: authProvider(this.auth, config.url, name, this.opts.ui) };
      try {
        await client.connect(new sdk.StreamableHTTPClientTransport(new URL(config.url), { ...auth, ...requestInit(config) }));
      } catch (err) {
        const authProblem = err instanceof NeedsSignIn || err instanceof sdk.UnauthorizedError || /\b401\b|unauthori[sz]ed|authoriz/i.test((err as Error).message);
        if (authProblem && !hasAuthHeader(config)) throw new NeedsSignIn(name);
        throw new Error(`Couldn't reach ${name}: ${(err as Error).message}`);
      }
    } else {
      const { StdioClientTransport, getDefaultEnvironment } = await import("@modelcontextprotocol/client/stdio");
      const transport = new StdioClientTransport({
        command: config.command!,
        args: config.args ?? [],
        env: { ...getDefaultEnvironment(), ...config.env },
        ...(config.cwd ? { cwd: config.cwd } : {}),
        stderr: "ignore",
      });
      try {
        await client.connect(transport);
      } catch (err) {
        throw new Error(`Couldn't start ${name} (${serverTarget(config)}): ${(err as Error).message}`);
      }
    }
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor && tools.length < 500);
    return { key, client, tools };
  }

  private async newClient(): Promise<Client> {
    const { Client } = await import("@modelcontextprotocol/client");
    return new Client({ name: "aecdo", version: this.opts.version });
  }

  /** The tools of the servers that are on, as the assistant's tools, and what kept any server out. */
  async tools(servers: McpServerEntry[]): Promise<{ tools: AgentTool[]; problems: string[] }> {
    const on = servers.filter((s) => s.on);
    const results = await Promise.allSettled(on.map((s) => this.connection(s.name, s.config)));
    const tools: AgentTool[] = [];
    const problems: string[] = [];
    const used = new Set<string>();
    results.forEach((r, i) => {
      const server = on[i];
      if (r.status === "rejected") return void problems.push((r.reason as Error).message);
      for (const tool of r.value.tools) tools.push(agentTool(server, tool, r.value.client, used));
    });
    return { tools, problems };
  }

  /** Whether each server is signed in (URL servers) or needs none. */
  async signedIn(config: McpServerConfig): Promise<boolean | undefined> {
    if (!config.url || hasAuthHeader(config)) return undefined;
    return this.auth.signedIn(config.url);
  }

  private drop(name: string): void {
    const c = this.connections.get(name);
    this.connections.delete(name);
    void c?.then((conn) => conn.client.close()).catch(() => undefined);
  }

  close(): void {
    for (const name of [...this.connections.keys()]) this.drop(name);
  }
}

function hasAuthHeader(config: McpServerConfig): boolean {
  return Object.keys(config.headers ?? {}).some((h) => h.toLowerCase() === "authorization");
}

function requestInit(config: McpServerConfig): { requestInit?: RequestInit } {
  return config.headers && Object.keys(config.headers).length ? { requestInit: { headers: config.headers } } : {};
}

const MAX_RESULT_CHARS = 40_000;

/** A tool name model APIs accept (letters, digits, _ and -, up to 64), unique among the tools. */
export function toolName(server: string, tool: string, used: Set<string>): string {
  const base = `${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 60)}_${n}`;
  used.add(name);
  return name;
}

/** The server's input schema without the keys some model APIs reject. */
export function cleanSchema(schema: Tool["inputSchema"]): TSchema {
  const rest: Record<string, unknown> = { ...schema };
  delete rest.$schema;
  return { type: "object", properties: {}, ...rest };
}

function agentTool(server: McpServerEntry, tool: Tool, client: Client, used: Set<string>): AgentTool {
  const from = `From the "${server.name}" connector.${server.config.note ? ` The user says: ${server.config.note}` : ""}`;
  return {
    name: toolName(server.name, tool.name, used),
    label: `${server.name}: ${tool.title ?? tool.annotations?.title ?? tool.name}`,
    description: `${from} ${tool.description ?? ""}`.trim(),
    parameters: cleanSchema(tool.inputSchema),
    execute: async (_id: string, params: unknown): Promise<AgentToolResult<unknown>> => {
      const result = await client.callTool({ name: tool.name, arguments: (params ?? {}) as Record<string, unknown> });
      const text = resultText(result.content, result.structuredContent);
      if (result.isError) throw new Error(text || `${server.name} reported an error.`);
      return { content: [{ type: "text", text: text || "(no result)" }], details: {} };
    },
  } as AgentTool;
}

type ContentBlock = { type: string; text?: string; uri?: string; name?: string; title?: string; resource?: { uri?: string; text?: string } };

/** The text of a tool's result. Images and binary resources are named, not sent. */
export function resultText(content: ContentBlock[] | undefined, structured?: unknown): string {
  const parts: string[] = [];
  for (const block of content ?? []) {
    if (block.type === "text" && block.text) parts.push(block.text);
    else if (block.type === "resource_link") parts.push(`[${block.title ?? block.name ?? block.uri}](${block.uri})`);
    else if (block.type === "resource") parts.push(block.resource?.text ? `${block.resource.uri ?? ""}\n${block.resource.text}`.trim() : `(resource ${block.resource?.uri ?? ""})`);
    else parts.push(`(${block.type} not shown)`);
  }
  if (!parts.length && structured !== undefined) parts.push(JSON.stringify(structured));
  const text = parts.join("\n\n");
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (cut at ${MAX_RESULT_CHARS} characters)` : text;
}
