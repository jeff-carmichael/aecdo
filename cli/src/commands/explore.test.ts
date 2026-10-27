import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Explorer, PageViewer, groupSheets, parseViewCommand, sheetEntries, sheetPrefix } from "./explore.js";
import type { PageViewRequest } from "../lib/page-view.js";
import { ANSI, withPalette } from "../lib/style.js";
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

test("r1 follows a drawing's reference and back returns", () => {
  const { ex, lines } = make();
  ex.handle("A101");
  ex.handle("1");
  assert.match(lines.join("\n"), /→ \[r1\] Building Section A \(A201, page \d+\)/);
  ex.handle("r1");
  assert.equal(kindOf(ex), "drawing");
  assert.match(ex.prompt(), /^A201 › Building Section A> $/);
  ex.handle("back");
  assert.match(ex.prompt(), /^A101 › Ground Floor Plan> $/);
});

test("r follows an item's only reference, and view targets the jump", () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("1");
  ex.handle("3");
  ex.handle("1");
  ex.handle("r");
  assert.match(ex.prompt(), /^A201 › Building Section A> $/);
  const target = ex.viewTarget();
  assert.ok(!("error" in target));
  assert.equal(target.sheet.sheetNumber, "A201");
  ex.handle("back");
  assert.equal(kindOf(ex), "layer");
});

test("reference commands report when there is nothing to follow", () => {
  const { ex, lines } = make();
  ex.handle("A101");
  ex.handle("r1");
  assert.equal(kindOf(ex), "sheet");
  assert.match(lines.at(-1)!, /^No references here/);
  ex.handle("1");
  ex.handle("r7");
  assert.match(lines.at(-1)!, /^No reference "r7"\. Pick r1–r1/);
  assert.equal(kindOf(ex), "drawing");
});

