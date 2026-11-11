import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Explorer, PdfLocator, groupSheets, sheetEntries, sheetPrefix } from "./explore.js";
import type { DrawingSet } from "../types.js";

const data = JSON.parse(
  readFileSync(new URL("../../../test/fixtures/sample-drawing-set.jsonld", import.meta.url), "utf-8")
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
  assert.match(out, /\n {2}Drawings\n/);
  assert.match(out, /\n +1 {2}\S/);
  assert.doesNotMatch(out, /\n {2}Layers\n/);
});

test("drills sheet → drawing → layer → item and back up", () => {
  const { ex, lines } = make();
  ex.handle(sheetWithDrawing.sheetNumber);
  ex.handle("1");
  assert.equal(kindOf(ex), "drawing");
  assert.match(lines.join("\n"), /\n {2}Layers\n/);

  ex.handle("1");
  assert.equal(kindOf(ex), "layer");
  assert.match(ex.location(), new RegExp(`^${sheetWithDrawing.sheetNumber} › .+ › .+$`));

  ex.handle("back");
  assert.equal(kindOf(ex), "drawing");
  ex.handle("top");
  assert.equal(kindOf(ex), "sheets");
  assert.equal(ex.location(), "sheet list");
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

test("view outlines the current level, or the open item", () => {
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

  ex.handle("up");
  ex.handle("up");
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

test("r1 follows a drawing's reference and back returns", () => {
  const { ex, lines } = make();
  ex.handle("A101");
  ex.handle("1");
  assert.match(lines.join("\n"), /→ \[r1\] Building Section A \(A201, PDF page \d+\)/);
  ex.handle("r1");
  assert.equal(kindOf(ex), "drawing");
  assert.match(ex.location(), /^A201 › Building Section A$/);
  ex.handle("back");
  assert.match(ex.location(), /^A101 › Ground Floor Plan$/);
});

test("r follows an item's only reference, and view targets the jump", () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("1");
  ex.handle("3");
  ex.handle("1");
  ex.handle("r");
  assert.match(ex.location(), /^A201 › Building Section A$/);
  const target = ex.viewTarget();
  assert.ok(!("error" in target));
  assert.equal(target.sheet.sheetNumber, "A201");
  ex.handle("back");
  assert.equal(kindOf(ex), "item");
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
    readFileSync(new URL("../../../test/fixtures/maple-grove-library.jsonld", import.meta.url), "utf-8")
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
  ex.handle("r1");
  assert.match(lines.join("\n"), /Jumped to Table Door Schedule \(A601, PDF page \d+\)/);
  assert.equal(ex.location(), "A601 › Door Schedule");
  const target = ex.viewTarget();
  assert.ok(!("error" in target));
  assert.equal(target.label, "table Door Schedule");
});

function maple() {
  const demo = JSON.parse(
    readFileSync(new URL("../../../test/fixtures/maple-grove-library.jsonld", import.meta.url), "utf-8")
  ) as DrawingSet;
  const lines: string[] = [];
  const ex = new Explorer(demo, (l = "") => lines.push(l), { fileName: "maple-grove-library.jsonld" });
  const layers = demo.sheets.find((s) => s.sheetNumber === "A101")!.drawings![0].layers;
  const layerNumber = (name: string) => String(layers.findIndex((l) => l.name === name) + 1);
  return { demo, ex, lines, layerNumber };
}

test("back after a jump reopens the item, so its other references still work", () => {
  const { ex, layerNumber } = maple();
  ex.handle("A101");
  ex.handle("1");
  ex.handle(layerNumber("Door Tags"));
  ex.handle("5");
  assert.equal(kindOf(ex), "item");
  assert.equal(ex.location(), "A101 › First Floor Plan › Door Tags › Door tag 105A");

  ex.handle("r1");
  assert.equal(ex.location(), "A601 › Door Schedule");
  ex.handle("back");
  assert.equal(ex.location(), "A101 › First Floor Plan › Door Tags › Door tag 105A");
  ex.handle("r2");
  assert.match(ex.location(), /^A101 › First Floor Plan › Doors › .*105A$/);
  ex.handle("back");
  ex.handle("back");
  assert.equal(ex.location(), "A101 › First Floor Plan › Door Tags");
});

test("up walks the tree of where you jumped; back returns to where the jump started", () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("1");
  ex.handle("r1");
  assert.match(ex.location(), /^A201 › Building Section A$/);
  ex.handle("up");
  assert.equal(ex.location(), "A201");
  ex.handle("..");
  assert.equal(kindOf(ex), "sheets");
  ex.handle("back");
  assert.match(ex.location(), /^A101 › Ground Floor Plan$/);
  ex.handle("back");
  assert.equal(ex.location(), "A101");
});

test("without jumps, up and back both go up one level", () => {
  const { ex } = make();
  ex.handle("A101");
  ex.handle("1");
  ex.handle("1");
  ex.handle("1");
  assert.equal(kindOf(ex), "item");
  ex.handle("back");
  assert.equal(kindOf(ex), "layer");
  ex.handle("up");
  assert.equal(kindOf(ex), "drawing");
  ex.handle("b");
  assert.equal(kindOf(ex), "sheet");
  ex.handle("..");
  assert.equal(kindOf(ex), "sheets");
});

test("another number at an open item or table swaps it, so back still goes up", () => {
  const { ex, layerNumber } = maple();
  ex.handle("A101");
  ex.handle("1");
  ex.handle(layerNumber("Door Tags"));
  ex.handle("5");
  ex.handle("6");
  assert.equal(ex.location(), "A101 › First Floor Plan › Door Tags › Door tag 106A");
  ex.handle("back");
  assert.equal(ex.location(), "A101 › First Floor Plan › Door Tags");

  const { ex: demoEx } = maple();
  demoEx.handle("A601");
  demoEx.handle("3");
  assert.equal(demoEx.location(), "A601 › Door Schedule");
  demoEx.handle("back");
  assert.equal(demoEx.location(), "A601");
  demoEx.handle("4");
  assert.equal(demoEx.location(), "A601 › Hardware Sets");
  demoEx.handle("3");
  assert.equal(demoEx.location(), "A601 › Door Schedule");
  demoEx.handle("back");
  assert.equal(demoEx.location(), "A601");
});

test("the assistant's context lists recent places and the reference that led here", () => {
  const { ex, layerNumber } = maple();
  ex.handle("A101");
  ex.handle("1");
  ex.handle(layerNumber("Door Tags"));
  ex.handle("5");
  const before = ex.context();
  assert.equal(before.arrivedVia, undefined);
  assert.equal(before.backGoesTo, "A101 › First Floor Plan › Door Tags");
  assert.equal((before.item as { "@type": string })["@type"], "Item");

  ex.navigate("r1");
  const ctx = ex.context();
  assert.equal(ctx.view, "table");
  assert.equal(ctx.location, "A601 › Door Schedule");
  assert.equal(ctx.arrivedVia, "followed reference r1 from A101 › First Floor Plan › Door Tags › Door tag 105A");
  assert.equal(ctx.backGoesTo, "A101 › First Floor Plan › Door Tags › Door tag 105A");
  const recent = ctx.recentlyVisited as string[];
  assert.equal(recent.at(-1), "A101 › First Floor Plan › Door Tags › Door tag 105A");
  assert.ok(recent.includes("A101"));
  assert.ok(recent.length <= 6);

  ex.handle("back");
  const after = ex.context();
  assert.equal(after.arrivedVia, undefined);
  assert.match((after.recentlyVisited as string[]).at(-1)!, /^A601 › Door Schedule \(followed reference r1 from A101/);
});

test("the sheet list is titled with the set's PDF name, numbered from 1, with disciplines spaced apart", () => {
  const { ex, lines } = maple();
  ex.render();
  const out = lines.join("\n");
  assert.match(out, /Maple Grove Branch Library 100CD\n {2}19 sheets/);
  assert.match(out, / 1 {2}G001 {2}Cover Sheet/);
  assert.match(out, /G002 .*\n\n +3 {2}C101/);
  assert.doesNotMatch(out, /\(page \d+\)/);
});

test("a number at the sheet list opens that row, and a sheet number still wins", () => {
  const { ex } = maple();
  ex.handle("1");
  assert.equal(ex.location(), "G001");
  ex.handle("top");
  ex.handle("4");
  assert.equal(ex.location(), "A101");

  const numbered = { ...data, sheets: [{ ...data.sheets[0], sheetNumber: "2" }, { ...data.sheets[0], sheetNumber: "X1" }] };
  const other = new Explorer(numbered, () => undefined);
  other.handle("2");
  assert.equal(other.location(), "2");
});

test("each hint shows once, and the assistant's view doesn't use it up", () => {
  const { ex, lines } = maple();
  ex.context();
  ex.render();
  ex.render();
  assert.equal(lines.filter((l) => l.includes("and press Enter to open it")).length, 1);
});

test("a missing PDF names the .jsonld, why each path was tried, and other PDFs nearby", () => {
  const { demo } = maple();
  const locator = new PdfLocator(demo, "/work/maple-grove-library.jsonld", undefined, {
    exists: () => false,
    listDir: () => ["maple-grove-library.jsonld", "sample-drawing-package-1and2family.jsonld", "sample-drawing-package-1and2family.pdf"],
  });
  assert.equal(locator.locatePdf().path, undefined);
  const text = locator.missingPdfLines().join("\n");
  assert.match(text, /Can't find the source PDF for maple-grove-library\.jsonld\. Looked for:/);
  assert.match(text, /[\\/]work[\\/]maple-grove-library\.pdf {2}\(same name as maple-grove-library\.jsonld\)/);
  assert.doesNotMatch(text, /\.PDF/);
  assert.match(text, /[\\/]work[\\/]Maple_Grove_Branch_Library_100CD\.pdf {2}\(the set's "filename", next to the \.jsonld\)/);
  assert.match(text, /PDFs in that folder: sample-drawing-package-1and2family\.pdf \(goes with sample-drawing-package-1and2family\.jsonld\)\./);
  assert.match(text, /Check that you opened the \.jsonld you meant to\./);

  const found = new PdfLocator(data, "/plans/set.jsonld", undefined, { exists: (p) => p === join("/plans", "set.pdf") });
  assert.equal(found.locatePdf().path, join("/plans", "set.pdf"));
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
  assert.match(out, /27 sheets in 10 groups/);
  assert.match(out, /\b3 +A +Architectural +12 sheets/);
  assert.doesNotMatch(out, /A101 +Sheet A101/);

  ex.handle("3");
  assert.equal(kindOf(ex), "group");
  assert.match(ex.location(), /^A - .+ sheets$/);
  assert.match(lines.join("\n"), /A112 +Sheet A112/);
  assert.ok("error" in ex.viewTarget());

  ex.handle("A105");
  assert.equal(kindOf(ex), "sheet");
  ex.handle("back");
  assert.equal(kindOf(ex), "group");
  ex.handle("back");
  assert.equal(kindOf(ex), "sheets");

  ex.handle("M601");
  assert.equal(kindOf(ex), "sheet");
  ex.handle("up");
  assert.match(ex.location(), /^M - .+ sheets$/);
  ex.handle("up");
  assert.equal(kindOf(ex), "sheets");

  ex.handle("e");
  assert.match(ex.location(), /^E - .+ sheets$/);
  ex.handle("top");
  ex.handle("Structural");
  assert.match(ex.location(), /^S - .+ sheets$/);
  ex.handle("top");
  ex.handle("other");
  assert.match(lines.at(-2)!, /001 +Sheet 001/);
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

test("link instructions name the real range and only appear when there are links", () => {
  const { ex, lines, demo } = maple();
  ex.handle("A101");
  ex.handle("1");
  const linked = lines.join("\n");
  const count = demo.sheets.find((s) => s.sheetNumber === "A101")!.drawings![0].references!.length;
  assert.match(linked, new RegExp(`Links to other drawings {2}type r1 to r${count} to open one`));
  assert.doesNotMatch(linked, /"r1" to follow/);

  ex.handle("up");
  const from = lines.length;
  ex.handle("2");
  const unlinked = lines.slice(from).join("\n");
  assert.doesNotMatch(unlinked, /r1/);

  ex.handle("up");
  ex.handle("1");
  ex.handle("4");
  ex.handle("5");
  assert.match(lines.join("\n"), /Related {2}type r1 to r2 to open one/);
});

test("items read like a form: plain field names, no ids unless details is on", () => {
  const { ex, lines } = maple();
  ex.handle("A101");
  ex.handle("1");
  ex.handle("4");
  ex.handle("5");
  let out = lines.join("\n");
  assert.match(out, /Door tag 105A\n {2}Tag on Door Tags, First Floor Plan, A101/);
  assert.match(out, /\n {2}Mark +105A/);
  assert.doesNotMatch(out, /urn:uuid/);

  ex.handle("details");
  out = lines.join("\n");
  assert.match(out, /id: +urn:uuid:/);
  assert.match(out, /data:\n {10}mark: 105A/);
});

