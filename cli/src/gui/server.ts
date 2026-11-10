import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { assetPath, contentType } from "./assets.js";
import { MARKUP_KINDS, type MarkupKind } from "../lib/markup.js";
import { ASSISTANTS, ROUTE_ORDER, type AssistantName, type CustomApi, type RouteId } from "../lib/llm.js";
import type { GuiApp } from "./app.js";
import type { GuiSession } from "./session.js";
import type { BBox } from "../lib/pdf-page.js";

export interface GuiServer {
  /** The app's address, including the secret path that every request must start with. */
  url: string;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type Body = Record<string, unknown>;
type Handler = (body: Body, query: URLSearchParams) => unknown;

const MAX_BODY = 1_000_000;
const HEARTBEAT_MS = 15_000;

function str(body: Body, key: string): string {
  const v = body[key];
  if (typeof v !== "string") throw new HttpError(400, `"${key}" is required`);
  return v;
}

function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        rej(new HttpError(413, "Request too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return res({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
        res(parsed && typeof parsed === "object" ? (parsed as Body) : {});
      } catch {
        rej(new HttpError(400, "Invalid JSON"));
      }
    });
    req.on("error", rej);
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const text = JSON.stringify(value ?? null);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

/**
 * Serves a file, honoring a single "Range: bytes=a-b" so PDF.js only loads the pages it shows.
 * `inMemory` reads it whole: the app's own files, which a compiled binary keeps in memory where streams can't reach.
 */
async function sendFile(req: IncomingMessage, res: ServerResponse, path: string, type: string, cache: string, inMemory = false): Promise<void> {
  const data = inMemory ? await readFile(path) : undefined;
  const size = data ? data.length : (await stat(path)).size;
  const headers: Record<string, string | number> = { "content-type": type, "accept-ranges": "bytes", "cache-control": cache };
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(status, { ...headers, "content-length": size === 0 ? 0 : end - start + 1 });
  if (req.method === "HEAD" || size === 0) return void res.end();
  if (data) return void res.end(data.subarray(start, end + 1));
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function session(app: GuiApp): GuiSession {
  if (!app.session) throw new HttpError(409, "No drawing set is open");
  return app.session;
}

function bbox(value: unknown): BBox | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number" && Number.isFinite(n))) return value as BBox;
  throw new HttpError(400, "bbox must be four numbers");
}

function assistantName(value: unknown): AssistantName | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && value in ASSISTANTS) return value as AssistantName;
  throw new HttpError(400, `Unknown model ${JSON.stringify(value)}`);
}

function routeId(value: unknown): RouteId {
  if (typeof value === "string" && (ROUTE_ORDER as string[]).includes(value)) return value as RouteId;
  throw new HttpError(400, `Unknown route ${JSON.stringify(value)}`);
}

