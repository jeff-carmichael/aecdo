import type { Key } from "node:readline";
import type { Explorer, ScreenModel, ScreenRow } from "./explore.js";
import { palette } from "../lib/style.js";
import { box, fit, keyHints, padEnd, symbols, textWidth } from "../lib/tui.js";

/** What the app needs from the terminal; the real one is `Screen`, tests pass a fake. */
export interface AppScreen {
  readonly width: number;
  readonly height: number;
  draw(lines: string[]): void;
  suspend(): void;
  resume(): void;
}

/** Things that leave full screen or touch the PDF; explore() wires them to the real viewer, assistant, and markups. */
export interface AppActions {
  /** Runs `fn` and returns what the explorer printed meanwhile. */
  collect(fn: () => void): string[];
  /** Opens the PDF page for what's selected; returns the messages to show. */
  view(): Promise<string[]>;
  /** Asks the AI in the normal terminal (the screen is suspended while it runs). */
  ask(): Promise<void>;
  /** Reviews and saves markups in the normal terminal. */
  markups(): Promise<void>;
  hasPendingMarkups(): boolean;
  /** Offers to save pending markups before quitting (in the normal terminal). */
  beforeQuit(): Promise<void>;
}

const HELP: [string, string][] = [
  ["↑ ↓", "move"],
  ["Enter or →", "open"],
  ["← or Esc", "go back up"],
  ["b", "back to where you were, after following a link"],
  ["/", "find a sheet by number or title"],
  ["v", "open this page of the PDF, outlined in red"],
  ["a", "ask the AI about what's on screen"],
  ["m", "review and save markups the AI suggested"],
  ["d", "show or hide ids and coordinates"],
  ["q", "quit"],
];

interface PaneLine {
  text: string;
  /** Index into the selectable rows, for lines that are one. */
  row?: number;
}

/**
 * The full-screen explorer: a sheet list on the left, what's open on the right,
 * and a footer with the keys that work. Navigation goes through `Explorer.handle`,
 * so up, back, links, and the assistant behave exactly as in the prompt version.
 */
export class ExploreApp {
  private cursors = new Map<string, number>();
  private bodyScroll = 0;
  private filter?: string;
  private status = "";
  private overlay?: string[];
  private busy = false;
  private finish?: () => void;

  constructor(
    private explorer: Explorer,
    private screen: AppScreen,
    private actions: AppActions
  ) {}

  /** Resolves when the user quits. */
  run(): Promise<void> {
    return new Promise((res) => {
      this.finish = res;
      this.redraw();
    });
  }

  redraw(): void {
    this.screen.draw(this.frame());
  }

  private get sheetFocus(): boolean {
    const kind = this.explorer.view.kind;
    return kind === "sheets" || kind === "group";
  }

  private place(): string {
    return this.explorer.prompt();
  }

  private sheetRows(): ScreenRow[] {
    const rows = this.explorer.sheetPane().rows;
    if (!this.filter) return rows;
    const q = this.filter.toLowerCase();
    return rows.filter((r) => `${r.label} ${r.note ?? ""}`.toLowerCase().includes(q));
  }

  private mainWidth(): number {
    return this.twoPanes() ? this.screen.width - this.leftWidth() - 3 : this.screen.width - 2;
  }

  private model(): ScreenModel {
    return this.explorer.screenModel(this.mainWidth());
  }

  private mainRows(): ScreenRow[] {
    return this.model().sections.flatMap((s) => s.rows);
  }

  private rows(): ScreenRow[] {
    return this.sheetFocus ? this.sheetRows() : this.mainRows();
  }

  private get cursor(): number {
    const n = this.rows().length;
    return Math.min(this.cursors.get(this.place()) ?? 0, Math.max(0, n - 1));
  }

  private set cursor(i: number) {
    this.cursors.set(this.place(), i);
  }

