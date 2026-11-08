import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Explorer, useFullScreen } from "./explore.js";
import { ExploreApp, quitFirst, window, type AppActions } from "./explore-app.js";
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
    ask: (text) => {
      calls.push(`ask ${text}`);
      return Promise.resolve();
    },
    stopAsking: () => calls.push("stop"),
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

test("following a related link jumps, and ← returns to where the link was", () => {
  const { key, text, explorer } = setup();
  for (const cmd of ["A101", "1", "4", "5"]) explorer.handle(cmd);
  const item = explorer.prompt();
  key("down");
  key("up");
  key("return");
  assert.equal(explorer.prompt(), "A601 › Door Schedule> ");
  assert.match(text(), /Jumped to Table Door Schedule .* Press ← to come back\./);
  assert.match(text(), /│ Mark/);
  key("left");
  assert.equal(explorer.prompt(), item);
  key("escape");
  assert.equal(explorer.prompt(), "A101 › First Floor Plan › Door Tags> ");
  key(undefined, "b");
  assert.equal(explorer.prompt(), "A101 › First Floor Plan> ");
});

test("u climbs the linked sheet, and ← still returns to where the link was", () => {
  const { key, explorer } = setup();
  for (const cmd of ["A101", "1", "4", "5"]) explorer.handle(cmd);
  const item = explorer.prompt();
  key("return");
  assert.equal(explorer.prompt(), "A601 › Door Schedule> ");
  key(undefined, "u");
  assert.equal(explorer.prompt(), "A601> ");
  key("left");
  assert.equal(explorer.prompt(), item);
});

