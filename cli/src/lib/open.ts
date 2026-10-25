import { spawn } from "node:child_process";

/** Opens a URL or file with the OS default app. Best-effort: callers also print the target. */
export function openWithDefaultApp(target: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [target]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", target]]
        : ["xdg-open", [target]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // a missing opener is fine; the caller prints the target
  }
}
