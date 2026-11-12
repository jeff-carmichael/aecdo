// Renders cli/gui/icon.svg into the icon files `aecdo shortcut` installs: icon.ico (Windows)
// and icon.icns (macOS); Linux uses the SVG itself. Needs Playwright with Chromium (not a
// dependency; e.g. NODE_PATH=$(npm root -g) node scripts/make-icons.mjs).
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../cli/gui/", import.meta.url));
const svg = await readFile(dir + "icon.svg", "utf-8");
// require() so a global install found through NODE_PATH works too.
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
const png = {};
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  png[size] = await page.screenshot({ omitBackground: true });
}
await browser.close();

// ICO with PNG entries (Windows Vista and later).
const icoSizes = [16, 32, 48, 256];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s % 256, e);
  header.writeUInt8(s % 256, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png[s].length;
});
await writeFile(dir + "icon.ico", Buffer.concat([header, ...icoSizes.map((s) => png[s])]));

// ICNS with PNG entries.
const icnsTypes = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024 };
const chunks = Object.entries(icnsTypes).map(([type, s]) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32BE(8 + png[s].length, 4);
  return Buffer.concat([head, png[s]]);
});
const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
const icnsHead = Buffer.alloc(8);
icnsHead.write("icns", 0, "ascii");
icnsHead.writeUInt32BE(total, 4);
await writeFile(dir + "icon.icns", Buffer.concat([icnsHead, ...chunks]));
await writeFile(new URL("../docs/assets/icon-256.png", import.meta.url), png[256]);
console.log("Wrote cli/gui/icon.ico, cli/gui/icon.icns, docs/assets/icon-256.png");
