import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { Explorer } from "./explore.js";
import { MarkupSession } from "./markups.js";
import { listSavedMarkups } from "../lib/markup.js";
import type { DrawingSet } from "../types.js";

const data = JSON.parse(
  readFileSync(new URL("../../../test/fixtures/sample-drawing-set.jsonld", import.meta.url), "utf-8")
) as DrawingSet;

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-markups-"));
  const pdf = join(dir, "set.pdf");
  const doc = await PDFDocument.create();
  data.sheets.forEach(() => doc.addPage([792, 612]));
  await writeFile(pdf, await doc.save());
  const explorer = new Explorer(data, () => undefined);
  const session = new MarkupSession(data, {
    locatePdf: () => ({ path: pdf, looked: [pdf] }),
    target: () => explorer.viewTarget(),
  });
  return { dir, pdf, copy: join(dir, "set-markups.pdf"), explorer, session };
}

test("each markup is written to the copy right away, and undo takes it back", async () => {
  const { dir, pdf, copy, explorer, session } = await setup();
  try {
    await assert.rejects(session.add({ kind: "cloud", text: "x" }), /Nothing is selected/);
    for (const cmd of ["A101", "1", "1", "1"]) explorer.handle(cmd);

    const original = readFileSync(pdf);
    const m = await session.add({ kind: "cloud", text: "Check this wall" });
    assert.equal(m.sheetNumber, "A101");
    assert.deepEqual(m.bbox, [85, 120, 700, 130]);
    assert.match(m.itemId ?? "", /^urn:uuid:/);
    assert.match(m.label ?? "", /Exterior Wall/);
    assert.equal(session.savedCopy(), copy, "written at once");
    await session.add({ kind: "note", text: "On A201", sheet: "A201", bbox: [100, 100, 200, 200] });
    await assert.rejects(session.add({ kind: "callout", text: "x", bbox: [0, 0, 2000, 10] }), /runs past the page/);
    assert.ok(readFileSync(pdf).equals(original), "original PDF untouched");

    const lines = (await session.lines()).join("\n");
    assert.match(lines, /Set: Markups \(set-markups\.pdf\)\.\n2 markups:/);
    assert.match(lines, /1\. cloud A101: Check this wall/);
    assert.match(lines, /2\. note A201: On A201/);

    assert.equal(await session.undo(), "Undone.");
    assert.equal((await session.list()).length, 1);
    assert.match(await session.undo(), /set-markups\.pdf is gone/);
    assert.equal(existsSync(copy), false);
    assert.equal(await session.undo(), "Nothing to undo.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quick adds don't overwrite each other; delete one, delete all, undo", async () => {
  const { dir, copy, explorer, session } = await setup();
  try {
    explorer.handle("A101");
    explorer.handle("1");
    await Promise.all(["First", "Second", "Third"].map((text) => session.add({ kind: "cloud", text })));
    assert.equal((await listSavedMarkups(copy)).length, 3);

    assert.match(await session.remove(2), /^Deleted cloud A101: Second/);
    await assert.rejects(session.remove(9), /No markup 9\. There are 2\./);
    assert.deepEqual((await session.list()).map((m) => m.text), ["First", "Third"]);

    assert.equal(await session.remove(), "Deleted 2 markups.");
    assert.equal((await session.list()).length, 0);
    assert.equal(await session.remove(), "There are no markups to delete.");
    await session.undo();
    assert.equal((await session.list()).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("markup sets: each is its own copy; the name is kept; history goes back and undo takes it back", async () => {
  const { dir, copy, explorer, session } = await setup();
  try {
    explorer.handle("A101");
    explorer.handle("1");
    await session.add({ kind: "cloud", text: "General" });
    assert.equal(session.setName(), "Markups");

    const started = session.useSet("QA");
    assert.deepEqual([started.name, started.file, started.exists], ["QA", "set-markups-qa.pdf", false]);
    assert.equal(session.savedCopy(), undefined, "nothing written until the first markup");
    assert.deepEqual(session.sets().map((s) => s.name), ["Markups", "QA"]);

    await session.add({ kind: "cloud", text: "One" });
    await session.add({ kind: "note", text: "Two", set: "Code review" });
    assert.equal(session.setName(), "Code review", "adding to a set switches to it");
    assert.equal(session.useSet("qa").name, "QA", "found by name, any case");
    await session.add({ kind: "callout", text: "Three" });
    assert.deepEqual((await session.list()).map((m) => m.text), ["One", "Three"]);
    assert.equal((await listSavedMarkups(copy)).length, 1, "the default set is untouched");
    assert.match((await session.lines())[0], /^Set: QA \(set-markups-qa\.pdf\)\. Other sets: Markups, Code review\.$/);

    // A new session finds the sets, their names, and opens the one changed last.
    const again = new MarkupSession(data, { locatePdf: () => ({ path: join(dir, "set.pdf"), looked: [] }), target: () => explorer.viewTarget() });
    assert.equal(again.setName(), "QA");
    assert.deepEqual(again.sets().map((s) => s.name), ["Markups", "Code review", "QA"]);

    const history = await session.history();
    assert.deepEqual(history.steps.map((h) => [h.step, h.text, h.current]), [
      [2, "Added callout A101 on drawing Ground Floor Plan: Three", true],
      [1, "Added cloud A101 on drawing Ground Floor Plan: One", false],
      [0, "The original PDF, before any markups", false],
    ]);
    assert.match(await session.restore(1), /^Went back to step 1: 1 markup\./);
    assert.deepEqual((await session.list()).map((m) => m.text), ["One"]);
    assert.equal((await session.history()).steps[0].text, "Went back to step 1");
    assert.match(await session.restore(0), /^Went back to before any of these changes: 0 markups/);
    await session.undo();
    await session.undo();
    assert.deepEqual((await session.list()).map((m) => m.text), ["One", "Three"]);

    assert.match(await session.renameSet("Final QA"), /its file is now set-markups-final-qa\.pdf/);
    assert.equal(existsSync(join(dir, "set-markups-qa.pdf")), false);
    assert.ok((await session.list()).every((m) => m.set === "Final QA"));
    assert.equal(again.sets().find((s) => s.slug === "final-qa")?.name, "Final QA");
    await assert.rejects(session.renameSet("Code review"), /already a set called Code review/);
    assert.match(await session.undo(), /called QA again/);
    assert.ok(existsSync(join(dir, "set-markups-qa.pdf")));
    assert.match(await session.undo(), /^Undone\.$/);
    assert.deepEqual((await session.list()).map((m) => m.text), ["One"]);

    assert.throws(() => session.useSet("!!"), /Give the set a name/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
