import type { Key } from "node:readline";
import type { Explorer, ScreenModel, ScreenRow } from "./explore.js";
import { palette } from "../lib/style.js";
import { wrapText } from "../lib/table.js";
import { box, fit, keyHints, padEnd, symbols, textWidth } from "../lib/tui.js";
import { ASCII_MAP, UNICODE_MAP, mapSize, pageExtent, renderMinimap } from "../lib/minimap.js";

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
  /** Sends a question to the AI; its answer comes back through `chatWrite`/`chatPrint`/`chatConfirm`. */
  ask(text: string): Promise<void>;
  /** Stops the answer being written. */
  stopAsking(): void;
  /** Reviews and saves markups in the normal terminal. */
  markups(): Promise<void>;
  hasPendingMarkups(): boolean;
  /** Offers to save pending markups before quitting (in the normal terminal). */
  beforeQuit(): Promise<void>;
  /** Which AI questions without an @name go to; the chat shows it. */
  aiModel?(): Promise<AiModel | undefined>;
}

export interface AiModel {
  /** The model family, e.g. "Claude". */
  label: string;
  /** The model and how it's reached, e.g. "claude-sonnet-5-5 via Anthropic", or "not set up". */
  detail?: string;
  /** The other @names that are set up, e.g. ["@chatgpt"]. */
  others: string[];
}

const HELP: [string, string][] = [
  ["↑ ↓", "move"],
  ["Enter or →", "open"],
  ["← or Esc", "go back to where you were, even after following a link"],
  ["u", "go up one level, to what this is on"],
  ["/", "find a sheet by number or title"],
  ["v", "open this page of the PDF, outlined in red"],
  ["a", "ask the AI about what's on screen (Esc closes the chat)"],
  ["m", "review and save markups the AI suggested"],
  ["d", "show or hide ids and coordinates"],
  ["q", "quit"],
];

interface PaneLine {
  text: string;
  /** Index into the selectable rows, for lines that are one. */
  row?: number;
}

interface ChatEntry {
  kind: "you" | "ai" | "info";
  text: string;
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
  private chatOpen = false;
  private chatInput = "";
  private transcript: ChatEntry[] = [];
  /** Lines scrolled up from the newest part of the chat. */
  private chatScroll = 0;
  private asking = false;
  private question?: (answer: string) => void;
  private ai?: AiModel;
  /** Where the AI last moved to, so each move is mentioned once in the chat. */
  private aiShown?: string;

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

  /** True while "/" is finding a sheet; it can start anywhere and only moves once a sheet is picked. */
  private get finding(): boolean {
    return this.filter !== undefined;
  }

  /** The sheet list has the cursor: on a sheet list, or while finding a sheet. */
  private get listFocus(): boolean {
    return this.sheetFocus || this.finding;
  }

  /** Each place keeps its own cursor; finding a sheet has one too, so the place's cursor survives Esc. */
  private place(): string {
    return this.finding ? "\0find" : this.explorer.prompt();
  }

