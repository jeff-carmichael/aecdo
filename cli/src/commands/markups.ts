import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  DEFAULT_MARKUP_SET,
  MARKUP_KINDS,
  listSavedMarkups,
  markupCopyPath,
  markupHistory,
  markupSetFiles,
  markupSetSlug,
  newMarkupId,
  pdfPageSizes,
  removeSavedMarkups,
  renameMarkups,
  restoreMarkups,
  saveMarkups,
  undoSave,
  type HistoryStep,
  type Markup,
  type MarkupKind,
  type RevisionNote,
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
  /** The markup set to add it to, by name; started if it's new, and shown from then on. */
  set?: string;
}

export interface MarkupSet {
  /** "" for the default set. */
  slug: string;
  name: string;
  /** The copy's file name. */
  file: string;
  /** False until its first markup is added. */
  exists: boolean;
  current: boolean;
}

export interface HistoryEntry {
  /** 1 is the oldest change; 0 is the PDF before any of them. */
  step: number;
  text: string;
  time?: string;
  current: boolean;
}

/** Quick picks when starting a set. */
export const SUGGESTED_SETS = ["Code review", "Coordination", "QA"];

export interface MarkupDeps {
  /** The source PDF, or undefined with the paths that were tried. */
  locatePdf(): { path?: string; looked: string[] };
  /** What the PDF pane outlines right now. */
  target(): ViewTarget | { error: string };
  exists?: (path: string) => boolean;
  now?: () => Date;
}

