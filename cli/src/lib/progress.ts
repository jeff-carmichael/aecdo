import type { JobStatus, PageStatus } from "../types.js";
import { paletteFor, PLAIN } from "./style.js";
import type { Palette } from "./style.js";
import { formatDuration, LiveRegion, padEnd, progressBar, spinnerFrame, symbols, textWidth } from "./tui.js";
import type { Symbols } from "./tui.js";

export interface StatusLineOptions {
  /** Time since the job started; shown after the bar. */
  elapsedMs?: number;
  /** Spinner frame; omit for a still snapshot. */
  frame?: number;
  /** Most page rows to show; earlier finished pages fold into one line. */
  maxRows?: number;
  palette?: Palette;
  symbols?: Symbols;
}

function counts(status: JobStatus) {
  const done = status.pages.filter((p) => p.status === "Done").length;
  const failed = status.pages.filter((p) => p.status === "Error").length;
  const total = status.totalPages ?? status.pages.length;
  return { done, failed, total };
}

function headlineLabel(status: JobStatus): string {
  if (status.globalStatus === "Pending") return "Waiting to start";
  if (status.globalStatus === "Processing") {
    const { done, failed, total } = counts(status);
    return total > 0 && done + failed >= total && status.agent?.status !== "Done" ? "Finishing up" : "Processing";
  }
  return status.globalStatus;
}

/** The live view of a job: a headline with a progress bar, then a row per started page. */
export function statusLines(status: JobStatus, opts: StatusLineOptions = {}): string[] {
  const { frame, maxRows = 12, palette: c = PLAIN, symbols: sym = symbols() } = opts;
  const { done, failed, total } = counts(status);
  const spin = frame === undefined ? sym.pointer : spinnerFrame(frame, sym);
  const sep = c.dim(` ${sym.sep} `);

  let headline = `${c.accent(spin)} ${c.bold(headlineLabel(status))}`;
  if (total > 0) headline += `  ${progressBar(done, total, 20, c, sym)} ${done}/${total} pages`;
  if (failed > 0) headline += sep + c.error(`${failed} failed`);
  if (opts.elapsedMs !== undefined) headline += sep + c.dim(formatDuration(opts.elapsedMs));

  const started = status.pages.filter((p) => p.status !== "Pending");
  const numberWidth = Math.max(0, ...started.map((p) => textWidth(pageName(p))));
  const row = (p: PageStatus): string => {
    const name = padEnd(pageName(p), numberWidth);
    if (p.status === "Done") return `  ${c.ok(sym.ok)} ${c.bold(name)}  ${p.title ?? ""}`.trimEnd();
    if (p.status === "Error") return `  ${c.error(sym.error)} ${c.bold(name)}  ${c.error(p.error ?? "failed")}`;
    return `  ${c.accent(spin)} ${c.bold(name)}  ${c.dim("processing")}`;
  };

  let rows = started;
  let folded = 0;
  while (rows.length > maxRows) {
    const firstDone = rows.findIndex((p) => p.status === "Done");
    if (firstDone < 0) break;
    rows = rows.filter((_, i) => i !== firstDone);
    folded++;
  }

  const lines = [headline];
  if (folded > 0) lines.push(`  ${c.ok(sym.ok)} ${c.dim(`${folded} earlier ${folded === 1 ? "page" : "pages"} done`)}`);
  lines.push(...rows.map(row));
  if (status.agent && status.agent.status === "Processing") {
    lines.push(`  ${c.accent(spin)} ${c.dim("assembling the drawing set")}`);
  }
  return lines;
}

function pageName(p: PageStatus): string {
  return p.sheetNumber || `Page ${p.page}`;
}

/** What stays on screen once a job finishes. */
export function completeLines(status: JobStatus, elapsedMs?: number, c: Palette = PLAIN, sym: Symbols = symbols()): string[] {
  const time = elapsedMs === undefined ? "" : ` in ${formatDuration(elapsedMs)}`;
  const sheets = status.pages.filter((p) => p.sheetNumber);
  const width = Math.max(0, ...sheets.map((p) => textWidth(p.sheetNumber!)));
  return [
    `${c.ok(sym.ok)} ${c.bold(`Processed ${status.pages.length} ${status.pages.length === 1 ? "page" : "pages"}`)}${c.dim(time)}`,
    ...sheets.map((p) => `    ${c.bold(padEnd(p.sheetNumber!, width))}  ${p.title ?? ""}`.trimEnd()),
  ];
}

export function errorLines(status: JobStatus, c: Palette = PLAIN, sym: Symbols = symbols()): string[] {
  const lines = [`${c.error(sym.error)} ${c.bold(`Processing failed (${status.globalStatus})`)}`];
  for (const page of status.pages) {
    if (page.status === "Error" && page.error) lines.push(`    ${c.bold(`Page ${page.page}`)}  ${c.error(page.error)}`);
  }
  if (status.agent?.error) lines.push(`    ${c.bold("Agent")}  ${c.error(status.agent.error)}`);
  return lines;
}

function plainHeadline(status: JobStatus): string {
  const { done, failed, total } = counts(status);
  let line = `Status: ${headlineLabel(status)}`;
  if (total > 0) line += ` — ${done}/${total} pages complete`;
  if (failed > 0) line += ` (${failed} failed)`;
  return line;
}

/**
 * Shows a job's progress on stderr. In a terminal it redraws in place with a
 * spinner and timer; otherwise it prints one line each time the counts change.
 */
export class ProgressView {
  private region: LiveRegion;
  private c: Palette;
  private sym = symbols();
  private tty: boolean;
  private status?: JobStatus;
  private frame = 0;
  private timer?: NodeJS.Timeout;
  private started = Date.now();
  private lastLine = "";

  constructor(private out: NodeJS.WriteStream = process.stderr) {
    this.region = new LiveRegion(out);
    this.c = paletteFor(out);
    this.tty = Boolean(out.isTTY);
  }

  update(status: JobStatus): void {
    this.status = status;
    const start = status.startTime ? Date.parse(status.startTime) : NaN;
    if (!Number.isNaN(start) && start <= Date.now()) this.started = start;
    if (!this.tty) {
      const line = plainHeadline(status);
      if (line !== this.lastLine) this.out.write(line + "\n");
      this.lastLine = line;
      return;
    }
    this.draw();
    if (!this.timer) {
      this.timer = setInterval(() => this.draw(), 80);
      this.timer.unref();
    }
  }

  /** Prints the status once, without a spinner, for "aecdo status" without --wait. */
  snapshot(status: JobStatus): void {
    const lines = statusLines(status, { palette: this.c, symbols: this.sym, maxRows: Number.MAX_SAFE_INTEGER });
    this.out.write(lines.map((l) => l + "\n").join(""));
  }

  complete(status: JobStatus): void {
    this.finish(completeLines(status, this.elapsed(), this.c, this.sym));
  }

  fail(status: JobStatus): void {
    this.finish(errorLines(status, this.c, this.sym));
  }

  private elapsed(): number {
    return Date.now() - this.started;
  }

  private draw(): void {
    if (!this.status) return;
    const maxRows = Math.max(1, this.region.rows - 3);
    this.region.render(
      statusLines(this.status, { elapsedMs: this.elapsed(), frame: this.frame++, maxRows, palette: this.c, symbols: this.sym })
    );
  }

  private finish(lines: string[]): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.tty) this.region.done(lines);
    else this.out.write(lines.map((l) => l + "\n").join(""));
  }
}
