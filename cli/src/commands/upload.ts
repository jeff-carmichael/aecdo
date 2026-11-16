import { resolve, basename } from "node:path";
import { stat } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { createUpload, uploadFile } from "../lib/api.js";
import type { ProcessOptions, UploadResponse } from "../types.js";

export async function uploadPdf(token: string, path: string, baseUrl: string): Promise<UploadResponse> {
  const job = await createUpload(token, basename(path), baseUrl);
  await uploadFile(job.uploadUrl, path);
  return job;
}

/** The size of the PDF at `path`, or an error naming it as the user typed it (`shownAs`). */
export async function pdfSize(path: string, shownAs = path): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    throw new Error(`Could not read file "${shownAs}": No such file or directory`);
  }
}

export async function upload(filePath: string, opts: ProcessOptions): Promise<void> {
  const resolved = resolve(filePath);
  await pdfSize(resolved, filePath);

  const config = await loadConfig();
  const token = await getToken(config);

  const { jobId } = await uploadPdf(token, resolved, config.baseUrl);
  process.stderr.write(`Job ID: ${jobId}\n`);

  if (opts.format === "json") {
    console.log(JSON.stringify({ jobId }));
  } else {
    console.log(jobId);
  }
}
