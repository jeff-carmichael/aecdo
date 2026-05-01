import type { JobStatus } from "../types.js";

const isTTY = process.stderr.isTTY ?? false;
let lastLineCount = 0;

function clearLines(count: number): void {
  if (!isTTY || count === 0) return;
  for (let i = 0; i < count; i++) {
    process.stderr.write("\x1b[1A\x1b[2K");
  }
}

function write(line: string): void {
  process.stderr.write(line + "\n");
}

export function renderStatus(status: JobStatus): void {
  if (isTTY) clearLines(lastLineCount);

  const lines: string[] = [];
  const done = status.pages.filter((p) => p.status === "Done").length;
  const total = status.totalPages ?? status.pages.length;
  const errored = status.pages.filter((p) => p.status === "Error").length;

  let headline = `Status: ${status.globalStatus}`;
  if (total > 0) {
    headline += ` — ${done}/${total} pages complete`;
  }
  if (errored > 0) {
    headline += ` (${errored} failed)`;
  }
  lines.push(headline);

  for (const page of status.pages) {
    if (page.status === "Done" && page.sheetNumber) {
      const title = page.title ? ` - ${page.title}` : "";
      lines.push(`  ${page.sheetNumber}${title} ......... Done`);
    } else if (page.status === "Processing") {
      lines.push(`  Page ${page.page} .................. Processing`);
    } else if (page.status === "Error") {
      const err = page.error ? `: ${page.error}` : "";
      lines.push(`  Page ${page.page} .................. Error${err}`);
    }
  }

  if (status.agent && status.agent.status !== "Done") {
    lines.push(`  Agent: ${status.agent.status}`);
  }

  for (const line of lines) write(line);
  lastLineCount = lines.length;
}

export function renderComplete(status: JobStatus): void {
  if (isTTY) clearLines(lastLineCount);
  lastLineCount = 0;

  write(`\nProcessing complete — ${status.pages.length} pages`);
  for (const page of status.pages) {
    if (page.sheetNumber) {
      const title = page.title ? ` - ${page.title}` : "";
      write(`  ${page.sheetNumber}${title}`);
    }
  }
}

export function renderError(status: JobStatus): void {
  if (isTTY) clearLines(lastLineCount);
  lastLineCount = 0;

  write(`\nProcessing failed (${status.globalStatus})`);
  for (const page of status.pages) {
    if (page.status === "Error" && page.error) {
      write(`  Page ${page.page}: ${page.error}`);
    }
  }
  if (status.agent?.error) {
    write(`  Agent: ${status.agent.error}`);
  }
}
