#!/usr/bin/env node

import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "../src/commands/validate.js";
import { summary } from "../src/commands/summary.js";
import { sheets } from "../src/commands/sheets.js";
import { page } from "../src/commands/page.js";
import { upload } from "../src/commands/upload.js";
import { status } from "../src/commands/status.js";
import { download } from "../src/commands/download.js";
import { processPdf } from "../src/commands/process.js";
import { update, cleanupOldBinary } from "../src/commands/update.js";
import { completion } from "../src/commands/completion.js";
import { examples } from "../src/commands/examples.js";
import { gui } from "../src/commands/gui.js";
import { canPrompt } from "../src/lib/prompt.js";
import { embedded } from "../src/lib/embedded.js";
import { startUpdateNotifier, runUpdateCheckWorker, WORKER_ENV, NO_UPDATE_CHECK_FLAG } from "../src/lib/update-check.js";
import type { DrawingSet, CommandOptions, ProcessOptions } from "../src/types.js";

const HELP = `
aecdo - AEC Drawing Ontology CLI

Usage:
  aecdo                       Open the app (in a terminal); otherwise print this help
  aecdo <command> [options] <file>

Commands for scripts and agents (plain output, never wait for input):
  validate <file>     Validate a JSON-LD file against the AECDO schema
  summary <file>      Print a concise summary of a drawing set
  sheets <file>       List all sheets
  page <file> <id>    Print one sheet by sheet number or page index
  process <pdf>       Upload a PDF, wait for processing, and save the result
                      as <pdf name>.jsonld next to the PDF
  upload <pdf>        Upload a PDF and print the job ID
  status <jobId>      Check the status of a processing job
  download <jobId>    Download the result of a completed job

For people:
  gui [file]          Open the app: the sheet list, what you've opened, and
                      the PDF page side by side, with the selection outlined
                      in red, AI chats, and PDF markups. A window with the
                      standalone binary; otherwise, or with --browser, your
                      default browser. With no file, pick one in the app
  explore [file]      Same as gui. Without a terminal, or with --format json,
                      it lists the sheets instead
  configure           Open the app's Settings: the AI models (Sign in with
                      ChatGPT or OpenRouter, API keys, Amazon Bedrock, a custom
                      endpoint) and the DrawingBot API credentials
  update              Update aecdo to the latest release
  examples [folder]   Download the example drawing sets (Maple Grove demo,
                      Vancouver house permit set with its PDF) into a folder
                      (default: ./aecdo-examples). Existing files are kept
                      unless you add --force
  completion [shell]  Print a tab-completion script for bash, zsh, or fish
                      (detected from $SHELL if omitted)

Options:
  --help, -h          Show this help message
  --version, -v       Show version number
  --schema <path>     Use a custom schema file for validation
  --format <fmt>      Output format: json, text (default: text)
  --pretty            Pretty-print JSON output
  --output, -o <file> Write output to a file instead of stdout
  --no-update-check   Skip the daily check for a newer release
                      (or set NO_UPDATE_CHECK=1)

API Options:
  --poll <seconds>    Polling interval for status checks (default: 5)
  --wait              Wait for job completion (used with status)
  --then <command>    Pipe result into: validate, summary
  --stdout            process: print the result to stdout instead of saving it
  --force             examples: replace files that are already there
  --pdf <file>        gui: the source PDF (default: <name>.pdf next to the
                      .jsonld, or the set's filename)
  --browser           gui: open in your default browser instead of a window

Examples:
  aecdo validate drawings.jsonld
  aecdo summary drawings.jsonld
  aecdo sheets drawings.jsonld --format json
  aecdo page drawings.jsonld A101
  aecdo page drawings.jsonld 0 --format json
  aecdo process plans.pdf
  aecdo process plans.pdf --then summary
  aecdo process plans.pdf --stdout | jq .sheets
  aecdo status <jobId> --wait
  aecdo download <jobId> -o result.jsonld
  aecdo gui drawings.jsonld
  aecdo configure
  aecdo examples ~/aecdo-examples
  eval "$(aecdo completion bash)"      # add to ~/.bashrc (zsh: ~/.zshrc)
`;

async function getVersion(): Promise<string> {
  return (
    embedded.version ??
    (JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf-8")) as { version: string }).version
  );
}

/** Loads a drawing set and runs one of the commands that read it. */
async function runOnFile(command: "validate" | "summary" | "sheets" | "page", filePath: string, opts: ProcessOptions, selector?: string): Promise<void> {
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
    data = JSON.parse(fileContent) as DrawingSet;
  } catch (err) {
    console.error(`Error: Invalid JSON in "${filePath}": ${(err as Error).message}`);
    process.exit(1);
  }

  const cmdOpts: CommandOptions = { format: opts.format, pretty: opts.pretty, output: opts.output, schema: opts.schema };

  switch (command) {
    case "validate":
      await validate(data, resolvedPath, cmdOpts);
      return;
    case "summary":
      return summary(data, resolvedPath, cmdOpts);
    case "sheets":
      return sheets(data, resolvedPath, cmdOpts);
    case "page":
      if (!selector) {
        console.error("Error: No sheet number or page index specified.");
        console.error("Usage: aecdo page <file> <sheetNumber|pageIndex>");
        process.exit(1);
      }
      return page(data, selector, cmdOpts);
  }
}

async function main(): Promise<void> {
  if (process.env[WORKER_ENV]) {
    await runUpdateCheckWorker();
    return;
  }

  const rawArgs = process.argv.slice(2);
  let args = rawArgs.filter((a) => a !== NO_UPDATE_CHECK_FLAG);

  const standalone = embedded.version !== undefined;
  if (standalone && process.platform === "win32") await cleanupOldBinary();

  if (args[0] !== "update") {
    try {
      startUpdateNotifier({ currentVersion: await getVersion(), standalone, args: rawArgs });
    } catch {
      // update checks must never break a command
    }
  }

  if (args.length === 0 && canPrompt()) args = ["gui"];

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`aecdo v${await getVersion()}`);
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  if (command === "configure") {
    if (!canPrompt()) {
      console.error('Error: settings are in the app. Run "aecdo configure" in a terminal on a computer with a screen.');
      process.exit(1);
    }
    await gui(undefined, { settings: true, browser: rest.includes("--browser") });
    return;
  }

  if (command === "completion") {
    try {
      completion(rest[0]);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (command === "update") {
    await update({ currentVersion: await getVersion(), standalone });
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
        stdout: { type: "boolean", default: false },
        pdf: { type: "string" },
        force: { type: "boolean", default: false },
        browser: { type: "boolean", default: false },
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
    stdout: options.values.stdout,
    pdf: options.values.pdf,
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
      case "explore":
        if (!process.stdin.isTTY || opts.format === "json") {
          if (!options.positionals[0]) {
            console.error("Error: No input file specified.");
            process.exit(1);
          }
          await runOnFile("sheets", options.positionals[0], opts);
          break;
        }
      // falls through: in a terminal, explore opens the app
      case "gui":
        await gui(options.positionals[0], { pdf: options.values.pdf, schema: options.values.schema, browser: options.values.browser });
        break;
      case "examples":
        await examples(options.positionals[0], { version: await getVersion(), force: options.values.force });
        break;
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
      case "sheets":
      case "page": {
        const filePath = options.positionals[0];
        if (!filePath) {
          console.error("Error: No input file specified.");
          console.error('Run "aecdo --help" for usage information.');
          process.exit(1);
        }
        await runOnFile(command, filePath, opts, options.positionals[1]);
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

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
