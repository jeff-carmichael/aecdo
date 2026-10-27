import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBanner, spriteLines, bannerEnabled, BANNER_WIDTH } from "./banner.js";

// eslint-disable-next-line no-control-regex
const visible = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");

test("sprite lines are all the same width and fit in a narrow terminal", () => {
  const lines = spriteLines();
  assert.ok(lines.length <= 12);
  for (const line of lines) assert.equal(visible(line).length, BANNER_WIDTH);
});

test("banner shows the file name and sheet count, within the terminal width", () => {
  const lines = renderBanner({ name: "Maple_Grove_Branch_Library_100CD.pdf", sheets: 19 }, 80);
  const text = lines.map(visible).join("\n");
  assert.match(text, /Maple_Grove_Branch_Library_100CD\.pdf/);
  assert.match(text, /19 sheets/);
  for (const line of lines) assert.ok(visible(line).length <= 80);
});

test("long names are cut to fit", () => {
  const lines = renderBanner({ name: "x".repeat(200), sheets: 1 }, 60);
  for (const line of lines) assert.ok(visible(line).length <= 60);
  assert.match(lines.map(visible).join("\n"), /1 sheet\b/);
});

test("banner only shows in a wide color terminal", () => {
  const tty = (columns: number) => ({ isTTY: true, columns }) as unknown as NodeJS.WriteStream;
  assert.equal(bannerEnabled(tty(100), {}), true);
  assert.equal(bannerEnabled(tty(40), {}), false);
  assert.equal(bannerEnabled(tty(100), { NO_COLOR: "1" }), false);
  assert.equal(bannerEnabled(tty(100), { TERM: "dumb" }), false);
  assert.equal(bannerEnabled(tty(100), { AECDO_NO_BANNER: "1" }), false);
  assert.equal(bannerEnabled({ isTTY: false, columns: 100 } as unknown as NodeJS.WriteStream, {}), false);
});
