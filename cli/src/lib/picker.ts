import { emitKeypressEvents } from "node:readline";
import { readdir } from "node:fs/promises";
import type { Key } from "node:readline";

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

function truncate(line: string, width: number): string {
  return line.length > width ? line.slice(0, Math.max(0, width - 1)) + "…" : line;
}

export function renderPicker(
  items: string[],
  state: PickerState,
  title: string,
  maxVisible = 10,
  width = 80,
): string[] {
  const visible = filterItems(items, state.query);
  const lines = [`? ${title}`, state.query ? `  Filter: ${state.query}` : "  ↑/↓ to move, type to filter, Enter to select, Esc to cancel"];

  if (visible.length === 0) {
    lines.push("  (no matches)");
    return lines.map((l) => truncate(l, width));
  }

  const start = Math.max(0, Math.min(state.cursor - Math.floor(maxVisible / 2), visible.length - maxVisible));
  const end = Math.min(visible.length, start + maxVisible);

  if (start > 0) lines.push(`  … ${start} more above`);
  for (let i = start; i < end; i++) {
    lines.push(`${i === state.cursor ? "> " : "  "}${visible[i]}`);
  }
  if (end < visible.length) lines.push(`  … ${visible.length - end} more below`);

  return lines.map((l) => truncate(l, width));
}

export interface PickOptions {
  title: string;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export function pick(items: string[], opts: PickOptions): Promise<string | null> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stderr;
  let state: PickerState = { query: "", cursor: 0 };
  let drawn = 0;

  const draw = () => {
    if (drawn > 0) output.write(`\x1b[${drawn}A\r\x1b[0J`);
    const lines = renderPicker(items, state, opts.title, 10, (output.columns || 80) - 1);
    output.write(lines.join("\n") + "\n");
    drawn = lines.length;
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
      output.write(`\x1b[${drawn}A\r\x1b[0J\x1b[?25h`);
      if (value !== null) output.write(`? ${opts.title} ${value}\n`);
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

export async function listPdfs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}
