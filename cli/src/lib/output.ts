import { writeFile } from "node:fs/promises";

interface OutputOptions {
  pretty?: boolean;
  output?: string;
}

export async function output(content: unknown, opts: OutputOptions = {}): Promise<void> {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (opts.pretty) {
    text = JSON.stringify(content, null, 2);
  } else {
    text = JSON.stringify(content);
  }

  if (opts.output) {
    await writeFile(opts.output, text + "\n", "utf-8");
    console.log(`Output written to ${opts.output}`);
  } else {
    console.log(text);
  }
}
