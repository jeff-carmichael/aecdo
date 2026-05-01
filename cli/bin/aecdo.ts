#!/usr/bin/env node

import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "../src/commands/validate.js";
import { summary } from "../src/commands/summary.js";
import { explore } from "../src/commands/explore.js";
import { configure } from "../src/commands/configure.js";
import { upload } from "../src/commands/upload.js";
import { status } from "../src/commands/status.js";
import { download } from "../src/commands/download.js";
import { processPdf } from "../src/commands/process.js";
import type { DrawingSet, CommandOptions, ProcessOptions } from "../src/types.js";

const HELP = `
aecdo - AEC Drawing Ontology CLI

Usage:
  aecdo <command> [options] <file>

Commands:
  validate <file>     Validate a JSON-LD file against the AECDO schema
  summary <file>      Print a concise summary of a drawing set
  explore <file>      Load, validate, inspect, then browse sheets interactively
  configure           Set up API credentials and region
  process <pdf>       Upload a PDF, wait for processing, download the result
  upload <pdf>        Upload a PDF and return the job ID
  status <jobId>      Check the status of a processing job
  download <jobId>    Download the result of a completed job

Options:
  --help, -h          Show this help message
  --version, -v       Show version number
  --schema <path>     Use a custom schema file for validation
  --format <fmt>      Output format: json, text (default: text)
  --pretty            Pretty-print JSON output
  --output, -o <file> Write output to a file instead of stdout

API Options:
  --poll <seconds>    Polling interval for status checks (default: 5)
  --wait              Wait for job completion (used with status)
  --then <command>    Pipe result into: validate, summary, explore

Examples:
  aecdo validate drawings.jsonld
  aecdo summary drawings.jsonld
  aecdo explore drawings.jsonld
  aecdo configure
  aecdo process plans.pdf
  aecdo process plans.pdf --then summary
  aecdo upload plans.pdf
  aecdo status <jobId> --wait
  aecdo download <jobId> -o result.jsonld
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

  if (command === "configure") {
    await configure();
    return;
  }

  let options;
  try {
    options = parseArgs({
      args: rest,
      options: {
        schema: { type: "string" },
        format: { type: "string", default: "text" },
        pretty: { type: "boolean", default: false },
        output: { type: "string", short: "o" },
        poll: { type: "string" },
        wait: { type: "boolean", default: false },
        then: { type: "string" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const opts: ProcessOptions = {
    format: options.values.format,
    pretty: options.values.pretty,
    output: options.values.output,
    schema: options.values.schema,
    poll: options.values.poll ? Number(options.values.poll) : undefined,
    wait: options.values.wait,
    then: options.values.then,
  };

  try {
    switch (command) {
      case "process":
      case "upload": {
        const filePath = options.positionals[0];
        if (!filePath) {
          console.error("Error: No input file specified.");
          console.error('Run "aecdo --help" for usage information.');
          process.exit(1);
        }
        if (command === "process") {
          await processPdf(filePath, opts);
        } else {
          await upload(filePath, opts);
        }
        break;
      }
      case "status":
      case "download": {
        const jobId = options.positionals[0];
        if (!jobId) {
          console.error("Error: No job ID specified.");
          console.error('Run "aecdo --help" for usage information.');
          process.exit(1);
        }
        if (command === "status") {
          await status(jobId, opts);
        } else {
          await download(jobId, opts);
        }
        break;
      }
      case "validate":
      case "summary":
      case "explore": {
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

        const cmdOpts: CommandOptions = {
          format: opts.format,
          pretty: opts.pretty,
          output: opts.output,
          schema: opts.schema,
        };

        switch (command) {
          case "validate":
            await validate(data, resolvedPath, cmdOpts);
            break;
          case "summary":
            await summary(data, resolvedPath, cmdOpts);
            break;
          case "explore":
            await explore(data, resolvedPath, cmdOpts);
            break;
        }
        break;
      }
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
