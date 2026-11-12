// Entry point for `bun build --compile`. Import order matters: assets must be
// registered before aecdo.ts evaluates and starts main().
import "./embed-assets.js";

// `aecdo gui` re-runs this binary to open its window; that process only needs webview.
if (process.argv[2] === "__gui-window") {
  const { runWindow } = await import("./gui-window.js");
  runWindow(process.argv[3], process.argv[4]);
  process.exit(0);
} else if (process.argv[2] === "__app") {
  const { launchApp } = await import("./app-launch.js");
  await launchApp();
  process.exit(0);
} else {
  await import("./aecdo.js");
}
