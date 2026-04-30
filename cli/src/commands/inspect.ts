import { output } from "../lib/output.js";
import type { DrawingSet, CommandOptions } from "../types.js";

interface LayerInfo {
  name: string;
  itemCount: number;
}

interface DrawingInfo {
  id: string;
  title: string;
  drawingType?: string;
  scale?: string;
  layerCount: number;
  itemCount: number;
  layers: LayerInfo[];
}

interface SheetInfo {
  id: string;
  sheetNumber: string;
  title: string;
  pageIndex: number;
  drawingCount: number;
  drawings: DrawingInfo[];
  tableCount: number;
  noteCount: number;
}

interface InspectionResult {
  file: string;
  type: string;
  id: string;
  filename: string;
  processedDate?: string;
  sheetCount: number;
  sheets: SheetInfo[];
}

export async function inspect(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  const sheets = data.sheets ?? [];

  const result: InspectionResult = {
    file: filePath,
    type: data["@type"],
    id: data["@id"],
    filename: data.filename,
    processedDate: data.processedDate,
    sheetCount: sheets.length,
    sheets: sheets.map((s) => {
      const drawings = s.drawings ?? [];
      return {
        id: s["@id"],
        sheetNumber: s.sheetNumber,
        title: s.title,
        pageIndex: s.pageIndex,
        drawingCount: drawings.length,
        drawings: drawings.map((d) => {
          const layers = d.layers ?? [];
          const itemCount = layers.reduce(
            (sum, l) => sum + (l.items?.length ?? 0),
            0
          );
          return {
            id: d["@id"],
            title: d.title,
            drawingType: d.drawingType,
            scale: d.scale,
            layerCount: layers.length,
            itemCount,
            layers: layers.map((l) => ({
              name: l.name,
              itemCount: l.items?.length ?? 0,
            })),
          };
        }),
        tableCount: s.tables?.length ?? 0,
        noteCount: s.notes?.length ?? 0,
      };
    }),
  };

  if (opts.format === "json") {
    await output(result, { ...opts, pretty: opts.pretty ?? true });
  } else {
    printInspection(result);
  }
}

function printInspection(result: InspectionResult): void {
  console.log(`Drawing Set: ${result.id}`);
  console.log(`Source: ${result.filename}`);
  if (result.processedDate) console.log(`Processed: ${result.processedDate}`);
  console.log(`\nSheets: ${result.sheetCount}`);

  for (const s of result.sheets) {
    console.log(`\n  ${s.sheetNumber} - ${s.title} (page ${s.pageIndex})`);

    for (const d of s.drawings) {
      const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
      console.log(`    Drawing: ${d.title}${meta ? ` [${meta}]` : ""}`);
      for (const l of d.layers) {
        console.log(`      Layer: ${l.name} (${l.itemCount} items)`);
      }
    }

    if (s.tableCount > 0) console.log(`    Tables: ${s.tableCount}`);
    if (s.noteCount > 0) console.log(`    Notes: ${s.noteCount}`);
  }
}
