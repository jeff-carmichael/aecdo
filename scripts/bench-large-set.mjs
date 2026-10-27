// Times parse, validation and explore navigation on a large synthetic set built by copying
// examples/maple-grove-library.jsonld. Usage: npm run build && npm run bench -- [sheets]
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const target = Number(process.argv[2] ?? 1000);
const dist = new URL("../dist/src/", import.meta.url);
const { createValidator } = await import(new URL("lib/schema.js", dist).href);
const { Explorer } = await import(new URL("commands/explore.js", dist).href);
const { printPage, findSheet } = await import(new URL("commands/page.js", dist).href);

const base = JSON.parse(readFileSync(new URL("../examples/maple-grove-library.jsonld", import.meta.url), "utf-8"));
const sheets = [];
for (let copy = 0; sheets.length < target; copy++) {
  const ids = new Map();
  const json = JSON.stringify(base.sheets).replace(/urn:uuid:[0-9a-f-]{36}/g, (id) => {
    if (!ids.has(id)) ids.set(id, `urn:uuid:${randomUUID()}`);
    return ids.get(id);
  });
  for (const sheet of JSON.parse(json)) {
    if (sheets.length === target) break;
    sheet.pageIndex = sheets.length;
    sheet.sheetNumber = sheet.sheetNumber.replace(/^([A-Za-z]+)/, `$1${copy}-`);
    sheets.push(sheet);
  }
}
const text = JSON.stringify({ ...base, sheets }, null, 2);

const rows = [];
const time = (label, fn) => {
  const start = performance.now();
  const result = fn();
  rows.push([label, `${(performance.now() - start).toFixed(1)} ms`]);
  return result;
};

const log = console.log;
console.log = () => {};
const data = time("JSON.parse", () => JSON.parse(text));
const validator = time("compile schema", () => createValidator(loadSchemaSync()));
time("validate", () => validator(data));
const explorer = time("open explore", () => new Explorer(data, () => {}));
const last = sheets.at(-1).sheetNumber;
time(`open sheet ${last}`, () => explorer.handle(last));
time("open drawing, layer, item", () => ["1", "1", "1"].forEach((c) => explorer.handle(c)));
time("assistant context", () => JSON.stringify(explorer.context()));
time(`"all" on ${last}`, () => printPage(findSheet(data, last), data));
console.log = log;

console.log(`${sheets.length} sheets, ${(text.length / 1e6).toFixed(1)} MB of JSON-LD`);
for (const [label, ms] of rows) console.log(`  ${label.padEnd(28)} ${ms.padStart(10)}`);
console.log(`  ${"heap used".padEnd(28)} ${`${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`.padStart(10)}`);

function loadSchemaSync() {
  return JSON.parse(readFileSync(new URL("../ontology/v0.3.0/aecdo.schema.json", import.meta.url), "utf-8"));
}
