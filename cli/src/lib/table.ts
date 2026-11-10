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