  private sheetRows(): ScreenRow[] {
    const rows = this.finding && !this.sheetFocus ? this.explorer.allSheetRows() : this.explorer.sheetPane().rows;
    if (!this.filter) return rows;
    const query = words(this.filter);
    if (!query.length) return rows;
    const byNumber = rows.filter((r) => compact(r.label).startsWith(query.join("")));
    return byNumber.length ? byNumber : rows.filter((r) => startsWords(query, r));
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
    return this.listFocus ? this.sheetRows() : this.mainRows();
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
    if (this.chatOpen) return this.chatKey(str, key);
    this.status = "";
    const name = key.name;
    const rows = this.rows();
    const page = Math.max(1, this.screen.height - 6);

    if (key.ctrl && name === "c") return void this.quit();

    if (this.filter !== undefined) {
      if (name === "escape") {
        this.filter = undefined;
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
        this.back();
        return this.redraw();
    }

    switch (str) {
      case "/":
        this.filter = "";
        this.cursor = 0;
        return this.redraw();
      case "b":
        this.back();
        return this.redraw();
      case "u":
        this.go("up");
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
        this.chatOpen = true;
        this.chatInput = str === "@" ? "@" : "";
        this.chatScroll = 0;
        this.refreshAi();
        return this.redraw();
      case "m":
        return void this.outside(() => this.actions.markups());
    }
  }

  /** Keys while the chat bar has focus: typing goes into the question, arrows scroll the answers. */
  private chatKey(str: string | undefined, key: Key): void {
    const name = key.name;
    const page = Math.max(1, this.chatHeight() - 1);
    if (name === "up" || name === "down" || name === "pageup" || name === "pagedown") {
      const step = name === "up" || name === "down" ? 1 : page;
      this.chatScroll = Math.max(0, this.chatScroll + (name === "up" || name === "pageup" ? step : -step));
      return this.redraw();
    }
    if (this.asking && !this.question) {
      if (name === "escape" || (key.ctrl && name === "c")) {
        this.actions.stopAsking();
        this.chatPrint("Stopped.");
      }
      return;
    }
    if (key.ctrl && name === "c") {
      if (!this.chatInput) return void this.quit();
      this.chatInput = "";
    } else if (name === "escape") {
      if (this.question) this.answer("");
      else this.chatOpen = false;
      this.chatInput = "";
    } else if (name === "return" || name === "enter") {
      const text = this.chatInput.trim();
      this.chatInput = "";
      if (this.question) this.answer(text);
      else if (text) return void this.send(text);
    } else if (name === "backspace") {
      this.chatInput = [...this.chatInput].slice(0, -1).join("");
    } else if (str && !key.ctrl && !key.meta) {
      // eslint-disable-next-line no-control-regex
      this.chatInput += str.replace(/[\x00-\x1f\x7f]/g, " ");
    }
    this.redraw();
  }

  private answer(text: string): void {
    const resolve = this.question!;
    this.question = undefined;
    this.transcript.push({ kind: "you", text: text || "no" });
    resolve(text);
  }

  private async send(text: string): Promise<void> {
    this.transcript.push({ kind: "you", text });
    this.chatScroll = 0;
    this.asking = true;
    this.redraw();
    try {
      await this.actions.ask(text);
    } catch (err) {
      this.chatPrint((err as Error).message);
    } finally {
      this.asking = false;
      this.question = undefined;
      this.redraw();
      this.refreshAi();
    }
  }

  /** Looks up which model questions go to; an @name in a question can change it. */
  private refreshAi(): void {
    if (!this.actions.aiModel) return;
    this.actions
      .aiModel()
      .then((ai) => {
        this.ai = ai;
        this.redraw();
      })
      .catch(() => undefined);
  }

  /**
   * Called after the AI moves the view, so the move shows above the chat right away and the
   * chat says where it went. Clears anything that would hide it.
   */
  assistantMoved(): void {
    this.filter = undefined;
    this.overlay = undefined;
    this.bodyScroll = 0;
    const where = this.explorer.location();
    if (where !== this.aiShown) {
      this.aiShown = where;
      this.chatPrint(`Now showing ${where} above`);
    } else {
      this.redraw();
    }
  }

  /** Streams part of the AI's answer into the chat. */
  chatWrite(text: string): void {
    const last = this.transcript.at(-1);
    if (last?.kind === "ai") last.text += text;
    else this.transcript.push({ kind: "ai", text });
    this.redraw();
  }

  /** Adds a status line (tool activity, errors) to the chat. */
  chatPrint(line: string): void {
    const text = quitFirst(line.trim(), "Press Esc, then q,");
    if (!text) return;
    this.transcript.push({ kind: "info", text });
    this.redraw();
  }

  /** Asks a yes/no question in the chat bar. */
  chatConfirm(question: string): Promise<boolean> {
    this.chatOpen = true;
    this.chatPrint(question);
    return new Promise((res) => {
      this.question = (answer) => res(/^y(es)?$/i.test(answer));
      this.redraw();
    });
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
      if (jumped) this.status = jumped.trim().replace(/ "back" returns\.$/, " Press ← to come back.");
    } else if (reportFailure) {
      this.status = lines.map((l) => l.trim()).find(Boolean) ?? "";
    }
  }

  /** Retraces your steps, so after following a link it returns to where the link was. */
  private back(): void {
    if (this.explorer.canGoBack) this.go("back");
    else if (this.explorer.view.kind !== "sheets") this.go("up");
  }

