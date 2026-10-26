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
  type SaveRecord,
} from "../lib/markup.js";
import { bboxFitsPage, type BBox } from "../lib/page-view.js";
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
  /** What "view" would outline right now. */
  target(): ViewTarget | { error: string };
  log?: (line?: string) => void;
  confirm?: (question: string) => Promise<boolean>;
  exists?: (path: string) => boolean;
}

/** Parses "markups", "markups save --in-place", "markups drop 2", … */
export function parseMarkupsCommand(input: string): { action: string; args: string[] } | null {
  const words = input.trim().split(/\s+/);
  if (!/^\/?markups?$/i.test(words[0] ?? "")) return null;
  return { action: (words[1] ?? "list").toLowerCase(), args: words.slice(2) };
}

const MARKUPS_HELP = [
  '  "markups" lists pending markups and the ones saved in the PDF.',
  '  "markups save" writes pending markups to <name>-markups.pdf (add --in-place for the original PDF).',
  '  "markups undo" takes back the last save, "markups drop <n>" or "markups clear" discards pending ones.',
  '  "markups remove" deletes every markup aecdo added from the saved PDF (add --in-place for the original).',
];

/**
 * Markups the assistant proposes in explore. Nothing touches a PDF until the user types "markups save";
 * saving appends to a copy next to the original unless --in-place is given.
 */
export class MarkupSession {
  readonly pending: Markup[] = [];
  private saves: SaveRecord[] = [];
  private sizes = new Map<string, { width: number; height: number }[]>();

  constructor(
    private data: DrawingSet,
    private deps: MarkupDeps
  ) {}

  private log(line = ""): void {
    (this.deps.log ?? console.log)(line);
  }

  private exists(path: string): boolean {
    return (this.deps.exists ?? existsSync)(path);
  }

  private sourcePdf(): string {
    const pdf = this.deps.locatePdf();
    if (!pdf.path) {
      throw new Error(`Can't find the source PDF for this drawing set (looked for ${pdf.looked.join(", ")}). Start explore with --pdf <file> or type "view <path>".`);
    }
    return pdf.path;
  }

  /** Where saves go: the copy next to the PDF, or the PDF itself. */
  outPath(inPlace = false): string {
    const src = this.sourcePdf();
    return inPlace ? src : markupCopyPath(src);
  }

  /** The PDF that already holds saved markups, for "view". */
  savedCopy(): string | undefined {
    try {
      const copy = this.outPath();
      return this.exists(copy) ? copy : undefined;
    } catch {
      return undefined;
    }
  }

  pendingOn(pageIndex: number): Markup[] {
    return this.pending.filter((m) => m.pageIndex === pageIndex);
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

  /** Adds a pending markup; throws with a message the assistant can act on when it can't. */
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
    this.pending.push(markup);
    return markup;
  }

  drop(index: number): Markup {
    const [m] = index >= 1 && index <= this.pending.length ? this.pending.splice(index - 1, 1) : [];
    if (!m) throw new Error(`No pending markup ${index}. There ${this.pending.length === 1 ? "is" : "are"} ${this.pending.length}.`);
    return m;
  }

  describe(m: Markup): string {
    const where = m.label ? ` on ${m.label}` : ` at [${m.bbox.map(Math.round).join(", ")}]`;
    const text = m.text.replace(/\s+/g, " ");
    return `${m.kind} ${m.sheetNumber}${where}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text}`;
  }

