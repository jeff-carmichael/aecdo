import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
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
      `No configuration found. Run "aecdo configure" to set up your API credentials.`
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

  const parsed = JSON.parse(raw);
  const { clientId, clientSecret, region } = parsed;

  if (!clientId || !clientSecret) {
    throw new Error(
      `Invalid configuration in ${configPath}. Run "aecdo configure" to reconfigure.`
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
  region: ApiRegion
): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const configPath = join(dir, "config.json");
  const content = JSON.stringify({ clientId, clientSecret, region }, null, 2) + "\n";
  await writeFile(configPath, content, { encoding: "utf-8", mode: 0o600 });
}
