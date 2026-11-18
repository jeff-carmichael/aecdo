import type { AgentTool } from "@earendil-works/pi-agent-core";
import { McpConfig, McpHub, serverTarget, splitCommand, type McpServerConfig, type McpServerEntry, type SignInUi } from "../lib/mcp.js";

export interface ServerInfo {
  name: string;
  /** Its URL, or the command that starts it. */
  target: string;
  kind: "url" | "command";
  source: "settings" | "folder";
  on: boolean;
  note?: string;
  everywhere: boolean;
  /** For servers that sign in: whether there's a saved sign-in. Absent for ones that don't sign in. */
  signedIn?: boolean;
}

export interface ToolsInfo {
  /** The folder whose choice of servers applies (it may be a parent of the open one). */
  folder: string;
  /** The folder's shared .mcp.json, when it has one. */
  sharedFile?: string;
  servers: ServerInfo[];
  path: string;
}

export interface ServerSetup {
  name: string;
  /** A URL, or the command line that starts the server. */
  target: string;
  /** For servers that take an API key instead of a sign-in; blank keeps the saved one. */
  token?: string;
  note?: string;
  everywhere?: boolean;
}

/** MCP connectors in the app: the ones in Settings, which are on in each folder, sign-ins, and their tools for the assistant. */
export class GuiTools {
  readonly config: McpConfig;
  readonly hub: McpHub;

  constructor(opts: { configDir?: string; ui: SignInUi; version: string }) {
    this.config = new McpConfig(opts.configDir);
    this.hub = new McpHub({ config: this.config, ui: opts.ui, version: opts.version });
  }

  async info(cwd: string): Promise<ToolsInfo> {
    const folder = await this.config.folderServers(cwd);
    const servers = await Promise.all(folder.servers.map((s) => this.describe(s)));
    return { folder: folder.folder, ...(folder.sharedFile ? { sharedFile: folder.sharedFile } : {}), servers, path: this.config.path };
  }

  private async describe(s: McpServerEntry): Promise<ServerInfo> {
    const signedIn = await this.hub.signedIn(s.config);
    return {
      name: s.name,
      target: serverTarget(s.config),
      kind: s.config.url ? "url" : "command",
      source: s.source,
      on: s.on,
      ...(s.config.note ? { note: s.config.note } : {}),
      everywhere: Boolean(s.config.everywhere),
      ...(signedIn !== undefined ? { signedIn } : {}),
    };
  }

  async setOn(cwd: string, name: string, on: boolean): Promise<string> {
    await this.config.setOn(cwd, name, on);
    return on ? `${name} is on in this folder.` : `${name} is off in this folder.`;
  }

  async save(setup: ServerSetup): Promise<string> {
    const name = setup.name.trim();
    const target = setup.target.trim();
    const saved = (await this.config.servers())[name];
    let config: McpServerConfig;
    if (/^https?:\/\//i.test(target)) {
      const token = setup.token?.trim();
      const headers = token ? { Authorization: /^bearer\s/i.test(token) ? token : `Bearer ${token}` } : saved?.url === target ? saved.headers : undefined;
      config = { url: target, ...(headers ? { headers } : {}) };
    } else {
      const { command, args } = splitCommand(target);
      config = { command, ...(args.length ? { args } : {}), ...(saved?.env ? { env: saved.env } : {}) };
    }
    const note = setup.note?.trim();
    if (note) config.note = note;
    if (setup.everywhere) config.everywhere = true;
    await this.config.saveServer(name, config);
    return saved ? `Saved ${name}.` : `Added ${name}.${config.url && !config.headers ? " Press Sign in if it needs an account." : ""}`;
  }

  async setEverywhere(name: string, on: boolean): Promise<string> {
    const config = (await this.config.servers())[name];
    if (!config) throw new Error(`There's no connector called ${name}.`);
    const next = { ...config };
    if (on) next.everywhere = true;
    else delete next.everywhere;
    await this.config.saveServer(name, next);
    return on ? `${name} is on in every folder that hasn't picked its own connectors.` : `${name} is only on in folders that turn it on.`;
  }

  async remove(name: string): Promise<string> {
    const config = (await this.config.servers())[name];
    if (config) await this.hub.signOut(name, config);
    await this.config.removeServer(name);
    return `Removed ${name}.`;
  }

  private async find(cwd: string, name: string): Promise<McpServerEntry> {
    const entry = (await this.config.folderServers(cwd)).servers.find((s) => s.name === name);
    if (!entry) throw new Error(`There's no connector called ${name}.`);
    return entry;
  }

  async signIn(cwd: string, name: string): Promise<string> {
    return this.hub.signIn(name, (await this.find(cwd, name)).config);
  }

  async signOut(cwd: string, name: string): Promise<string> {
    return this.hub.signOut(name, (await this.find(cwd, name)).config);
  }

  /** The tools of the servers on in `cwd`, for the assistant. */
  async tools(cwd: string): Promise<{ tools: AgentTool[]; problems: string[] }> {
    const { servers } = await this.config.folderServers(cwd);
    if (!servers.some((s) => s.on)) return { tools: [], problems: [] };
    return this.hub.tools(servers);
  }

  close(): void {
    this.hub.close();
  }
}
