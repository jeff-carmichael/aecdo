import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import {
  bboxToUserSpace,
  displaySize,
  sourcePdfCandidates,
  sourcePdfCandidatesWithReasons,
  unionBBox,
} from "./pdf-page.js";
import type { DrawingSet } from "../types.js";

const page = { x: 0, y: 0, width: 612, height: 792 };

test("maps a top-left bbox into PDF user space for each rotation", () => {
  const bbox: [number, number, number, number] = [10, 20, 110, 70];
  assert.deepEqual(bboxToUserSpace(bbox, page, 0), { x: 10, y: 722, width: 100, height: 50 });
  assert.deepEqual(bboxToUserSpace(bbox, page, 90), { x: 20, y: 10, width: 50, height: 100 });
  assert.deepEqual(bboxToUserSpace(bbox, page, 180), { x: 502, y: 20, width: 100, height: 50 });
  assert.deepEqual(bboxToUserSpace(bbox, page, 270), { x: 542, y: 682, width: 50, height: 100 });
  assert.deepEqual(bboxToUserSpace(bbox, page, -90), bboxToUserSpace(bbox, page, 270));
});

test("honors a crop box that doesn't start at the origin", () => {
  const crop = { x: 36, y: 18, width: 540, height: 756 };
  assert.deepEqual(bboxToUserSpace([0, 0, 10, 10], crop, 0), { x: 36, y: 764, width: 10, height: 10 });
});

test("display size swaps width and height on quarter turns", () => {
  assert.deepEqual(displaySize(page, 90), { width: 792, height: 612 });
  assert.deepEqual(displaySize(page, 180), { width: 612, height: 792 });
});

test("unions item boxes and ignores missing ones", () => {
  assert.equal(unionBBox([undefined]), undefined);
  assert.deepEqual(unionBBox([[1, 5, 3, 6], undefined, [0, 7, 2, 9]]), [0, 5, 3, 9]);
});

// Expected paths go through the same path functions as the code, so "/a/plans.pdf" is "\a\plans.pdf" on Windows.
test("looks for the PDF next to the JSON-LD, then by the set's filename", () => {
  const data = { filename: "uploads/Plans Set.pdf" } as DrawingSet;
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, undefined, "/cwd"), [
    join("/a", "plans.pdf"),
    join("/a", "plans.PDF"),
    join("/a", "Plans Set.pdf"),
    resolve("/cwd", "Plans Set.pdf"),
  ]);
  assert.deepEqual(sourcePdfCandidates("job:123", data, undefined, "/cwd"), [resolve("/cwd", "Plans Set.pdf")]);
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, "x.pdf", "/cwd"), [resolve("/cwd", "x.pdf"), join("/a", "x.pdf")]);
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, "/b/x.pdf", "/cwd"), [resolve("/b/x.pdf")]);
});

test("says why each PDF path was tried", () => {
  const data = { filename: "Plans Set.pdf" } as DrawingSet;
  const tried = sourcePdfCandidatesWithReasons("/a/plans.jsonld", data, undefined, "/cwd");
  assert.equal(tried[0].reason, "same name as plans.jsonld");
  assert.match(tried.find((c) => c.path === join("/a", "Plans Set.pdf"))!.reason, /set's "filename", next to the \.jsonld/);
  assert.match(tried.find((c) => c.path === resolve("/cwd", "Plans Set.pdf"))!.reason, /in the current folder/);
});
