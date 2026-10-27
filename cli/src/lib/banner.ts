import { colorEnabled } from "./mention-highlight.js";

// An original 8-bit construction worker's head: hard hat, ears, and eyes.
// Each character is one pixel; two pixel rows share one terminal line via "▀"
// (foreground = top pixel, background = bottom pixel).
const SPRITE = [
  "......YYYY......",
  "....YYYYwYYY....",
  "...YYYYYwYYYY...",
  "...YYYYYwYYYY...",
  "...SSSSSSSSSS...",
  "..SSSSSSSSSSSS..",
  "..SSKKSSSSKKSS..",
  "..SSKKSSSSKKSS..",
  "...SSSSSSSSSS...",
  "...SSSSSSSSSS...",
  "....SSSSSSSS....",
  ".....SSSSSS.....",
];

// 256-color codes, which nearly every terminal supports, since the 16 base colors
// have no skin tone.
const COLORS: Record<string, number> = {
  Y: 220, // hard hat
  w: 228, // hat highlight
  S: 223, // skin
  K: 236, // eyes
};

export const BANNER_WIDTH = SPRITE[0].length;
/** Narrowest terminal that still gets the banner. */
export const BANNER_MIN_COLUMNS = 60;

export interface BannerInfo {
  name: string;
  sheets: number;
}

function cell(top: string, bottom: string): string {
  const t = COLORS[top];
  const b = COLORS[bottom];
  if (t === undefined && b === undefined) return " ";
  if (t === undefined) return `\x1b[38;5;${b}m▄\x1b[39m`;
  if (b === undefined) return `\x1b[38;5;${t}m▀\x1b[39m`;
  if (t === b) return `\x1b[38;5;${t}m█\x1b[39m`;
  return `\x1b[38;5;${t};48;5;${b}m▀\x1b[39;49m`;
}

/** The sprite as terminal lines, each exactly BANNER_WIDTH columns wide. */
export function spriteLines(): string[] {
  const lines: string[] = [];
  for (let y = 0; y < SPRITE.length; y += 2) {
    const top = SPRITE[y];
    const bottom = SPRITE[y + 1] ?? "";
    let line = "";
    for (let x = 0; x < top.length; x++) line += cell(top[x], bottom[x] ?? ".");
    lines.push(line);
  }
  return lines;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** The sprite with the drawing set's name beside it. */
export function renderBanner(info: BannerInfo, columns: number): string[] {
  const sprite = spriteLines();
  const room = columns - BANNER_WIDTH - 4;
  const sheets = `${info.sheets} sheet${info.sheets === 1 ? "" : "s"}`;
  const text: string[] = [];
  text[1] = `\x1b[1;33mAECDO explore\x1b[22;39m`;
  text[2] = `\x1b[2m${truncate("Let's dig into the drawings.", room)}\x1b[22m`;
  text[3] = `\x1b[1m${truncate(info.name, room)}\x1b[22m`;
  text[4] = `\x1b[2m${truncate(sheets, room)}\x1b[22m`;
  return sprite.map((line, i) => (text[i] ? `  ${line}  ${text[i]}` : `  ${line}`).trimEnd());
}

/** Only in a color terminal wide enough to fit it, unless AECDO_NO_BANNER is set. */
export function bannerEnabled(stream: NodeJS.WriteStream = process.stdout, env = process.env): boolean {
  return colorEnabled(stream, env) && !env.AECDO_NO_BANNER && (stream.columns || 80) >= BANNER_MIN_COLUMNS;
}
