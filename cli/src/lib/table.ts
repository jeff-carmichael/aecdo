/** Splits pipe-delimited table content into trimmed cells, one array per non-empty row. */
export function parseTable(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length > 1 && cells[0] === "" && /^\s*\|/.test(line)) cells.shift();
      if (cells.length > 1 && cells[cells.length - 1] === "" && /\|\s*$/.test(line)) cells.pop();
      return cells;
    });
}

/** Word-wraps text to a width, breaking words that don't fit on their own. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const lines: string[] = [];
  let current = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > w) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, w));
      word = word.slice(w);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= w) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

const MIN_COL = 4;

/**
 * Fits column widths into the space left after borders by shrinking the widest
 * columns first, so short columns (ids, units) keep their full width.
 */
function fitWidths(natural: number[], available: number): number[] {
  const widths = [...natural];
  let total = widths.reduce((a, b) => a + b, 0);
  while (total > available) {
    const max = Math.max(...widths);
    if (max <= MIN_COL) break;
    const i = widths.indexOf(max);
    widths[i]--;
    total--;
  }
  return widths;
}

/**
 * Draws a boxed table with padded columns. The first row is treated as the header.
 * Cells too long for `maxWidth` (the whole box, borders included) wrap onto extra lines.
 */
export function formatTable(content: string, maxWidth = 80): string[] {
  const rows = parseTable(content);
  if (rows.length === 0) return ["(empty table)"];
  const cols = Math.max(...rows.map((r) => r.length));
  const cells = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const natural = Array.from({ length: cols }, (_, i) => Math.max(1, ...cells.map((r) => r[i].length)));
  const available = maxWidth - (3 * cols + 1);
  const widths = fitWidths(natural, available);

  const rule = (l: string, m: string, r: string) => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const out = [rule("┌", "┬", "┐")];
  cells.forEach((row, ri) => {
    const wrapped = row.map((cell, i) => wrapText(cell, widths[i]));
    const height = Math.max(...wrapped.map((w) => w.length));
    for (let line = 0; line < height; line++) {
      out.push("│" + wrapped.map((w, i) => ` ${(w[line] ?? "").padEnd(widths[i])} `).join("│") + "│");
    }
    if (ri === 0 && cells.length > 1) out.push(rule("├", "┼", "┤"));
  });
  out.push(rule("└", "┴", "┘"));
  return out;
}
