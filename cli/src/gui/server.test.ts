import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { request } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { GuiApp, type HomeInfo } from "./app.js";
import type { BootInfo, GuiState } from "./session.js";
import { startGuiServer } from "./server.js";
import { assetPath } from "./assets.js";

const examples = new URL("../../../examples/", import.meta.url);

async function start(withSet = true, opened: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-server-"));
  for (const f of ["sample-drawing-package-1and2family.jsonld", "sample-drawing-package-1and2family.pdf"]) copyFileSync(new URL(f, examples), join(dir, f));
  const app = new GuiApp({ cwd: dir, settingsPath: join(dir, "gui.json"), llmPath: join(dir, "llm.json"), configDir: dir, openUrl: (u) => opened.push(u) });
  if (withSet) await app.open("sample-drawing-package-1and2family.jsonld");
  const server = await startGuiServer(app, { token: "secret" });
  return { app, server, dir, url: server.url };
}

async function json<T = unknown>(url: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as T };
}

test("serves the app only under its secret path and to its own host name", async () => {
  const { server, url } = await start();
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/secret\/$/);
    const index = await fetch(url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<script type="module" src="app\/app.js">/);
    assert.equal((await fetch(url.replace("/secret/", "/guess/"))).status, 404);
    assert.equal((await fetch(`${url}app/../../package.json`)).status, 404);

    // A page on another site can't reach it by pointing a DNS name at 127.0.0.1.
    const port = new URL(url).port;
    const status = await new Promise<number>((res, rej) => {
      const req = request({ host: "127.0.0.1", port, path: "/secret/api/state", headers: { host: `evil.example:${port}` } }, (r) => {
        r.resume();
        res(r.statusCode ?? 0);
      });
      req.on("error", rej);
      req.end();
    });
    assert.equal(status, 403);
  } finally {
    await server.close();
  }
});

