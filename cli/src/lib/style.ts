import { colorEnabled } from "./mention-highlight.js";

type Paint = (text: string) => string;

/** The colors used for human-readable output (explore, page, validate). */
export interface Palette {
  /** Section labels: "Drawing:", "Tables (2):", "Notes (1):". */
  heading: Paint;
  /** "Layer:" labels. */
  layer: Paint;
  /** Item type tags such as "[THING]". */
  tag: Paint;
  /** Secondary detail: bbox values, ids, drawing type and scale, arrows, rules. */
  dim: Paint;
  bold: Paint;
  ok: Paint;
  error: Paint;
}

const sgr = (open: string, close: string): Paint => (text) => (text ? `\x1b[${open}m${text}\x1b[${close}m` : text);
const same: Paint = (text) => text;

// Only the 16 base colors, so the terminal's own theme decides the exact shades and
// they stay readable on light and dark backgrounds. Faint (2) rather than "bright
// black" (90) for dim text, since some dark themes draw 90 almost invisible.
export const ANSI: Palette = {
  heading: sgr("1;36", "22;39"),
  layer: sgr("35", "39"),
  tag: sgr("33", "39"),
  dim: sgr("2", "22"),
  bold: sgr("1", "22"),
  ok: sgr("1;32", "22;39"),
  error: sgr("1;31", "22;39"),
};

export const PLAIN: Palette = {
  heading: same,
  layer: same,
  tag: same,
  dim: same,
  bold: same,
  ok: same,
  error: same,
};

let current: Palette | undefined;

/** The palette for stdout: colors only on a TTY without NO_COLOR or TERM=dumb. */
export function palette(): Palette {
  return (current ??= colorEnabled() ? ANSI : PLAIN);
}

/** Runs `fn` with a fixed palette, e.g. PLAIN while capturing text for the AI assistant. */
export function withPalette<T>(p: Palette, fn: () => T): T {
  const previous = current;
  current = p;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/** "[72, 108, 720, 540]" in the dim color. */
export function bboxText(bbox: readonly number[]): string {
  return palette().dim(`[${bbox.join(", ")}]`);
}
