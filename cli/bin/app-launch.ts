// Opening the app from its icon: `aecdo __app`, which `aecdo shortcut` puts in the Start menu,
// Applications, or the app menu. Unlike `aecdo gui`, the window runs in this process and the
// server in a child (`__app-server`): the process the OS launched is the one with the window, so
// the Dock and taskbar show the app's icon.
//
// Nobody sees this process's output (on Windows it has no console at all), so each launch writes
// what it did to ~/.aecdo/app.log.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { getConfigDir } from "../src/lib/config.js";
import { embedded } from "../src/lib/embedded.js";

const HIDDEN_ENV = "AECDO_APP_HIDDEN";
export const APP_LOG = join(getConfigDir(), "app.log");

function log(line: string): void {
  try {
    appendFileSync(APP_LOG, `${new Date().toISOString()} [${process.pid}] ${line}\n`);
  } catch {
    // a log we can't write mustn't stop the app
  }
}

function startLog(): void {
  try {
    mkdirSync(getConfigDir(), { recursive: true });
    writeFileSync(APP_LOG, "");
  } catch {
    // as above
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

/** Reads the server's output: its URL, then "connected" once the page has loaded. */
function watchServer(stream: Readable): { url: Promise<string | undefined>; connected: () => boolean; done: Promise<void> } {
  let text = "";
  let gotUrl: (url: string | undefined) => void;
  const url = new Promise<string | undefined>((res) => (gotUrl = res));
  stream.on("data", (d: Buffer) => {
    text += d.toString("utf-8");
    const end = text.indexOf("\n");
    if (end >= 0) gotUrl(text.slice(0, end).trim());
  });
  const done = new Promise<void>((res) =>
    stream.once("end", () => {
      gotUrl(undefined);
      res();
    })
  );
  return { url, connected: () => /\nconnected\n/.test(text), done };
}

/** Without a window (no WebView2 or WebKitGTK), the app opens in the browser as `aecdo gui` would. */
async function inBrowser(): Promise<void> {
  log("opening in the browser instead");
  const { gui } = await import("../src/commands/gui.js");
  await gui(undefined, { app: true, browser: true });
}

export async function launchApp(): Promise<void> {
  const self = embedded.selfCommand!;
  const hidden = process.platform === "win32" && !process.env[HIDDEN_ENV];
  if (!process.env[HIDDEN_ENV]) startLog();
  log(`aecdo ${embedded.version ?? ""} __app on ${process.platform}-${process.arch}, ${self.join(" ")}`);
  process.on("uncaughtException", (err) => {
    log(`uncaught: ${describe(err)}`);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => log(`unhandled rejection: ${describe(err)}`));
  process.on("exit", (code) => log(`exit ${code}`));

  if (hidden) {
    // aecdo.exe is a console program, so Windows gave it a console window (minimized by the
    // shortcut). Start again without one and let this process, and its console, go.
    const child = spawn(self[0], [...self.slice(1), "__app"], { stdio: "ignore", detached: true, windowsHide: true, env: { ...process.env, [HIDDEN_ENV]: "1" } });
    child.on("error", (err) => log(`couldn't restart without a console: ${err.message}`));
    child.unref();
    log(`restarted without a console as ${child.pid}`);
    return;
  }

  try {
    await launchWindow(self);
  } catch (err) {
    log(`failed: ${describe(err)}`);
    await inBrowser();
  }
}

async function launchWindow(self: string[]): Promise<void> {
  let window: typeof import("./gui-window.js");
  try {
    window = await import("./gui-window.js");
  } catch (err) {
    log(`no window library: ${describe(err)}`);
    return inBrowser();
  }
  const server = spawn(self[0], [...self.slice(1), "__app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  server.on("error", (err) => log(`server didn't start: ${err.message}`));
  server.on("exit", (code) => log(`server exited ${code}`));
  server.stderr.on("data", (d: Buffer) => log(`server: ${d.toString("utf-8").trimEnd()}`));
  const output = watchServer(server.stdout);
  server.stdout.on("data", (d: Buffer) => {
    if (d.toString("utf-8").includes("connected")) log("page loaded");
  });
  const url = await output.url;
  if (!url) return inBrowser();
  log(`server at ${url.replace(/\/[^/]+\/?$/, "/…")}, opening the window`);
  try {
    window.runWindow(url);
    log("window closed");
  } catch (err) {
    log(`window failed: ${describe(err)}`);
  }
  // The server quits when its stdin closes. Wait for that, so its output has all been read.
  server.stdin.end();
  await Promise.race([output.done, new Promise((res) => setTimeout(res, 5000))]);
  // A window that closed before its page ever loaded never really opened (no display, say).
  if (!output.connected()) return inBrowser();
}