test("the API moves around the set and serves PDF byte ranges", async () => {
  const { server, url, dir } = await start();
  try {
    const boot = await json<{ set: BootInfo }>(`${url}api/boot`);
    assert.equal(boot.data.set.sheets.length, 7);
    assert.equal(boot.data.set.pdf.available, true);

    const sheet = await json<GuiState>(`${url}api/sheet`, { sheet: "2" });
    assert.equal(sheet.data.kind, "sheet");
    const drawing = await json<GuiState>(`${url}api/cmd`, { commands: ["1"] });
    assert.equal(drawing.data.kind, "drawing");
    assert.equal((await json(`${url}api/cmd`, { commands: "1" })).status, 400);
    assert.deepEqual((await json(`${url}api/find?q=floor`)).data, ["2"]);

    const size = statSync(join(dir, "sample-drawing-package-1and2family.pdf")).size;
    const range = await fetch(`${url}pdf`, { headers: { range: "bytes=0-99" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), `bytes 0-99/${size}`);
    assert.equal((await range.arrayBuffer()).byteLength, 100);
    assert.match(new TextDecoder().decode((await (await fetch(`${url}pdf`, { headers: { range: "bytes=0-4" } })).arrayBuffer())), /^%PDF-/);

    const worker = await fetch(`${url}pdfjs/pdf.worker.min.mjs`);
    assert.equal(worker.status, 200);
    assert.match(worker.headers.get("content-type") ?? "", /javascript/);
    await worker.arrayBuffer();
  } finally {
    await server.close();
  }
});

test("with no set open, the app lists the folder's sets and opens one", async () => {
  const { app, server, url } = await start(false);
  try {
    const boot = await json<{ home: HomeInfo }>(`${url}api/boot`);
    assert.deepEqual(boot.data.home.files, ["sample-drawing-package-1and2family.jsonld"]);
    assert.equal((await json(`${url}api/state`)).status, 409);
    const opened = await json<{ set: BootInfo }>(`${url}api/open`, { path: "sample-drawing-package-1and2family.jsonld" });
    assert.equal(opened.data.set.sheets.length, 7);
    assert.equal((await json(`${url}api/open`, { path: "nope.jsonld" })).status, 400);
    assert.equal(app.session?.sheets.length, 7);
    assert.match((await app.recent())[0], /sample-drawing-package-1and2family\.jsonld$/);
  } finally {
    await server.close();
  }
});

test("the app opens other folders, remembers them, and starts in the last one", async () => {
  const { app, server, url, dir } = await start(false);
  try {
    const other = mkdtempSync(join(tmpdir(), "aecdo-gui-folder-"));
    copyFileSync(new URL("sample-drawing-package-1and2family.jsonld", examples), join(other, "house.jsonld"));
    const typed = await json<{ home: HomeInfo }>(`${url}api/open`, { path: other });
    assert.equal(typed.data.home.cwd, other);
    assert.deepEqual(typed.data.home.files, ["house.jsonld"]);
    assert.equal(app.cwd, other);

    let picked: string | null | undefined = dir;
    const picker = new GuiApp({ cwd: other, settingsPath: join(dir, "gui.json"), chooseFolder: () => Promise.resolve(picked) });
    assert.deepEqual(await picker.pickFolder(), { cwd: dir, homeDir: homedir(), files: ["sample-drawing-package-1and2family.jsonld"], pdfs: [], canProcess: false, recent: [], folders: [other] });
    picked = null;
    assert.equal(await picker.pickFolder(), "cancelled");
    picked = undefined;
    assert.equal(await picker.pickFolder(), "unavailable");
    assert.equal(await picker.lastFolder(), dir);

    assert.equal((await json(`${url}api/open`, { path: join(dir, "missing-folder") })).status, 400);

    await app.open(join(other, "house.jsonld"));
    await app.open(join(dir, "sample-drawing-package-1and2family.jsonld"));
    assert.equal(app.cwd, dir, "opening a set from another folder works in that folder");
    assert.equal(await app.lastFolder(), dir);
    rmSync(join(other, "house.jsonld"));
    assert.deepEqual((await app.home()).recent, [join(dir, "sample-drawing-package-1and2family.jsonld")], "sets that are gone aren't offered");
  } finally {
    await server.close();
  }
});

test("PDFs stay hidden on the home screen while processing is coming soon", async () => {
  const { app, server, url, dir } = await start(false);
  try {
    copyFileSync(new URL("sample-drawing-package-1and2family.pdf", examples), join(dir, "new plans.pdf"));
    const home = await json<{ home: HomeInfo }>(`${url}api/boot`);
    assert.deepEqual(home.data.home.pdfs, []);
    assert.equal(home.data.home.canProcess, false);
    const opened = await json<{ error: string }>(`${url}api/open`, { path: "new plans.pdf" });
    assert.equal(opened.status, 400);
    assert.match(opened.data.error, /coming soon/);
    assert.equal((await json(`${url}api/process`, { name: "new plans.pdf" })).status, 400);
    assert.equal((await app.settings.info()).api.available, false);
  } finally {
    await server.close();
  }
});

test("the app processes a PDF on the home screen and saves the set next to it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-process-"));
  for (const f of ["sample-drawing-package-1and2family.jsonld", "sample-drawing-package-1and2family.pdf"]) copyFileSync(new URL(f, examples), join(dir, f));
  copyFileSync(new URL("sample-drawing-package-1and2family.pdf", examples), join(dir, "new plans.pdf"));
  let finish!: () => void;
  const ran: string[] = [];
  const app = new GuiApp({
    cwd: dir,
    settingsPath: join(dir, "gui.json"),
    configDir: dir,
    processing: true,
    runJob: async (path, opts) => {
      ran.push(path);
      opts.onStatus?.({ jobId: "j1", fileName: "new plans.pdf", globalStatus: "Processing", totalPages: 7, pages: [{ page: "1", status: "Done" }] });
      await new Promise<void>((res) => (finish = res));
      return { content: '{"sheets":[]}' };
    },
  });
  const events: unknown[] = [];
  app.subscribe((e) => events.push(e));

  let home = await app.home();
  assert.deepEqual(home.pdfs, [{ name: "new plans.pdf" }], "a PDF with a set next to it isn't listed");
  assert.equal(home.canProcess, false);
  await assert.rejects(app.process("new plans.pdf"), /credentials in Settings/);

  await app.settings.saveApi("client-1234", "secret", "us-west-2");
  assert.equal((await app.home()).canProcess, true);
  await assert.rejects(app.process("missing.pdf"), /isn't a PDF in this folder/);
  await app.process("new plans.pdf");
  await assert.rejects(app.process("new plans.pdf"), /already being processed/);
  assert.deepEqual(ran, [join(dir, "new plans.pdf")]);
  home = await app.home();
  assert.deepEqual(home.pdfs, [{ name: "new plans.pdf", status: "Processing, 1/7 pages done" }]);

  finish();
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(readFileSync(join(dir, "new plans.jsonld"), "utf-8"), '{"sheets":[]}\n');
  assert.deepEqual(events.at(-1), { type: "process", file: "new plans.pdf", done: join(dir, "new plans.jsonld") });
  assert.deepEqual((await app.home()).pdfs, []);
});

