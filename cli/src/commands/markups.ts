import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  MARKUP_KINDS,
  listSavedMarkups,
  markupCopyPath,
  newMarkupId,
  pdfPageSizes,
  removeSavedMarkups,
  saveMarkups,
  undoSave,
  type Markup,
  type MarkupKind,
  type SavedMarkup,
  type SaveRecord,
} from "../lib/markup.js";
import { bboxFitsPage, type BBox } from "../lib/pdf-page.js";
import type { DrawingSet, Sheet } from "../types.js";
import type { ViewTarget } from "./explore.js";

export interface MarkupRequest {
  kind: MarkupKind;
  text: string;
  /** Defaults to the current selection's box. */
  bbox?: BBox;
  /** Sheet number or page index; defaults to the current sheet. */
  sheet?: string;
  at?: [number, number];
}

export interface MarkupDeps {
  /** The source PDF, or undefined with the paths that were tried. */
  locatePdf(): { path?: string; looked: string[] };
  /** What the PDF pane outlines right now. */
  target(): ViewTarget | { error: string };
  exists?: (path: string) => boolean;
}

/**
 * Markups added in the app, by the user or the assistant. Each one is written as it's added to a
 * copy next to the source PDF (`<name>-markups.pdf`), so the PDF pane can show it right away and
 * the original is never changed.
 */
