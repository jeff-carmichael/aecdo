import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable } from "./table.js";

test("parses cells and drops outer pipes and blank rows", () => {
  assert.deepEqual(parseTable("| a | b |\n\nc|d"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTable("a | | c"), [["a", "", "c"]]);
});
