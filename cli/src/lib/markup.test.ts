import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument, PDFName, PDFDict, PDFNumber, PDFString, degrees } from "pdf-lib";
import {
  displayUpToUser,
  listSavedMarkups,
  markupCopyPath,
  newMarkupId,
  removeSavedMarkups,
  saveMarkups,
  undoSave,
  type Markup,
} from "./markup.js";
import { bboxToUserSpace, type BBox } from "./page-view.js";

const ROTATIONS = [0, 90, 180, 270];

async function sourcePdf(path: string, objectStreams: boolean, foreignAnnot = false): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const r of ROTATIONS) {
    const page = r % 180 ? doc.addPage([1728, 2592]) : doc.addPage([2592, 1728]);
    page.setRotation(degrees(r));
  }
  if (foreignAnnot) {
    const page = doc.getPage(0);
    const annot = doc.context.register(
      doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [10, 10, 50, 50], NM: PDFString.of("someone-else"), C: [0, 0, 1] })
    );
    page.node.set(PDFName.of("Annots"), doc.context.obj([annot]));
  }
  const bytes = Buffer.from(await doc.save({ useObjectStreams: objectStreams }));
  await writeFile(path, bytes);
  return bytes;
}

function markup(kind: Markup["kind"], pageIndex: number, bbox: BBox = [800, 400, 1400, 900]): Markup {
  return { id: newMarkupId(), kind, pageIndex, sheetNumber: `A${pageIndex}`, bbox, text: `${kind} on page ${pageIndex}`, itemId: "urn:uuid:1" };
}

/** Follows the newest cross-reference section and checks each object it lists starts at its offset. */
function checkNewestXref(bytes: Buffer): number[] {
  const tail = bytes.subarray(bytes.length - 64).toString("latin1");
  const at = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail)![1]);
  const section = bytes.subarray(at).toString("latin1");
  const entries: { num: number; offset: number }[] = [];
  if (section.startsWith("xref")) {
    const lines = section.split(/\r?\n/);
    for (let i = 1; !lines[i].startsWith("trailer"); ) {
      const [start, count] = lines[i].split(" ").map(Number);
      for (let k = 0; k < count; k++) entries.push({ num: start + k, offset: Number(lines[i + 1 + k].slice(0, 10)) });
      i += count + 1;
    }
  } else {
    const dict = /<<([\s\S]*?)>>\s*stream\r?\n/.exec(section)!;
    const index = /\/Index \[([\d\s]+)\]/.exec(dict[1])![1].trim().split(/\s+/).map(Number);
    const length = Number(/\/Length (\d+)/.exec(dict[1])![1]);
    const start = at + dict.index + dict[0].length;
    const rows = inflateSync(bytes.subarray(start, start + length));
    let row = 0;
    for (let i = 0; i < index.length; i += 2) {
      for (let k = 0; k < index[i + 1]; k++, row++) entries.push({ num: index[i] + k, offset: rows.readUInt32BE(row * 7 + 1) });
    }
  }
  for (const e of entries) {
    assert.match(bytes.subarray(e.offset, e.offset + 20).toString("latin1"), new RegExp(`^${e.num} 0 obj`), `object ${e.num}`);
  }
  return entries.map((e) => e.num);
}

test("display-up drawing space lines up with bbox conversion on every rotation", () => {
  const crop = { x: 0, y: 0, width: 1728, height: 2592 };
  for (const r of ROTATIONS) {
    const display = r % 180 ? { w: 2592, h: 1728 } : { w: 1728, h: 2592 };
    const m = displayUpToUser(crop, r);
    const box = bboxToUserSpace([100, 200, 300, 260], crop, r);
    const corners = [
      [100, display.h - 200],
      [300, display.h - 260],
    ].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
    assert.equal(Math.min(corners[0][0], corners[1][0]), box.x, `x at ${r}`);
    assert.equal(Math.min(corners[0][1], corners[1][1]), box.y, `y at ${r}`);
  }
});

test("names the copy next to the PDF", () => {
  assert.equal(markupCopyPath("/a/Plans Set.pdf"), "/a/Plans Set-markups.pdf");
  assert.equal(markupCopyPath("/a/plans.PDF"), "/a/plans-markups.PDF");
});

