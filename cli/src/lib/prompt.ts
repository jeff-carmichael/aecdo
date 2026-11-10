import { createInterface } from "node:readline";

/** Questions need a person at a terminal on both ends. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

/** Picks an item by its number, by its exact text, or by text that only one item contains. */
export function matchChoice(items: string[], answer: string): string[] {
  const a = answer.trim();
  if (/^\d+$/.test(a)) {
    const item = items[Number(a) - 1];
    return item === undefined ? [] : [item];
  }
  const exact = items.find((i) => i.toLowerCase() === a.toLowerCase());
  if (exact) return [exact];
  return items.filter((i) => i.toLowerCase().includes(a.toLowerCase()));
}

/**
 * Prints a numbered list on stderr and reads a choice. Typing text narrows the list.
 * An empty answer or Ctrl+C returns null.
 */
export async function choose(items: string[], title: string, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stderr): Promise<string | null> {
  const rl = createInterface({ input, output });
  const question = (q: string) =>
    new Promise<string | null>((res) => {
      rl.once("SIGINT", () => res(null));
      rl.question(q, res);
    });
  try {
    let shown = items;
    for (;;) {
      output.write(`${title}\n${shown.map((item, i) => `  ${String(i + 1).padStart(String(shown.length).length)}. ${item}`).join("\n")}\n`);
      const answer = await question("Number (Enter to cancel): ");
      if (answer === null || !answer.trim()) return null;
      const matches = matchChoice(shown, answer);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) shown = matches;
      else output.write(`No match for "${answer.trim()}".\n`);
    }
  } finally {
    rl.close();
  }
}
