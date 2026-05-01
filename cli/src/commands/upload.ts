import { resolve, basename } from "node:path";
import { stat } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { createUpload, uploadFile } from "../lib/api.js";
import type { ProcessOptions } from "../types.js";

export async function upload(filePath: string, opts: ProcessOptions): Promise<void> {
  const resolved = resolve(filePath);

  try {
    await stat(resolved);
  } catch {
    throw new Error(`Could not read file "${filePath}": No such file or directory`);
  }

  const config = await loadConfig();
  const token = await getToken(config);

  process.stderr.write(`Uploading ${basename(resolved)}...\n`);

  const { jobId, uploadUrl } = await createUpload(token, basename(resolved), config.baseUrl);
  await uploadFile(uploadUrl, resolved);

  process.stderr.write(`Upload complete. Job ID: ${jobId}\n`);

  if (opts.format === "json") {
    console.log(JSON.stringify({ jobId }));
  } else {
    console.log(jobId);
  }
}
