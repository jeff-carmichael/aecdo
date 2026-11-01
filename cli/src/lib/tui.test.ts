import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSI } from "./style.js";
import {
  ASCII,
  box,
  fit,
  formatBytes,
  formatDuration,
  LiveRegion,
  padEnd,
  progressBar,
  stripAnsi,
  textWidth,
  unicodeSupported,
  UNICODE,
} from "./tui.js";

test("textWidth ignores color codes and counts wide characters as two columns", () => {
  assert.equal(textWidth(ANSI.bold("A101")), 4);
  assert.equal(textWidth("平面図"), 6);
  assert.equal(textWidth("é"), 1);
});

test("fit leaves short lines alone and cuts long ones with an ellipsis", () => {
  assert.equal(fit("short", 10), "short");
  assert.equal(fit("abcdefghij", 5), "abcd…");
  assert.equal(fit("平面図平面図", 5), "平面…");
});

test("fit keeps color codes and resets them after cutting", () => {
  const cut = fit(ANSI.ok("abcdefghij"), 5);
  assert.equal(stripAnsi(cut), "abcd…");
  assert.ok(cut.startsWith("\x1b[1;32m"));
  assert.ok(cut.includes("\x1b[0m"));
});

test("padEnd pads to visible width", () => {
  assert.equal(stripAnsi(padEnd(ANSI.bold("ab"), 4)), "ab  ");
});

test("progressBar fills in proportion", () => {
  assert.equal(progressBar(5, 10, 10, undefined, UNICODE), "█████░░░░░");
  assert.equal(progressBar(0, 0, 4, undefined, ASCII), "----");
  assert.equal(progressBar(12, 10, 4, undefined, ASCII), "####");
});

test("formatDuration and formatBytes", () => {
  assert.equal(formatDuration(8_400), "8s");
  assert.equal(formatDuration(65_000), "1m 05s");
  assert.equal(formatDuration(7_380_000), "2h 03m");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2_400_000), "2.3 MB");
});

test("box draws a border around padded lines", () => {
  assert.deepEqual(box(["ab", "abcd"], 80, undefined, ASCII), ["+------+", "| ab   |", "| abcd |", "+------+"]);
  const narrow = box(["a long line that will not fit"], 12, undefined, ASCII);
  assert.ok(narrow.every((l) => l.length === 12));
});

test("unicodeSupported falls back to ASCII in the classic Windows console", () => {
  assert.equal(unicodeSupported({}, "win32", "10.0.19045"), false);
  assert.equal(unicodeSupported({ WT_SESSION: "1" }, "win32", "10.0.19045"), true);
  assert.equal(unicodeSupported({}, "win32", "10.0.26100"), true);
  assert.equal(unicodeSupported({ TERM: "xterm-256color" }, "linux"), true);
  assert.equal(unicodeSupported({ TERM: "linux" }, "linux"), false);
});

function fakeStream(columns = 20, rows = 5) {
  const writes: string[] = [];
  const stream = { columns, rows, isTTY: true, write: (s: string) => writes.push(s) } as unknown as NodeJS.WriteStream;
  return { stream, writes };
}

test("LiveRegion erases what it drew before redrawing", () => {
  const { stream, writes } = fakeStream();
  const region = new LiveRegion(stream);
  region.render(["one", "two"]);
  region.render(["three"]);
  region.done(["final"]);
  assert.equal(writes[0], "one\ntwo\n");
  assert.equal(writes[1], "\x1b[2A\r\x1b[0Jthree\n");
  assert.equal(writes[2], "\x1b[1A\r\x1b[0Jfinal\n");
});

test("LiveRegion cuts lines to the terminal width and height so redraws stay aligned", () => {
  const { stream, writes } = fakeStream(12, 4);
  new LiveRegion(stream).render(["x".repeat(30), "2", "3", "4", "5"]);
  const lines = writes[0].split("\n").filter(Boolean);
  assert.equal(lines.length, 3);
  assert.equal(textWidth(lines[0]), 11);
});
