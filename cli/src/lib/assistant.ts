import { appendFile, access, readdir, readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, basename } from "node:path";
import type { AgentTool, AgentToolResult, AgentEvent } from "@earendil-works/pi-agent-core";
import type { MutableModels, Model, Api, TSchema } from "@earendil-works/pi-ai";
import type { DrawingSet } from "../types.js";
import {
  isSpreadsheet,
  listSpreadsheets,
  readSpreadsheet,
  writeCells,
  appendRows,
  createSpreadsheet,
  SPREADSHEET_EXTENSIONS,
  type CellValue,
} from "./spreadsheet.js";
import type { AssistantInfo } from "./llm.js";
import { MARKUP_KINDS, type Markup, type MarkupKind } from "./markup.js";
import type { BBox } from "./page-view.js";

/** What the assistant can see and drive. Implemented by the explore Explorer. */
export interface AssistantView {
  /** The current view as structured data for the model. */
  context(): unknown;
  /** Runs an explore command (sheet number, entry number, "back", "top", "all") and returns the new context. */
  navigate(command: string): unknown;
}

export interface AssistantHost {
  data: DrawingSet;
  filePath: string;
  cwd: string;
  view: AssistantView;
  /** Streamed assistant text. */
  write(text: string): void;
  /** A full line of status output (tool activity, errors). */
  print(line: string): void;
  confirm(question: string): Promise<boolean>;
  /** Opens the current page from the source PDF with the selection outlined, like the user typing "view". */
  showPage?(): Promise<string>;
  /** Pending PDF markups; the user reviews and saves them with "markups save". */
  markups?: AssistantMarkups;
}

export interface AssistantMarkups {
  readonly pending: Markup[];
  add(req: { kind: MarkupKind; text: string; bbox?: BBox; sheet?: string; at?: [number, number] }): Promise<Markup>;
  drop(index: number): Markup;
  describe(m: Markup): string;
  outPath(inPlace?: boolean): string;
}

export const DEFAULT_NOTES_FILE = "notes.md";
export const INSTRUCTIONS_FILE = "AGENTS.md";
const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_TOOL_CHARS = 40_000;
const MAX_SHEET_ROWS = 200;

export function truncateJson(value: unknown, max = MAX_TOOL_CHARS): string {
  const text = JSON.stringify(value, null, 1);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} characters; ask for a narrower view]`;
}

export function resolveInCwd(cwd: string, file: string, allowed: string[]): string {
  const abs = resolve(cwd, file);
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`"${file}" is outside the current folder; only files in ${cwd} can be used`);
  }
  if (!allowed.includes(extname(abs).toLowerCase())) {
    throw new Error(`"${file}" must end in ${allowed.join(", ")}`);
  }
  return abs;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function buildSystemPrompt(host: Pick<AssistantHost, "filePath" | "cwd" | "data" | "showPage" | "markups">, info: AssistantInfo): string {
  const sheetCount = host.data.sheets?.length ?? 0;
  return `You are ${info.label}, working inside "aecdo explore", a terminal browser for construction drawing sets.

The open file is ${basename(host.filePath)} (${sheetCount} sheets), extracted from a PDF drawing set by AEC DrawingBot.
Its data follows the AEC Drawing Ontology: DrawingSet → Sheet → Drawing (plan, section, elevation, detail) → Layer → Item.
Items are "tag" (annotations, symbols), "thing" (physical elements) or "area" (regions); their "data" object holds whatever was extracted.
Sheets also hold tables (pipe-delimited rows), notes and images. bbox values are [xmin, ymin, xmax, ymax] on the sheet in PDF points (72 per inch) from the top-left corner of the page, y down.

