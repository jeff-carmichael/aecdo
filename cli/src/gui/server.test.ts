import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, statSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuiApp, type HomeInfo } from "./app.js";
import type { BootInfo, GuiState } from "./session.js";
import { startGuiServer } from "./server.js";
import { assetPath } from "./assets.js";

const examples = new URL("../../../examples/", import.meta.url);

async function start(withSet = true) {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-gui-server-"));
  for (const f of ["sample-drawing-package-1and2family.jsonld", "sample-drawing-package-1and2family.pdf"]) copyFileSync(new URL(f, examples), join(dir, f));
  const app = new GuiApp({ cwd: dir, settingsPath: join(dir, "gui.json") });
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

test("asset paths stay inside the app's files", () => {
  assert.match(assetPath("app/app.js") ?? "", /cli[\\/]gui[\\/]app\.js$/);
  assert.match(assetPath("pdfjs/pdf.min.mjs") ?? "", /pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.min\.mjs$/);
  assert.match(assetPath("pdfjs/standard_fonts/FoxitSerif.pfb") ?? "", /pdfjs-dist[\\/]standard_fonts[\\/]FoxitSerif\.pfb$/);
  assert.equal(assetPath("app/../package.json"), undefined);
  assert.equal(assetPath("app/secret.txt"), undefined);
  assert.equal(assetPath("../etc/passwd"), undefined);
});
