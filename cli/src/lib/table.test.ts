import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTable, parseTable, wrapText } from "./table.js";

const MSB = [
  "Item | Value",
  "Service | 1200A, 480Y/277V, 3ph, 4W",
  "Fault rating | 65 kAIC",
  "Feeders | LP-1 (225A), LP-2 (225A), RP-1 via T1 (150A), RTU-1/2/3, ELEV (100A), FP (60A)",
].join("\n");

test("parses cells and drops outer pipes and blank rows", () => {
  assert.deepEqual(parseTable("| a | b |\n\nc|d"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTable("a | | c"), [["a", "", "c"]]);
});

test("pads columns so the dividers line up", () => {
  const lines = formatTable("Item | Value\nFault rating | 65 kAIC", 80);
  assert.deepEqual(lines, [
    "┌──────────────┬─────────┐",
    "│ Item         │ Value   │",
    "├──────────────┼─────────┤",
    "│ Fault rating │ 65 kAIC │",
    "└──────────────┴─────────┘",
  ]);
});

test("wraps long cells so no line runs past the width", () => {
  const lines = formatTable(MSB, 50);
  for (const line of lines) assert.ok(line.length <= 50, `too wide: ${line}`);
  const widths = new Set(lines.map((l) => l.length));
  assert.equal(widths.size, 1, "every line of the box has the same width");
  assert.ok(lines.some((l) => l.includes("LP-1 (225A)")));
  assert.ok(lines.some((l) => l.startsWith("│ Fault rating │")), "the short first column keeps its width");
});

test("fills in missing cells and handles a header-only table", () => {
  const lines = formatTable("a | b | c\n1", 80);
  assert.equal(new Set(lines.map((l) => l.length)).size, 1);
  assert.equal(formatTable("only", 80).length, 3);
  assert.deepEqual(formatTable("", 80), ["(empty table)"]);
});

test("wrapText breaks words longer than the width", () => {
  assert.deepEqual(wrapText("urn:uuid:abcdef", 6), ["urn:uu", "id:abc", "def"]);
  assert.deepEqual(wrapText("one two three", 7), ["one two", "three"]);
  assert.deepEqual(wrapText("", 5), [""]);
});
