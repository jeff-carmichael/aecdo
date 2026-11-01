import { test } from "node:test";
import assert from "node:assert/strict";
import { completeLines, errorLines, ProgressView, statusLines } from "./progress.js";
import { ASCII } from "./tui.js";
import type { JobStatus, PageStatus } from "../types.js";

function job(pages: PageStatus[], overrides: Partial<JobStatus> = {}): JobStatus {
  return { jobId: "job-1", fileName: "plans.pdf", globalStatus: "Processing", totalPages: pages.length, pages, ...overrides };
}

const done = (page: string, sheetNumber: string, title: string): PageStatus => ({ page, status: "Done", sheetNumber, title });

test("statusLines shows a bar, counts, and a row per started page", () => {
  const lines = statusLines(
    job([done("1", "A101", "Floor Plan"), { page: "2", status: "Processing" }, { page: "3", status: "Error", error: "unreadable" }, { page: "4", status: "Pending" }]),
    { symbols: ASCII, elapsedMs: 65_000, frame: 0 }
  );
  assert.equal(lines[0], "- Processing  #####--------------- 1/4 pages - 1 failed - 1m 05s");
  assert.equal(lines[1], "  + A101    Floor Plan");
  assert.equal(lines[2], "  - Page 2  processing");
  assert.equal(lines[3], "  x Page 3  unreadable");
  assert.equal(lines.length, 4);
});

test("statusLines folds the earliest finished pages when there are too many rows", () => {
  const pages = Array.from({ length: 10 }, (_, i) => done(String(i + 1), `A${i + 1}`, "Sheet"));
  pages.push({ page: "11", status: "Processing" });
  const lines = statusLines(job(pages), { symbols: ASCII, maxRows: 4 });
  assert.equal(lines.length, 6);
  assert.equal(lines[1], "  + 7 earlier pages done");
  assert.ok(lines[5].includes("Page 11"));
});

test("statusLines says it is finishing up once every page is done", () => {
  const lines = statusLines(job([done("1", "A101", "Plan")], { agent: { status: "Processing" } }), { symbols: ASCII });
  assert.ok(lines[0].includes("Finishing up"));
  assert.ok(lines.at(-1)!.includes("assembling the drawing set"));
});

test("completeLines and errorLines summarize the job", () => {
  const status = job([done("1", "A101", "Floor Plan"), done("2", "A2", "Roof")], { globalStatus: "Done" });
  assert.deepEqual(completeLines(status, 3_000, undefined, ASCII), ["+ Processed 2 pages in 3s", "    A101  Floor Plan", "    A2    Roof"]);
  const failed = job([{ page: "4", status: "Error", error: "bad scan" }], { globalStatus: "Error" });
  assert.deepEqual(errorLines(failed, undefined, ASCII), ["x Processing failed (Error)", "    Page 4  bad scan"]);
});

test("ProgressView prints one line per change when not in a terminal", () => {
  const writes: string[] = [];
  const out = { isTTY: false, write: (s: string) => writes.push(s) } as unknown as NodeJS.WriteStream;
  const view = new ProgressView(out);
  const pending = job([{ page: "1", status: "Processing" }]);
  view.update(pending);
  view.update(pending);
  view.update(job([done("1", "A101", "Plan")], { globalStatus: "Done" }));
  assert.deepEqual(writes, ["Status: Processing — 0/1 pages complete\n", "Status: Done — 1/1 pages complete\n"]);
});
