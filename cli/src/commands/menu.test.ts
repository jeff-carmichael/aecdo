import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU, menuLines, argsFor } from "./menu.js";
import type { MenuDeps } from "./menu.js";

function deps(overrides: Partial<MenuDeps> = {}): MenuDeps & { logged: string[]; titles: string[] } {
  const logged: string[] = [];
  const titles: string[] = [];
  return {
    logged,
    titles,
    pickFile: (files, title) => {
      titles.push(title);
      return Promise.resolve(files[0] ?? null);
    },
    ask: () => Promise.resolve(""),
    listJsonld: () => Promise.resolve(["a.jsonld", "b.jsonld"]),
    log: (line) => logged.push(line),
    ...overrides,
  };
}

test("menuLines aligns hints after the longest label", () => {
  const lines = menuLines();
  assert.equal(lines.length, MENU.length);
  const col = lines[0].indexOf(MENU[0].hint);
  for (const [i, e] of MENU.entries()) {
    if (e.hint) assert.equal(lines[i].indexOf(e.hint), col);
    else assert.equal(lines[i], e.label);
  }
});

test("every menu action maps to args or quits", async () => {
  for (const e of MENU) {
    const args = await argsFor(e.action, deps({ ask: () => Promise.resolve("job-1") }));
    if (e.action === "quit") assert.equal(args, null);
    else assert.ok(args && args.length > 0, e.action);
  }
});

test("commands with their own pickers run bare", async () => {
  assert.deepEqual(await argsFor("explore", deps()), ["explore"]);
  assert.deepEqual(await argsFor("process", deps()), ["process"]);
  assert.deepEqual(await argsFor("configure-ai", deps()), ["configure", "ai"]);
  assert.deepEqual(await argsFor("help", deps()), ["--help"]);
});

test("validate and summary pick a .jsonld file first", async () => {
  const d = deps();
  assert.deepEqual(await argsFor("validate", d), ["validate", "a.jsonld"]);
  assert.deepEqual(d.titles, ["Select a drawing set to validate:"]);
  assert.equal(await argsFor("summary", deps({ pickFile: () => Promise.resolve(null) })), null);
});

test("validate with no .jsonld files explains and quits", async () => {
  const d = deps({ listJsonld: () => Promise.resolve([]) });
  assert.equal(await argsFor("validate", d), null);
  assert.match(d.logged[0], /Download example sets/);
});

test("status and download ask for a job ID", async () => {
  const d = deps({ ask: () => Promise.resolve("  job-42 \n") });
  assert.deepEqual(await argsFor("status", d), ["status", "job-42", "--wait"]);
  assert.deepEqual(await argsFor("download", d), ["download", "job-42"]);
  assert.equal(await argsFor("status", deps()), null);
});
