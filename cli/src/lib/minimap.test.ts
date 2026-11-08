import { test } from "node:test";
import assert from "node:assert/strict";
import { ASCII_MAP, mapSize, pageExtent, renderMinimap } from "./minimap.js";

test("pageExtent picks the smallest common sheet size that holds every box", () => {
  assert.deepEqual(pageExtent([[100, 100, 2520, 1650]]), [2592, 1728]);
  assert.deepEqual(pageExtent([[0, 0, 720, 680]]), [1224, 792]);
  assert.deepEqual(pageExtent([[0, 0, 500, 700]]), [612, 792]);
});

test("mapSize keeps the page's shape, growing with the space and shrinking to fit the height", () => {
  assert.deepEqual(mapSize([2592, 1728], 38, 40), [38, 14]);
  assert.deepEqual(mapSize([2592, 1728], 74, 40), [74, 26]);
  const [w, h] = mapSize([2592, 1728], 60, 8);
  assert.equal(h, 8);
  assert.ok(w < 60);
});

test("renderMinimap outlines boxes with no text, and the selected one in heavy lines", () => {
  const lines = renderMinimap(
    [
      { bbox: [0, 0, 400, 300], selected: true },
      { bbox: [500, 0, 790, 300] },
    ],
    30,
    10,
    { page: [800, 600] }
  );
  assert.equal(lines.length, 10);
  assert.ok(lines.every((l) => [...l].length === 30));
  const text = lines.join("\n");
  assert.match(text, /┏━+┓ +┌─+┐/);
  assert.doesNotMatch(text, /\w/);
});

test("renderMinimap has an ASCII set for terminals without box-drawing glyphs", () => {
  const lines = renderMinimap([{ bbox: [0, 0, 800, 600], selected: true }], 20, 8, { page: [800, 600], glyphs: ASCII_MAP });
  assert.match(lines[1], /^\|#=+#\|$/);
});

test("renderMinimap marks boxes too small to outline", () => {
  const lines = renderMinimap(
    [
      { bbox: [10, 10, 12, 12], selected: true },
      { bbox: [700, 500, 702, 502] },
    ],
    20,
    8,
    { page: [800, 600] }
  );
  const text = lines.join("\n");
  assert.match(text, /■/);
  assert.match(text, /▪/);
});