Each user message starts with <current_view>, the part of the set the user is looking at right now. Treat it as "this page".
You can move around with the navigate tool, using the same commands the user types: a sheet number or page index from the sheet list, an entry number from the current list, "back", "top", or "all". The user sees every move.
Use list_sheets and read_sheet to look at other sheets without moving the user.
${host.showPage ? `show_page opens the current sheet's page from the source PDF in the user's image viewer, with the current drawing, layer, or last-opened item, table, note, or image outlined in red (same as the user typing "view"). Use it when the user asks to see, show, or find something on the drawing: navigate to it first (open the item for a red box around it), then call show_page. You can't see the image yourself.
` : ""}
${host.markups ? `add_markup proposes a markup on the source PDF, the kind people draw in Bluebeam or Acrobat: "cloud" around a problem area, "callout" (a text box with a leader arrow pointing at it), or "note" (a sticky-note icon holding longer text). By default it marks the current selection (navigate to the item first, as for show_page); or pass a bbox in the same units as the data, plus the sheet. Write the text as a short review comment a reviewer would leave, e.g. "Door 209B is not in the door schedule (A601)." Markups stay pending until the user types "markups save", which writes them to a copy of the PDF; tell the user that after adding them, and that "view" shows them first. Use list_markups and remove_markup to review or take back pending ones. Only add markups when the user asks for them.
` : ""}
You can write files in the current folder (${host.cwd}):
- append_note adds Markdown to ${DEFAULT_NOTES_FILE} (or another .md file). Use it when the user asks you to note, record or remember something.
- Spreadsheets: ${SPREADSHEET_EXTENSIONS.join(", ")}. Use list_spreadsheets first and work in the user's existing file and layout when there is one; read it before writing so new rows match its columns. Only create a new spreadsheet if none fits or the user asks.

Answer in plain text suited to a terminal: short paragraphs or simple lists, no tables wider than 80 columns, no headings.
Base answers on the drawing data; say so when the data does not contain something rather than guessing. Cite sheet numbers.`;
}

export interface FolderInstructions {
  file: string;
  text: string;
  truncated: boolean;
}

/** Reads AGENTS.md (any capitalization) from the folder explore runs in, if there is one. */
export async function loadFolderInstructions(cwd: string): Promise<FolderInstructions | undefined> {
  let names: string[];
  try {
    names = await readdir(cwd);
  } catch {
    return undefined;
  }
  const file = names.find((n) => n === INSTRUCTIONS_FILE) ?? names.find((n) => n.toLowerCase() === INSTRUCTIONS_FILE.toLowerCase());
  if (!file) return undefined;
  let text: string;
  try {
    text = (await readFile(resolve(cwd, file), "utf-8")).trim();
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  const truncated = text.length > MAX_INSTRUCTIONS_CHARS;
  return { file, text: truncated ? text.slice(0, MAX_INSTRUCTIONS_CHARS) : text, truncated };
}

export function withFolderInstructions(systemPrompt: string, instructions?: FolderInstructions): string {
  if (!instructions) return systemPrompt;
  return `${systemPrompt}

