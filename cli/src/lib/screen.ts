import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";
import { fit, padEnd } from "./tui.js";

export type KeyHandler = (str: string | undefined, key: Key) => void;

const ENTER = "\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J";
const LEAVE = "\x1b[0m\x1b[?25h\x1b[?1049l";

/**
 * A full-window screen on the terminal's alternate buffer (the one vim and less use).
 * Draws whole frames but only rewrites the lines that changed, and always puts the
 * terminal back (main buffer, cursor, cooked input) on exit, suspend, or a crash.
 */
export class Screen {
  private previous: string[] = [];
  private active = false;
  private handler?: KeyHandler;
  private onResize?: () => void;
  private readonly restoreOnExit = () => this.restore();

  constructor(
    private out: NodeJS.WriteStream = process.stdout,
    private input: NodeJS.ReadStream = process.stdin
  ) {}

  get width(): number {
    return this.out.columns || 80;
  }

  get height(): number {
    return this.out.rows || 24;
  }

  /** Switches to the alternate screen and sends keys to `onKey`; `onResize` runs when the window changes size. */
  start(onKey: KeyHandler, onResize: () => void): void {
    this.handler = onKey;
    this.onResize = () => {
      this.previous = [];
      this.out.write("\x1b[2J");
      onResize();
    };
    emitKeypressEvents(this.input);
    this.input.on("keypress", this.keypress);
    this.out.on("resize", this.onResize);
    process.on("exit", this.restoreOnExit);
    this.resume();
  }

  /** Leaves full screen for good. */
  stop(): void {
    this.restore();
    this.input.removeListener("keypress", this.keypress);
    if (this.onResize) this.out.removeListener("resize", this.onResize);
    process.removeListener("exit", this.restoreOnExit);
    this.input.pause();
  }

  /** Hands the normal terminal back for a while, e.g. to ask a question with readline. */
  suspend(): void {
    this.restore();
  }

  resume(): void {
    if (this.active) return;
    this.active = true;
    this.previous = [];
    this.out.write(ENTER);
    if (this.input.isTTY) this.input.setRawMode(true);
    this.input.resume();
  }

  get suspended(): boolean {
    return !this.active;
  }

  /** Draws a frame: one string per row, cut or padded to the window width. */
  draw(lines: string[]): void {
    if (!this.active) return;
    const width = this.width;
    let out = "";
    for (let row = 0; row < this.height; row++) {
      const line = padEnd(fit(lines[row] ?? "", width), width);
      if (line !== this.previous[row]) out += `\x1b[${row + 1};1H${line}\x1b[0m`;
      this.previous[row] = line;
    }
    if (out) this.out.write(out);
  }

  private readonly keypress = (str: string | undefined, key: Key | undefined) => {
    if (!this.active) return;
    this.handler?.(str, key ?? {});
  };

  private restore(): void {
    if (!this.active) return;
    this.active = false;
    if (this.input.isTTY) this.input.setRawMode(false);
    this.out.write(LEAVE);
  }
}
