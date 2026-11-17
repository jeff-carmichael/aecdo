import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatStore, replay, setDirName } from "./chat-history.js";

test("set folders are named after the path like Claude Code's, with long paths shortened", () => {
  assert.equal(setDirName("/Users/jo/Plans/house.jsonld"), "-Users-jo-Plans-house-jsonld");
  assert.equal(setDirName("C:\\Plans\\house.jsonld"), "C--Plans-house-jsonld");
  const long = setDirName(`/${"a".repeat(300)}.jsonld`);
  assert.equal(long.length, 200);
  assert.notEqual(long, setDirName(`/${"a".repeat(301)}.jsonld`));
});

test("a line cut short by a crash is skipped", () => {
  const raw = [
    JSON.stringify({ type: "chat", set: "/x.jsonld", sessionId: "a", timestamp: "2026-11-16T10:00:00.000Z" }),
    JSON.stringify({ type: "entry", role: "user", text: "hi", sessionId: "a", timestamp: "2026-11-16T10:00:01.000Z" }),
    '{"type":"entry","role":"assis',
  ].join("\n");
  const chat = replay("a", raw);
  assert.deepEqual(chat.entries, [{ role: "user", text: "hi" }]);
  assert.equal(chat.created, "2026-11-16T10:00:00.000Z");
  assert.equal(chat.updated, "2026-11-16T10:00:01.000Z");
});

test("the list is newest first and leaves out chats with no question", async () => {
  const store = new ChatStore(mkdtempSync(join(tmpdir(), "aecdo-chats-")), "/w/set.jsonld");
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const c = "33333333-3333-4333-8333-333333333333";
  await store.append(a, [{ type: "title", title: "older" }, { type: "entry", role: "user", text: "q" }]);
  await store.append(c, [{ type: "title", title: "nothing asked" }]);
  await new Promise((r) => setTimeout(r, 5));
  await store.append(b, [{ type: "title", title: "newer" }, { type: "entry", role: "user", text: "q" }]);
  appendFileSync(join(store.dir, "notes.jsonl"), "{}\n");
  assert.deepEqual((await store.list()).map((s) => s.title), ["newer", "older"]);
  assert.equal(await store.load("nope"), undefined);
});
