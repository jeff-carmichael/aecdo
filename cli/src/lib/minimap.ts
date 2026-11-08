import type { Palette } from "./style.js";
import { PLAIN } from "./style.js";

type Rect = readonly [number, number, number, number];

export interface MapBox {
  bbox: Rect;
  selected?: boolean;
}

export interface MapGlyphs {
  normal: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
  selected: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
  page: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
  /** A box too small to outline. */
  dot: string;
  /** A selected box too small to outline. */
  mark: string;
}

export const UNICODE_MAP: MapGlyphs = {
  normal: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  selected: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  page: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  dot: "▪",
  mark: "■",
};

export const ASCII_MAP: MapGlyphs = {
  normal: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
  selected: { tl: "#", tr: "#", bl: "#", br: "#", h: "=", v: "#" },
  page: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
  dot: "o",
  mark: "#",
};

/** Common sheet sizes in points, landscape. A page is assumed to be the smallest one that holds every box. */
const SHEET_SIZES: [number, number][] = [
  [792, 612], // Letter
  [842, 595], // A4
  [1008, 612], // Legal
  [1224, 792], // Tabloid / ANSI B
  [1191, 842], // A3
  [1296, 864], // ARCH B
  [1584, 1224], // ANSI C
  [1684, 1191], // A2
  [1728, 1296], // ARCH C
  [2384, 1684], // A1
  [2448, 1584], // ANSI D
  [2592, 1728], // ARCH D
  [3024, 2160], // ARCH E1
  [3168, 2448], // ANSI E
  [3370, 2384], // A0
  [3456, 2592], // ARCH E
];

/** The page's size, guessed from the boxes since the data doesn't record it. */
export function pageExtent(boxes: readonly Rect[]): [number, number] {
  const w = Math.max(1, ...boxes.map((b) => b[2]));
  const h = Math.max(1, ...boxes.map((b) => b[3]));
  for (const [a, b] of SHEET_SIZES) {
    if (w <= a && h <= b) return [a, b];
    if (w <= b && h <= a) return [b, a];
  }
  return [w * 1.02, h * 1.02];
}

/** Map size in cells that keeps the page's shape (terminal cells are about twice as tall as wide). */
export function mapSize(page: [number, number], maxWidth: number, maxHeight: number): [number, number] {
  const aspect = page[1] / page[0] / 2;
  let w = Math.max(6, maxWidth);
  let h = Math.round((w - 2) * aspect) + 2;
  if (h > maxHeight) {
    h = Math.max(4, maxHeight);
    w = Math.min(maxWidth, Math.round((h - 2) / aspect) + 2);
  }
  return [w, h];
}

interface Cell {
  ch: string;
  paint?: (s: string) => string;
}

/**
 * Draws the page as an outline with each box inside it; the selected box gets heavy lines
 * in the accent color.
 */
export function renderMinimap(
  boxes: readonly MapBox[],
  width: number,
  height: number,
  opts: { c?: Palette; glyphs?: MapGlyphs; page?: [number, number] } = {}
): string[] {
  const c = opts.c ?? PLAIN;
  const g = opts.glyphs ?? UNICODE_MAP;
  const [pw, ph] = opts.page ?? pageExtent(boxes.map((b) => b.bbox));
  const grid: Cell[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: " " })));
  const innerW = width - 2;
  const innerH = height - 2;
  const set = (x: number, y: number, ch: string, paint?: (s: string) => string) => {
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = { ch, paint };
  };
  const toCells = (b: Rect): [number, number, number, number] => {
    const clampX = (v: number) => Math.min(innerW, Math.max(1, v));
    const clampY = (v: number) => Math.min(innerH, Math.max(1, v));
    // Rounding both edges the same way keeps boxes that touch on the page from sharing a cell.
    const x0 = clampX(1 + Math.round((b[0] / pw) * innerW));
    const y0 = clampY(1 + Math.round((b[1] / ph) * innerH));
    const x1 = Math.max(x0, clampX(Math.round((b[2] / pw) * innerW)));
    const y1 = Math.max(y0, clampY(Math.round((b[3] / ph) * innerH)));
    return [x0, y0, x1, y1];
  };
  const outline = (x0: number, y0: number, x1: number, y1: number, s: MapGlyphs["normal"], paint: (t: string) => string) => {
    for (let x = x0 + 1; x < x1; x++) {
      set(x, y0, s.h, paint);
      set(x, y1, s.h, paint);
    }
    for (let y = y0 + 1; y < y1; y++) {
      set(x0, y, s.v, paint);
      set(x1, y, s.v, paint);
    }
    set(x0, y0, s.tl, paint);
    set(x1, y0, s.tr, paint);
    set(x0, y1, s.bl, paint);
    set(x1, y1, s.br, paint);
  };

  outline(0, 0, width - 1, height - 1, g.page, c.dim);
  // The selected box goes last so overlapping outlines don't cut through it.
  for (const box of [...boxes.filter((b) => !b.selected), ...boxes.filter((b) => b.selected)]) {
    const paint = box.selected ? (t: string) => c.accent(c.bold(t)) : c.dim;
    const [x0, y0, x1, y1] = toCells(box.bbox);
    if (x1 - x0 < 1 || y1 - y0 < 1) {
      set(x0, y0, box.selected ? g.mark : g.dot, paint);
      continue;
    }
    outline(x0, y0, x1, y1, box.selected ? g.selected : g.normal, paint);
  }

  return grid.map((row) => {
    let out = "";
    let run = "";
    let paint: Cell["paint"];
    const flush = () => {
      out += paint ? paint(run) : run;
      run = "";
    };
    for (const cell of row) {
      if (cell.paint !== paint) {
        flush();
        paint = cell.paint;
      }
      run += cell.ch;
    }
    flush();
    return out;
  });
}
