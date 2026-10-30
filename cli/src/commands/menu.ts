import { createInterface } from "node:readline/promises";
import { pick, listJsonld } from "../lib/picker.js";

export type MenuAction =
  | "explore"
  | "examples"
  | "validate"
  | "summary"
  | "process"
  | "status"
  | "download"
  | "configure-ai"
  | "configure"
  | "update"
  | "help"
  | "quit";

export interface MenuEntry {
  action: MenuAction;
  label: string;
  hint: string;
}

export const MENU: MenuEntry[] = [
  { action: "explore", label: "Explore a drawing set", hint: "browse sheets, drawings, and items; ask @claude" },
  { action: "examples", label: "Download example sets", hint: "Maple Grove demo and a real permit set with PDF" },
  { action: "validate", label: "Validate a drawing set", hint: "check a .jsonld file against the schema" },
  { action: "summary", label: "Summarize a drawing set", hint: "counts of sheets, drawings, items" },
  { action: "process", label: "Process a PDF", hint: "turn a PDF into a .jsonld (DrawingBot API)" },
  { action: "status", label: "Check a processing job", hint: "status of a job ID" },
  { action: "download", label: "Download a job result", hint: "save the .jsonld of a finished job" },
  { action: "configure-ai", label: "Set up the AI assistant", hint: "ChatGPT, OpenRouter, API keys, Bedrock" },
  { action: "configure", label: "Set up DrawingBot API", hint: "credentials and region" },
  { action: "update", label: "Update aecdo", hint: "install the latest release" },
  { action: "help", label: "Show all commands", hint: "aecdo --help" },
  { action: "quit", label: "Quit", hint: "" },
];

export function menuLines(entries: MenuEntry[] = MENU): string[] {
  const width = Math.max(...entries.map((e) => e.label.length));
  return entries.map((e) => (e.hint ? `${e.label.padEnd(width)}   ${e.hint}` : e.label));
}

export interface MenuDeps {
  pickFile: (files: string[], title: string) => Promise<string | null>;
  ask: (question: string) => Promise<string>;
  listJsonld: () => Promise<string[]>;
  log: (line: string) => void;
}

/**
 * Turns a menu choice into the argv the CLI would have received, so each
 * action runs through the normal command path. Returns null to quit.
 */
export async function argsFor(action: MenuAction, deps: MenuDeps): Promise<string[] | null> {
  switch (action) {
    case "explore":
    case "process":
    case "examples":
    case "update":
    case "configure":
      return [action];
    case "configure-ai":
      return ["configure", "ai"];
    case "help":
      return ["--help"];
    case "quit":
      return null;
    case "validate":
    case "summary": {
      const sets = await deps.listJsonld();
      if (sets.length === 0) {
        deps.log('No .jsonld files in this folder. Choose "Download example sets" or cd to a folder with drawing sets.');
        return null;
      }
      const file = await deps.pickFile(sets, `Select a drawing set to ${action}:`);
      return file === null ? null : [action, file];
    }
    case "status":
    case "download": {
      const jobId = (await deps.ask("Job ID: ")).trim();
      if (!jobId) return null;
      return action === "status" ? ["status", jobId, "--wait"] : ["download", jobId];
    }
  }
}

export interface RunMenuOptions {
  version: string;
}

export async function runMenu(opts: RunMenuOptions): Promise<string[] | null> {
  const lines = menuLines();
  process.stderr.write(`aecdo v${opts.version}: pick what to do (or run "aecdo --help" for all commands)\n`);
  const choice = await pick(lines, { title: "What do you want to do?", maxVisible: MENU.length, echo: (value) => value.split("   ")[0] });
  if (choice === null) return null;
  const entry = MENU[lines.indexOf(choice)];

  const deps: MenuDeps = {
    pickFile: (files, title) => pick(files, { title }),
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    listJsonld: () => listJsonld(process.cwd()),
    log: (line) => process.stderr.write(line + "\n"),
  };

  const args = await argsFor(entry.action, deps);
  if (args && entry.action !== "help") {
    process.stderr.write(`  (next time: aecdo ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")})\n`);
  }
  return args;
}
