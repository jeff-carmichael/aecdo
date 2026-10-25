import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightMention, colorEnabled } from "./mention-highlight.js";

const C = "<";
const R = ">";

test("highlights a leading mention of a known assistant", () => {
  assert.equal(highlightMention("@claude what is here?", C, R), "<@claude> what is here?");
  assert.equal(highlightMention("  @ChatGPT, hi", C, R), "  <@ChatGPT>, hi");
  assert.equal(highlightMention("@gpt", C, R), "<@gpt>");
});

test("leaves unknown, partial, and non-leading mentions alone", () => {
  assert.equal(highlightMention("@clau", C, R), "@clau");
  assert.equal(highlightMention("@claudette hi", C, R), "@claudette hi");
  assert.equal(highlightMention("@bard hi", C, R), "@bard hi");
  assert.equal(highlightMention("ask @claude", C, R), "ask @claude");
  assert.equal(highlightMention("A101", C, R), "A101");
});

test("color is off for non-TTY output, NO_COLOR, and dumb terminals", () => {
  const tty = { isTTY: true } as NodeJS.WriteStream;
  assert.equal(colorEnabled(tty, {}), true);
  assert.equal(colorEnabled(tty, { NO_COLOR: "1" }), false);
  assert.equal(colorEnabled(tty, { TERM: "dumb" }), false);
  assert.equal(colorEnabled({ isTTY: false } as NodeJS.WriteStream, {}), false);
});
