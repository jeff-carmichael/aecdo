import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Explorer, useFullScreen } from "./explore.js";
import { ExploreApp, window, type AppActions } from "./explore-app.js";
import type { DrawingSet } from "../types.js";

const demo = JSON.parse(
  readFileSync(new URL("../../../examples/maple-grove-library.jsonld", import.meta.url), "utf-8")
) as DrawingSet;

function setup(width = 110, height = 30, overrides: Partial<AppActions> = {}) {
  let sink: (line: string) => void = () => undefined;
  const explorer = new Explorer(demo, (l = "") => sink(l));
  const frames: string[][] = [];
  const calls: string[] = [];
  const screen = {
    width,
    height,
    draw: (lines: string[]) => frames.push(lines),
    suspend: () => calls.push("suspend"),
    resume: () => calls.push("resume"),
  };
  const app = new ExploreApp(explorer, screen, {
    collect: (fn) => {
      const lines: string[] = [];
      const previous = sink;
      sink = (l) => lines.push(l);
      try {
        fn();
      } finally {
        sink = previous;
      }
      return lines;
    },
    view: () => Promise.resolve(["Opening sheet A101 (PDF page 4) of plans.pdf:"]),
    ask: () => {
      calls.push("ask");
      return Promise.resolve();
    },
    markups: () => Promise.resolve(),
    hasPendingMarkups: () => false,
    beforeQuit: () => Promise.resolve(),
    ...overrides,
  });
  const done = app.run();
  const key = (name?: string, str?: string) => app.handleKey(str, name ? { name } : {});
  const text = () => frames.at(-1)!.join("\n");
  return { app, explorer, key, text, frames, calls, done };
}

const tick = () => new Promise((res) => setImmediate(res));

test("opens on the sheet list with a preview of the highlighted sheet", () => {
  const { key, text, frames } = setup();
  assert.equal(frames[0].length, 30);
  for (let i = 0; i < 3; i++) key("down");
  const screen = text();
  assert.match(screen, /❯ A101 +First Floor Plan +│ Drawings/);
  assert.match(screen, /G001 +Cover Sheet +│ A101 {2}First Floor Plan/);
  assert.match(screen, /│ PDF page 4/);
  assert.match(screen, /↑↓ move · Enter open · \/ find/);
});

test("Enter drills in, ← goes back up, and the cursor is remembered", () => {
  const { key, text, explorer } = setup();
  for (let i = 0; i < 3; i++) key("down");
  key("return");
  assert.equal(explorer.prompt(), "A101> ");
  key("return");
  assert.equal(explorer.view.kind, "drawing");
  for (let i = 0; i < 3; i++) key("down");
  key("return");
  assert.match(text(), /Door Tags\n?.*│ 26 items on First Floor Plan, A101/);
  key("left");
  assert.match(text(), /❯ Door Tags/);
  key("escape");
  key("left");
  assert.equal(explorer.view.kind, "sheets");
  assert.match(text(), /❯ A101/);
});

test("following a related link jumps, says how to come back, and b returns", () => {
  const { key, text, explorer } = setup();
  for (const cmd of ["A101", "1", "4", "5"]) explorer.handle(cmd);
  key("down");
  key("up");
  key("return");
  assert.equal(explorer.prompt(), "A601 › Door Schedule> ");
  assert.match(text(), /Jumped to Table Door Schedule .* Press b to come back\./);
  assert.match(text(), /│ Mark/);
  key(undefined, "b");
  assert.equal(explorer.view.kind, "item");
});

test("/ finds a sheet by number or title", () => {
  const { key, text, explorer } = setup();
  key(undefined, "/");
  for (const ch of "roof") key(undefined, ch);
  assert.match(text(), /Find: roof.*2 matches/);
  key("down");
  key("return");
  assert.equal(explorer.prompt(), "S201> ");
});

test("long lists scroll to keep the cursor in view", () => {
  const { key, text, explorer } = setup(110, 16);
  for (const cmd of ["A101", "1", "4"]) explorer.handle(cmd);
  key("end");
  assert.match(text(), /❯ Door tag 123A/);
  assert.doesNotMatch(text(), /Door tag 101A/);
});

test("tables use the full width, with the sheet list stepping aside", () => {
  const { app, explorer, text } = setup();
  explorer.handle("A601");
  explorer.handle("3");
  app.redraw();
  assert.doesNotMatch(text(), /│ G001/);
  assert.match(text(), /│ Mark │ Room +│ Width │/);
});

test("narrow windows show one pane at a time", () => {
  const { key, text } = setup(60, 20);
  assert.doesNotMatch(text(), /│/);
  key("return");
  assert.match(text(), /^ G001 {2}Cover Sheet\n PDF page 1/m);
});

test("? shows the keys and any key closes them", () => {
  const { key, text } = setup();
  key(undefined, "?");
  assert.match(text(), /ask the AI about what's on screen/);
  key(undefined, "x");
  assert.doesNotMatch(text(), /ask the AI about what's on screen/);
});

test("asking the AI leaves full screen and comes back", async () => {
  const { key, calls } = setup();
  key(undefined, "a");
  await tick();
  assert.deepEqual(calls, ["suspend", "ask", "resume"]);
});

test("v shows what the viewer reported in the status line", async () => {
  const { key, text, explorer } = setup();
  explorer.handle("A101");
  key(undefined, "v");
  await tick();
  assert.match(text(), /Opening sheet A101 \(PDF page 4\) of plans\.pdf:/);
});

test("q offers to save pending markups before quitting", async () => {
  let asked = false;
  const { key, done, calls } = setup(110, 30, {
    hasPendingMarkups: () => true,
    beforeQuit: () => {
      asked = true;
      return Promise.resolve();
    },
  });
  key(undefined, "q");
  await done;
  assert.ok(asked);
  assert.deepEqual(calls, ["suspend"]);
});

test("window keeps the selection in view", () => {
  assert.equal(window(0, 5, 10), 0);
  assert.equal(window(50, 100, 10), 47);
  assert.equal(window(99, 100, 10), 90);
});

test("full screen only in a real, big enough terminal", () => {
  const tty = { isTTY: true, columns: 100, rows: 30 } as unknown as NodeJS.WriteStream;
  const stdinTTY = process.stdin.isTTY;
  process.stdin.isTTY = true;
  try {
    assert.equal(useFullScreen({}, {}, tty), true);
    assert.equal(useFullScreen({ classic: true }, {}, tty), false);
    assert.equal(useFullScreen({}, { AECDO_EXPLORE: "classic" }, tty), false);
    assert.equal(useFullScreen({}, {}, { ...tty, rows: 8 } as NodeJS.WriteStream), false);
    assert.equal(useFullScreen({}, {}, { isTTY: false } as unknown as NodeJS.WriteStream), false);
  } finally {
    process.stdin.isTTY = stdinTTY;
  }
});