  private open(row: ScreenRow): void {
    if (row.sheet && !this.sheetFocus) {
      const before = this.explorer.view;
      const sheet = row.sheet;
      this.actions.collect(() => this.explorer.openSheetFromAnywhere(sheet));
      if (this.explorer.view !== before) this.bodyScroll = 0;
      return;
    }
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
    const table = v.kind === "entry" && v.entry.kind === "table" && !this.finding;
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
    const chatRows = this.chatOpen ? this.chatHeight() : 0;
    const bodyHeight = Math.max(1, height - 5 - (chatRows ? chatRows + 1 : 0));

    let body: string[];
    if (this.twoPanes()) {
      const lw = this.leftWidth();
      const left = this.leftPane(lw, bodyHeight);
      const rw = this.mainWidth();
      const right = this.mainPane(rw, bodyHeight);
      const inset = this.mapInset(rw, bodyHeight);
      if (inset.lines.length) {
        // Rows beside the map give up their right end to it; everything above keeps the full width.
        const room = rw - inset.width - 2;
        const first = bodyHeight - inset.lines.length - 1;
        for (let i = first; i < bodyHeight; i++) {
          const map = i > first ? `  ${inset.lines[i - first - 1]}` : "";
          right[i] = `${padEnd(fit(right[i] ?? "", room), room)}${map}`;
        }
      }
      body = Array.from({ length: bodyHeight }, (_, i) => {
        const leftCell = padEnd(fit(left[i] ?? "", lw), lw);
        return `${leftCell} ${c.dim(sym.box.v)} ${right[i] ?? ""}`;
      });
    } else {
      body = this.listFocus ? this.leftPane(width - 1, bodyHeight) : this.mainPane(width - 2, bodyHeight).map((l) => ` ${l}`);
    }

    const chat = chatRows ? this.chatPane(width, chatRows) : [];
    const lines = [` ${header}`, c.dim(sym.box.h.repeat(width)), ...body, ...chat, this.statusLine(), this.chatBar(width), ` ${this.footer()}`];
    return this.overlay ? this.withOverlay(lines) : lines;
  }

  /** Rows for the chat's answers: a bit under half the screen, leaving room for the drawings above. */
  private chatHeight(): number {
    const free = this.screen.height - 5;
    return Math.max(3, Math.min(Math.floor(free * 0.45), free - 4));
  }

  private where(): string {
    const w = this.place().replace(/>\s*$/, "");
    return w === "sheet" ? "this drawing set" : w;
  }

