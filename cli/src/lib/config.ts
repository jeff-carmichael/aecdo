import { readFile, writeFile, mkdir, stat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ApiConfig, ApiRegion } from "../types.js";

const REGIONS: Record<ApiRegion, { baseUrl: string; tokenUrl: string }> = {
  "us-west-2": {
    baseUrl: "https://2055f9uxk6.execute-api.us-west-2.amazonaws.com/v1",
    tokenUrl: "https://drawingbot-api.auth.us-west-2.amazoncognito.com/oauth2/token",
  },
};

export const AVAILABLE_REGIONS = Object.keys(REGIONS) as ApiRegion[];
export const DEFAULT_REGION: ApiRegion = "us-west-2";

export function getConfigDir(): string {
  return join(homedir(), ".aecdo");
}

/** A JSON file in ~/.aecdo, or `fallback` when it isn't there yet. */
export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
}

/** Writes a JSON file only this user can read, since these hold keys and sign-ins. */
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
}

export function resolveEndpoints(region: ApiRegion): { baseUrl: string; tokenUrl: string } {
  const endpoints = REGIONS[region];
  if (!endpoints) {
    throw new Error(`Unknown region "${region}". Available: ${AVAILABLE_REGIONS.join(", ")}`);
  }
  return endpoints;
}

export async function loadConfig(): Promise<ApiConfig> {
  const configPath = join(getConfigDir(), "config.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    throw new Error(
      `No DrawingBot API credentials yet. Run "aecdo configure" to add them in the app's Settings.`
    );
  }

  try {
    const info = await stat(configPath);
    const mode = info.mode & 0o777;
    if (mode & 0o077) {
      process.stderr.write(
        `Warning: ${configPath} has open permissions (${mode.toString(8)}). ` +
        `Run 'chmod 600 ${configPath}' to fix.\n`
      );
    }
  } catch {
    // stat failed — permission check is best-effort
  }

  const parsed = JSON.parse(raw) as {
    clientId?: string;
    clientSecret?: string;
    region?: ApiRegion;
  };
  const { clientId, clientSecret, region } = parsed;

  if (!clientId || !clientSecret) {
    throw new Error(
      `Invalid configuration in ${configPath}. Run "aecdo configure" to enter them again.`
    );
  }

  const resolvedRegion: ApiRegion = region ?? DEFAULT_REGION;
  const endpoints = resolveEndpoints(resolvedRegion);

  return {
    clientId,
    clientSecret,
    region: resolvedRegion,
    ...endpoints,
  };
}

export async function saveConfig(
  clientId: string,
  clientSecret: string,
  region: ApiRegion,
  dir = getConfigDir()
): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const configPath = join(dir, "config.json");
  const content = JSON.stringify({ clientId, clientSecret, region }, null, 2) + "\n";
  await writeFile(configPath, content, { encoding: "utf-8", mode: 0o600 });
}

/**
 * Whether the app offers to process PDFs. Off until the DrawingBot API launches, so the app
 * shows it as coming soon; AECDO_PROCESSING=1 turns it on to try it.
 */
export function processingAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AECDO_PROCESSING === "1";
}
