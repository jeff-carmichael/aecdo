import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Explorer, PageViewer, parseViewCommand, sheetEntries } from "./explore.js";
import type { PageViewRequest } from "../lib/page-view.js";
import type { DrawingSet } from "../types.js";

const data = JSON.parse(
  readFileSync(new URL("../../../examples/sample-drawing-set.jsonld", import.meta.url), "utf-8")
) as DrawingSet;

function kindOf(ex: Explorer): string {
  return ex.view.kind;
}

function make() {
  const lines: string[] = [];
  const ex = new Explorer(data, (l = "") => lines.push(l));
  return { ex, lines };
}

const sheetWithDrawing = data.sheets.find((s) => (s.drawings ?? []).some((d) => d.layers.length > 0))!;

test("opening a sheet lists its contents without dumping everything", () => {
  const { ex, lines } = make();
  ex.handle(sheetWithDrawing.sheetNumber);
  assert.equal(kindOf(ex), "sheet");
  const out = lines.join("\n");
  assert.match(out, /Drawings \(\d+\):/);
  assert.match(out, / 1\. /);
  assert.doesNotMatch(out, /Layer:/);
});

test("drills sheet → drawing → layer → item and back up", () => {
  const { ex, lines } = make();
  ex.handle(sheetWithDrawing.sheetNumber);
  ex.handle("1");
  assert.equal(kindOf(ex), "drawing");
  assert.match(lines.join("\n"), /Layers \(\d+\):/);

  ex.handle("1");
  assert.equal(kindOf(ex), "layer");
  assert.match(ex.prompt(), new RegExp(`^${sheetWithDrawing.sheetNumber} › .+ › .+> $`));

  ex.handle("back");
  assert.equal(kindOf(ex), "drawing");
  ex.handle("top");
  assert.equal(kindOf(ex), "sheets");
  assert.equal(ex.prompt(), "sheet> ");
});

test("out-of-range selection reports an error and stays put", () => {
  const { ex, lines } = make();
  ex.handle(sheetWithDrawing.sheetNumber);
  const count = sheetEntries(sheetWithDrawing).length;
  ex.handle(String(count + 1));
  assert.equal(kindOf(ex), "sheet");
  assert.match(lines.at(-1)!, /^No entry/);
});

test("back at the top level is a no-op and quit stops the loop", () => {
  const { ex } = make();
  assert.equal(ex.handle(".."), true);
  assert.equal(kindOf(ex), "sheets");
  assert.equal(ex.handle("quit"), false);
});

test("parses view commands with an optional PDF path", () => {
  assert.deepEqual(parseViewCommand("view"), {});
  assert.deepEqual(parseViewCommand("/VIEW"), {});
  assert.deepEqual(parseViewCommand('/view "my plans.pdf"'), { pdf: "my plans.pdf" });
  assert.equal(parseViewCommand("viewer"), null);
  assert.equal(parseViewCommand("1"), null);
});

test("view outlines the current level, or the last item shown", () => {
  const { ex } = make();
  assert.ok("error" in ex.viewTarget());

  ex.handle("A101");
  const page = ex.viewTarget();
  assert.ok(!("error" in page) && page.wholePage && !page.bbox);

  ex.handle("1");
  const drawing = ex.viewTarget();
  assert.ok(!("error" in drawing));
  assert.deepEqual(drawing.bbox, [72, 108, 720, 540]);

  ex.handle("1");
  const layer = ex.viewTarget();
  assert.ok(!("error" in layer));
  assert.deepEqual(layer.bbox, [85, 120, 700, 520]);

  ex.handle("1");
  const item = ex.viewTarget();
  assert.ok(!("error" in item));
  assert.match(item.label, /^item /);
  assert.deepEqual(item.bbox, [85, 120, 700, 130]);

  ex.handle("back");
  ex.handle("2");
  const unboxedLayer = ex.viewTarget();
  assert.ok(!("error" in unboxedLayer));
  assert.deepEqual(unboxedLayer.bbox, [200, 120, 236, 130]);
});

test("a table picked on a sheet stays selected until you move", () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("2");
  const t = ex.viewTarget();
  assert.ok(!("error" in t));
  assert.match(t.label, /^table /);
  ex.handle("1");
  ex.handle("back");
  const after = ex.viewTarget();
  assert.ok(!("error" in after) && after.wholePage);
});

test("PageViewer renders and opens the page, or explains a missing PDF", async () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("1");

  const out: string[] = [];
  const opened: string[] = [];
  const requests: PageViewRequest[] = [];
  const viewer = new PageViewer(data, "/plans/set.jsonld", undefined, {
    log: (l = "") => out.push(l),
    exists: (p) => p === "/plans/set.pdf",
    open: (p) => opened.push(p),
    render: (req) => {
      requests.push(req);
      return Promise.resolve({ path: "/tmp/A101.png", pdfPath: "/tmp/A101.pdf", pageCount: 2 });
    },
  });
  await viewer.show(ex);
  assert.equal(requests[0].pdfPath, "/plans/set.pdf");
  assert.equal(requests[0].pageIndex, 0);
  assert.deepEqual(requests[0].bbox, [72, 108, 720, 540]);
  assert.deepEqual(opened, ["/tmp/A101.png"]);

  const missing: string[] = [];
  const none = new PageViewer(data, "/plans/set.jsonld", undefined, {
    log: (l = "") => missing.push(l),
    exists: () => false,
    open: () => assert.fail("should not open"),
  });
  await none.show(ex);
  assert.match(missing.join("\n"), /Can't find the source PDF/);
  assert.match(missing.join("\n"), /\/plans\/set\.pdf/);
});
