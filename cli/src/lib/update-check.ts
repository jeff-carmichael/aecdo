import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { getConfigDir } from "./config.js";

export const RELEASES_URL = "https://api.github.com/repos/jeff-carmichael/aecdo/releases/latest";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const WORKER_ENV = "AECDO_UPDATE_CHECK_WORKER";
export const NO_UPDATE_CHECK_FLAG = "--no-update-check";
const FETCH_TIMEOUT_MS = 5000;

export interface UpdateCache {
  lastChecked: number;
  latestVersion?: string;
}

export function getCachePath(): string {
  return join(getConfigDir(), "update-check.json");
}

export function parseVersion(version: string): { core: number[]; prerelease: boolean } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined,
  };
}

// Only stable releases are offered, so a prerelease `latest` is never "newer".
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b || a.prerelease) return false;
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  }
  return b.prerelease;
}

export function isUpdateCheckDisabled(env: NodeJS.ProcessEnv, args: string[]): boolean {
  const truthy = (v: string | undefined) => v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
  return (
    args.includes(NO_UPDATE_CHECK_FLAG) ||
    truthy(env.NO_UPDATE_CHECK) ||
    truthy(env.AECDO_NO_UPDATE_CHECK) ||
    truthy(env.CI)
  );
}

export function isCacheStale(cache: UpdateCache | null, now: number): boolean {
  if (!cache) return true;
  const age = now - cache.lastChecked;
  return age < 0 || age >= CHECK_INTERVAL_MS;
}

export function readCache(path = getCachePath()): UpdateCache | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<UpdateCache>;
    if (typeof parsed.lastChecked !== "number") return null;
    return {
      lastChecked: parsed.lastChecked,
      latestVersion: typeof parsed.latestVersion === "string" ? parsed.latestVersion : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCache(cache: UpdateCache, path = getCachePath()): void {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(cache, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}

export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const res = await fetchImpl(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "aecdo-cli" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { tag_name?: unknown };
  if (typeof body.tag_name !== "string" || !parseVersion(body.tag_name)) return undefined;
  return body.tag_name.replace(/^v/, "");
}

// Runs inside the detached worker. Always stamps lastChecked, even on failure,
// so an offline machine does not retry on every command.
export async function runUpdateCheckWorker(
  path = getCachePath(),
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<void> {
  const previous = readCache(path);
  let latestVersion = previous?.latestVersion;
  try {
    latestVersion = (await fetchLatestVersion(fetchImpl)) ?? latestVersion;
  } catch {
    // network failure: keep the previous answer
  }
  try {
    writeCache({ lastChecked: now, latestVersion }, path);
  } catch {
    // unwritable config dir: nothing useful to do
  }
}

export function formatUpdateBanner(current: string, latest: string, standalone: boolean): string {
  const rule = "─".repeat(50);
  const how = standalone
    ? "Re-run the install script to upgrade:\n  curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh"
    : "Run 'npm install -g aecdo@latest' to upgrade.";
  return `\n${rule}\nUpdate available! v${current} → v${latest}\n${how}\nSet NO_UPDATE_CHECK=1 or pass ${NO_UPDATE_CHECK_FLAG} to hide this.\n${rule}\n`;
}

// A detached child does the network call so the current command never waits on
// it. The compiled Bun binary re-runs itself; under Node we re-run the script.
function spawnWorker(standalone: boolean): void {
  const args = standalone || !process.argv[1] ? [] : [process.argv[1]];
  try {
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, [WORKER_ENV]: "1" },
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // spawning is best-effort
  }
}

export interface UpdateNotifierOptions {
  currentVersion: string;
  standalone: boolean;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

// Reads only the local cache now; prints the banner on exit (to stderr, so piped
// stdout stays clean) and refreshes the cache in the background when stale.
export function startUpdateNotifier(opts: UpdateNotifierOptions): void {
  const env = opts.env ?? process.env;
  if (env[WORKER_ENV] || isUpdateCheckDisabled(env, opts.args)) return;

  const cache = readCache();
  if (isCacheStale(cache, Date.now())) spawnWorker(opts.standalone);

  const latest = cache?.latestVersion;
  if (!latest || !isNewerVersion(latest, opts.currentVersion)) return;
  if (!process.stderr.isTTY) return;

  process.on("exit", () => {
    process.stderr.write(formatUpdateBanner(opts.currentVersion, latest, opts.standalone));
  });
}
