import { test } from "node:test";
import assert from "node:assert/strict";
import { matchChoice } from "./prompt.js";

test("a choice is picked by number, exact text, or a unique part of its text", () => {
  const items = ["@claude (Claude)", "@chatgpt (ChatGPT)", "@gemini (Gemini)"];
  assert.deepEqual(matchChoice(items, "2"), ["@chatgpt (ChatGPT)"]);
  assert.deepEqual(matchChoice(items, "9"), []);
  assert.deepEqual(matchChoice(items, "@GEMINI (gemini)"), ["@gemini (Gemini)"]);
  assert.deepEqual(matchChoice(items, "gem"), ["@gemini (Gemini)"]);
  assert.deepEqual(matchChoice(items, "@c"), ["@claude (Claude)", "@chatgpt (ChatGPT)"]);
});
