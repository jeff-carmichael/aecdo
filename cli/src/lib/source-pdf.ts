import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileSha256 } from "./hash.js";
import { readMarkupCopyInfo } from "./markup.js";
import type { DrawingSet } from "../types.js";

/**
 * Adds `sourcePdfSha256` (right after `filename`) to a set's JSON text, unless it already has one.
 * Text that isn't a JSON object comes back unchanged.
 */
export function stampSourcePdf(content: string, pdfHash: string): string {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return content;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || "sourcePdfSha256" in data) return content;
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(data)) {
    out[key] = value;
    if (key === "filename") {
      out.sourcePdfSha256 = pdfHash;
      placed = true;
    }
  }
  if (!placed) out.sourcePdfSha256 = pdfHash;
  return JSON.stringify(out, null, 2);
}

export interface PdfMatch {
  /** Undefined when there's nothing to compare: the set has no `sourcePdfSha256`, or an old markup copy doesn't say what it came from. */
  matches?: boolean;
  /** True when the file is an aecdo markup copy, checked by the original it was copied from. */
  markupCopy?: boolean;
}

/**
 * Whether `pdfPath` is the PDF the set was made from. A markup copy is checked by the original's hash
 * it recorded when it was made; an older copy that didn't record it, by its original next to it.
 */
export async function checkSourcePdf(data: DrawingSet, pdfPath: string): Promise<PdfMatch> {
  const expected = data.sourcePdfSha256?.toLowerCase();
  if (!expected) return {};
  const info = readMarkupCopyInfo(pdfPath);
  if (!info.set && !info.sourceSha256) return { matches: (await fileSha256(pdfPath)) === expected };
  if (info.sourceSha256) return { matches: info.sourceSha256.toLowerCase() === expected, markupCopy: true };
  const original = info.source ? join(dirname(pdfPath), basename(info.source)) : undefined;
  if (!original || !existsSync(original)) return { markupCopy: true };
  return { matches: (await fileSha256(original)) === expected, markupCopy: true };
}
