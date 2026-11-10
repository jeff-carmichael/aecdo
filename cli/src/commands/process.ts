import { resolve, basename, dirname, extname, join } from "node:path";
import { stat, writeFile } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobStatus, getJobResult, downloadResult } from "../lib/api.js";
import { JobProgress } from "../lib/progress.js";
import { uploadPdf } from "./upload.js";
import { validate } from "./validate.js";
import { summary } from "./summary.js";
import type { DrawingSet, ProcessOptions } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function defaultResultPath(pdfPath: string): string {
  const ext = extname(pdfPath);
  return join(dirname(pdfPath), `${basename(pdfPath, ext)}.jsonld`);
}

export async function processPdf(filePath: string, opts: ProcessOptions): Promise<void> {
  if (opts.stdout && opts.output) {
    throw new Error("Use either --output or --stdout, not both.");
  }

  const resolved = resolve(filePath);

  let size: number;
  try {
    size = (await stat(resolved)).size;
  } catch {
    throw new Error(`Could not read file "${filePath}": No such file or directory`);
  }

  const config = await loadConfig();
  const token = await getToken(config);
  const pollInterval = (opts.poll ?? 5) * 1000;

  process.stderr.write(`Uploading ${basename(resolved)} (${formatBytes(size)})\n`);
  const { jobId } = await uploadPdf(token, resolved, config.baseUrl);
  process.stderr.write(`Job ID: ${jobId}\n`);

  const progress = new JobProgress();
  let current = await getJobStatus(token, jobId, config.baseUrl);
  progress.update(current);

  while (current.globalStatus === "Pending" || current.globalStatus === "Processing") {
    await sleep(pollInterval);
    current = await getJobStatus(token, jobId, config.baseUrl);
    progress.update(current);
  }

  if (current.globalStatus === "Error") {
    progress.fail(current);
    process.exit(1);
  }

  progress.complete(current);

  const result = await getJobResult(token, jobId, config.baseUrl);
  const content = await downloadResult(result.downloadUrl);

  if (!opts.stdout) {
    const outPath = opts.output ?? defaultResultPath(resolved);
    await writeFile(outPath, content + "\n", "utf-8");
    process.stderr.write(`Saved to ${outPath}\n`);
  }

  if (opts.then) {
    const data = JSON.parse(content) as DrawingSet;
    switch (opts.then) {
      case "validate":
        await validate(data, `job:${jobId}`, opts);
        break;
      case "summary":
        await summary(data, `job:${jobId}`, opts);
        break;
      default:
        throw new Error(`Unknown --then command: "${opts.then}". Use validate or summary.`);
    }
    return;
  }

  if (opts.stdout) {
    console.log(content);
  }
}