  handleKey(str: string | undefined, key: Key = {}): void {
    if (this.busy) return;
    if (this.overlay) {
      this.overlay = undefined;
      this.redraw();
      return;
    }
    this.status = "";
    const name = key.name;
    const rows = this.rows();
    const page = Math.max(1, this.screen.height - 6);

    if (key.ctrl && name === "c") return void this.quit();

    if (this.filter !== undefined) {
      if (name === "escape") {
        this.filter = undefined;
        this.cursor = 0;
      } else if (name === "backspace") {
        this.filter = this.filter.slice(0, -1);
        this.cursor = 0;
      } else if (name === "return" || name === "enter" || name === "right") {
        const row = rows[this.cursor];
        this.filter = undefined;
        if (row) this.open(row);
      } else if (name === "up" || name === "down") {
        this.move(name === "up" ? -1 : 1, rows.length);
      } else if (str && str.length === 1 && str >= " " && !key.ctrl && !key.meta) {
        this.filter += str;
        this.cursor = 0;
      }
      return this.redraw();
    }

    switch (name) {
      case "up":
      case "down":
        if (rows.length) this.move(name === "up" ? -1 : 1, rows.length);
        else this.scrollBody(name === "up" ? -1 : 1);
        return this.redraw();
      case "pageup":
      case "pagedown":
        if (rows.length) this.move((name === "pageup" ? -1 : 1) * page, rows.length, false);
        else this.scrollBody((name === "pageup" ? -1 : 1) * page);
        return this.redraw();
      case "home":
        this.cursor = 0;
        this.bodyScroll = 0;
        return this.redraw();
      case "end":
        this.cursor = Math.max(0, rows.length - 1);
        return this.redraw();
      case "return":
      case "enter":
      case "right": {
        const row = rows[this.cursor];
        if (row) this.open(row);
        return this.redraw();
      }
      case "left":
      case "backspace":
      case "escape":
        if (this.explorer.view.kind !== "sheets") this.go("up");
        return this.redraw();
    }

    switch (str) {
      case "/":
        if (!this.sheetFocus) this.go("top");
        this.filter = "";
        this.cursor = 0;
        return this.redraw();
      case "b":
        this.go("back");
        return this.redraw();
      case "d":
        this.actions.collect(() => this.explorer.handle("details"));
        this.status = this.explorer.showingDetails ? "Showing ids and coordinates. Press d to hide them." : "Ids and coordinates hidden.";
        return this.redraw();
      case "?":
      case "h":
        this.overlay = this.helpLines();
        return this.redraw();
      case "q":
        return void this.quit();
      case "v":
        return void this.viewPage();
      case "a":
      case "@":
        return void this.outside(() => this.actions.ask());
      case "m":
        return void this.outside(() => this.actions.markups());
    }
  }

  private move(delta: number, count: number, wrap = true): void {
    let next = this.cursor + delta;
    if (wrap) next = ((next % count) + count) % count;
    else next = Math.max(0, Math.min(count - 1, next));
    this.cursor = next;
  }

  private scrollBody(delta: number): void {
    this.bodyScroll = Math.max(0, this.bodyScroll + delta);
  }

  /** Runs a command, keeping the cursor of the place we leave and showing any complaint. */
  private go(command: string, reportFailure = false): void {
    const before = this.explorer.view;
    const lines = this.actions.collect(() => this.explorer.handle(command));
    if (this.explorer.view !== before) {
      this.bodyScroll = 0;
      const jumped = lines.find((l) => l.trim().startsWith("Jumped to"));
      if (jumped) this.status = jumped.trim().replace(/ "back" returns\.$/, " Press b to come back.");
    } else if (reportFailure) {
      this.status = lines.map((l) => l.trim()).find(Boolean) ?? "";
    }
  }

  private open(row: ScreenRow): void {
    this.go(row.command, true);
  }

