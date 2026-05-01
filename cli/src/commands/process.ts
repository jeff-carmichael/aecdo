import { resolve, basename } from "node:path";
import { stat } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { createUpload, uploadFile, getJobStatus, getJobResult, downloadResult } from "../lib/api.js";
import { renderStatus, renderComplete, renderError } from "../lib/progress.js";
import { output } from "../lib/output.js";
import { validate } from "./validate.js";
import { summary } from "./summary.js";
import { explore } from "./explore.js";
import type { DrawingSet, ProcessOptions } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function processPdf(filePath: string, opts: ProcessOptions): Promise<void> {
  const resolved = resolve(filePath);

  try {
    await stat(resolved);
  } catch {
    throw new Error(`Could not read file "${filePath}": No such file or directory`);
  }

  const config = await loadConfig();
  const token = await getToken(config);
  const pollInterval = (opts.poll ?? 5) * 1000;

  process.stderr.write(`Uploading ${basename(resolved)}...\n`);

  const { jobId, uploadUrl } = await createUpload(token, basename(resolved), config.baseUrl);
  await uploadFile(uploadUrl, resolved);

  process.stderr.write(`Upload complete. Job ID: ${jobId}\n\n`);

  let current = await getJobStatus(token, jobId, config.baseUrl);
  renderStatus(current);

  while (current.globalStatus === "Pending" || current.globalStatus === "Processing") {
    await sleep(pollInterval);
    current = await getJobStatus(token, jobId, config.baseUrl);
    renderStatus(current);
  }

  if (current.globalStatus === "Error") {
    renderError(current);
    process.exit(1);
  }

  renderComplete(current);

  const result = await getJobResult(token, jobId, config.baseUrl);
  process.stderr.write("\nDownloading result...\n");
  const content = await downloadResult(result.downloadUrl);

  if (opts.output) {
    await output(content, opts);
  }

  if (opts.then) {
    const data: DrawingSet = JSON.parse(content);
    switch (opts.then) {
      case "validate":
        await validate(data, `job:${jobId}`, opts);
        break;
      case "summary":
        await summary(data, `job:${jobId}`, opts);
        break;
      case "explore":
        await explore(data, `job:${jobId}`, opts);
        break;
      default:
        throw new Error(`Unknown --then command: "${opts.then}". Use validate, summary, or explore.`);
    }
    return;
  }

  if (!opts.output) {
    console.log(content);
  }
}