function routes(app: GuiApp): Record<string, Handler> {
  return {
    "GET /api/boot": async () => (app.session ? { set: await app.session.boot() } : { home: await app.home() }),
    "GET /api/home": () => app.home(),
    "POST /api/open-file": async (b) => {
      try {
        return { path: await app.openFile(str(b, "url")) };
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
    },
    "POST /api/open": async (b) => {
      const path = str(b, "path");
      try {
        return { set: await app.open(path) };
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
    },
    "GET /api/state": () => session(app).state(),
    "POST /api/cmd": (b) => {
      const commands = b.commands;
      if (!Array.isArray(commands) || !commands.every((c) => typeof c === "string")) throw new HttpError(400, '"commands" must be a list of strings');
      return session(app).command(commands);
    },
    "POST /api/sheet": (b) => session(app).openSheet(str(b, "sheet")),
    "POST /api/id": (b) => session(app).openId(str(b, "id")),
    "GET /api/preview": (_b, q) => session(app).preview(q.get("sheet") ?? "") ?? null,
    "GET /api/find": (_b, q) => session(app).find(q.get("q") ?? ""),
    "GET /api/pdf-info": () => session(app).pdfInfo(),
    "POST /api/pdf": async (b) => {
      try {
        return await session(app).setPdf(str(b, "path"));
      } catch (err) {
        throw new HttpError(404, (err as Error).message);
      }
    },
    "GET /api/markups": () => session(app).markupsInfo(),
    "POST /api/markups": async (b) => {
      const index = typeof b.index === "number" ? b.index : undefined;
      try {
        return { message: await session(app).markupsAction(str(b, "action"), b.inPlace === true, index) };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, (err as Error).message);
      }
    },
    "POST /api/markups/add": async (b) => {
      const kind = str(b, "kind") as MarkupKind;
      if (!MARKUP_KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${MARKUP_KINDS.join(", ")}`);
      try {
        return {
          message: await session(app).addMarkup({ kind, text: str(b, "text"), bbox: bbox(b.bbox), ...(typeof b.sheet === "string" ? { sheet: b.sheet } : {}) }),
        };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, (err as Error).message);
      }
    },
    "GET /api/assistants": () => session(app).assistants(),
    "GET /api/chat": () => session(app).threadList(),
    "POST /api/chat/new": (b) => session(app).newThread(assistantName(b.model)),
    "POST /api/chat/send": (b) => {
      const s = session(app);
      const thread = str(b, "thread");
      const text = str(b, "text");
      // The answer streams over the event stream; this request only starts it.
      s.send(thread, text).catch((err: Error) => app.emit({ type: "toast", level: "warn", text: err.message }));
      return { ok: true };
    },
    "POST /api/chat/stop": (b) => {
      session(app).stop(str(b, "thread"));
      return { ok: true };
    },
    "POST /api/chat/close": (b) => {
      session(app).closeThread(str(b, "thread"));
      return { ok: true };
    },
    "GET /api/settings": () => app.settings.info(),
    "POST /api/settings": async (b) => {
      const action = str(b, "action");
      const opt = (key: string) => (typeof b[key] === "string" ? (b[key]) : "");
      const route = () => routeId(b.route);
      try {
        const message = await app.changeSettings((s) => {
          switch (action) {
            case "api":
              return s.saveApi(opt("clientId"), opt("clientSecret"), opt("region") || "us-west-2");
            case "key":
              return s.saveKey(route(), opt("key"));
            case "sign-in":
              return s.signIn(route());
            case "bedrock":
              return s.setupBedrock(opt("region"));
            case "custom": {
              const models = b.models && typeof b.models === "object" ? (b.models as Record<string, unknown>) : {};
              const picked: Partial<Record<AssistantName, string>> = {};
              for (const [k, v] of Object.entries(models)) if (k in ASSISTANTS && typeof v === "string") picked[k as AssistantName] = v;
              return s.saveCustom({ name: opt("name"), baseUrl: opt("baseUrl"), api: opt("api") as CustomApi, token: opt("token"), models: picked });
            }
            case "choose":
              return s.choose(assistantName(b.name) ?? "claude", route(), opt("model"));
            case "sign-out":
              return s.signOut(route());
            default:
              throw new HttpError(400, `Unknown settings action "${action}"`);
          }
        });
        return { message, settings: await app.settings.info() };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, (err as Error).message);
      }
    },
    "GET /api/settings/models": (_b, q) => {
      const name = assistantName(q.get("name"));
      if (!name) throw new HttpError(400, "Which model family?");
      return app.settings.modelChoices(name, routeId(q.get("route")));
    },
    "POST /api/prompt": (b) => {
      app.answerPrompt(str(b, "id"), typeof b.value === "string" ? b.value : null);
      return { ok: true };
    },
    "POST /api/confirm": (b) => {
      app.answer(str(b, "id"), b.ok === true);
      return { ok: true };
    },
    "POST /api/quit": async (b) => {
      if (b.save === true && app.session?.markups.pending.length) await app.session.markups.save();
      setTimeout(() => app.quit("quit"), 50);
      return { ok: true };
    },
  };
}

function openEvents(app: GuiApp, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  res.write(": connected\n\n");
  const unsubscribe = app.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
  const beat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(beat);
    unsubscribe();
  });
}

/**
 * Serves the app on 127.0.0.1 under a random secret path, so other programs and web pages
 * on this computer can't drive it. `onDisconnect` hears when the last open page goes away.
 */
export async function startGuiServer(app: GuiApp, opts: { token?: string; port?: number; onDisconnect?: () => void } = {}): Promise<GuiServer> {
  const token = opts.token ?? randomBytes(18).toString("base64url");
  const prefix = `/${token}`;
  const table = routes(app);
  let port = 0;

  const server = createServer((req, res) => {
    void (async () => {
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, "Forbidden");
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) throw new HttpError(404, "Not found");
      const path = url.pathname.slice(prefix.length) || "/";
      const method = req.method === "HEAD" ? "GET" : (req.method ?? "GET");

      if (path === "/" && method === "GET") {
        if (!url.pathname.endsWith("/")) {
          res.writeHead(302, { location: `${prefix}/` });
          return void res.end();
        }
        const index = assetPath("app/index.html");
        if (!index) throw new HttpError(500, "The app's files are missing");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return void res.end(await readFile(index));
      }
      if (path === "/api/events" && method === "GET") {
        openEvents(app, req, res);
        req.on("close", () => {
          if (app.clientCount === 0) opts.onDisconnect?.();
        });
        return;
      }
      if (path === "/pdf" && method === "GET") {
        const file = app.session?.pdfFile();
        if (!file) throw new HttpError(404, "No PDF for this set");
        return sendFile(req, res, file, "application/pdf", "no-cache");
      }
      if ((path.startsWith("/app/") || path.startsWith("/pdfjs/")) && method === "GET") {
        const file = assetPath(decodeURIComponent(path.slice(1)));
        if (!file) throw new HttpError(404, "Not found");
        // PDF.js is pinned by package version, so the browser can keep it; the app's own files may change.
        return sendFile(req, res, file, contentType(file), path.startsWith("/pdfjs/") ? "max-age=86400" : "no-cache", true);
      }
      const handler = table[`${method} ${path}`];
      if (!handler) throw new HttpError(404, "Not found");
      const body = method === "POST" ? await readBody(req) : {};
      sendJson(res, 200, await handler(body, url.searchParams));
    })().catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = (err as Error).message ?? String(err);
      if (res.headersSent) return void res.end();
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return sendJson(res, 404, { error: "File not found" });
      sendJson(res, status, { error: message });
    });
  });

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(opts.port ?? 0, "127.0.0.1", () => res());
  });
  port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}${prefix}/`,
    close: () =>
      new Promise<void>((res) => {
        server.closeAllConnections();
        server.close(() => res());
      }),
  };
}