test("a reference to an id outside the file says so", () => {
  const copy = structuredClone(data);
  copy.sheets[0].drawings![0].references = ["urn:uuid:00000000-0000-0000-0000-000000000000"];
  const lines: string[] = [];
  const ex = new Explorer(copy, (l = "") => lines.push(l));
  ex.handle(copy.sheets[0].sheetNumber);
  ex.handle("1");
  ex.handle("r1");
  assert.equal(kindOf(ex), "drawing");
  assert.match(lines.at(-1)!, /isn't in this file/);
});

test("jumping to a schedule opens it on its sheet", () => {
  const demo = JSON.parse(
    readFileSync(new URL("../../../examples/maple-grove-library.jsonld", import.meta.url), "utf-8")
  ) as DrawingSet;
  const sheet = demo.sheets.find((s) => s.sheetNumber === "A101")!;
  const drawing = sheet.drawings![0];
  const layerIndex = drawing.layers.findIndex((l) => l.name === "Door Tags");
  const lines: string[] = [];
  const ex = new Explorer(demo, (l = "") => lines.push(l));
  ex.handle("A101");
  ex.handle("1");
  ex.handle(String(layerIndex + 1));
  ex.handle("1");
  const original = console.log;
  console.log = () => {};
  try {
    ex.handle("r1");
  } finally {
    console.log = original;
  }
  assert.match(lines.join("\n"), /Jumped to Table Door Schedule \(A601, page \d+\)/);
  assert.equal(ex.prompt(), "A601> ");
  const target = ex.viewTarget();
  assert.ok(!("error" in target));
  assert.equal(target.label, "table Door Schedule");
});

function bigSet(): DrawingSet {
  const numbers = [
    "G001", "G002", "C101", "C102",
    ...Array.from({ length: 12 }, (_, i) => `A${101 + i}`),
    "AD101", "S001", "S101", "S102", "M101", "M601", "P101", "E101", "E601", "FP101", "001",
  ];
  return {
    ...data,
    sheets: numbers.map((sheetNumber, pageIndex) => ({
      "@id": `urn:uuid:00000000-0000-4000-8000-${String(pageIndex).padStart(12, "0")}`,
      "@type": "Sheet",
      sheetNumber,
      title: `Sheet ${sheetNumber}`,
      pageIndex,
    })),
  };
}

test("sheetPrefix takes the leading letters", () => {
  assert.equal(sheetPrefix("A101"), "A");
  assert.equal(sheetPrefix("fp-101"), "FP");
  assert.equal(sheetPrefix("001"), "");
});

test("groupSheets keeps first-seen order and names disciplines", () => {
  const groups = groupSheets(bigSet().sheets);
  assert.deepEqual(groups.map((g) => g.prefix), ["G", "C", "A", "AD", "S", "M", "P", "E", "FP", ""]);
  assert.equal(groups[2].name, "Architectural");
  assert.equal(groups[2].sheets.length, 12);
  assert.equal(groups[3].name, "Architectural");
  assert.equal(groups[8].name, "Fire Protection");
  assert.equal(groups[9].name, "Other");
});

test("25 sheets or fewer stay a flat list", () => {
  const { ex, lines } = make();
  ex.render();
  assert.doesNotMatch(lines.join("\n"), /Sheet groups/);
});

test("more than 25 sheets list groups; pick by number or prefix, back returns", () => {
  const lines: string[] = [];
  const ex = new Explorer(bigSet(), (l = "") => lines.push(l));
  ex.render();
  const out = lines.join("\n");
  assert.match(out, /Sheet groups \(27 sheets\):/);
  assert.match(out, / 3\. A - Architectural \(12 sheets\)/);
  assert.doesNotMatch(out, /A101 - /);

  ex.handle("3");
  assert.equal(kindOf(ex), "group");
  assert.equal(ex.prompt(), "A sheets> ");
  assert.match(lines.join("\n"), /A112 - Sheet A112/);
  assert.ok("error" in ex.viewTarget());

  ex.handle("A105");
  assert.equal(kindOf(ex), "sheet");
  ex.handle("back");
  assert.equal(kindOf(ex), "group");
  ex.handle("back");
  assert.equal(kindOf(ex), "sheets");

  ex.handle("e");
  assert.equal(ex.prompt(), "E sheets> ");
  ex.handle("top");
  ex.handle("Structural");
  assert.equal(ex.prompt(), "S sheets> ");
  ex.handle("top");
  ex.handle("other");
  assert.match(lines.at(-2)!, /001 - Sheet 001/);
});

test("a sheet number at the group list opens the sheet; bad picks stay put", () => {
  const lines: string[] = [];
  const ex = new Explorer(bigSet(), (l = "") => lines.push(l));
  ex.handle("M601");
  assert.equal(kindOf(ex), "sheet");
  ex.handle("top");
  ex.handle("99");
  assert.equal(kindOf(ex), "sheets");
  assert.match(lines.at(-1)!, /^No group "99"/);
});

test("colors labels, tags, and bbox values like the mockup, but keeps the assistant's view plain", () => {
  const { ex, lines } = make();
  const E = "\x1b[";
  withPalette(ANSI, () => {
    ex.handle("A101");
    ex.handle("1");
    ex.handle("1");
    const shown = lines.join("\n");
    assert.ok(shown.includes(`${E}1mSheet A101 — `));
    assert.ok(shown.includes(`${E}1;36mDrawing:${E}22;39m`));
    assert.ok(shown.includes(`${E}2m[72, 108, 720, 540]${E}22m`));
    assert.ok(shown.includes(`${E}2m→${E}22m ${E}1m[r1]`));
    assert.ok(shown.includes(`${E}35mLayer:${E}39m`));
    assert.ok(/\[33m\[(THING|TAG)\]/.test(shown));

    const listing = String(ex.context().listing);
    assert.ok(!listing.includes(E));
    assert.match(listing, /Layer: /);
  });
});

test("output is plain by default when stdout isn't a terminal", () => {
  const { ex, lines } = make();
  ex.handle("A101");
  assert.ok(!lines.join("\n").includes("\x1b["));
});
