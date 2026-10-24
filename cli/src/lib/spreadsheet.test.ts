import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseDelimited,
  formatDelimited,
  parseRef,
  formatRef,
  readSpreadsheet,
  writeCells,
  appendRows,
  createSpreadsheet,
  listSpreadsheets,
} from "./spreadsheet.js";
import { readZip, writeZip } from "./zip.js";

const FIXTURE = new URL("../../../cli/src/lib/__fixtures__/door-schedule.xlsx", import.meta.url);

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "aecdo-sheet-"));
}

function fixtureCopy(): string {
  const path = join(tempDir(), "doors.xlsx");
  copyFileSync(FIXTURE, path);
  return path;
}

function sheetXml(path: string, n = 1): string {
  const entry = readZip(readFileSync(path)).find((e) => e.name === `xl/worksheets/sheet${n}.xml`);
  return entry!.data.toString("utf-8");
}

test("cell references convert both ways", () => {
  assert.deepEqual(parseRef("A1"), { row: 0, col: 0 });
  assert.deepEqual(parseRef("ab12"), { row: 11, col: 27 });
  assert.equal(formatRef(11, 27), "AB12");
  assert.equal(formatRef(0, 25), "Z1");
  assert.throws(() => parseRef("12A"), /Invalid cell reference/);
});

test("CSV parsing handles quotes, embedded newlines, and CRLF", () => {
  const rows = parseDelimited('Mark,Note\r\nD101,"Pair, with ""panic"" bar"\r\nD102,"two\nlines"\r\n');
  assert.deepEqual(rows, [
    ["Mark", "Note"],
    ["D101", 'Pair, with "panic" bar'],
    ["D102", "two\nlines"],
  ]);
  assert.equal(formatDelimited(rows, ",", "\r\n"), 'Mark,Note\r\nD101,"Pair, with ""panic"" bar"\r\nD102,"two\nlines"\r\n');
});

test("zip archives round-trip", () => {
  const entries = [
    { name: "a.txt", data: Buffer.from("hello") },
    { name: "dir/b.xml", data: Buffer.from("<x/>".repeat(200)) },
  ];
  const back = readZip(writeZip(entries));
  assert.deepEqual(back.map((e) => [e.name, e.data.toString()]), entries.map((e) => [e.name, e.data.toString()]));
});

test("reads an Excel-style workbook with shared strings, numbers and formulas", async () => {
  const data = await readSpreadsheet(FIXTURE.pathname);
  assert.deepEqual(data.sheets, ["Door Schedule", "Info"]);
  assert.equal(data.sheet, "Door Schedule");
  assert.deepEqual(data.rows[0], ["Mark", "Width (in)", "Height (in)", "Type", "Sheet", null, "Total width"]);
  assert.deepEqual(data.rows[1], ["D101", 36, 84, "Single", "A101", null, 108]);

  const info = await readSpreadsheet(FIXTURE.pathname, "info");
  assert.equal(info.rows[0][1], "Sample & Co <test>");
});

test("appending rows to an xlsx keeps styles and existing cells", async () => {
  const path = fixtureCopy();
  const before = sheetXml(path);
  const first = await appendRows(path, [["D103", 36, 96, "Single & Glazed", "A102"]]);
  assert.equal(first, 4);

  const data = await readSpreadsheet(path);
  assert.deepEqual(data.rows[3], ["D103", 36, 96, "Single & Glazed", "A102"]);
  assert.deepEqual(data.rows[1], ["D101", 36, 84, "Single", "A101", null, 108]);

  const after = sheetXml(path);
  assert.match(after, /<c r="A1" s="1" t="s">/, "header style kept");
  assert.match(after, /<f aca="false">SUM\(B2:B10\)<\/f>/, "formula kept");
  assert.match(after, /<dimension ref="A1:G4"\/>/);
  assert.notEqual(before, after);

  const wb = readZip(readFileSync(path)).find((e) => e.name === "xl/workbook.xml")!.data.toString();
  assert.match(wb, /fullCalcOnLoad="1"/);
});

test("writing cells keeps the cell's style and refuses to overwrite formulas", async () => {
  const path = fixtureCopy();
  await writeCells(path, [{ ref: "D1", value: "Door type" }, { ref: "H5", value: true }]);
  const data = await readSpreadsheet(path);
  assert.equal(data.rows[0][3], "Door type");
  assert.equal(data.rows[4][7], true);
  assert.match(sheetXml(path), /<c r="D1" s="1" t="inlineStr">/);

  await assert.rejects(writeCells(path, [{ ref: "G2", value: 1 }]), /holds a formula/);
  await assert.rejects(writeCells(path, [{ ref: "A1", value: 1 }], "Nope"), /No sheet named "Nope"/);
});

test("creates new xlsx and CSV files and refuses to overwrite", async () => {
  const dir = tempDir();
  const xlsx = join(dir, "takeoff.xlsx");
  await createSpreadsheet(xlsx, [["Sheet", "Count"], ["A101", 3]]);
  assert.deepEqual((await readSpreadsheet(xlsx)).rows, [["Sheet", "Count"], ["A101", 3]]);
  await assert.rejects(createSpreadsheet(xlsx, [["x"]]), /EEXIST/);

  const csv = join(dir, "notes.csv");
  await createSpreadsheet(csv, [["a", "b"]]);
  await appendRows(csv, [["1", "2"]]);
  await writeCells(csv, [{ ref: "C1", value: "c" }]);
  assert.equal(readFileSync(csv, "utf-8"), "a,b,c\n1,2,\n");

  writeFileSync(join(dir, "~$takeoff.xlsx"), "lock");
  assert.deepEqual(await listSpreadsheets(dir), ["notes.csv", "takeoff.xlsx"]);
});
