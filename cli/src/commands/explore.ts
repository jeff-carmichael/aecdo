import { createInterface } from "node:readline";
import { validate } from "./validate.js";
import { printPage } from "./page.js";
import { sheets as sheetsCmd } from "./sheets.js";
import type { DrawingSet, CommandOptions } from "../types.js";

function printSheetList(data: DrawingSet): void {
  const sheets = data.sheets ?? [];
  console.log();
  for (const s of sheets) {
    console.log(`  ${s.sheetNumber} - ${s.title} (page ${s.pageIndex})`);
  }
}

export async function explore(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  if (opts.format === "json" || !process.stdin.isTTY) {
    await sheetsCmd(data, filePath, opts);
    return;
  }

  const valid = await validate(data, filePath, opts);
  if (!valid) {
    console.log("\nFile has validation errors. Continuing anyway…\n");
  }

  printSheetList(data);

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
      printSheetList(data);
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

    printPage(sheet, data);
  }

  rl.close();
}
