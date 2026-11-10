import { test } from "node:test";
import assert from "node:assert/strict";
import { completeLines, errorLines, JobProgress, statusLines } from "./progress.js";
import type { JobStatus, PageStatus } from "../types.js";

function job(pages: PageStatus[], overrides: Partial<JobStatus> = {}): JobStatus {
  return { jobId: "job-1", fileName: "plans.pdf", globalStatus: "Processing", totalPages: pages.length, pages, ...overrides };
}

const done = (page: string, sheetNumber: string, title: string): PageStatus => ({ page, status: "Done", sheetNumber, title });

test("statusLines gives the counts and a line per started page", () => {
  const lines = statusLines(job([done("1", "A101", "Floor Plan"), { page: "2", status: "Processing" }, { page: "3", status: "Error", error: "unreadable" }, { page: "4", status: "Pending" }]));
  assert.deepEqual(lines, [
    "Status: Processing, 1/4 pages done (1 failed)",
    "  A101    Floor Plan",
    "  Page 2  processing",
    "  Page 3  failed: unreadable",
  ]);
});

test("says it is finishing up once every page is done", () => {
  assert.match(statusLines(job([done("1", "A101", "Plan")], { agent: { status: "Processing" } }))[0], /Finishing up/);
});

test("completeLines and errorLines summarize the job", () => {
  const status = job([done("1", "A101", "Floor Plan"), done("2", "A2", "Roof")], { globalStatus: "Done" });
  assert.deepEqual(completeLines(status), ["Processed 2 pages", "  A101  Floor Plan", "  A2    Roof"]);
  const failed = job([{ page: "4", status: "Error", error: "bad scan" }], { globalStatus: "Error" });
  assert.deepEqual(errorLines(failed), ["Processing failed (Error)", "  Page 4  bad scan"]);
});

test("JobProgress prints one line per change", () => {
  const writes: string[] = [];
  const out = { write: (s: string) => writes.push(s) } as unknown as NodeJS.WritableStream;
  const view = new JobProgress(out);
  const pending = job([{ page: "1", status: "Processing" }]);
  view.update(pending);
  view.update(pending);
  view.update(job([done("1", "A101", "Plan")], { globalStatus: "Done" }));
  assert.deepEqual(writes, ["Status: Processing, 0/1 pages done\n", "Status: Done, 1/1 pages done\n"]);
});
