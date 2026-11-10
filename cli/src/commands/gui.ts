import { spawn } from "node:child_process";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { GuiApp } from "../gui/app.js";
import { startGuiServer } from "../gui/server.js";
import { embedded } from "../lib/embedded.js";
import { openWithDefaultApp } from "../lib/open.js";
import { canPrompt } from "../lib/prompt.js";

export interface GuiOptions {
  pdf?: string;
  schema?: string;
  /** Open in the default browser instead of the app window. */
  browser?: boolean;
}

/** How long the browser version waits for a reloaded page to come back before quitting. */
const BROWSER_GRACE_MS = 20_000;

export const LINUX_WEBVIEW_HINT =
  "The app window needs GTK 4 and WebKitGTK 6 (Debian/Ubuntu: sudo apt install libwebkitgtk-6.0-4, Fedora: sudo dnf install webkitgtk6.0, Arch: sudo pacman -S webkitgtk-6.0).";

/**
 * Starts the window process. Resolves "closed" when the user closes the window and "failed"
 * (with its error output) when it exits before the page ever loaded, e.g. missing WebKitGTK.
 */
function runWindow(command: string[], app: GuiApp, kill: { current?: () => void }): Promise<{ result: "closed" } | { result: "failed"; error: string }> {
  return new Promise((res) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env } });
    let errors = "";
    child.stderr.on("data", (d: Buffer) => {
      errors = (errors + d.toString("utf-8")).slice(-4000);
    });
    kill.current = () => child.kill();
    child.on("error", (err) => res({ result: "failed", error: err.message }));
    child.on("exit", (code) => {
      kill.current = undefined;
      if (code !== 0 && !app.everConnected) res({ result: "failed", error: errors.trim() || `exit code ${code}` });
      else res({ result: "closed" });
    });
  });
}

async function offerToSave(app: GuiApp): Promise<void> {
  const markups = app.session?.markups;
  const n = markups?.pending.length ?? 0;
  if (!markups || n === 0) return;
  const what = `${n} pending markup${n === 1 ? "" : "s"}`;
  if (!canPrompt()) {
    console.error(`${what} not saved.`);
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Save ${what} to ${basename(markups.outPath())}? [y/N] `);
    if (/^y(es)?$/i.test(answer.trim())) console.error(await markups.save());
  } catch (err) {
    console.error((err as Error).message);
  } finally {
    rl.close();
  }
}

/** `aecdo gui [file]`: the app window, with the PDF beside the data. */
export async function gui(file: string | undefined, opts: GuiOptions = {}): Promise<void> {
  const app = new GuiApp({ cwd: process.cwd(), pdf: opts.pdf, schema: opts.schema });
  const browser = opts.browser || !embedded.windowCommand;
  let idle: NodeJS.Timeout | undefined;
  const server = await startGuiServer(app, {
    onDisconnect: () => {
      if (!browser) return;
      clearTimeout(idle);
      idle = setTimeout(() => {
        if (app.clientCount === 0) app.quit("browser closed");
      }, BROWSER_GRACE_MS);
    },
  });

  // Open the set while the window starts; the page waits for it.
  const opening = file ? app.open(file).then(() => undefined) : Promise.resolve();
  const kill: { current?: () => void } = {};

  const openInBrowser = () => {
    openWithDefaultApp(server.url);
    console.error(`aecdo is open in your browser: ${server.url}`);
    console.error("Close the tab or press Ctrl+C to quit.");
  };

  try {
    await opening;
  } catch (err) {
    await server.close();
    throw err;
  }

  if (browser) {
    if (!opts.browser) console.error("The app window comes with the standalone aecdo binary, so this opens in your browser instead.");
    openInBrowser();
  } else {
    void runWindow(embedded.windowCommand!(server.url), app, kill).then((r) => {
      if (r.result === "closed") return app.quit("window closed");
      const lines = r.error.split("\n").map((l) => l.trim()).filter(Boolean);
      console.error(`Couldn't open the app window: ${lines.find((l) => /error/i.test(l)) ?? lines.at(-1) ?? "it closed right away"}`);
      if (process.platform === "linux") console.error(LINUX_WEBVIEW_HINT);
      if (process.platform === "win32") console.error("The app window needs the Microsoft Edge WebView2 runtime: https://go.microsoft.com/fwlink/p/?LinkId=2124703");
      openInBrowser();
    });
  }

  const onSignal = () => app.quit("interrupted");
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  await app.quitting;
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  clearTimeout(idle);
  kill.current?.();
  await server.close();
  await offerToSave(app);
}
