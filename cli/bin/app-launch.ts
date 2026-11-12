// Opening the app from its icon: `aecdo __app`, which `aecdo shortcut` puts in the Start menu,
// Applications, or the app menu. Unlike `aecdo gui`, the window runs in this process and the
// server in a child (`__app-server`): the process the OS launched is the one with the window, so
// the Dock and taskbar show the app's icon.
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { embedded } from "../src/lib/embedded.js";

const HIDDEN_ENV = "AECDO_APP_HIDDEN";

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
  const { gui } = await import("../src/commands/gui.js");
  await gui(undefined, { app: true, browser: true });
}

export async function launchApp(): Promise<void> {
  const self = embedded.selfCommand!;
  if (process.platform === "win32" && !process.env[HIDDEN_ENV]) {
    // aecdo.exe is a console program, so Windows gave it a console window (minimized by the
    // shortcut). Start again without one and let this process, and its console, go.
    spawn(self[0], [...self.slice(1), "__app"], { stdio: "ignore", detached: true, windowsHide: true, env: { ...process.env, [HIDDEN_ENV]: "1" } }).unref();
    return;
  }

  let window: typeof import("./gui-window.js");
  try {
    window = await import("./gui-window.js");
  } catch {
    return inBrowser();
  }
  const server = spawn(self[0], [...self.slice(1), "__app-server"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  const output = watchServer(server.stdout);
  const url = await output.url;
  if (!url) return inBrowser();
  try {
    window.runWindow(url);
  } catch {
    // the window couldn't start; handled below like one that closed before its page loaded
  }
  // The server quits when its stdin closes. Wait for that, so its output has all been read.
  server.stdin.end();
  await Promise.race([output.done, new Promise((res) => setTimeout(res, 5000))]);
  // A window that closed before its page ever loaded never really opened (no display, say).
  if (!output.connected()) return inBrowser();
}
