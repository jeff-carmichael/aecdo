import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobStatus } from "../lib/api.js";
import { JobProgress, statusLines } from "../lib/progress.js";
import { output } from "../lib/output.js";
import { waitForJob } from "./process.js";
import type { ProcessOptions } from "../types.js";

export async function status(jobId: string, opts: ProcessOptions): Promise<void> {
  const config = await loadConfig();
  const token = await getToken(config);

  if (opts.wait) {
    const progress = new JobProgress();
    const current = await waitForJob(config, token, jobId, { poll: opts.poll, onStatus: (s) => progress.update(s) });
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
    console.log(statusLines(current).join("\n"));
  }
}
