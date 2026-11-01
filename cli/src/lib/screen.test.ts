import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Screen } from "./screen.js";

function fakeTerminal(columns = 10, rows = 3) {
  const writes: string[] = [];
  const out = Object.assign(new EventEmitter(), { columns, rows, isTTY: true, write: (s: string) => writes.push(s) });
  const raw: boolean[] = [];
  const input = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: (on: boolean) => raw.push(on),
    resume: () => undefined,
    pause: () => undefined,
  });
  const screen = new Screen(out as unknown as NodeJS.WriteStream, input as unknown as NodeJS.ReadStream);
  return { screen, writes, raw, input, out };
}

test("switches to the alternate screen and back, restoring input", () => {
  const { screen, writes, raw } = fakeTerminal();
  screen.start(() => undefined, () => undefined);
  assert.ok(writes[0].includes("\x1b[?1049h"));
  screen.stop();
  assert.ok(writes.at(-1)!.includes("\x1b[?1049l"));
  assert.ok(writes.at(-1)!.includes("\x1b[?25h"));
  assert.deepEqual(raw, [true, false]);
});

test("only rewrites the rows that changed", () => {
  const { screen, writes } = fakeTerminal();
  screen.start(() => undefined, () => undefined);
  screen.draw(["one", "two", "three"]);
  const first = writes.at(-1)!;
  assert.ok(first.includes("\x1b[1;1Hone") && first.includes("\x1b[3;1Hthree"));
  screen.draw(["one", "TWO", "three"]);
  assert.equal(writes.at(-1), "\x1b[2;1HTWO       \x1b[0m");
  const count = writes.length;
  screen.draw(["one", "TWO", "three"]);
  assert.equal(writes.length, count);
});

test("ignores keys and drawing while suspended", () => {
  const { screen, writes, input } = fakeTerminal();
  const keys: string[] = [];
  screen.start((str) => keys.push(str ?? ""), () => undefined);
  screen.suspend();
  assert.ok(screen.suspended);
  input.emit("keypress", "x", { name: "x" });
  const count = writes.length;
  screen.draw(["hidden"]);
  assert.equal(writes.length, count);
  screen.resume();
  input.emit("keypress", "y", { name: "y" });
  assert.deepEqual(keys, ["y"]);
  screen.stop();
});

test("a resize clears the screen and redraws everything", () => {
  const { screen, writes, out } = fakeTerminal();
  let redraws = 0;
  screen.start(() => undefined, () => {
    redraws++;
    screen.draw(["a", "b", "c"]);
  });
  screen.draw(["a", "b", "c"]);
  out.emit("resize");
  assert.equal(redraws, 1);
  assert.ok(writes.some((w) => w === "\x1b[2J"));
  assert.ok(writes.at(-1)!.includes("\x1b[1;1Ha"));
  screen.stop();
});
