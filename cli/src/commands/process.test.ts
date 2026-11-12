import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { defaultResultPath, JobFailedError, processPdf } from "./process.js";

test("defaultResultPath swaps the PDF extension for .jsonld in the same folder", () => {
  assert.equal(defaultResultPath(join("/tmp", "jobs", "plans.pdf")), join("/tmp", "jobs", "plans.jsonld"));
  assert.equal(defaultResultPath(join("/tmp", "Plans.Set.PDF")), join("/tmp", "Plans.Set.jsonld"));
  assert.equal(defaultResultPath(join("/tmp", "plans")), join("/tmp", "plans.jsonld"));
});

test("processPdf rejects --output together with --stdout", async () => {
  await assert.rejects(processPdf("plans.pdf", { output: "x.jsonld", stdout: true }), /either --output or --stdout/);
});

test("JobFailedError says which pages failed", () => {
  const err = new JobFailedError({
    jobId: "j1",
    fileName: "plans.pdf",
    globalStatus: "Error",
    pages: [{ page: "2", status: "Error", error: "unreadable" }],
  });
  assert.deepEqual(err.lines, ["Processing failed (Error)", "  Page 2  unreadable"]);
  assert.match(err.message, /Page 2 {2}unreadable/);
});
