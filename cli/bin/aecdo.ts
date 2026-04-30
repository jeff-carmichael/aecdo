#!/usr/bin/env node

import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "../src/commands/validate.js";
import { summary } from "../src/commands/summary.js";
import { explore } from "../src/commands/explore.js";
import type { DrawingSet, CommandOptions } from "../src/types.js";

const HELP = `
aecdo - AEC Drawing Ontology CLI

Usage:
  aecdo <command> [options] <file>

Commands:
  validate <file>     Validate a JSON-LD file against the AECDO schema
  summary <file>      Print a concise summary of a drawing set
  explore <file>      Load, validate, inspect, then browse sheets interactively

Options:
  --help, -h          Show this help message
  --version, -v       Show version number
  --schema <path>     Use a custom schema file for validation
  --format <fmt>      Output format: json, text (default: text)
  --pretty            Pretty-print JSON output
  --output, -o <file> Write output to a file instead of stdout

Examples:
  aecdo validate drawings.jsonld
  aecdo summary drawings.jsonld
  aecdo explore drawings.jsonld
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    const pkg = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf-8")
    );
    console.log(`aecdo v${pkg.version}`);
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  let options;
  try {
    options = parseArgs({
      args: rest,
      options: {
        schema: { type: "string" },
        format: { type: "string", default: "text" },
        pretty: { type: "boolean", default: false },
        output: { type: "string", short: "o" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const filePath = options.positionals[0];
  if (!filePath) {
    console.error("Error: No input file specified.");
    console.error('Run "aecdo --help" for usage information.');
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);
  let fileContent: string;
  try {
    fileContent = await readFile(resolvedPath, "utf-8");
  } catch (err) {
    console.error(`Error: Could not read file "${filePath}": ${(err as Error).message}`);
    process.exit(1);
  }

  let data: DrawingSet;
  try {
    data = JSON.parse(fileContent);
  } catch (err) {
    console.error(`Error: Invalid JSON in "${filePath}": ${(err as Error).message}`);
    process.exit(1);
  }

  const opts: CommandOptions = {
    format: options.values.format,
    pretty: options.values.pretty,
    output: options.values.output,
    schema: options.values.schema,
  };

  try {
    switch (command) {
      case "validate":
        await validate(data, resolvedPath, opts);
        break;
      case "summary":
        await summary(data, resolvedPath, opts);
        break;
      case "explore":
        await explore(data, resolvedPath, opts);
        break;
      default:
        console.error(`Error: Unknown command "${command}".`);
        console.error('Run "aecdo --help" for usage information.');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
