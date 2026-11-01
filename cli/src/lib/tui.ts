import { release } from "node:os";
import { paletteFor, PLAIN } from "./style.js";
import type { Palette } from "./style.js";

/** Glyphs for interactive output, with an ASCII set for terminals whose fonts lack them. */
export interface Symbols {
  ok: string;
  error: string;
  pointer: string;
  sep: string;
  ellipsis: string;
  barFull: string;
  barEmpty: string;
  spinner: string[];
  box: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
}

export const UNICODE: Symbols = {
  ok: "✓",
  error: "✗",
  pointer: "❯",
  sep: "·",
  ellipsis: "…",
  barFull: "█",
  barEmpty: "░",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  box: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
};

export const ASCII: Symbols = {
  ok: "+",
  error: "x",
  pointer: ">",
  sep: "-",
  ellipsis: "...",
  barFull: "#",
  barEmpty: "-",
  spinner: ["-", "\\", "|", "/"],
  box: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
};

/**
 * Based on the is-unicode-supported package: the classic Windows console font lacks these glyphs.
 * Windows 11 (build 22000+) opens Windows Terminal with a font that has them.
 */
export function unicodeSupported(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, osRelease = release()): boolean {
  if (platform !== "win32") return env.TERM !== "linux";
  if (Number(osRelease.split(".")[2]) >= 22000) return true;
  return Boolean(
    env.WT_SESSION ||
      env.TERMINUS_SUBLIME ||
      env.ConEmuTask === "{cmd::Cmder}" ||
      env.TERM_PROGRAM === "vscode" ||
      env.TERM === "xterm-256color" ||
      env.TERM === "alacritty" ||
      env.TERMINAL_EMULATOR === "JetBrains-JediTerm"
  );
}

let cachedSymbols: Symbols | undefined;

export function symbols(): Symbols {
  return (cachedSymbols ??= unicodeSupported() ? UNICODE : ASCII);
}

// eslint-disable-next-line no-control-regex
const ANSI_SEQ = /\x1b\[[0-9;?]*[A-Za-z]/g;
// eslint-disable-next-line no-control-regex
const ANSI_SPLIT = /(\x1b\[[0-9;?]*[A-Za-z])/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQ, "");
}

/** Terminal columns a code point takes: 0 for controls and combining marks, 2 for wide CJK and emoji. */
export function charWidth(cp: number): number {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** How many terminal columns the text takes, ignoring color codes. */
export function textWidth(text: string): number {
  let width = 0;
  for (const ch of stripAnsi(text)) width += charWidth(ch.codePointAt(0)!);
  return width;
}

/**
 * Cuts text to `width` columns, ending in "…", keeping color codes intact.
 * Lines that fit are returned unchanged.
 */
export function fit(text: string, width: number, ellipsis = "…"): string {
  if (textWidth(text) <= width) return text;
  const room = Math.max(0, width - textWidth(ellipsis));
  let out = "";
  let used = 0;
  let styled = false;
  for (const part of text.split(ANSI_SPLIT)) {
    if (part.startsWith("\x1b[")) {
      out += part;
      styled = true;
      continue;
    }
    for (const ch of part) {
      const w = charWidth(ch.codePointAt(0)!);
      if (used + w > room) return out + (styled ? "\x1b[0m" : "") + ellipsis;
      out += ch;
      used += w;
    }
  }
  return out;
}

/** Pads text with spaces to `width` columns, ignoring color codes. */
export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - textWidth(text)));
}

export function spinnerFrame(frame: number, sym: Symbols = symbols()): string {
  return sym.spinner[frame % sym.spinner.length];
}

/** A bar such as "████████░░░░" filled in proportion to done/total. */
export function progressBar(done: number, total: number, width = 20, c: Palette = PLAIN, sym: Symbols = symbols()): string {
  const filled = total > 0 ? Math.round((width * Math.min(done, total)) / total) : 0;
  return c.ok(sym.barFull.repeat(filled)) + c.dim(sym.barEmpty.repeat(width - filled));
}

/** "8s", "1m 05s", "2h 03m". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** A footer like "↑/↓ move · enter select · esc cancel", keys bold and labels dim. */
export function keyHints(hints: [key: string, label: string][], c: Palette = PLAIN, sym: Symbols = symbols()): string {
  return hints.map(([key, label]) => `${c.bold(key)} ${c.dim(label)}`).join(c.dim(` ${sym.sep} `));
}

/** Draws lines in a rounded box no wider than `maxWidth` columns, borders included. */
export function box(lines: string[], maxWidth = 80, c: Palette = PLAIN, sym: Symbols = symbols()): string[] {
  const inner = Math.max(1, Math.min(Math.max(...lines.map(textWidth)), maxWidth - 4));
  const b = sym.box;
  return [
    c.dim(b.tl + b.h.repeat(inner + 2) + b.tr),
    ...lines.map((line) => `${c.dim(b.v)} ${padEnd(fit(line, inner, sym.ellipsis), inner)} ${c.dim(b.v)}`),
    c.dim(b.bl + b.h.repeat(inner + 2) + b.br),
  ];
}

/**
 * A block of lines at the bottom of the terminal that can be redrawn in place.
 * Each line is cut to the terminal width and the block to its height, because
 * a wrapped line or one scrolled off the top can't be erased by moving the cursor up.
 */
export class LiveRegion {
  private height = 0;

  constructor(private out: NodeJS.WriteStream = process.stderr) {}

  get width(): number {
    return Math.max(10, (this.out.columns || 80) - 1);
  }

  get rows(): number {
    return Math.max(2, (this.out.rows || 24) - 1);
  }

  render(lines: string[]): void {
    const shown = lines.slice(0, this.rows).map((line) => fit(line, this.width));
    this.out.write(this.erase() + shown.map((l) => l + "\n").join(""));
    this.height = shown.length;
  }

  /** Erases the block, then writes `lines` as normal output that stays on screen. */
  done(lines: string[] = []): void {
    this.out.write(this.erase() + lines.map((l) => l + "\n").join(""));
    this.height = 0;
  }

  private erase(): string {
    return this.height ? `\x1b[${this.height}A\r\x1b[0J` : "";
  }
}

export interface TaskOptions<T> {
  /** The line left on screen when `fn` succeeds. Defaults to the label. */
  done?: (result: T) => string;
  out?: NodeJS.WriteStream;
}

/** Runs `fn` with a spinner next to `label`, then leaves a ✓ or ✗ line in its place. */
export async function task<T>(label: string, fn: () => Promise<T>, opts: TaskOptions<T> = {}): Promise<T> {
  const out = opts.out ?? process.stderr;
  const c = paletteFor(out);
  const sym = symbols();

  if (!out.isTTY) {
    out.write(`${label}…\n`);
    const result = await fn();
    if (opts.done) out.write(`${opts.done(result)}\n`);
    return result;
  }

  const region = new LiveRegion(out);
  let frame = 0;
  const draw = () => region.render([`${c.accent(spinnerFrame(frame++, sym))} ${label}`]);
  draw();
  const timer = setInterval(draw, 80);
  timer.unref();
  try {
    const result = await fn();
    region.done([`${c.ok(sym.ok)} ${opts.done ? opts.done(result) : label}`]);
    return result;
  } catch (err) {
    region.done([`${c.error(sym.error)} ${label}`]);
    throw err;
  } finally {
    clearInterval(timer);
  }
}
