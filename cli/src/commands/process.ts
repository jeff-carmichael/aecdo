import { resolve, basename, dirname, extname, join } from "node:path";
import { stat, writeFile } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobStatus, getJobResult, downloadResult } from "../lib/api.js";
import { ProgressView } from "../lib/progress.js";
import { paletteFor } from "../lib/style.js";
import { formatBytes, symbols, task } from "../lib/tui.js";
import { uploadPdf } from "./upload.js";
import { validate } from "./validate.js";
import { summary } from "./summary.js";
import { explore } from "./explore.js";
import type { DrawingSet, ProcessOptions } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
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
  const c = paletteFor(process.stderr);
  const sep = ` ${symbols().sep} `;
  const name = basename(resolved);

  const { jobId } = await uploadPdf(token, resolved, config.baseUrl);
  process.stderr.write(`  ${c.dim(`${formatBytes(size)}${sep}job ID ${jobId}`)}\n\n`);

  const progress = new ProgressView();
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
  process.stderr.write("\n");

  const content = await task("Downloading the result", async () => {
    const result = await getJobResult(token, jobId, config.baseUrl);
    return downloadResult(result.downloadUrl);
  }, { done: () => `Downloaded the result for ${name}` });

  if (!opts.stdout) {
    const outPath = opts.output ?? defaultResultPath(resolved);
    await writeFile(outPath, content + "\n", "utf-8");
    process.stderr.write(`${c.ok(symbols().ok)} Saved to ${c.bold(outPath)}\n`);
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
      case "explore":
        await explore(data, `job:${jobId}`, { ...opts, pdf: opts.pdf ?? resolved });
        break;
      default:
        throw new Error(`Unknown --then command: "${opts.then}". Use validate, summary, or explore.`);
    }
    return;
  }

  if (opts.stdout) {
    console.log(content);
  }
}