  private chatPane(width: number, height: number): string[] {
    const c = palette();
    const sym = symbols();
    const rule = this.chatRule(width);
    const inner = width - 2;
    let lines: string[] = [];
    if (this.transcript.length === 0) {
      const others = this.ai?.others ?? [];
      lines = [
        c.dim(`Ask anything about ${this.where()}, for example "Which doors are fire rated?"`),
        c.dim("The AI can open sheets for you, and what it opens shows above."),
        ...(others.length ? [c.dim(`Also set up: ${others.join(", ")}. Type one, alone or before a question, to change models.`)] : []),
      ].flatMap((l) => wrapKeepingIndent(l, inner));
    } else {
      this.transcript.forEach((entry, i) => {
        if (entry.kind === "you") {
          if (i > 0) lines.push("");
          const [first, ...rest] = wrapKeepingIndent(entry.text, inner - 2);
          lines.push(`${c.accent(sym.pointer)} ${c.bold(first)}`, ...rest.map((l) => `  ${c.bold(l)}`));
        } else if (entry.kind === "info") {
          lines.push(...wrapKeepingIndent(entry.text, inner).map((l) => c.dim(l)));
        } else {
          const paragraphs = entry.text.replace(/\n{3,}/g, "\n\n").trim().split("\n");
          for (const p of paragraphs) {
            const heading = /^#{1,6}\s+/.test(p);
            for (const l of wrapKeepingIndent(p.replace(/^#{1,6}\s+/, ""), inner)) {
              const styled = l.replace(/\*\*(.+?)\*\*/g, (_, t: string) => c.bold(t)).replace(/\*\*/g, "");
              lines.push(heading ? c.bold(styled) : styled);
            }
          }
        }
      });
      const last = this.transcript.at(-1);
      if (this.asking && !this.question && last?.kind !== "ai") lines.push(c.dim("Thinking…"));
    }
    this.chatScroll = Math.min(this.chatScroll, Math.max(0, lines.length - height));
    const start = Math.max(0, lines.length - height - this.chatScroll);
    const shown = lines.slice(start, start + height).map((l) => ` ${fit(l, inner)}`);
    if (this.chatScroll > 0) shown[height - 1] = ` ${c.dim(`↓ ${this.chatScroll} more line${this.chatScroll === 1 ? "" : "s"}, press ↓ to read on`)}`;
    while (shown.length < height) shown.push("");
    return [rule, ...shown];
  }

  /** "── Ask the AI · Claude (claude-sonnet-5-5 via Anthropic) ─── type @name to change models ──" */
  private chatRule(width: number): string {
    const c = palette();
    const h = symbols().box.h;
    const title = " Ask the AI ";
    const model = this.ai ? `· ${this.ai.label}${this.ai.detail ? ` (${this.ai.detail})` : ""} ` : "";
    const hint = " type @name to change models ";
    const used = 2 + textWidth(title) + textWidth(model);
    const fitsHint = used + textWidth(hint) + 4 <= width;
    const fill = Math.max(0, width - used - (fitsHint ? textWidth(hint) + 2 : 0));
    const left = c.dim(h.repeat(2)) + c.bold(title) + (model ? c.accent(fit(model, Math.max(0, width - 2 - textWidth(title)))) : "");
    return left + c.dim(h.repeat(fill)) + (fitsHint ? c.dim(hint) + c.dim(h.repeat(2)) : "");
  }

  private aiName(): string {
    return this.ai?.label ?? "the AI";
  }

  /** The line you type into: always at the bottom, so it's clear where to ask. */
  private chatBar(width: number): string {
    const c = palette();
    const sym = symbols();
    if (!this.chatOpen) return ` ${c.dim(sym.pointer)} ${c.dim(`Ask ${this.aiName()} about ${this.where()}… press a`)}`;
    if (this.asking && !this.question) return ` ${c.dim(sym.pointer)} ${c.dim("Answering… press Esc to stop")}`;
    const caret = c.accent("▏");
    const hint = this.question ? c.dim("  type y or n, then Enter") : "";
    const room = Math.max(4, width - 4 - textWidth(hint));
    let input = this.chatInput;
    if (textWidth(input) > room - 1) input = `…${[...input].slice(-(room - 2)).join("")}`;
    const shown = input || c.dim(this.ai ? `Type a question for ${this.ai.label} and press Enter, or @name to change models` : "Type a question and press Enter");
    const mark = this.question ? c.warn("?") : c.accent(sym.pointer);
    return ` ${mark} ${input ? shown + caret : caret + shown}${hint}`;
  }

  private statusLine(): string {
    const c = palette();
    if (this.filter !== undefined) {
      const count = this.sheetRows().length;
      return ` ${c.accent("Find:")} ${this.filter}${c.accent("▏")}  ${c.dim(`${count} ${count === 1 ? "match" : "matches"} · Enter to open, Esc to stop`)}`;
    }
    return this.status ? ` ${c.warn(quitFirst(this.status, this.chatOpen ? "Press Esc, then q," : "Press q"))}` : "";
  }

  private footer(): string {
    const c = palette();
    if (this.chatOpen) {
      const chatKeys: [string, string][] =
        this.asking && !this.question
          ? [["Esc", "stop"], ["↑↓", "scroll"]]
          : [["Enter", "send"], ["↑↓", "scroll"], ["Esc", "close chat"], ["@name", "change models"]];
      return keyHints(chatKeys, c);
    }
    const keys: [string, string][] = this.sheetFocus
      ? [["↑↓", "move"], ["Enter", "open"], ["/", "find"], ["a", "ask AI"], ["?", "help"], ["q", "quit"]]
      : [["↑↓", "move"], ["Enter", "open"], ["←", "back"], ["u", "up"], ["v", "view PDF"], ["a", "ask AI"], ["?", "help"], ["q", "quit"]];
    return keyHints(keys, c);
  }

  private leftPane(width: number, height: number): string[] {
    const c = palette();
    const sym = symbols();
    const pane = this.explorer.sheetPane();
    const focus = this.listFocus;
    const rows = focus ? this.sheetRows() : pane.rows;
    const labelWidth = Math.min(8, Math.max(0, ...rows.map((r) => textWidth(r.label))));
    const selected = focus ? this.cursor : rows.findIndex((r) => r.label === pane.current);
    const start = window(selected, rows.length, height);
    return rows.slice(start, start + height).map((r, i) => {
      const index = start + i;
      const text = fit(`${padEnd(r.label, labelWidth)}  ${r.note ?? ""}`, width - 3);
      if (index !== selected) return `   ${text}`;
      return focus ? ` ${c.accent(sym.pointer)} ${c.accent(c.bold(text))}` : ` ${c.dim(sym.pointer)} ${c.bold(text)}`;
    });
  }

  private mainPane(width: number, height: number): string[] {
    const preview = this.listFocus;
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
    // Somewhere just opened (by you or the AI) starts at its title, so you can see where you are.
    const fresh = !this.cursors.has(this.place());
    let start: number;
    if (!preview && selectedLine >= 0 && !(fresh && this.bodyScroll === 0)) {
      start = window(selectedLine, lines.length, height, 3);
    } else {
      start = Math.min(this.bodyScroll, Math.max(0, lines.length - height));
      if (!preview) this.bodyScroll = start;
    }
    const shown = lines.slice(start, start + height).map((l) => l.text);
    if (start + height < lines.length) shown[height - 1] = palette().dim(`  ↓ ${lines.length - start - height + 1} more`);
    return shown;
  }

  /**
   * The sheet's layout drawn from its bounding boxes, as a small inset in the right column's
   * bottom-right corner: big enough to show the structure, small enough to leave the list its room.
   */
  private mapInset(width: number, height: number): { lines: string[]; width: number } {
    const none = { lines: [], width: 0 };
    const maxW = Math.min(36, Math.max(20, Math.floor(width * 0.4)));
    const maxH = Math.min(12, Math.floor(height * 0.4));
    if (width < 50 || maxH < 6) return none;
    const sheet = this.listFocus ? this.sheetRows()[this.cursor]?.sheet : undefined;
    const map = this.listFocus ? sheet && this.explorer.sheetMap(-1, sheet) : this.explorer.sheetMap(this.cursor);
    if (!map?.boxes.length) return none;
    const page = pageExtent(map.boxes.map((b) => b.bbox));
    const [w, h] = mapSize(page, maxW, maxH);
    const glyphs = symbols().box.tl === "+" ? ASCII_MAP : UNICODE_MAP;
    return { lines: renderMinimap(map.boxes, w, h, { c: palette(), glyphs, page }), width: w };
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

/**
 * Turns 'Run "aecdo configure ai"' into an instruction to leave explore first, since other
 * aecdo commands can't run inside it. `how` is the key press, e.g. "Press q".
 */
export function quitFirst(text: string, how: string): string {
  return text.replace(/\bRun ["'](aecdo [^"']+)["']/g, `${how} to leave explore, then run "$1"`);
}

/** Wraps one line of text, keeping its leading indent (list items in answers) on every piece. */
function wrapKeepingIndent(text: string, width: number): string[] {
  if (!text.trim()) return [""];
  const indent = /^\s*/.exec(text)![0].replace(/\t/g, "  ");
  const room = Math.max(8, width - indent.length);
  return wrapText(text.trim(), room).map((l) => indent + l);
}

/** First index to show so `selected` stays visible, keeping `margin` rows of context when possible. */
export function window(selected: number, count: number, height: number, margin = 0): number {
  if (count <= height || selected < 0) return 0;
  const ideal = selected - Math.max(margin, Math.floor(height / 3));
  return Math.max(0, Math.min(ideal, count - height));
}

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const compact = (s: string): string => words(s).join("");

/** Each typed word must start a word of the sheet number or title. */
function startsWords(query: string[], row: ScreenRow): boolean {
  const all = [...words(row.label), ...words(row.note ?? "")];
  return query.every((q) => all.some((w) => w.startsWith(q)));
}
