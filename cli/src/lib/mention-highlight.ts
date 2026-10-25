import type { Interface } from "node:readline";
import { allMentions, assistantForMention } from "./llm.js";

const MENTION = /^(\s*)@([a-z]+)(?![a-z])/i;

/** Wraps a leading @mention in color when it names a known assistant. */
export function highlightMention(line: string, color = "\x1b[1;36m", reset = "\x1b[0m"): string {
  const m = MENTION.exec(line);
  if (!m || !assistantForMention(m[2])) return line;
  const end = m[0].length;
  return `${m[1]}${color}${line.slice(m[1].length, end)}${reset}${line.slice(end)}`;
}

/** readline completer: Tab after a leading "@" offers the assistant names that match. */
export function completeMention(line: string): [string[], string] {
  const m = /^\s*@([a-z]*)$/i.exec(line);
  if (!m) return [[], line];
  const typed = m[1].toLowerCase();
  const hits = allMentions()
    .filter((name) => name.startsWith(typed))
    .map((name) => `@${name} `);
  return [hits, line.trimStart()];
}

export function colorEnabled(stream: NodeJS.WriteStream = process.stdout, env = process.env): boolean {
  return Boolean(stream.isTTY) && !env.NO_COLOR && env.TERM !== "dumb";
}

// readline has no public hook for styling the line being edited, so this uses its
// internal redraw methods. If a runtime lacks them, input just stays uncolored.
interface ReadlineInternals {
  line: string;
  _writeToOutput?: (s: string) => void;
  _refreshLine?: () => void;
}

/**
 * Colors a valid @claude / @chatgpt / @openrouter … at the start of the line while the user types.
 * `editing` must be true only while a prompt is waiting for input, so redraws never
 * land in the middle of other output.
 */
export function enableMentionHighlight(
  rl: Interface,
  editing: () => boolean,
  input: NodeJS.ReadStream = process.stdin
): void {
  const internals = rl as unknown as ReadlineInternals;
  const write = internals._writeToOutput;
  const refresh = internals._refreshLine;
  if (typeof write !== "function" || typeof refresh !== "function") return;

  internals._writeToOutput = (s: string) => {
    const line = internals.line;
    const styled = line && s.endsWith(line) ? s.slice(0, s.length - line.length) + highlightMention(line) : s;
    write.call(rl, styled);
  };

  let wasMention = false;
  input.on("keypress", (_str: string | undefined, key: { name?: string } | undefined) => {
    if (key?.name === "return" || key?.name === "enter") {
      wasMention = false;
      return;
    }
    setImmediate(() => {
      if (!editing()) return;
      const isMention = MENTION.test(internals.line ?? "");
      if (isMention || wasMention) refresh.call(rl);
      wasMention = isMention;
    });
  });
}
