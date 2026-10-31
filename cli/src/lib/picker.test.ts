import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterItems, handleKey, renderPicker, listPdfs, listJsonld } from "./picker.js";
import type { PickerState } from "./picker.js";
import { ASCII } from "./tui.js";

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
  const lines = renderPicker(many, { query: "", cursor: 20 }, "Pick", { maxVisible: 5, symbols: ASCII });
  assert.ok(lines.includes("> sheet-20.pdf"));
  assert.ok(lines.some((l) => l.includes("more above")));
  assert.ok(lines.some((l) => l.includes("more below")));
  assert.equal(lines.filter((l) => l.includes("sheet-")).length, 5);
});

test("renderPicker shows when the filter matches nothing", () => {
  assert.ok(renderPicker(items, { query: "zzz", cursor: 0 }, "Pick").includes("  (no matches)"));
});

test("renderPicker shows the match count while filtering", () => {
  const lines = renderPicker(items, { query: "plans", cursor: 0 }, "Pick");
  assert.equal(lines[1], "  Filter: plans (2 of 3)");
});

test("renderPicker aligns hints after the longest label", () => {
  const labels = ["Explore", "Process a PDF", "Quit"];
  const hints: Record<string, string> = { Explore: "browse sheets", "Process a PDF": "upload and wait" };
  const lines = renderPicker(labels, { query: "", cursor: 2 }, "Pick", { symbols: ASCII, hint: (l) => hints[l] });
  assert.equal(lines[2].indexOf("browse sheets"), lines[3].indexOf("upload and wait"));
  assert.equal(lines[4], "> Quit");
});

test("renderPicker cuts lines to the width", () => {
  const lines = renderPicker(["x".repeat(100)], start, "Pick", { width: 30, symbols: ASCII });
  assert.ok(lines.every((l) => l.length <= 30));
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

test("listJsonld returns only .jsonld files, sorted naturally", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aecdo-picker-"));
  try {
    for (const f of ["set10.jsonld", "set2.JSONLD", "plans.pdf", "package.json"]) await writeFile(join(dir, f), "");
    await mkdir(join(dir, "folder.jsonld"));
    assert.deepEqual(await listJsonld(dir), ["set2.JSONLD", "set10.jsonld"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