test("/ from inside a sheet keeps your place: Esc stays put, and ← returns after opening", () => {
  const { key, text, explorer } = setup();
  for (const cmd of ["A101", "1"]) explorer.handle(cmd);
  key("down");
  key(undefined, "/");
  for (const ch of "a601") key(undefined, ch);
  assert.match(text(), /Find: a601.*1 match/);
  assert.match(text(), /❯ A601 +Door & Window Schedules/);
  key("escape");
  assert.equal(explorer.prompt(), "A101 › First Floor Plan> ");
  assert.match(text(), /❯ Walls/);
  key(undefined, "/");
  for (const ch of "a601") key(undefined, ch);
  key("return");
  assert.equal(explorer.prompt(), "A601> ");
  key("left");
  assert.equal(explorer.prompt(), "A101 › First Floor Plan> ");
  assert.match(text(), /❯ Walls/);
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

test("/ matches the start of a sheet number before title words", () => {
  const { key, text } = setup();
  key(undefined, "/");
  key(undefined, "a");
  assert.match(text(), /Find: a.*8 matches/);
  assert.doesNotMatch(text(), /G002/);
  key(undefined, "1");
  assert.match(text(), /Find: a1.*3 matches/);
});

test("/ matches the start of title words, not the middle", () => {
  const { key, text } = setup();
  key(undefined, "/");
  for (const ch of "lan") key(undefined, ch);
  assert.match(text(), /Find: lan.*0 matches/);
  for (let i = 0; i < 3; i++) key("backspace");
  for (const ch of "first fl") key(undefined, ch);
  assert.match(text(), /Find: first fl.*4 matches/);
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

test("the right column's bottom half draws the sheet's layout, highlighting what the cursor is on", () => {
  const { key, text } = setup(130, 34);
  for (let i = 0; i < 3; i++) key("down");
  const map = () => text().split("├")[1] ?? "";
  assert.match(map(), /╭─+╮/);
  assert.doesNotMatch(map(), /Layout of|D drawing|First Floor Plan/, "the map has no text");
  assert.doesNotMatch(map(), /┏/, "previewing a sheet highlights nothing");
  key("return");
  const drawing = /┏━{10,}┓/;
  assert.match(map(), drawing, "the first drawing is highlighted");
  key("down");
  assert.doesNotMatch(map(), drawing);
  assert.match(map(), /┏━+┓|■/, "the key plan is highlighted instead");
  key("up");
  key("return");
  key("down");
  assert.match(map(), drawing, "inside a drawing, the drawing stays highlighted");
  assert.doesNotMatch(map(), /▒/, "layers and items aren't marked");
});

test("short windows leave the layout out", () => {
  const { key, text } = setup(110, 20);
  for (let i = 0; i < 3; i++) key("down");
  assert.doesNotMatch(text(), /Layout/);
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

const type = (key: (name?: string, str?: string) => void, text: string) => {
  for (const ch of text) key(undefined, ch);
};

test("the chat bar sits at the bottom and a opens it without leaving full screen", async () => {
  const { app, key, text, calls, frames } = setup();
  assert.match(frames[0].at(-2)!, /Ask the AI about this drawing set… press a/);
  key(undefined, "a");
  assert.match(text(), /Ask the AI ─/);
  assert.match(text(), /Which doors are fire rated\?/);
  type(key, "how many doors?");
  assert.match(frames.at(-1)!.at(-2)!, /how many doors\?▏/);
  key("return");
  await tick();
  assert.deepEqual(calls, ["ask how many doors?"]);
  app.chatWrite("There are ");
  app.chatWrite("26 doors on A101.");
  app.chatPrint("  ✎ Added a note to notes.md");
  assert.match(text(), /❯ how many doors\?\n +There are 26 doors on A101\.\n +✎ Added a note/);
  assert.match(text(), /G001 +Cover Sheet/);
  key("escape");
  assert.doesNotMatch(text(), /Ask the AI ─/);
  key(undefined, "q");
});

test("the chat shows which model answers and how to change it", async () => {
  const { app, key, text, frames } = setup(110, 30, {
    aiModel: () => Promise.resolve({ label: "Claude", detail: "claude-sonnet-5-5 via Anthropic", others: ["@chatgpt"] }),
  });
  key(undefined, "a");
  await tick();
  assert.match(text(), /Ask the AI · Claude \(claude-sonnet-5-5 via Anthropic\) ─+ type @name to change models ─/);
  assert.match(text(), /Also set up: @chatgpt\. Type one, alone or before a question, to change models\./);
  assert.match(frames.at(-1)!.at(-2)!, /Type a question for Claude and press Enter, or @name to change models/);
  assert.match(frames.at(-1)!.at(-1)!, /@name change models/);
  assert.doesNotMatch(text(), /pick another AI/);
  key("escape");
  app.redraw();
  assert.match(frames.at(-1)!.at(-2)!, /Ask Claude about this drawing set… press a/);
});

test("messages that say to run another aecdo command say to leave explore first", () => {
  const { app, key, text } = setup(110, 30);
  key(undefined, "a");
  app.chatPrint('Gemini isn\'t set up yet. Run "aecdo configure ai" to add a Google API key.');
  assert.match(text(), /Press Esc, then q, to leave explore, then run "aecdo configure ai" to add/);
  assert.doesNotMatch(text(), /Run "aecdo/);
});

test("quitFirst rewrites Run \"aecdo …\" with the key that leaves explore", () => {
  assert.equal(quitFirst("Run 'aecdo update' to upgrade.", "Type q"), 'Type q to leave explore, then run "aecdo update" to upgrade.');
  assert.equal(quitFirst("Nothing to change here.", "Press q"), "Nothing to change here.");
});

test("when the AI moves, the move shows above the chat and the chat says where", () => {
  const { app, key, text, explorer } = setup(110, 24);
  key(undefined, "a");
  explorer.navigate("A101");
  explorer.navigate("1");
  explorer.navigate("4");
  explorer.navigate("5");
  app.assistantMoved();
  const screen = text();
  assert.match(screen, /Door tag 105A\n.*│ Tag on Door Tags/);
  assert.match(screen, /Now showing A101 › First Floor Plan › Door Tags › Door tag 105A above/);
  explorer.navigate("r1");
  app.assistantMoved();
  assert.match(text(), /Now showing A601 › Door Schedule above/);
  assert.match(text(), /│ Mark/);
});

test("Esc stops an answer that's still being written", () => {
  let finish: () => void = () => undefined;
  const { key, text, calls } = setup(110, 30, {
    ask: () => new Promise<void>((res) => (finish = res)),
    stopAsking: () => {
      calls.push("stop");
      finish();
    },
  });
  key(undefined, "a");
  type(key, "hi");
  key("return");
  assert.match(text(), /Answering… press Esc to stop/);
  assert.match(text(), /Thinking…/);
  key("escape");
  assert.deepEqual(calls, ["stop"]);
  assert.match(text(), /Stopped\./);
});

test("the AI's yes/no questions are answered in the chat bar", async () => {
  let answer: boolean | undefined;
  const { app, key, text } = setup(110, 30, {
    ask: async () => {
      answer = await app.chatConfirm("Create doors.xlsx? [y/N]");
    },
  });
  key(undefined, "a");
  type(key, "make a door list");
  key("return");
  assert.match(text(), /Create doors\.xlsx\? \[y\/N\]/);
  assert.match(text(), /type y or n, then Enter/);
  key(undefined, "y");
  key("return");
  await tick();
  assert.equal(answer, true);
});

test("long answers scroll with the arrow keys while the chat is open", () => {
  const { app, key, text } = setup(110, 20);
  key(undefined, "a");
  app.chatWrite(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n"));
  assert.match(text(), /line 30/);
  for (let i = 0; i < 5; i++) key("up");
  assert.doesNotMatch(text(), /line 30/);
  assert.match(text(), /↓ 5 more lines/);
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
