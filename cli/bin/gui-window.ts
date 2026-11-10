// The app window: `aecdo __gui-window <url>`, started by `aecdo gui`, which serves the page.
// It runs in its own process because webview's run() blocks the thread until the window closes.
import { Webview, SizeHint } from "webview-bun";

export function runWindow(url: string, title = "aecdo"): void {
  const w = new Webview(process.env.AECDO_GUI_DEBUG === "1", { width: 1440, height: 900, hint: SizeHint.NONE });
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
