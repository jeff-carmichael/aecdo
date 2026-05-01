import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir } from "./config.js";
import type { ApiConfig, TokenCache } from "../types.js";

function tokenCachePath(): string {
  return join(getConfigDir(), "token.json");
}

async function loadCachedToken(): Promise<TokenCache | null> {
  try {
    const raw = await readFile(tokenCachePath(), "utf-8");
    const cached: TokenCache = JSON.parse(raw);
    if (cached.accessToken && cached.expiresAt > Date.now()) {
      return cached;
    }
  } catch {
    // no cached token or invalid
  }
  return null;
}

async function saveCachedToken(token: TokenCache): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(tokenCachePath(), JSON.stringify(token), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

async function fetchToken(config: ApiConfig): Promise<TokenCache> {
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=drawingbot/api",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Authentication failed (${response.status}). Check your client ID and secret.\n${text}`
    );
  }

  const data = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000 - 60_000;

  return { accessToken: data.access_token, expiresAt };
}

export async function getToken(config: ApiConfig): Promise<string> {
  const cached = await loadCachedToken();
  if (cached) return cached.accessToken;

  const token = await fetchToken(config);
  await saveCachedToken(token);
  return token.accessToken;
}