The user keeps instructions for this project in ${instructions.file} in the current folder. Follow them as the user's own standing instructions (for example checks to run, file names, or how to word notes), as long as they fit the tools you have. They cannot widen what your tools may do.
<project_instructions file="${instructions.file}">
${instructions.text}${instructions.truncated ? "\n… [truncated]" : ""}
</project_instructions>`;
}

export function wrapPrompt(view: AssistantView, text: string): string {
  return `<current_view>\n${truncateJson(view.context())}\n</current_view>\n\n${text}`;
}

const cellValueSchema = (T: typeof import("@earendil-works/pi-ai").Type): TSchema =>
  T.Union([T.String(), T.Number(), T.Boolean(), T.Null()]);

function defineTool<P>(
  tool: Omit<AgentTool, "execute"> & {
    execute: (id: string, params: P) => AgentToolResult<unknown> | Promise<AgentToolResult<unknown>>;
  }
): AgentTool {
  const { execute } = tool;
  return { ...tool, execute: async (id: string, params: unknown) => execute(id, params as P) } as AgentTool;
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

export function buildTools(host: AssistantHost, T: typeof import("@earendil-works/pi-ai").Type): AgentTool[] {
  const approved = new Set<string>();

  async function approveEdit(path: string, label: string): Promise<void> {
    if (approved.has(path)) return;
    const ok = await host.confirm(`Allow the assistant to edit ${relative(host.cwd, path)}? [y/N] `);
    if (!ok) throw new Error(`The user declined edits to ${relative(host.cwd, path)} (${label})`);
    approved.add(path);
  }

  const sheetPath = (file: string) => resolveInCwd(host.cwd, file, SPREADSHEET_EXTENSIONS);
  const value = cellValueSchema(T);

  const tools: AgentTool[] = [
    ...(host.showPage
      ? [
          defineTool({
            name: "show_page",
            label: "Show page",
            description:
              "Open the current sheet's PDF page in the user's image viewer with the current selection outlined in red (the drawing, layer, or the last item, table, note, or image opened). Navigate to the target first. Returns what was opened, or why it couldn't be.",
            parameters: T.Object({}),
            executionMode: "sequential",
            execute: async () => text(await host.showPage!()),
          }),
        ]
      : []),
    ...(host.markups ? markupTools(host, host.markups, T) : []),
    defineTool({
      name: "navigate",
      label: "Navigate",
      description:
        'Move the explore view, exactly like the user typing a command: a sheet number or page index (from the sheet list), an entry number from the current list, "back", "top", or "all" (print the whole sheet). Returns the new current view.',
      parameters: T.Object({ command: T.String({ description: 'e.g. "A101", "3", "back", "top"' }) }),
      executionMode: "sequential",
      execute: (_id, params: { command: string }) => {
        const cmd = params.command.trim().toLowerCase();
        if (["quit", "q", "exit"].includes(cmd)) throw new Error("The assistant cannot quit explore");
        return text(truncateJson(host.view.navigate(params.command)));
      },
    }),
    defineTool({
      name: "list_sheets",
      label: "List sheets",
      description: "List every sheet in the drawing set with its number, title, page index and content counts.",
      parameters: T.Object({}),
      execute: () =>
        text(
          truncateJson(
            (host.data.sheets ?? []).map((s) => ({
              sheetNumber: s.sheetNumber,
              title: s.title,
              pageIndex: s.pageIndex,
              drawings: s.drawings?.length ?? 0,
              tables: s.tables?.length ?? 0,
              notes: s.notes?.length ?? 0,
            }))
          )
        ),
    }),
    defineTool({
      name: "read_sheet",
      label: "Read sheet",
      description: "Return the full data of one sheet (by sheet number or page index) without moving the user's view.",
      parameters: T.Object({ sheet: T.String() }),
      execute: (_id, params: { sheet: string }) => {
        const sel = params.sheet.trim();
        const sheet = (host.data.sheets ?? []).find(
          (s) => s.sheetNumber.toLowerCase() === sel.toLowerCase() || String(s.pageIndex) === sel
        );
        if (!sheet) throw new Error(`No sheet "${sel}"`);
        return text(truncateJson(sheet));
      },
    }),
    defineTool({
      name: "append_note",
      label: "Note",
      description: `Append Markdown to a notes file in the current folder (default ${DEFAULT_NOTES_FILE}). Creates the file if needed.`,
      parameters: T.Object({
        text: T.String({ description: "Markdown to append" }),
        file: T.Optional(T.String({ description: `Defaults to ${DEFAULT_NOTES_FILE}` })),
      }),
      executionMode: "sequential",
      execute: async (_id, params: { text: string; file?: string }) => {
        const path = resolveInCwd(host.cwd, params.file || DEFAULT_NOTES_FILE, [".md", ".markdown"]);
        const body = params.text.trimEnd() + "\n";
        const prefix = (await exists(path)) ? "\n" : "";
        await appendFile(path, prefix + body, "utf-8");
        host.print(`  ✎ Added a note to ${relative(host.cwd, path)}`);
        return text(`Appended ${body.length} characters to ${relative(host.cwd, path)}`);
      },
    }),
    defineTool({
      name: "list_spreadsheets",
      label: "List spreadsheets",
      description: `List spreadsheet files (${SPREADSHEET_EXTENSIONS.join(", ")}) in the current folder.`,
      parameters: T.Object({}),
      execute: async () => {
        const files = await listSpreadsheets(host.cwd);
        return text(files.length ? files.join("\n") : "No spreadsheets in the current folder.");
      },
    }),
    defineTool({
      name: "read_spreadsheet",
      label: "Read spreadsheet",
      description: "Read a spreadsheet's rows (first row is usually the header). Rows are 1-based in cell references, columns are letters. Excel dates appear as serial numbers.",
      parameters: T.Object({
        file: T.String(),
        sheet: T.Optional(T.String({ description: "Tab name for .xlsx; defaults to the first tab" })),
      }),
      execute: async (_id, params: { file: string; sheet?: string }) => {
        const data = await readSpreadsheet(sheetPath(params.file), params.sheet);
        const shown = data.rows.slice(0, MAX_SHEET_ROWS);
        const note = data.rows.length > shown.length ? `\n(showing ${shown.length} of ${data.rows.length} rows)` : "";
        return text(truncateJson({ sheets: data.sheets, sheet: data.sheet, rowCount: data.rows.length, rows: shown }) + note);
      },
    }),
    defineTool({
      name: "write_cells",
      label: "Write cells",
      description: "Set individual cells in an existing spreadsheet by reference (e.g. B3). Formatting is kept; cells holding formulas are not overwritten.",
      parameters: T.Object({
        file: T.String(),
        sheet: T.Optional(T.String()),
        cells: T.Array(T.Object({ ref: T.String(), value })),
      }),
      executionMode: "sequential",
      execute: async (_id, params: { file: string; sheet?: string; cells: { ref: string; value: CellValue }[] }) => {
        const path = sheetPath(params.file);
        await approveEdit(path, "write cells");
        await writeCells(path, params.cells, params.sheet);
        host.print(`  ✎ Updated ${params.cells.length} cell(s) in ${relative(host.cwd, path)}`);
        return text(`Wrote ${params.cells.length} cell(s)`);
      },
    }),
    defineTool({
      name: "append_rows",
      label: "Append rows",
      description: "Append rows after the last filled row of an existing spreadsheet. Match the existing columns.",
      parameters: T.Object({
        file: T.String(),
        sheet: T.Optional(T.String()),
        rows: T.Array(T.Array(value)),
      }),
      executionMode: "sequential",
      execute: async (_id, params: { file: string; sheet?: string; rows: CellValue[][] }) => {
        const path = sheetPath(params.file);
        await approveEdit(path, "append rows");
        const first = await appendRows(path, params.rows, params.sheet);
        host.print(`  ✎ Added ${params.rows.length} row(s) to ${relative(host.cwd, path)}`);
        return text(`Appended ${params.rows.length} row(s) starting at row ${first}`);
      },
    }),
    defineTool({
      name: "create_spreadsheet",
      label: "Create spreadsheet",
      description: "Create a new spreadsheet (.xlsx, .csv or .tsv) in the current folder with the given rows; the first row should be headers. Fails if the file exists.",
      parameters: T.Object({ file: T.String(), rows: T.Array(T.Array(value)) }),
      executionMode: "sequential",
      execute: async (_id, params: { file: string; rows: CellValue[][] }) => {
        const path = sheetPath(params.file);
        if (!isSpreadsheet(path)) throw new Error("Unsupported spreadsheet type");
        await createSpreadsheet(path, params.rows);
        approved.add(path);
        host.print(`  ✎ Created ${relative(host.cwd, path)}`);
        return text(`Created ${relative(host.cwd, path)} with ${params.rows.length} row(s)`);
      },
    }),
  ];
  return tools;
}

function markupTools(host: AssistantHost, markups: AssistantMarkups, T: typeof import("@earendil-works/pi-ai").Type): AgentTool[] {
  const point = T.Tuple([T.Number(), T.Number()]);
  return [
    defineTool({
      name: "add_markup",
      label: "Add markup",
      description:
        "Propose a markup on the source PDF: a cloud, a callout, or a sticky note. It stays pending until the user saves it. Marks the current selection unless bbox (and sheet) are given. Returns the pending markup's number.",
      parameters: T.Object({
        kind: T.Union(MARKUP_KINDS.map((k) => T.Literal(k))),
        text: T.String({ description: "The comment, as a reviewer would write it" }),
        bbox: T.Optional(T.Tuple([T.Number(), T.Number(), T.Number(), T.Number()], { description: "[xmin, ymin, xmax, ymax] in PDF points from the page's top-left; defaults to the current selection" })),
        sheet: T.Optional(T.String({ description: "Sheet number or page index for bbox; defaults to the current sheet" })),
        at: T.Optional(point),
      }),
      executionMode: "sequential",
      execute: async (_id, params: { kind: MarkupKind; text: string; bbox?: BBox; sheet?: string; at?: [number, number] }) => {
        const m = await markups.add(params);
        const index = markups.pending.length;
        host.print(`  ✎ Markup ${index} pending: ${markups.describe(m)}`);
        return text(`Pending markup ${index}: ${markups.describe(m)}. ${index} pending in total. Nothing is written until the user types "markups save" (writes ${markups.outPath()}); "view" shows them on the page first.`);
      },
    }),
    defineTool({
      name: "list_markups",
      label: "List markups",
      description: "List the pending markups, numbered.",
      parameters: T.Object({}),
      execute: () =>
        text(markups.pending.length ? markups.pending.map((m, i) => `${i + 1}. ${markups.describe(m)}`).join("\n") : "No pending markups."),
    }),
    defineTool({
      name: "remove_markup",
      label: "Remove markup",
      description: "Drop a pending markup by its number from list_markups. Saved markups can only be removed by the user.",
      parameters: T.Object({ number: T.Number() }),
      executionMode: "sequential",
      execute: (_id, params: { number: number }) => {
        const m = markups.drop(params.number);
        host.print(`  ✎ Dropped pending markup: ${markups.describe(m)}`);
        return text(`Dropped: ${markups.describe(m)}. Pending markups are renumbered.`);
      },
    }),
  ];
}

export interface AssistantSession {
  info: AssistantInfo;
  ask(text: string): Promise<void>;
  abort(): void;
}

export async function createAssistantSession(
  host: AssistantHost,
  info: AssistantInfo,
  models: MutableModels,
  model: Model<Api>
): Promise<AssistantSession> {
  const [{ Agent }, pi, instructions] = await Promise.all([
    import("@earendil-works/pi-agent-core"),
    import("@earendil-works/pi-ai"),
    loadFolderInstructions(host.cwd),
  ]);
  if (instructions) {
    host.print(`  Using ${instructions.file} from this folder${instructions.truncated ? " (first 20,000 characters)" : ""}.`);
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: withFolderInstructions(buildSystemPrompt(host, info), instructions),
      model,
      tools: buildTools(host, pi.Type),
    },
    streamFn: models.streamSimple.bind(models),
    identity: { attribution: { name: "aecdo", url: "https://github.com/jeff-carmichael/aecdo" } },
  });

  let midLine = false;
  const write = (s: string) => {
    if (!s) return;
    host.write(s);
    midLine = !s.endsWith("\n");
  };
  const line = (s: string) => {
    if (midLine) host.write("\n");
    midLine = false;
    host.print(s);
  };

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") write(event.assistantMessageEvent.delta);
        break;
      case "tool_execution_end":
        if (event.isError) {
          const result = event.result as { content?: { type: string; text?: string }[] } | undefined;
          const msg = result?.content?.find((c) => c.type === "text");
          line(`  ⚠ ${event.toolName}: ${msg?.text ?? "failed"}`);
        }
        break;
      case "message_end": {
        const m = event.message as { role?: string; stopReason?: string; errorMessage?: string };
        if (m.role === "assistant" && m.stopReason === "error") line(`  ⚠ ${info.label} error: ${m.errorMessage ?? "request failed"}`);
        if (m.role === "assistant" && midLine) line("");
        break;
      }
    }
  });

  return {
    info,
    async ask(textInput: string) {
      await agent.prompt(wrapPrompt(host.view, textInput));
      if (midLine) line("");
    },
    abort() {
      agent.abort();
    },
  };
}
