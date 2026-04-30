import { output } from "../lib/output.js";
import type { DrawingSet, CommandOptions } from "../types.js";

export async function summary(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  const sheets = data.sheets ?? [];

  let totalDrawings = 0;
  let totalLayers = 0;
  let totalItems = 0;
  let totalTables = 0;
  let totalNotes = 0;
  const drawingTypes: Record<string, number> = {};
  const itemTypes: Record<string, number> = {};

  for (const s of sheets) {
    totalTables += s.tables?.length ?? 0;
    totalNotes += s.notes?.length ?? 0;

    for (const d of s.drawings ?? []) {
      totalDrawings++;
      if (d.drawingType) {
        drawingTypes[d.drawingType] = (drawingTypes[d.drawingType] || 0) + 1;
      }
      for (const l of d.layers ?? []) {
        totalLayers++;
        for (const item of l.items ?? []) {
          totalItems++;
          if (item.itemType) {
            itemTypes[item.itemType] = (itemTypes[item.itemType] || 0) + 1;
          }
        }
      }
    }
  }

  const result = {
    filename: data.filename,
    sheetCount: sheets.length,
    drawingCount: totalDrawings,
    drawingTypes,
    layerCount: totalLayers,
    itemCount: totalItems,
    itemTypes,
    tableCount: totalTables,
    noteCount: totalNotes,
  };

  if (opts.format === "json") {
    await output(result, opts);
  } else {
    console.log(`Source: ${result.filename}`);
    console.log(
      `${result.sheetCount} sheet(s), ${result.drawingCount} drawing(s), ${result.itemCount} item(s)\n`
    );

    if (Object.keys(result.drawingTypes).length > 0) {
      console.log("Drawing types:");
      for (const [type, count] of Object.entries(result.drawingTypes)) {
        console.log(`  ${type}: ${count}`);
      }
    }

    if (Object.keys(result.itemTypes).length > 0) {
      console.log("\nItem types:");
      for (const [type, count] of Object.entries(result.itemTypes)) {
        console.log(`  ${type}: ${count}`);
      }
    }

    if (result.tableCount > 0 || result.noteCount > 0) {
      console.log("");
      if (result.tableCount > 0) console.log(`Tables: ${result.tableCount}`);
      if (result.noteCount > 0) console.log(`Notes: ${result.noteCount}`);
    }
  }
}
