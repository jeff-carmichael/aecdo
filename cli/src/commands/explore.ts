import { createInterface } from "node:readline";
import { validate } from "./validate.js";
import { printPage } from "./page.js";
import type { DrawingSet, CommandOptions } from "../types.js";

function printOverview(data: DrawingSet): void {
  const sheets = data.sheets ?? [];
  console.log(`\nDrawing Set: ${data["@id"]}`);
  console.log(`Source: ${data.filename}`);
  if (data.processedDate) console.log(`Processed: ${data.processedDate}`);
  console.log(`\nSheets: ${sheets.length}`);

  for (const s of sheets) {
    console.log(`\n  ${s.sheetNumber} - ${s.title} (page ${s.pageIndex})`);
    for (const d of s.drawings ?? []) {
      const meta = [d.drawingType, d.scale].filter(Boolean).join(", ");
      console.log(`    Drawing: ${d.title}${meta ? ` [${meta}]` : ""}`);
      for (const l of d.layers) {
        console.log(`      Layer: ${l.name} (${l.items?.length ?? 0} items)`);
      }
    }
    if (s.tables?.length) console.log(`    Tables: ${s.tables.length}`);
    if (s.notes?.length) console.log(`    Notes: ${s.notes.length}`);
  }
}

export async function explore(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  const valid = await validate(data, filePath, opts);
  if (!valid) {
    console.log("\nFile has validation errors. Continuing anyway…\n");
  }

  printOverview(data);

  const sheets = data.sheets ?? [];
  if (sheets.length === 0) {
    console.log("\nNo sheets found.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>((res) => rl.question(q, res));

  console.log("\nEnter a sheet number or page index to view its contents.");
  console.log('Type "list" to show sheets again, or "quit" to exit.\n');

  while (true) {
    const answer = (await prompt("sheet> ")).trim();

    if (!answer) continue;
    if (answer === "quit" || answer === "q" || answer === "exit") break;

    if (answer === "list" || answer === "ls") {
      for (const s of sheets) {
        console.log(`  ${s.sheetNumber} — ${s.title} (page ${s.pageIndex})`);
      }
      console.log();
      continue;
    }

    const sheet = sheets.find(
      (s) =>
        s.sheetNumber.toLowerCase() === answer.toLowerCase() ||
        String(s.pageIndex) === answer
    );

    if (!sheet) {
      console.log(`No sheet matching "${answer}". Try a sheet number or page index.`);
      continue;
    }

    printPage(sheet);
  }

  rl.close();
}