test("events reach the page, and questions wait for its answer", async () => {
  const { app, server, url } = await start();
  try {
    const res = await fetch(`${url}api/events`);
    const reader = res.body!.getReader();
    const next = async () => {
      let text = "";
      while (!text.includes("data:")) text += new TextDecoder().decode((await reader.read()).value);
      return JSON.parse(text.slice(text.indexOf("data:") + 5).split("\n")[0]) as { type: string; id?: string; question?: string };
    };
    const answer = app.confirm("Allow it?");
    const ev = await next();
    assert.equal(ev.type, "confirm");
    assert.equal(ev.question, "Allow it?");
    await json(`${url}api/confirm`, { id: ev.id, ok: true });
    assert.equal(await answer, true);
    await reader.cancel();
  } finally {
    await server.close();
  }
});

test("Settings saves keys and asks sign-in questions through the page", async () => {
  const { app, server, url } = await start(false);
  try {
    const info = await json<{ ai: { routes: { id: string; configured: boolean }[] }; api: { configured: boolean } }>(`${url}api/settings`);
    assert.equal(info.data.api.configured, false);
    const saved = await json<{ message: string; settings: typeof info.data }>(`${url}api/settings`, { action: "key", route: "openai", key: "sk-test" });
    assert.match(saved.data.message, /Saved the OpenAI/);
    assert.equal(saved.data.settings.ai.routes.find((r) => r.id === "openai")?.configured, true);
    assert.equal((await json(`${url}api/settings`, { action: "key", route: "nowhere", key: "x" })).status, 400);
    assert.equal((await json(`${url}api/settings`, { action: "dance" })).status, 400);
    const models = await json<string[]>(`${url}api/settings/models?name=chatgpt&route=openai`);
    assert.ok(models.data.length > 0);

    const res = await fetch(`${url}api/events`);
    const reader = res.body!.getReader();
    let buffered = "";
    const next = async (): Promise<{ type: string; id: string; kind: string; options?: { id: string }[] }> => {
      for (;;) {
        while (!buffered.includes("\n\n")) buffered += new TextDecoder().decode((await reader.read()).value);
        const [chunk, ...rest] = buffered.split("\n\n");
        buffered = rest.join("\n\n");
        if (chunk.startsWith("data:")) return JSON.parse(chunk.slice(5)) as never;
      }
    };
    const typed = app.prompt({ type: "secret", message: "Paste the token" });
    const ev = await next();
    assert.deepEqual([ev.type, ev.kind], ["prompt", "secret"]);
    await json(`${url}api/prompt`, { id: ev.id, value: "tok" });
    assert.equal(await typed, "tok");

    const picked = assert.rejects(app.prompt({ type: "select", message: "How?", options: [{ id: "a", label: "A" }] }), /Cancelled/);
    const sel = await next();
    assert.deepEqual(sel.options?.map((o) => o.id), ["a"]);
    await json(`${url}api/prompt`, { id: sel.id, value: null });
    await picked;
    await reader.cancel();
  } finally {
    await server.close();
  }
});

test("file links from a chat open spreadsheets and notes in the folder, and nothing else", async () => {
  const opened: string[] = [];
  const { server, url, dir } = await start(false, opened);
  try {
    writeFileSync(join(dir, "door check.csv"), "Door\n");
    const ok = await json<{ path: string }>(`${url}api/open-file`, { url: pathToFileURL(join(dir, "door check.csv")).href });
    assert.equal(ok.status, 200);
    assert.deepEqual(opened, [join(dir, "door check.csv")]);
    for (const bad of [pathToFileURL(join(dir, "missing.csv")).href, pathToFileURL(join(dir, "sample-drawing-package-1and2family.pdf")).href, pathToFileURL("/etc/passwd.csv").href, "https://example.com/a.csv"]) {
      assert.equal((await json(`${url}api/open-file`, { url: bad })).status, 400, bad);
    }
    assert.equal(opened.length, 1);
  } finally {
    await server.close();
  }
});

test("asset paths stay inside the app's files", () => {
  assert.match(assetPath("app/app.js") ?? "", /cli[\\/]gui[\\/]app\.js$/);
  assert.match(assetPath("pdfjs/pdf.min.mjs") ?? "", /pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.min\.mjs$/);
  assert.match(assetPath("pdfjs/standard_fonts/FoxitSerif.pfb") ?? "", /pdfjs-dist[\\/]standard_fonts[\\/]FoxitSerif\.pfb$/);
  assert.equal(assetPath("app/../package.json"), undefined);
  assert.equal(assetPath("app/secret.txt"), undefined);
  assert.equal(assetPath("../etc/passwd"), undefined);
});
