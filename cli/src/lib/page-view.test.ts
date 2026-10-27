import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument, degrees } from "pdf-lib";
import {
  bboxToUserSpace,
  displaySize,
  rasterDpi,
  renderPageView,
  sourcePdfCandidates,
  sourcePdfCandidatesWithReasons,
  unionBBox,
} from "./page-view.js";
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

test("caps the raster size for large sheets", () => {
  assert.equal(rasterDpi(792), 200);
  assert.equal(rasterDpi(36 * 72), 111);
});

test("looks for the PDF next to the JSON-LD, then by the set's filename", () => {
  const data = { filename: "uploads/Plans Set.pdf" } as DrawingSet;
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, undefined, "/cwd"), [
    "/a/plans.pdf",
    "/a/plans.PDF",
    "/a/Plans Set.pdf",
    "/cwd/Plans Set.pdf",
  ]);
  assert.deepEqual(sourcePdfCandidates("job:123", data, undefined, "/cwd"), ["/cwd/Plans Set.pdf"]);
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, "x.pdf", "/cwd"), ["/cwd/x.pdf", "/a/x.pdf"]);
  assert.deepEqual(sourcePdfCandidates("/a/plans.jsonld", data, "/b/x.pdf", "/cwd"), ["/b/x.pdf"]);
});

test("says why each PDF path was tried", () => {
  const data = { filename: "Plans Set.pdf" } as DrawingSet;
  const tried = sourcePdfCandidatesWithReasons("/a/plans.jsonld", data, undefined, "/cwd");
  assert.equal(tried[0].reason, "same name as plans.jsonld");
  assert.match(tried.find((c) => c.path === "/a/Plans Set.pdf")!.reason, /set's "filename", next to the \.jsonld/);
  assert.match(tried.find((c) => c.path === "/cwd/Plans Set.pdf")!.reason, /in the current folder/);
});

for (const extract of [true, false]) {
  test(`renders one page with a red box drawn on it (${extract ? "pdfseparate/mutool when installed" : "pdf-lib only"})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "aecdo-view-test-"));
    try {
      const src = await PDFDocument.create();
      src.addPage([792, 612]);
      src.addPage([612, 792]).setRotation(degrees(90));
      const input = join(dir, "set.pdf");
      await writeFile(input, await src.save());

      const result = await renderPageView({ pdfPath: input, pageIndex: 1, bbox: [72, 108, 720, 540], name: "A 201", outDir: dir, extract });
      if (!extract) assert.equal(result.pageCount, 2);
      assert.equal(result.outsidePage, undefined);
      assert.match(result.pdfPath, /A_201-72_108_720_540\.pdf$/);

      const out = await PDFDocument.load(await readFile(result.pdfPath));
      assert.equal(out.getPageCount(), 1);
      assert.equal(out.getPage(0).getRotation().angle, 90);

      const far = await renderPageView({ pdfPath: input, pageIndex: 0, bbox: [0, 0, 2000, 100], name: "x", outDir: dir, extract });
      assert.deepEqual(far.outsidePage, { width: 792, height: 612 });

      await assert.rejects(renderPageView({ pdfPath: input, pageIndex: 5, name: "x", outDir: dir, extract }), /out of range/);

      const marked = await renderPageView({
        pdfPath: input,
        pageIndex: 1,
        name: "marked",
        outDir: dir,
        extract,
        markups: [{ id: "aecdo-x", kind: "cloud", pageIndex: 1, sheetNumber: "A201", bbox: [72, 108, 720, 540], text: "check" }],
      });
      const markedDoc = await PDFDocument.load(await readFile(marked.pdfPath));
      assert.equal(markedDoc.getPage(0).node.Annots()?.size(), 1);

      src.addPage([200, 200]);
      await writeFile(input, await src.save());
      const changed = await renderPageView({ pdfPath: input, pageIndex: 2, name: "new", outDir: dir, extract });
      if (!extract) assert.equal(changed.pageCount, 3);
      assert.equal((await PDFDocument.load(await readFile(changed.pdfPath))).getPage(0).getWidth(), 200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
