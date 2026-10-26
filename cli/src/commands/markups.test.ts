import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { Explorer, PageViewer } from "./explore.js";
import { MarkupSession, parseMarkupsCommand } from "./markups.js";
import { listSavedMarkups } from "../lib/markup.js";
import type { PageViewRequest } from "../lib/page-view.js";
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
  const lines: string[] = [];
  const questions: string[] = [];
  const explorer = new Explorer(data, () => undefined);
  const session = new MarkupSession(data, {
    locatePdf: () => ({ path: pdf, looked: [pdf] }),
    target: () => explorer.viewTarget(),
    log: (l = "") => lines.push(l),
    confirm: (q) => {
      questions.push(q);
      return Promise.resolve(answer);
    },
  });
  return { dir, pdf, copy: join(dir, "set-markups.pdf"), explorer, session, lines, questions };
}

test("parses markups commands", () => {
  assert.deepEqual(parseMarkupsCommand("markups"), { action: "list", args: [] });
  assert.deepEqual(parseMarkupsCommand("/markups save --in-place"), { action: "save", args: ["--in-place"] });
  assert.deepEqual(parseMarkupsCommand("markup drop 2"), { action: "drop", args: ["2"] });
  assert.equal(parseMarkupsCommand("marks"), null);
  assert.equal(parseMarkupsCommand("A101"), null);
});

test("a markup on the current selection stays pending until saved, then undo takes it back", async () => {
  const { dir, pdf, copy, explorer, session, lines } = await setup();
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

    await session.run("list", []);
    assert.match(lines.join("\n"), /1\. cloud A101 on item Exterior Wall: Check this wall/);
    assert.match(lines.join("\n"), /2\. note A201 at \[100, 100, 200, 200\]: On A201/);

    const original = readFileSync(pdf);
    await session.run("save", []);
    assert.match(lines.at(-1)!, /Saved 2 markups to .*set-markups\.pdf/);
    assert.equal(session.pending.length, 0);
    assert.ok(readFileSync(pdf).equals(original), "original PDF untouched");
    assert.equal((await listSavedMarkups(copy)).length, 2);

    await session.run("undo", []);
    assert.match(lines.at(-1)!, /Deleted set-markups\.pdf/);
    assert.equal(existsSync(copy), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("save --in-place, remove with confirmation, drop and clear", async () => {
  const { dir, pdf, explorer, session, lines, questions } = await setup();
  try {
    explorer.handle("A101");
    explorer.handle("1");
    await session.add({ kind: "callout", text: "Drawing note" });
    await session.add({ kind: "cloud", text: "Second" });
    await session.add({ kind: "cloud", text: "Third" });
    await session.run("drop", ["2"]);
    assert.match(lines.at(-1)!, /Dropped cloud A101 .*Second/);
    await session.run("drop", ["9"]);
    assert.match(lines.at(-1)!, /No pending markup 9/);

    await session.run("save", ["--in-place"]);
    assert.equal((await listSavedMarkups(pdf)).length, 2);

    await session.run("remove", ["--in-place"]);
    assert.match(questions.at(-1)!, /Remove 2 aecdo markups from set\.pdf/);
    assert.equal((await listSavedMarkups(pdf)).length, 0);
    await session.run("undo", []);
    assert.equal((await listSavedMarkups(pdf)).length, 2);

    await session.add({ kind: "note", text: "pending" });
    await session.run("clear", []);
    assert.equal(session.pending.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("offers to save pending markups before quitting", async () => {
  const { dir, copy, explorer, session, questions } = await setup(true);
  try {
    explorer.handle("A101");
    explorer.handle("1");
    await session.beforeQuit();
    assert.equal(questions.length, 0, "nothing pending, no question");
    await session.add({ kind: "cloud", text: "x" });
    await session.beforeQuit();
    assert.match(questions[0], /Save 1 pending markup to set-markups\.pdf before quitting/);
    assert.equal((await listSavedMarkups(copy)).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("view draws pending markups and shows the saved copy", async () => {
  const { dir, pdf, copy, explorer, session } = await setup();
  try {
    explorer.handle("A101");
    explorer.handle("1");
    const requests: PageViewRequest[] = [];
    const out: string[] = [];
    const viewer = new PageViewer(data, join(dir, "set.jsonld"), pdf, {
      log: (l = "") => out.push(l),
      open: () => undefined,
      markups: session,
      render: (req) => {
        requests.push(req);
        return Promise.resolve({ path: "/tmp/x.png", pdfPath: "/tmp/x.pdf", pageCount: 2 });
      },
    });
    await session.add({ kind: "cloud", text: "x" });
    await viewer.show(explorer);
    assert.equal(requests[0].pdfPath, pdf);
    assert.equal(requests[0].markups?.length, 1);
    assert.match(out.join("\n"), /Showing 1 pending markup/);

    await session.save();
    await viewer.show(explorer);
    assert.equal(requests[1].pdfPath, copy);
    assert.equal(requests[1].markups, undefined);
    assert.match(out.join("\n"), /Showing saved markups from set-markups\.pdf/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
