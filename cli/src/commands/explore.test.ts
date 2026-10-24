import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Explorer, sheetEntries } from "./explore.js";
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