export class MarkupSession {
  private saves: SaveRecord[] = [];
  private sizes = new Map<string, { width: number; height: number }[]>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private data: DrawingSet,
    private deps: MarkupDeps
  ) {}

  private exists(path: string): boolean {
    return (this.deps.exists ?? existsSync)(path);
  }

  private sourcePdf(): string {
    const pdf = this.deps.locatePdf();
    if (!pdf.path) {
      throw new Error(`Can't find the source PDF for this drawing set (looked for ${pdf.looked.join(", ")}). Pick the PDF in the app, or start it with --pdf <file>.`);
    }
    return pdf.path;
  }

  /** The copy that holds the markups. */
  outPath(): string {
    return markupCopyPath(this.sourcePdf());
  }

  /** The copy, once it exists. */
  savedCopy(): string | undefined {
    try {
      const copy = this.outPath();
      return this.exists(copy) ? copy : undefined;
    } catch {
      return undefined;
    }
  }

  /** One change to the copy at a time, so two quick adds can't overwrite each other. */
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async pageSizes(pdf: string) {
    let sizes = this.sizes.get(pdf);
    if (!sizes) {
      sizes = await pdfPageSizes(pdf);
      this.sizes.set(pdf, sizes);
    }
    return sizes;
  }

  private findSheet(sel: string): Sheet | undefined {
    const s = sel.trim().toLowerCase();
    return (this.data.sheets ?? []).find((sh) => sh.sheetNumber.toLowerCase() === s || String(sh.pageIndex) === s);
  }

  /** Writes a markup into the copy; throws with a message the assistant can act on when it can't. */
  async add(req: MarkupRequest): Promise<Markup> {
    if (!MARKUP_KINDS.includes(req.kind)) throw new Error(`kind must be one of ${MARKUP_KINDS.join(", ")}`);
    const text = req.text.trim();
    if (!text) throw new Error("text is required: say what the markup is about");

    const target = this.deps.target();
    let sheet: Sheet | undefined;
    let bbox: BBox;
    let label: string | undefined;
    let itemId: string | undefined;
    if (req.sheet) {
      sheet = this.findSheet(req.sheet);
      if (!sheet) throw new Error(`No sheet "${req.sheet}"`);
    }
    if (req.bbox) {
      bbox = req.bbox;
    } else {
      if ("error" in target) throw new Error("Nothing is selected. Navigate to the item, table, note, drawing, or layer first, or pass a bbox.");
      if (sheet && sheet !== target.sheet) throw new Error(`The current selection is on ${target.sheet.sheetNumber}, not ${sheet.sheetNumber}; pass a bbox for that sheet.`);
      if (!target.bbox) throw new Error(`${target.label} has no bounding box; open an item or pass a bbox.`);
      ({ sheet, bbox, label, id: itemId } = { ...target, bbox: target.bbox });
    }
    sheet ??= "error" in target ? undefined : target.sheet;
    if (!sheet) throw new Error("Open a sheet first, or pass the sheet number.");
    if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
      throw new Error("bbox must be [xmin, ymin, xmax, ymax] with xmin < xmax and ymin < ymax");
    }

    const pdf = this.sourcePdf();
    const sizes = await this.pageSizes(pdf);
    const size = sizes[sheet.pageIndex];
    if (!size) throw new Error(`${basename(pdf)} has no page ${sheet.pageIndex} for sheet ${sheet.sheetNumber}.`);
    if (!bboxFitsPage(bbox, size)) {
      throw new Error(`bbox [${bbox.join(", ")}] runs past the page (${Math.round(size.width)} × ${Math.round(size.height)} pt).`);
    }

    const markup: Markup = {
      id: newMarkupId(),
      kind: req.kind,
      pageIndex: sheet.pageIndex,
      sheetNumber: sheet.sheetNumber,
      bbox,
      text,
      ...(label ? { label } : {}),
      ...(itemId ? { itemId } : {}),
      ...(req.at ? { at: req.at } : {}),
    };
    await this.write(async () => {
      this.saves.push(await saveMarkups({ sourcePdf: pdf, outPath: markupCopyPath(pdf), markups: [markup] }));
    });
    return markup;
  }

  describe(m: Markup): string {
    const where = m.label ? ` on ${m.label}` : ` at [${m.bbox.map(Math.round).join(", ")}]`;
    const text = m.text.replace(/\s+/g, " ");
    return `${m.kind} ${m.sheetNumber}${where}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text}`;
  }

  /** aecdo's markups in the copy, in page order. */
  async list(): Promise<(SavedMarkup & { sheetNumber: string; describe: string })[]> {
    const copy = this.savedCopy();
    if (!copy) return [];
    return (await listSavedMarkups(copy)).map((m) => {
      const sheetNumber = (this.data.sheets ?? []).find((s) => s.pageIndex === m.pageIndex)?.sheetNumber ?? `page ${m.pageIndex + 1}`;
      const text = m.text.replace(/\s+/g, " ");
      return { ...m, sheetNumber, describe: `${m.kind} ${sheetNumber}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text}` };
    });
  }

  /** The markups as numbered lines, for the assistant. */
  async lines(): Promise<string[]> {
    const all = await this.list();
    if (all.length === 0) return ["No markups yet."];
    return [`${all.length} in ${basename(this.outPath())}:`, ...all.map((m, i) => `${i + 1}. ${m.describe}`)];
  }

  /** Deletes markup `n` (1-based, as numbered by list()), or all of them when n is undefined. */
  async remove(n?: number): Promise<string> {
    return this.write(async () => {
      const all = await this.list();
      const copy = this.savedCopy();
      if (!copy || all.length === 0) return "There are no markups to delete.";
      const one = n === undefined ? undefined : all[n - 1];
      if (n !== undefined && !one) throw new Error(`No markup ${n}. There ${all.length === 1 ? "is" : "are"} ${all.length}.`);
      const { removed, record } = await removeSavedMarkups(copy, one ? new Set([one.name]) : undefined);
      if (record) this.saves.push(record);
      return one ? `Deleted ${one.describe}` : `Deleted ${removed} markup${removed === 1 ? "" : "s"}.`;
    });
  }

  /** Takes back the last add or delete. */
  async undo(): Promise<string> {
    return this.write(async () => {
      const record = this.saves.at(-1);
      if (!record) return "Nothing to undo.";
      await undoSave(record);
      this.saves.pop();
      return record.sizeBefore === undefined ? `Undone. ${basename(record.path)} is gone, since that markup was its first.` : "Undone.";
    });
  }
}
