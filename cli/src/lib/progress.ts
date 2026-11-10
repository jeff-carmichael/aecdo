import type { JobStatus, PageStatus } from "../types.js";

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

function pageName(p: PageStatus): string {
  return p.sheetNumber || `Page ${p.page}`;
}

/** One line: "Status: Processing, 3/10 pages done (1 failed)". */
export function statusLine(status: JobStatus): string {
  const { done, failed, total } = counts(status);
  let line = `Status: ${headlineLabel(status)}`;
  if (total > 0) line += `, ${done}/${total} pages done`;
  if (failed > 0) line += ` (${failed} failed)`;
  return line;
}

/** The status line, then a line per started page, for "aecdo status" without --wait. */
export function statusLines(status: JobStatus): string[] {
  const started = status.pages.filter((p) => p.status !== "Pending");
  const width = Math.max(0, ...started.map((p) => pageName(p).length));
  return [
    statusLine(status),
    ...started.map((p) => {
      const what = p.status === "Done" ? (p.title ?? "") : p.status === "Error" ? `failed: ${p.error ?? "unknown error"}` : "processing";
      return `  ${pageName(p).padEnd(width)}  ${what}`.trimEnd();
    }),
  ];
}

/** What's printed once a job finishes. */
export function completeLines(status: JobStatus): string[] {
  const sheets = status.pages.filter((p) => p.sheetNumber);
  const width = Math.max(0, ...sheets.map((p) => p.sheetNumber!.length));
  return [
    `Processed ${status.pages.length} ${status.pages.length === 1 ? "page" : "pages"}`,
    ...sheets.map((p) => `  ${p.sheetNumber!.padEnd(width)}  ${p.title ?? ""}`.trimEnd()),
  ];
}

export function errorLines(status: JobStatus): string[] {
  const lines = [`Processing failed (${status.globalStatus})`];
  for (const page of status.pages) {
    if (page.status === "Error" && page.error) lines.push(`  Page ${page.page}  ${page.error}`);
  }
  if (status.agent?.error) lines.push(`  Agent  ${status.agent.error}`);
  return lines;
}

/** Reports a job's progress on stderr: one line each time the counts change. */
export class JobProgress {
  private last = "";

  constructor(private out: NodeJS.WritableStream = process.stderr) {}

  update(status: JobStatus): void {
    const line = statusLine(status);
    if (line !== this.last) this.out.write(line + "\n");
    this.last = line;
  }

  complete(status: JobStatus): void {
    this.out.write(completeLines(status).map((l) => l + "\n").join(""));
  }

  fail(status: JobStatus): void {
    this.out.write(errorLines(status).map((l) => l + "\n").join(""));
  }
}
