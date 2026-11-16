import { loadConfig } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { getJobResult, downloadResult, ApiError } from "../lib/api.js";
import { output } from "../lib/output.js";
import { runThen } from "./process.js";
import type { ProcessOptions } from "../types.js";

export async function download(jobId: string, opts: ProcessOptions): Promise<void> {
  const config = await loadConfig();
  const token = await getToken(config);

  let result;
  try {
    result = await getJobResult(token, jobId, config.baseUrl);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.statusCode === 409) {
        throw new Error(`Job is still processing. Use "aecdo status ${jobId} --wait" to wait for completion.`);
      }
      if (err.statusCode === 410) {
        throw new Error("Result expired (7-day retention). You will need to re-upload the file.");
      }
    }
    throw err;
  }

  process.stderr.write("Downloading result...\n");
  const content = await downloadResult(result.downloadUrl);

  if (opts.output) {
    await output(content, opts);
  }

  if (opts.then) await runThen(content, jobId, opts);
  else if (!opts.output) console.log(content);
}