  private async viewPage(): Promise<void> {
    this.busy = true;
    this.status = "Opening the PDF page…";
    this.redraw();
    try {
      const lines = (await this.actions.view()).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 2 || lines.some((l) => l.startsWith("Can't find"))) this.overlay = lines;
      else this.status = lines.join(" ");
    } catch (err) {
      this.status = `Couldn't open the page: ${(err as Error).message}`;
    } finally {
      this.busy = false;
      this.redraw();
    }
  }

  /** Leaves full screen while `fn` uses the normal terminal, then comes back. */
  private async outside(fn: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.screen.suspend();
    try {
      await fn();
    } catch (err) {
      this.status = (err as Error).message;
    } finally {
      this.screen.resume();
      this.busy = false;
      this.redraw();
    }
  }

  private async quit(): Promise<void> {
    if (this.actions.hasPendingMarkups()) {
      this.busy = true;
      this.screen.suspend();
      try {
        await this.actions.beforeQuit();
      } finally {
        this.busy = false;
      }
    }
    this.finish?.();
  }

  private helpLines(): string[] {
    const c = palette();
    const width = Math.max(...HELP.map(([k]) => k.length));
    return [c.bold("Keys"), "", ...HELP.map(([k, what]) => `${c.bold(k.padEnd(width))}   ${what}`), "", c.dim("Press any key to close.")];
  }

  /** Tables get the whole width, so schedules wrap as little as possible. */
  private twoPanes(): boolean {
    const v = this.explorer.view;
    const table = v.kind === "entry" && v.entry.kind === "table";
    return this.screen.width >= 70 && !table;
  }

  private leftWidth(): number {
    return Math.max(24, Math.min(40, Math.floor(this.screen.width * 0.32)));
  }

  /** The whole screen as one string per row. */
  frame(): string[] {
    const c = palette();
    const sym = symbols();
    const { width, height } = this.screen;
    const pane = this.explorer.sheetPane();
    const where = this.sheetFocus ? "" : this.place().replace(/>\s*$/, "");
    const header = `${c.bold(pane.title)}${where ? c.dim(`  ${sym.pointer}  ${where}`) : ""}`;
    const bodyHeight = Math.max(1, height - 4);

    let body: string[];
    if (this.twoPanes()) {
      const lw = this.leftWidth();
      const left = this.leftPane(lw, bodyHeight);
      const main = this.mainPane(width - lw - 3, bodyHeight);
      body = Array.from({ length: bodyHeight }, (_, i) => `${padEnd(fit(left[i] ?? "", lw), lw)} ${c.dim(sym.box.v)} ${main[i] ?? ""}`);
    } else {
      body = this.sheetFocus ? this.leftPane(width - 1, bodyHeight) : this.mainPane(width - 2, bodyHeight).map((l) => ` ${l}`);
    }

    const lines = [` ${header}`, c.dim(sym.box.h.repeat(width)), ...body, this.statusLine(), ` ${this.footer()}`];
    return this.overlay ? this.withOverlay(lines) : lines;
  }

  private statusLine(): string {
    const c = palette();
    if (this.filter !== undefined) {
      const count = this.sheetRows().length;
      return ` ${c.accent("Find:")} ${this.filter}${c.accent("▏")}  ${c.dim(`${count} ${count === 1 ? "match" : "matches"} · Enter to open, Esc to stop`)}`;
    }
    return this.status ? ` ${c.warn(this.status)}` : "";
  }

  private footer(): string {
    const c = palette();
    const keys: [string, string][] = this.sheetFocus
      ? [["↑↓", "move"], ["Enter", "open"], ["/", "find"], ["?", "help"], ["q", "quit"]]
      : [["↑↓", "move"], ["Enter", "open"], ["←", "back"], ["v", "view PDF"], ["a", "ask AI"], ["?", "help"], ["q", "quit"]];
    return keyHints(keys, c);
  }

  private leftPane(width: number, height: number): string[] {
    const c = palette();
    const sym = symbols();
    const pane = this.explorer.sheetPane();
    const rows = this.sheetFocus ? this.sheetRows() : pane.rows;
    const labelWidth = Math.min(8, Math.max(0, ...rows.map((r) => textWidth(r.label))));
    const selected = this.sheetFocus ? this.cursor : rows.findIndex((r) => r.label === pane.current);
    const start = window(selected, rows.length, height);
    return rows.slice(start, start + height).map((r, i) => {
      const index = start + i;
      const text = fit(`${padEnd(r.label, labelWidth)}  ${r.note ?? ""}`, width - 3);
      if (index !== selected) return `   ${text}`;
      return this.sheetFocus ? ` ${c.accent(sym.pointer)} ${c.accent(c.bold(text))}` : ` ${c.dim(sym.pointer)} ${c.bold(text)}`;
    });
  }

  private mainPane(width: number, height: number): string[] {
    const preview = this.sheetFocus;
    let model: ScreenModel;
    if (preview) {
      const row = this.sheetRows()[this.cursor];
      if (!row?.sheet) return row ? this.groupPreview(row, width) : [palette().dim("No sheets match. Press Esc to clear the search.")];
      model = this.explorer.screenModel(width, row.sheet);
    } else {
      model = this.model();
    }
    const lines = this.modelLines(model, width, preview ? -1 : this.cursor);
    const selectedLine = lines.findIndex((l) => l.row === this.cursor);
    let start: number;
    if (!preview && selectedLine >= 0) {
      start = window(selectedLine, lines.length, height, 3);
    } else {
      start = Math.min(this.bodyScroll, Math.max(0, lines.length - height));
      if (!preview) this.bodyScroll = start;
    }
    const shown = lines.slice(start, start + height).map((l) => l.text);
    if (start + height < lines.length) shown[height - 1] = palette().dim(`  ↓ ${lines.length - start - height + 1} more`);
    return shown;
  }

  private groupPreview(row: ScreenRow, width: number): string[] {
    const c = palette();
    return [c.bold(fit(`${row.label}  ${row.note ?? ""}`, width)), "", c.dim("Press Enter to see these sheets.")];
  }

  private modelLines(model: ScreenModel, width: number, cursor: number): PaneLine[] {
    const c = palette();
    const sym = symbols();
    const out: PaneLine[] = [
      { text: c.bold(fit(model.title, width)) },
      { text: c.dim(fit(model.subtitle, width)) },
    ];
    if (model.body?.length) {
      out.push({ text: "" });
      for (const line of model.body) out.push({ text: fit(line, width) });
    }
    let index = 0;
    for (const section of model.sections) {
      out.push({ text: "" });
      if (section.heading) out.push({ text: fit(`${c.bold(section.heading)}${section.note ? `  ${c.dim(section.note)}` : ""}`, width) });
      const labelWidth = Math.min(Math.floor(width * 0.6), Math.max(0, ...section.rows.map((r) => textWidth(r.label))));
      for (const row of section.rows) {
        const label = fit(row.label, labelWidth);
        const note = row.note ? `  ${" ".repeat(Math.max(0, labelWidth - textWidth(label)))}${c.dim(row.note)}` : "";
        const selected = index === cursor;
        const text = selected ? `${c.accent(sym.pointer)} ${c.accent(c.bold(label))}${note}` : `  ${label}${note}`;
        out.push({ text: fit(text, width), row: index });
        index++;
      }
    }
    return out;
  }

  private withOverlay(lines: string[]): string[] {
    const { width, height } = this.screen;
    const drawn = box(this.overlay!, Math.min(width - 4, 76), palette(), symbols());
    const top = Math.max(1, Math.floor((height - drawn.length) / 2));
    const left = Math.max(0, Math.floor((width - textWidth(drawn[0])) / 2));
    const out = [...lines];
    drawn.forEach((line, i) => {
      if (top + i < height) out[top + i] = `${" ".repeat(left)}${line}`;
    });
    return out;
  }
}

/** First index to show so `selected` stays visible, keeping `margin` rows of context when possible. */
export function window(selected: number, count: number, height: number, margin = 0): number {
  if (count <= height || selected < 0) return 0;
  const ideal = selected - Math.max(margin, Math.floor(height / 3));
  return Math.max(0, Math.min(ideal, count - height));
}
