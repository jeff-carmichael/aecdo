import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { DrawingSet } from "../types.js";

export type BBox = [number, number, number, number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfCandidate {
  path: string;
  /** Why this path was tried, for the "can't find the PDF" message. */
  reason: string;
}

/**
 * Where to look for the PDF a JSON-LD file came from: an explicit path, `plans.pdf` next to
 * `plans.jsonld` (what `aecdo process` writes), or the set's `filename` next to the JSON-LD or
 * in the current folder.
 */
export function sourcePdfCandidatesWithReasons(jsonldPath: string, data: DrawingSet, explicit?: string, cwd = process.cwd()): PdfCandidate[] {
  const out: PdfCandidate[] = [];
  const isFile = !jsonldPath.startsWith("job:");
  if (explicit) {
    out.push({ path: resolve(cwd, explicit), reason: "the PDF you named, from the current folder" });
    if (isFile && !isAbsolute(explicit)) out.push({ path: join(dirname(jsonldPath), explicit), reason: "the PDF you named, next to the .jsonld" });
    return unique(out);
  }
  if (isFile) {
    const stem = join(dirname(jsonldPath), basename(jsonldPath, extname(jsonldPath)));
    const reason = `same name as ${basename(jsonldPath)}`;
    out.push({ path: `${stem}.pdf`, reason }, { path: `${stem}.PDF`, reason });
  }
  if (data.filename) {
    const name = basename(data.filename);
    const reason = `the set's "filename"`;
    if (isFile) out.push({ path: join(dirname(jsonldPath), name), reason: `${reason}, next to the .jsonld` });
    out.push({ path: resolve(cwd, name), reason: `${reason}, in the current folder` });
  }
  return unique(out);
}

function unique(candidates: PdfCandidate[]): PdfCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => !seen.has(c.path) && seen.add(c.path));
}

export function sourcePdfCandidates(jsonldPath: string, data: DrawingSet, explicit?: string, cwd = process.cwd()): string[] {
  return sourcePdfCandidatesWithReasons(jsonldPath, data, explicit, cwd).map((c) => c.path);
}

export function findSourcePdf(candidates: string[], exists: (p: string) => boolean = existsSync): string | undefined {
  return candidates.find((p) => exists(p));
}

/**
 * Converts a bbox measured in PDF points from the top-left of the page as displayed (crop box,
 * after /Rotate) into the page's own user-space rectangle, which is what drawing operators use.
 */
export function bboxToUserSpace(bbox: BBox, page: Box, rotation: number): Box {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const { x, y, width: w, height: h } = page;
  const map = (u: number, v: number): [number, number] => {
    switch (r) {
      case 90:
        return [x + v, y + u];
      case 180:
        return [x + w - u, y + v];
      case 270:
        return [x + w - v, y + h - u];
      default:
        return [x + u, y + h - v];
    }
  };
  const [ax, ay] = map(bbox[0], bbox[1]);
  const [bx, by] = map(bbox[2], bbox[3]);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Size of the page as displayed, in points. */
export function displaySize(page: Box, rotation: number): { width: number; height: number } {
  const turned = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return turned ? { width: page.height, height: page.width } : { width: page.width, height: page.height };
}

export function bboxFitsPage(bbox: BBox, size: { width: number; height: number }, slack = 1): boolean {
  return bbox[0] >= -slack && bbox[1] >= -slack && bbox[2] <= size.width + slack && bbox[3] <= size.height + slack;
}

export function unionBBox(boxes: (BBox | undefined)[]): BBox | undefined {
  const present = boxes.filter((b): b is BBox => Array.isArray(b) && b.length === 4);
  if (present.length === 0) return undefined;
  return [
    Math.min(...present.map((b) => b[0])),
    Math.min(...present.map((b) => b[1])),
    Math.max(...present.map((b) => b[2])),
    Math.max(...present.map((b) => b[3])),
  ];
}