for (const objectStreams of [true, false]) {
  test(`appends markups without touching the original bytes (${objectStreams ? "xref stream" : "classic xref"})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "aecdo-markup-"));
    try {
      const src = join(dir, "plans.pdf");
      const original = await sourcePdf(src, objectStreams);
      const out = markupCopyPath(src);
      const first = ROTATIONS.map((_, i) => [markup("cloud", i), markup("callout", i), markup("note", i)]).flat();

      const r1 = await saveMarkups({ sourcePdf: src, outPath: out, markups: first });
      assert.equal(r1.sizeBefore, undefined);
      assert.equal(r1.rewritten, false);
      const bytes1 = await readFile(out);
      assert.ok(bytes1.subarray(0, original.length).equals(original), "original bytes are a prefix");
      assert.ok((await readFile(src)).equals(original), "source PDF untouched");
      checkNewestXref(bytes1);

      const r2 = await saveMarkups({ sourcePdf: src, outPath: out, markups: [markup("cloud", 0, [10, 10, 100, 100])] });
      assert.equal(r2.sizeBefore, bytes1.length);
      const bytes2 = await readFile(out);
      assert.ok(bytes2.subarray(0, bytes1.length).equals(bytes1), "second save appends too");
      checkNewestXref(bytes2);

      const saved = await listSavedMarkups(out);
      assert.equal(saved.length, 13);
      assert.deepEqual(saved.filter((s) => s.pageIndex === 0).map((s) => s.kind), ["cloud", "callout", "note", "cloud"]);
      assert.equal(saved[0].text, "cloud on page 0");
      assert.equal(saved[0].itemId, "urn:uuid:1");

      const doc = await PDFDocument.load(bytes2);
      const page1 = doc.getPage(1);
      const annots = page1.node.Annots()!;
      const kinds = annots.asArray().map((ref) => doc.context.lookup(ref, PDFDict));
      const freeText = kinds.find((d) => d.get(PDFName.of("Subtype")) === PDFName.of("FreeText"))!;
      assert.equal((freeText.get(PDFName.of("Rotate")) as PDFNumber).asNumber(), 90, "callout text is kept upright");
      assert.ok(freeText.get(PDFName.of("AP")), "has its own appearance");
      const note = kinds.find((d) => d.get(PDFName.of("Subtype")) === PDFName.of("Text"))!;
      assert.equal((note.get(PDFName.of("F")) as PDFNumber).asNumber(), 28);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("undo deletes a copy the save created, and refuses once the file changed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-markup-"));
  try {
    const src = join(dir, "plans.pdf");
    await sourcePdf(src, true);
    const out = markupCopyPath(src);
    const r1 = await saveMarkups({ sourcePdf: src, outPath: out, markups: [markup("cloud", 0)] });
    await undoSave(r1);
    assert.equal(existsSync(out), false);

    const r2 = await saveMarkups({ sourcePdf: src, outPath: src, markups: [markup("note", 0)] });
    await writeFile(src, Buffer.concat([await readFile(src), Buffer.from("\n% edited elsewhere\n")]));
    await assert.rejects(undoSave(r2), /has changed since/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("remove takes out aecdo's markups and replies to them, keeps other people's, and can be undone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-markup-"));
  try {
    const src = join(dir, "plans.pdf");
    await sourcePdf(src, false, true);
    const ours = markup("cloud", 0);
    await saveMarkups({ sourcePdf: src, outPath: src, markups: [ours, markup("callout", 2)] });

    // Someone replies to our cloud in Bluebeam.
    const doc = await PDFDocument.load(await readFile(src));
    const page = doc.getPage(0);
    const annots = page.node.Annots()!;
    const cloudRef = annots.asArray().find((ref) => doc.context.lookup(ref, PDFDict).get(PDFName.of("NM"))?.toString() === `(${ours.id})`)!;
    annots.push(doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Text", Rect: [0, 0, 20, 20], IRT: cloudRef })));
    await writeFile(src, await doc.save());

    const before = await readFile(src);
    const { removed, record } = await removeSavedMarkups(src);
    assert.equal(removed, 3);
    assert.equal((await listSavedMarkups(src)).length, 0);
    const after = await PDFDocument.load(await readFile(src));
    const left = after.getPage(0).node.Annots()!.asArray().map((ref) => after.context.lookup(ref, PDFDict).get(PDFName.of("NM"))?.toString());
    assert.deepEqual(left, ["(someone-else)"]);

    await undoSave(record!);
    assert.ok((await readFile(src)).equals(before));
    assert.equal((await removeSavedMarkups(join(dir, "plans.pdf"))).removed, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
