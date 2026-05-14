import { output } from "../lib/output.js";
import type { DrawingSet, CommandOptions } from "../types.js";

export async function sheets(data: DrawingSet, _filePath: string, opts: CommandOptions = {}): Promise<void> {
  const list = (data.sheets ?? []).map((s) => ({
    sheetNumber: s.sheetNumber,
    title: s.title,
    pageIndex: s.pageIndex,
    id: s["@id"],
  }));

  if (opts.format === "json") {
    await output(list, opts);
    return;
  }

  if (list.length === 0) {
    console.log("No sheets found.");
    return;
  }

  for (const s of list) {
    console.log(`  ${s.sheetNumber} - ${s.title} (page ${s.pageIndex})`);
  }
}