  /** Pending and saved markups, as lines. */
  async listing(): Promise<string[]> {
    const lines: string[] = [];
    if (this.pending.length) {
      lines.push(`Pending (not saved yet):`);
      this.pending.forEach((m, i) => lines.push(`  ${i + 1}. ${this.describe(m)}`));
    } else {
      lines.push("No pending markups.");
    }
    for (const inPlace of [false, true]) {
      let path: string;
      try {
        path = this.outPath(inPlace);
      } catch {
        break;
      }
      if (!this.exists(path)) continue;
      const saved = await listSavedMarkups(path);
      if (inPlace && saved.length === 0) continue;
      lines.push(`Saved in ${basename(path)}: ${saved.length}`);
      const sheetFor = (i: number) => (this.data.sheets ?? []).find((s) => s.pageIndex === i)?.sheetNumber ?? `page ${i}`;
      for (const s of saved.slice(0, 50)) lines.push(`  - ${s.kind} ${sheetFor(s.pageIndex)}: ${s.text.replace(/\s+/g, " ").slice(0, 70)}`);
      if (saved.length > 50) lines.push(`  … and ${saved.length - 50} more`);
    }
    return lines;
  }

  async save(inPlace = false): Promise<string> {
    if (this.pending.length === 0) return "No pending markups to save.";
    const out = this.outPath(inPlace);
    const record = await saveMarkups({ sourcePdf: this.sourcePdf(), outPath: out, markups: this.pending });
    this.saves.push(record);
    this.pending.length = 0;
    const note = record.rewritten ? " (the PDF's structure needed a full rewrite, so any digital signature in the copy is no longer valid)" : "";
    return `Saved ${record.count} markup${record.count === 1 ? "" : "s"} to ${out}${note}. "markups undo" takes them back.`;
  }

  async undo(): Promise<string> {
    const record = this.saves.at(-1);
    if (!record) return "Nothing to undo in this session.";
    await undoSave(record);
    this.saves.pop();
    return record.sizeBefore === undefined
      ? `Deleted ${basename(record.path)}, which the last save created.`
      : `Took back the last change to ${basename(record.path)} (${record.count} markup${record.count === 1 ? "" : "s"}).`;
  }

  async remove(inPlace = false): Promise<string> {
    const path = this.outPath(inPlace);
    if (!this.exists(path)) return `${basename(path)} doesn't exist, so there's nothing to remove.`;
    const saved = await listSavedMarkups(path);
    if (saved.length === 0) return `${basename(path)} has no markups from aecdo.`;
    const ok = await (this.deps.confirm ?? (() => Promise.resolve(false)))(
      `Remove ${saved.length} aecdo markup${saved.length === 1 ? "" : "s"} from ${basename(path)}? Other people's markups stay. [y/N] `
    );
    if (!ok) return "Nothing removed.";
    const { removed, record } = await removeSavedMarkups(path);
    if (record) this.saves.push(record);
    return `Removed ${removed} markup${removed === 1 ? "" : "s"} from ${basename(path)}. "markups undo" puts them back.`;
  }

  /** Runs a "markups …" command typed in explore. */
  async run(action: string, args: string[]): Promise<void> {
    const inPlace = args.includes("--in-place");
    try {
      switch (action) {
        case "list":
        case "ls":
          for (const line of await this.listing()) this.log(line);
          break;
        case "save":
          this.log(await this.save(inPlace));
          break;
        case "undo":
          this.log(await this.undo());
          break;
        case "remove":
          this.log(await this.remove(inPlace));
          break;
        case "drop": {
          const m = this.drop(Number(args[0]));
          this.log(`Dropped ${this.describe(m)}`);
          break;
        }
        case "clear": {
          const count = this.pending.length;
          this.pending.length = 0;
          this.log(`Discarded ${count} pending markup${count === 1 ? "" : "s"}.`);
          break;
        }
        default:
          for (const line of MARKUPS_HELP) this.log(line);
      }
    } catch (err) {
      this.log((err as Error).message);
    }
  }

  /** Before quitting: offers to save what's pending. */
  async beforeQuit(): Promise<void> {
    if (this.pending.length === 0 || !this.deps.confirm) return;
    let out: string;
    try {
      out = this.outPath();
    } catch {
      return;
    }
    const n = this.pending.length;
    if (await this.deps.confirm(`Save ${n} pending markup${n === 1 ? "" : "s"} to ${basename(out)} before quitting? [y/N] `)) {
      try {
        this.log(await this.save());
      } catch (err) {
        this.log((err as Error).message);
      }
    }
  }
}
