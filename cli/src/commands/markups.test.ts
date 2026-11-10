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
  readFileSync(new URL("../../../examples/sample-drawing-set.jsonld", import.meta.url), "utf-8")
) as DrawingSet;

async function setup(answer = true) {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-markups-"));
  const pdf = join(dir, "set.pdf");
  const doc = await PDFDocument.create();
  data.sheets.forEach(() => doc.addPage([792, 612]));
  await writeFile(pdf, await doc.save());
  const questions: string[] = [];
  const explorer = new Explorer(data, () => undefined);
  const session = new MarkupSession(data, {
    locatePdf: () => ({ path: pdf, looked: [pdf] }),
    target: () => explorer.viewTarget(),
    confirm: (q) => {
      questions.push(q);
      return Promise.resolve(answer);
    },
  });
  return { dir, pdf, copy: join(dir, "set-markups.pdf"), explorer, session, questions };
}

test("a markup on the current selection stays pending until saved, then undo takes it back", async () => {
  const { dir, pdf, copy, explorer, session } = await setup();
  try {
    await assert.rejects(session.add({ kind: "cloud", text: "x" }), /Nothing is selected/);
    for (const cmd of ["A101", "1", "1", "1"]) explorer.handle(cmd);

    const m = await session.add({ kind: "cloud", text: "Check this wall" });
    assert.equal(m.sheetNumber, "A101");
    assert.deepEqual(m.bbox, [85, 120, 700, 130]);
    assert.match(m.itemId ?? "", /^urn:uuid:/);
    assert.match(m.label ?? "", /Exterior Wall/);
    await session.add({ kind: "note", text: "On A201", sheet: "A201", bbox: [100, 100, 200, 200] });
    await assert.rejects(session.add({ kind: "callout", text: "x", bbox: [0, 0, 2000, 10] }), /runs past the page/);
    assert.equal(existsSync(copy), false, "nothing written yet");

    const listing = (await session.listing()).join("\n");
    assert.match(listing, /1\. cloud A101 on item Exterior Wall: Check this wall/);
    assert.match(listing, /2\. note A201 at \[100, 100, 200, 200\]: On A201/);

    const original = readFileSync(pdf);
    assert.match(await session.save(), /Saved 2 markups to .*set-markups\.pdf/);
    assert.equal(session.pending.length, 0);
    assert.ok(readFileSync(pdf).equals(original), "original PDF untouched");
    assert.equal((await listSavedMarkups(copy)).length, 2);

    assert.match(await session.undo(), /Deleted set-markups\.pdf/);
    assert.equal(existsSync(copy), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("save in place, remove with confirmation, and drop", async () => {
  const { dir, pdf, explorer, session, questions } = await setup();
  try {
    explorer.handle("A101");
    explorer.handle("1");
    await session.add({ kind: "callout", text: "Drawing note" });
    await session.add({ kind: "cloud", text: "Second" });
    await session.add({ kind: "cloud", text: "Third" });
    assert.match(session.describe(session.drop(2)), /cloud A101 .*Second/);
    assert.throws(() => session.drop(9), /No pending markup 9/);

    await session.save(true);
    assert.equal((await listSavedMarkups(pdf)).length, 2);

    await session.remove(true);
    assert.match(questions.at(-1)!, /Remove 2 aecdo markups from set\.pdf/);
    assert.equal((await listSavedMarkups(pdf)).length, 0);
    await session.undo();
    assert.equal((await listSavedMarkups(pdf)).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
