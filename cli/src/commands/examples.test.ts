import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLE_FILES, exampleUrl, examples, expandHome } from "./examples.js";

const tmp = () => mkdtempSync(join(tmpdir(), "aecdo-examples-test-"));

function fakeFetch(handler: (url: string) => Response, seen: string[] = []): typeof fetch {
  return (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    seen.push(url);
    return Promise.resolve(handler(url));
  };
}

test("examples downloads every file from the release tag", async () => {
  const dir = join(tmp(), "out");
  const seen: string[] = [];
  const lines: string[] = [];
  const result = await examples(dir, {
    version: "1.2.3",
    fetchImpl: fakeFetch((url) => new Response(`content of ${url}`), seen),
    log: (l) => lines.push(l),
  });
  assert.equal(result, dir);
  assert.deepEqual(readdirSync(dir).sort(), [...EXAMPLE_FILES].sort());
  for (const file of EXAMPLE_FILES) {
    assert.equal(readFileSync(join(dir, file), "utf-8"), `content of ${exampleUrl("v1.2.3", file)}`);
  }
  assert.ok(seen.every((u) => u.includes("/v1.2.3/examples/")));
  assert.ok(lines.some((l) => l.includes("aecdo explore maple-grove-library.jsonld")));
});

test("examples falls back to main when the tag doesn't exist", async () => {
  const dir = tmp();
  await examples(dir, {
    version: "9.9.9",
    fetchImpl: fakeFetch((url) => (url.includes("/main/") ? new Response("main") : new Response("", { status: 404 }))),
    log: () => {},
  });
  for (const file of EXAMPLE_FILES) assert.equal(readFileSync(join(dir, file), "utf-8"), "main");
});

test("examples keeps existing files unless forced", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "maple-grove-library.jsonld"), "mine");
  const opts = { version: "1.0.0", fetchImpl: fakeFetch(() => new Response("new")), log: () => {} };
  await examples(dir, opts);
  assert.equal(readFileSync(join(dir, "maple-grove-library.jsonld"), "utf-8"), "mine");
  await examples(dir, { ...opts, force: true });
  assert.equal(readFileSync(join(dir, "maple-grove-library.jsonld"), "utf-8"), "new");
});

test("examples reports a failed download and leaves no partial file", async () => {
  const dir = tmp();
  await assert.rejects(
    examples(dir, { version: "1.0.0", fetchImpl: fakeFetch(() => new Response("", { status: 500 })), log: () => {} }),
    /Could not download README\.md \(500\)/,
  );
  assert.deepEqual(readdirSync(dir), []);
});

test("expandHome expands a leading ~", () => {
  assert.equal(expandHome("~", "/home/u"), "/home/u");
  assert.equal(expandHome("~/ex", "/home/u"), join("/home/u", "ex"));
  assert.equal(expandHome("a/~/b", "/home/u"), "a/~/b");
});
