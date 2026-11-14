// The app window: `aecdo __gui-window <url>`, started by `aecdo gui`, which serves the page.
// It runs in its own process because webview's run() blocks the thread until the window closes.
import { dlopen } from "bun:ffi";
import { Webview, SizeHint } from "webview-bun";

/**
 * Windows applies the show state its launcher asked for (hidden for a child started with
 * windowsHide, minimized for the Start menu shortcut) to a program's first window, so show it again.
 */
function showOnWindows(w: Webview): void {
  if (process.platform !== "win32") return;
  const user32 = dlopen("user32.dll", {
    ShowWindow: { args: ["ptr", "i32"], returns: "i32" },
    SetForegroundWindow: { args: ["ptr"], returns: "i32" },
  });
  const SW_RESTORE = 9;
  user32.symbols.ShowWindow(w.unsafeWindowHandle, SW_RESTORE);
  user32.symbols.SetForegroundWindow(w.unsafeWindowHandle);
}

export function runWindow(url: string, title = "aecdo"): void {
  const w = new Webview(process.env.AECDO_GUI_DEBUG === "1", { width: 1440, height: 900, hint: SizeHint.NONE });
  // webview-bun doesn't check this, and every later call on a null handle would crash the process.
  if (!w.unsafeHandle) throw new Error("The window couldn't start. On Windows it needs the Microsoft Edge WebView2 runtime.");
  showOnWindows(w);
  w.title = title;
  // The page names the set and place it shows, like a browser tab.
  w.bind("aecdoSetTitle", (t: string) => {
    w.title = t;
  });
  w.bind("aecdoClose", () => {
    w.terminate();
  });
  w.navigate(url);
  w.run();
}
