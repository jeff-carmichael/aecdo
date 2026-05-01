import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getConfigDir,
  saveConfig,
  AVAILABLE_REGIONS,
  DEFAULT_REGION,
} from "../lib/config.js";
import type { ApiRegion } from "../types.js";

export async function configure(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>((res) => rl.question(q, res));

  let existing: { clientId?: string; clientSecret?: string; region?: string } | null = null;
  try {
    const raw = await readFile(join(getConfigDir(), "config.json"), "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // no existing config
  }

  if (existing?.clientId) {
    const masked = existing.clientId.slice(-4).padStart(existing.clientId.length, "*");
    console.log(`\nExisting configuration found:`);
    console.log(`  Client ID: ${masked}`);
    console.log(`  Region:    ${existing.region ?? DEFAULT_REGION}\n`);
  }

  const clientId = (await prompt("Client ID: ")).trim();
  if (!clientId) {
    console.error("Error: Client ID is required.");
    rl.close();
    process.exit(1);
  }

  const clientSecret = (await prompt("Client Secret: ")).trim();
  if (!clientSecret) {
    console.error("Error: Client Secret is required.");
    rl.close();
    process.exit(1);
  }

  console.log(`\nAvailable regions: ${AVAILABLE_REGIONS.join(", ")}`);
  const regionInput = (await prompt(`Region (${DEFAULT_REGION}): `)).trim() || DEFAULT_REGION;

  if (!AVAILABLE_REGIONS.includes(regionInput as ApiRegion)) {
    console.error(`Error: Unknown region "${regionInput}". Available: ${AVAILABLE_REGIONS.join(", ")}`);
    rl.close();
    process.exit(1);
  }

  const region = regionInput as ApiRegion;

  await saveConfig(clientId, clientSecret, region);
  console.log(`\nConfiguration saved to ${join(getConfigDir(), "config.json")}`);

  rl.close();
}
