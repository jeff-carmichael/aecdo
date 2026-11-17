import { resolve, basename, dirname, extname, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobStatus, getJobResult, downloadResult } from "../lib/api.js";
import { fileSha256 } from "../lib/hash.js";
import { stampSourcePdf } from "../lib/source-pdf.js";
import { JobProgress, errorLines } from "../lib/progress.js";
import { uploadPdf, pdfSize } from "./upload.js";
import { validate } from "./validate.js";
import { summary } from "./summary.js";
import type { ApiConfig, DrawingSet, JobStatus, ProcessOptions } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function defaultResultPath(pdfPath: string): string {
  const ext = extname(pdfPath);
  return join(dirname(pdfPath), `${basename(pdfPath, ext)}.jsonld`);
}

export interface JobOptions {
  /** Seconds between status checks (default 5). */
  poll?: number;
  /** Called after the upload with the job's id. */
  onUpload?: (jobId: string) => void;
  /** Called with each status the API reports. */
  onStatus?: (status: JobStatus) => void;
  /** Waits between status checks; tests replace it. */
  sleep?: (ms: number) => Promise<void>;
}

/** A job the API reports as failed; `lines` say which pages failed and why. */
export class JobFailedError extends Error {
  readonly lines: string[];

  constructor(readonly status: JobStatus) {
    const lines = errorLines(status);
    super(lines.join("\n"));
    this.lines = lines;
  }
}

/** Checks a job's status until it's no longer pending or processing, and returns the last one. */
export async function waitForJob(config: ApiConfig, token: string, jobId: string, opts: JobOptions = {}): Promise<JobStatus> {
  const pollInterval = (opts.poll ?? 5) * 1000;
  const wait = opts.sleep ?? sleep;
  let current = await getJobStatus(token, jobId, config.baseUrl);
  opts.onStatus?.(current);
  while (current.globalStatus === "Pending" || current.globalStatus === "Processing") {
    await wait(pollInterval);
    current = await getJobStatus(token, jobId, config.baseUrl);
    opts.onStatus?.(current);
  }
  return current;
}

/** `--then validate|summary`: runs that command on a job's result. */
export async function runThen(content: string, jobId: string, opts: ProcessOptions): Promise<void> {
  const data = JSON.parse(content) as DrawingSet;
  switch (opts.then) {
    case "validate":
      await validate(data, `job:${jobId}`, opts);
      return;
    case "summary":
      return summary(data, opts);
    default:
      throw new Error(`Unknown --then command: "${opts.then}". Use validate or summary.`);
  }
}

/**
 * Uploads a PDF, waits for the job, and returns the JSON-LD it produced, with the PDF's hash added. Shared by
 * `aecdo process` and the app, so it prints nothing and never exits.
 */
export async function runJob(path: string, opts: JobOptions = {}): Promise<{ jobId: string; status: JobStatus; content: string }> {
  const config = await loadConfig();
  const token = await getToken(config);

  const { jobId } = await uploadPdf(token, path, config.baseUrl);
  opts.onUpload?.(jobId);

  const current = await waitForJob(config, token, jobId, opts);
  if (current.globalStatus === "Error") throw new JobFailedError(current);

  const result = await getJobResult(token, jobId, config.baseUrl);
  const content = stampSourcePdf(await downloadResult(result.downloadUrl), await fileSha256(path));
  return { jobId, status: current, content };
}

export async function processPdf(filePath: string, opts: ProcessOptions): Promise<void> {
  if (opts.stdout && opts.output) {
    throw new Error("Use either --output or --stdout, not both.");
  }

  const resolved = resolve(filePath);
  const size = await pdfSize(resolved, filePath);

  process.stderr.write(`Uploading ${basename(resolved)} (${formatBytes(size)})\n`);
  const progress = new JobProgress();
  let job: Awaited<ReturnType<typeof runJob>>;
  try {
    job = await runJob(resolved, {
      poll: opts.poll,
      onUpload: (jobId) => process.stderr.write(`Job ID: ${jobId}\n`),
      onStatus: (status) => progress.update(status),
    });
  } catch (err) {
    if (!(err instanceof JobFailedError)) throw err;
    progress.fail(err.status);
    process.exit(1);
  }
  const { jobId, status, content } = job;
  progress.complete(status);

  if (!opts.stdout) {
    const outPath = opts.output ?? defaultResultPath(resolved);
    await writeFile(outPath, content + "\n", "utf-8");
    process.stderr.write(`Saved to ${outPath}\n`);
  }

  if (opts.then) await runThen(content, jobId, opts);
  else if (opts.stdout) console.log(content);
}