const slugTitle = (slug: string) => (slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ") : DEFAULT_MARKUP_SET);

/**
 * Markups added in the app, by the user or the assistant, in named sets (one per purpose, such as
 * code review or QA). Each markup is written as it's added to the set's copy next to the source PDF
 * (`<name>-markups.pdf`, `<name>-markups-<set>.pdf`), so the PDF pane can show it right away and the
 * original is never changed. Every change also notes what it did in the copy, which is its history.
 */
export class MarkupSession {
  private saves: (SaveRecord & { renamedFrom?: string })[] = [];
  private sizes = new Map<string, { width: number; height: number }[]>();
  private queue: Promise<unknown> = Promise.resolve();
  /** The set new markups go to; undefined until first asked, then the most recently changed one. */
  private slug?: string;
  /** Names of sets, by slug, including ones started but still empty. */
  private names = new Map<string, string>();
  private nameCache = new Map<string, { key: string; name?: string }>();

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

  /** The copy that holds the current set's markups. */
  outPath(): string {
    return markupCopyPath(this.sourcePdf(), this.currentSlug());
  }

  private currentSlug(): string {
    if (this.slug !== undefined) return this.slug;
    const pdf = this.deps.locatePdf().path;
    if (!pdf) return "";
    return (this.slug = this.setFiles(pdf).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.slug ?? "");
  }

  private setFiles(pdf: string) {
    return markupSetFiles(pdf).filter((f) => this.exists(f.path));
  }

  /** The name the set's copy says it has (its latest change notes it), read once per version of the file. */
  private storedName(path: string): string | undefined {
    try {
      const st = statSync(path);
      const key = `${st.size}:${st.mtimeMs}`;
      const hit = this.nameCache.get(path);
      if (hit?.key === key) return hit.name;
      const name = markupHistory(readFileSync(path)).steps.reduce<string | undefined>((last, s) => s.set ?? last, undefined);
      this.nameCache.set(path, { key, name });
      return name;
    } catch {
      return undefined;
    }
  }

  private nameOf(slug: string, path?: string): string {
    return this.names.get(slug) ?? (path ? this.storedName(path) : undefined) ?? slugTitle(slug);
  }

  /** The current set's name. */
  setName(): string {
    const slug = this.currentSlug();
    const pdf = this.deps.locatePdf().path;
    return this.nameOf(slug, pdf ? markupCopyPath(pdf, slug) : undefined);
  }

  /** Every set: those with a copy next to the PDF, plus ones started this session, current first-ish by name. */
  sets(): MarkupSet[] {
    const pdf = this.deps.locatePdf().path;
    if (!pdf) return [];
    const current = this.currentSlug();
    const bySlug = new Map<string, MarkupSet>();
    const put = (slug: string, exists: boolean) => {
      const path = markupCopyPath(pdf, slug);
      bySlug.set(slug, { slug, name: this.nameOf(slug, exists ? path : undefined), file: basename(path), exists, current: slug === current });
    };
    for (const f of this.setFiles(pdf)) put(f.slug, true);
    for (const slug of [...this.names.keys(), current]) if (!bySlug.has(slug)) put(slug, false);
    return [...bySlug.values()].sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : a.name.localeCompare(b.name)));
  }

  private findSet(name: string): MarkupSet | undefined {
    const slug = markupSetSlug(name);
    const want = name.trim().toLowerCase();
    return this.sets().find((s) => s.slug === slug || s.name.toLowerCase() === want);
  }

  /** Switches to the set called `name`, starting it if there isn't one. Its copy is made with its first markup. */
  useSet(name: string): MarkupSet {
    const trimmed = name.trim().replace(/\s+/g, " ");
    const slug = markupSetSlug(trimmed);
    if (!trimmed || (!slug && trimmed.toLowerCase() !== DEFAULT_MARKUP_SET.toLowerCase())) {
      throw new Error("Give the set a name with some letters or numbers, e.g. \"Code review\".");
    }
    this.sourcePdf();
    const found = this.findSet(trimmed);
    if (found) {
      this.slug = found.slug;
    } else {
      this.slug = slug;
      this.names.set(slug, trimmed);
    }
    return this.sets().find((s) => s.current)!;
  }

  /** Renames the current set: its copy's file, and the set name kept on each of its markups. */
  renameSet(name: string): Promise<string> {
    return this.write(async () => {
      const trimmed = name.trim().replace(/\s+/g, " ");
      const slug = markupSetSlug(trimmed);
      if (!trimmed || (!slug && trimmed.toLowerCase() !== DEFAULT_MARKUP_SET.toLowerCase())) throw new Error("Give the set a name with some letters or numbers.");
      const pdf = this.sourcePdf();
      const from = this.currentSlug();
      const oldName = this.setName();
      const fromPath = markupCopyPath(pdf, from);
      const toPath = markupCopyPath(pdf, slug);
      if (slug !== from && (this.exists(toPath) || this.names.has(slug))) throw new Error(`There's already a set called ${this.nameOf(slug, toPath)}.`);
      this.names.delete(from);
      this.names.set(slug, trimmed);
      this.slug = slug;
      if (!this.exists(fromPath)) return `Renamed ${oldName} to ${trimmed}.`;
      const record = await renameMarkups(fromPath, slug ? trimmed : undefined, this.note("rename", `Renamed the set from ${oldName} to ${trimmed}`));
      if (toPath !== fromPath) {
        renameSync(fromPath, toPath);
        for (const r of this.saves) if (r.path === fromPath) r.path = toPath;
        this.saves.push({ ...record, path: toPath, renamedFrom: fromPath });
      } else {
        this.saves.push(record);
      }
      return `Renamed ${oldName} to ${trimmed}${toPath !== fromPath ? `; its file is now ${basename(toPath)}` : ""}.`;
    });
  }

  /** Call when the source PDF changes: its sets are found afresh. */
  forgetSets(): void {
    this.slug = undefined;
    this.names.clear();
  }

  private note(op: RevisionNote["op"], text: string): RevisionNote {
    return { op, set: this.setName(), text, time: (this.deps.now?.() ?? new Date()).toISOString() };
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

  /**
   * Writes a markup into the copy; throws with a message the assistant can act on when it can't.
   * Markups land in the order add() was called, each on the selection at the time of its call.
   */
  async add(req: MarkupRequest): Promise<Markup> {
    if (req.set) this.useSet(req.set);
    const target = this.deps.target();
    return await this.write(() => this.place(req, target));
  }

  private async place(req: MarkupRequest, target: ViewTarget | { error: string }): Promise<Markup> {
    if (!MARKUP_KINDS.includes(req.kind)) throw new Error(`kind must be one of ${MARKUP_KINDS.join(", ")}`);
    const text = req.text.trim();
    if (!text) throw new Error("text is required: say what the markup is about");

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
      ...(this.currentSlug() ? { set: this.setName() } : {}),
    };
    const outPath = markupCopyPath(pdf, this.currentSlug());
    this.saves.push(await saveMarkups({ sourcePdf: pdf, outPath, markups: [markup], note: this.note("add", `Added ${this.describe(markup)}`) }));
    this.names.delete(this.currentSlug());
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
    const others = this.sets().filter((s) => !s.current).map((s) => s.name);
    const head = `Set: ${this.setName()} (${basename(this.outPath())}).${others.length ? ` Other sets: ${others.join(", ")}.` : ""}`;
    if (all.length === 0) return [head, "No markups in this set yet."];
    return [head, `${all.length} markup${all.length === 1 ? "" : "s"}:`, ...all.map((m, i) => `${i + 1}. ${m.describe}`)];
  }

  /** Deletes markup `n` (1-based, as numbered by list()), or all of them when n is undefined. */
  async remove(n?: number): Promise<string> {
    return this.write(async () => {
      const all = await this.list();
      const copy = this.savedCopy();
      if (!copy || all.length === 0) return "There are no markups to delete.";
      const one = n === undefined ? undefined : all[n - 1];
      if (n !== undefined && !one) throw new Error(`No markup ${n}. There ${all.length === 1 ? "is" : "are"} ${all.length}.`);
      const text = one ? `Deleted ${one.describe}` : `Deleted all ${all.length} markup${all.length === 1 ? "" : "s"}`;
      const { removed, record } = await removeSavedMarkups(copy, one ? new Set([one.name]) : undefined, this.note("delete", text));
      if (record) this.saves.push(record);
      return one ? `Deleted ${one.describe}` : `Deleted ${removed} markup${removed === 1 ? "" : "s"}.`;
    });
  }

  /** The current set's changes, newest first, ending with the PDF before them. */
  async history(): Promise<{ steps: HistoryEntry[]; note?: string }> {
    const copy = this.savedCopy();
    if (!copy) return { steps: [] };
    const bytes = await readFile(copy);
    const { start, steps } = markupHistory(bytes);
    if (start === undefined) {
      return { steps: [], note: `${basename(copy)} has no history of changes: it was made before aecdo kept one, or another program re-saved the whole file. History starts again with the next change.` };
    }
    const latest = steps.at(-1)?.end;
    const entries: HistoryEntry[] = steps.map((s, i) => ({
      step: i + 1,
      text: s.outside ? "Edited in another program" : (s.text ?? s.op ?? "Change"),
      ...(s.time ? { time: s.time } : {}),
      current: s.end === latest && bytes.length - s.end < 3,
    }));
    let original = false;
    try {
      original = Math.abs(statSync(this.sourcePdf()).size - start) <= 1;
    } catch {
      // the source PDF moved; the label just stays generic
    }
    entries.unshift({ step: 0, text: original ? "The original PDF, before any markups" : "Before these changes", current: false });
    return { steps: entries.reverse() };
  }

  /** Brings back the current set's markups as they were after `step` (0: before any), as a new change. */
  restore(step: number): Promise<string> {
    return this.write(async () => {
      const copy = this.savedCopy();
      if (!copy) return "This set has no history yet.";
      const { start, steps } = markupHistory(await readFile(copy));
      const target: HistoryStep | undefined = step === 0 && start !== undefined ? { end: start } : steps[step - 1];
      if (!target || !Number.isInteger(step)) throw new Error(`No step ${step} in this set's history.`);
      const label = step === 0 ? "before any of these changes" : `step ${step}`;
      const { count, record } = await restoreMarkups(copy, target.end, this.note("restore", `Went back to ${label}`));
      if (!record) return `The markups are already as they were at ${label}.`;
      this.saves.push(record);
      return `Went back to ${label}: ${count} markup${count === 1 ? "" : "s"}. Undo takes this back.`;
    });
  }

  /** Takes back the current set's last change. */
  async undo(): Promise<string> {
    return this.write(async () => {
      const path = this.outPath();
      let i = this.saves.length - 1;
      while (i >= 0 && this.saves[i].path !== path) i--;
      const record = this.saves[i];
      if (!record) return "Nothing to undo.";
      await undoSave(record);
      this.saves.splice(i, 1);
      if (record.renamedFrom) {
        renameSync(record.path, record.renamedFrom);
        for (const r of this.saves) if (r.path === record.path) r.path = record.renamedFrom;
        this.slug = this.setFiles(this.sourcePdf()).find((f) => f.path === record.renamedFrom)?.slug ?? this.slug;
        this.names.delete(this.slug ?? "");
        return `Undone. The set is called ${this.setName()} again.`;
      }
      return record.sizeBefore === undefined ? `Undone. ${basename(record.path)} is gone, since that markup was its first.` : "Undone.";
    });
  }
}
