import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { fileSha256, sha256 } from "./hash.js";
import { newMarkupId, saveMarkups } from "./markup.js";
import { checkSourcePdf, stampSourcePdf } from "./source-pdf.js";
import type { DrawingSet } from "../types.js";

async function pdf(path: string, pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([600, 400]);
  const bytes = Buffer.from(await doc.save());
  await writeFile(path, bytes);
  return bytes;
}

function set(hash?: string): DrawingSet {
  return {
    "@type": "DrawingSet",
    "@id": "urn:uuid:00000000-0000-4000-8000-000000000000",
    filename: "plans.pdf",
    processedDate: "2026-11-17T00:00:00Z",
    ...(hash ? { sourcePdfSha256: hash } : {}),
    sheets: [],
  };
}

test("stampSourcePdf adds the hash after filename and leaves other text alone", () => {
  const stamped = JSON.parse(stampSourcePdf(JSON.stringify({ "@id": "x", filename: "a.pdf", sheets: [] }), "ab".repeat(32))) as object;
  assert.deepEqual(Object.keys(stamped), ["@id", "filename", "sourcePdfSha256", "sheets"]);
  const existing = JSON.stringify({ filename: "a.pdf", sourcePdfSha256: "cd".repeat(32) });
  assert.equal(stampSourcePdf(existing, "ab".repeat(32)), existing, "a hash the producer wrote is kept");
  assert.equal(stampSourcePdf("not json", "ab".repeat(32)), "not json");
});

test("checkSourcePdf compares the PDF, or a markup copy's original, with the set's hash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-source-"));
  try {
    const src = join(dir, "plans.pdf");
    const bytes = await pdf(src);
    const other = join(dir, "other.pdf");
    await pdf(other, 2);
    assert.equal(await fileSha256(src), sha256(bytes));

    const data = set(sha256(bytes).toUpperCase());
    assert.deepEqual(await checkSourcePdf(data, src), { matches: true });
    assert.deepEqual(await checkSourcePdf(data, other), { matches: false });
    assert.deepEqual(await checkSourcePdf(set(), other), {}, "no hash, nothing to say");

    const copy = join(dir, "plans-markups.pdf");
    const markup = { id: newMarkupId(), kind: "cloud" as const, pageIndex: 0, sheetNumber: "A1", bbox: [10, 10, 100, 100] as [number, number, number, number], text: "x" };
    await saveMarkups({ sourcePdf: src, outPath: copy, markups: [markup], note: { op: "add", set: "Markups", text: "Added", time: "2026-11-17T00:00:00Z" } });
    assert.deepEqual(await checkSourcePdf(data, copy), { matches: true, markupCopy: true });
    assert.deepEqual(await checkSourcePdf(set(sha256(await readFile(other))), copy), { matches: false, markupCopy: true });

    // A copy made before copies recorded the original's hash is checked by the original beside it.
    const old = join(dir, "plans-markups-old.pdf");
    const oldText = (await readFile(copy)).toString("latin1").replace(/\/AECDOSourceSHA256/g, "/AECDOSourceXXX256");
    await writeFile(old, Buffer.from(oldText, "latin1"));
    assert.deepEqual(await checkSourcePdf(data, old), { matches: true, markupCopy: true });
    await writeFile(src, await readFile(other));
    assert.deepEqual(await checkSourcePdf(data, old), { matches: false, markupCopy: true }, "the original changed since");
    rmSync(src);
    assert.deepEqual(await checkSourcePdf(data, old), { markupCopy: true }, "the original is gone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
