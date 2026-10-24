import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterItems, handleKey, renderPicker, listPdfs } from "./picker.js";
import type { PickerState } from "./picker.js";

const items = ["a-plans.pdf", "b-civil.pdf", "c-plans-rev2.pdf"];
const start: PickerState = { query: "", cursor: 0 };

test("filterItems matches case-insensitive substrings", () => {
  assert.deepEqual(filterItems(items, "PLANS"), ["a-plans.pdf", "c-plans-rev2.pdf"]);
  assert.deepEqual(filterItems(items, ""), items);
});

test("handleKey moves the cursor with arrows and wraps around", () => {
  const up = handleKey(items, start, undefined, { name: "up" });
  assert.deepEqual(up, { kind: "update", state: { query: "", cursor: 2 } });
  const down = handleKey(items, { query: "", cursor: 2 }, undefined, { name: "down" });
  assert.deepEqual(down, { kind: "update", state: { query: "", cursor: 0 } });
});

test("handleKey selects the highlighted item from the filtered list", () => {
  let state = start;
  for (const ch of "rev") {
    const r = handleKey(items, state, ch, { name: ch });
    assert.equal(r.kind, "update");
    if (r.kind === "update") state = r.state;
  }
  assert.deepEqual(handleKey(items, state, "\r", { name: "return" }), { kind: "select", value: "c-plans-rev2.pdf" });
});

test("handleKey ignores Enter when nothing matches", () => {
  const state = { query: "zzz", cursor: 0 };
  assert.deepEqual(handleKey(items, state, "\r", { name: "return" }), { kind: "update", state });
});

test("handleKey removes filter characters with backspace", () => {
  const r = handleKey(items, { query: "ab", cursor: 1 }, undefined, { name: "backspace" });
  assert.deepEqual(r, { kind: "update", state: { query: "a", cursor: 0 } });
});

test("handleKey cancels on Escape and Ctrl+C", () => {
  assert.deepEqual(handleKey(items, start, undefined, { name: "escape" }), { kind: "cancel" });
  assert.deepEqual(handleKey(items, start, "\x03", { name: "c", ctrl: true }), { kind: "cancel" });
});

test("renderPicker marks the cursor and scrolls long lists", () => {
  const many = Array.from({ length: 30 }, (_, i) => `sheet-${i}.pdf`);
  const lines = renderPicker(many, { query: "", cursor: 20 }, "Pick", 5);
  assert.ok(lines.includes("> sheet-20.pdf"));
  assert.ok(lines.some((l) => l.includes("more above")));
  assert.ok(lines.some((l) => l.includes("more below")));
  assert.equal(lines.filter((l) => l.includes("sheet-")).length, 5);
});

test("renderPicker shows when the filter matches nothing", () => {
  assert.ok(renderPicker(items, { query: "zzz", cursor: 0 }, "Pick").includes("  (no matches)"));
});

test("listPdfs returns only PDF files, sorted naturally", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aecdo-picker-"));
  try {
    for (const f of ["sheet10.pdf", "sheet2.PDF", "notes.txt", "result.jsonld"]) await writeFile(join(dir, f), "");
    await mkdir(join(dir, "folder.pdf"));
    assert.deepEqual(await listPdfs(dir), ["sheet2.PDF", "sheet10.pdf"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
