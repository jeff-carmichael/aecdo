import { emitKeypressEvents } from "node:readline";
import { readdir } from "node:fs/promises";
import type { Key } from "node:readline";
import { paletteFor, PLAIN } from "./style.js";
import type { Palette } from "./style.js";
import { fit, keyHints, LiveRegion, symbols, textWidth } from "./tui.js";
import type { Symbols } from "./tui.js";

export interface PickerState {
  query: string;
  cursor: number;
}

export type PickerResult =
  | { kind: "update"; state: PickerState }
  | { kind: "select"; value: string }
  | { kind: "cancel" };

export function filterItems(items: string[], query: string): string[] {
  const q = query.toLowerCase();
  return q ? items.filter((item) => item.toLowerCase().includes(q)) : items;
}

export function handleKey(items: string[], state: PickerState, str: string | undefined, key: Key = {}): PickerResult {
  const visible = filterItems(items, state.query);
  const count = visible.length;

  if ((key.ctrl && key.name === "c") || key.name === "escape") return { kind: "cancel" };

  if (key.name === "return" || key.name === "enter") {
    const value = visible[state.cursor];
    return value === undefined ? { kind: "update", state } : { kind: "select", value };
  }

  if (key.name === "up" || (key.ctrl && key.name === "p")) {
    return { kind: "update", state: { ...state, cursor: count ? (state.cursor - 1 + count) % count : 0 } };
  }
  if (key.name === "down" || (key.ctrl && key.name === "n")) {
    return { kind: "update", state: { ...state, cursor: count ? (state.cursor + 1) % count : 0 } };
  }

  if (key.name === "backspace") {
    return { kind: "update", state: { query: state.query.slice(0, -1), cursor: 0 } };
  }

  if (str && !key.ctrl && !key.meta && str.length === 1 && str >= " ") {
    return { kind: "update", state: { query: state.query + str, cursor: 0 } };
  }

  return { kind: "update", state };
}

/** Bolds the first case-insensitive match of `query` in `text`. */
function markMatch(text: string, query: string, c: Palette): string {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return text.slice(0, at) + c.bold(text.slice(at, at + query.length)) + text.slice(at + query.length);
}

export interface RenderPickerOptions {
  maxVisible?: number;
  width?: number;
  palette?: Palette;
  symbols?: Symbols;
  /** Dimmed text shown after each item, aligned in a column. Not used for filtering. */
  hint?: (item: string) => string | undefined;
}

export function renderPicker(items: string[], state: PickerState, title: string, opts: RenderPickerOptions = {}): string[] {
  const { maxVisible = 10, width = 80, palette: c = PLAIN, symbols: sym = symbols(), hint } = opts;
  const visible = filterItems(items, state.query);
  const help = keyHints([["↑/↓", "move"], ["type", "to filter"], ["enter", "select"], ["esc", "cancel"]], c, sym);
  const lines = [
    `${c.accent("?")} ${c.bold(title)}`,
    state.query ? `  ${c.dim("Filter:")} ${state.query} ${c.dim(`(${visible.length} of ${items.length})`)}` : `  ${help}`,
  ];

  if (visible.length === 0) {
    lines.push(`  ${c.dim("(no matches)")}`);
    return lines.map((l) => fit(l, width, sym.ellipsis));
  }

  const labelWidth = hint ? Math.max(...items.map(textWidth)) : 0;
  const start = Math.max(0, Math.min(state.cursor - Math.floor(maxVisible / 2), visible.length - maxVisible));
  const end = Math.min(visible.length, start + maxVisible);

  if (start > 0) lines.push(`  ${c.dim(`${sym.ellipsis} ${start} more above`)}`);
  for (let i = start; i < end; i++) {
    const item = visible[i];
    const selected = i === state.cursor;
    const label = markMatch(item, state.query, c);
    const note = hint?.(item);
    const after = note ? `${" ".repeat(labelWidth - textWidth(item))}   ${c.dim(note)}` : "";
    lines.push(selected ? `${c.accent(sym.pointer)} ${c.accent(label)}${after}` : `  ${label}${after}`);
  }
  if (end < visible.length) lines.push(`  ${c.dim(`${sym.ellipsis} ${visible.length - end} more below`)}`);

  return lines.map((l) => fit(l, width, sym.ellipsis));
}

export interface PickOptions {
  title: string;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  maxVisible?: number;
  hint?: (item: string) => string | undefined;
  echo?: (value: string) => string;
}

export function pick(items: string[], opts: PickOptions): Promise<string | null> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stderr;
  const c = paletteFor(output);
  const sym = symbols();
  const region = new LiveRegion(output);
  let state: PickerState = { query: "", cursor: 0 };

  const draw = () => {
    const maxVisible = Math.min(opts.maxVisible ?? 10, Math.max(1, region.rows - 4));
    region.render(renderPicker(items, state, opts.title, { maxVisible, width: region.width, palette: c, symbols: sym, hint: opts.hint }));
  };

  return new Promise((res) => {
    emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    output.write("\x1b[?25l");

    const finish = (value: string | null) => {
      input.removeListener("keypress", onKey);
      input.setRawMode(wasRaw);
      input.pause();
      const shown = value === null ? [] : [`${c.accent("?")} ${opts.title} ${c.accent(opts.echo ? opts.echo(value) : value)}`];
      region.done(shown);
      output.write("\x1b[?25h");
      res(value);
    };

    const onKey = (str: string | undefined, key: Key | undefined) => {
      const result = handleKey(items, state, str, key);
      if (result.kind === "select") return finish(result.value);
      if (result.kind === "cancel") return finish(null);
      state = result.state;
      draw();
    };

    input.on("keypress", onKey);
    draw();
  });
}

export async function listFiles(dir: string, extension: string): Promise<string[]> {
  const ext = extension.toLowerCase();
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.toLowerCase().endsWith(ext))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

export function listPdfs(dir: string): Promise<string[]> {
  return listFiles(dir, ".pdf");
}

export function listJsonld(dir: string): Promise<string[]> {
  return listFiles(dir, ".jsonld");
}

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}
