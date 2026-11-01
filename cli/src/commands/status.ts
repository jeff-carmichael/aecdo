import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobStatus } from "../lib/api.js";
import { ProgressView } from "../lib/progress.js";
import { output } from "../lib/output.js";
import type { ProcessOptions } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function status(jobId: string, opts: ProcessOptions): Promise<void> {
  const config = await loadConfig();
  const token = await getToken(config);
  const pollInterval = (opts.poll ?? 5) * 1000;

  const progress = new ProgressView();

  if (opts.wait) {
    let current = await getJobStatus(token, jobId, config.baseUrl);
    progress.update(current);

    while (current.globalStatus === "Pending" || current.globalStatus === "Processing") {
      await sleep(pollInterval);
      current = await getJobStatus(token, jobId, config.baseUrl);
      progress.update(current);
    }

    if (current.globalStatus === "Done") {
      progress.complete(current);
    } else {
      progress.fail(current);
      process.exit(1);
    }
    return;
  }

  const current = await getJobStatus(token, jobId, config.baseUrl);

  if (opts.format === "json") {
    await output(current, opts);
  } else {
    progress.snapshot(current);
  }
}
