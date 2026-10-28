import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const REPO = "jeff-carmichael/aecdo";
const DOWNLOAD_TIMEOUT_MS = 120_000;

export const DEFAULT_EXAMPLES_DIR = "aecdo-examples";

export const EXAMPLE_FILES = [
  "README.md",
  "maple-grove-library.jsonld",
  "sample-drawing-package-1and2family.jsonld",
  "sample-drawing-package-1and2family.pdf",
  "sample-drawing-set.jsonld",
];

export interface ExamplesOptions {
  version: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export function exampleUrl(ref: string, file: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${ref}/examples/${file}`;
}

export function expandHome(path: string, home = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
  return path;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Files come from the release tag so they match this version's schema; a dev
// build or a file added after that tag falls back to main.
async function fetchExample(file: string, version: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  let lastStatus = 0;
  for (const ref of [`v${version}`, "main"]) {
    const res = await fetchImpl(exampleUrl(ref, file), {
      headers: { "User-Agent": "aecdo-cli" },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    lastStatus = res.status;
    if (res.status !== 404) break;
  }
  throw new Error(`Could not download ${file} (${lastStatus}) from ${exampleUrl("main", file)}`);
}

export async function examples(dirArg: string | undefined, opts: ExamplesOptions): Promise<string> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dir = resolve(expandHome(dirArg ?? DEFAULT_EXAMPLES_DIR));

  await mkdir(dir, { recursive: true });
  log(`Downloading example drawing sets to ${dir}`);

  for (const file of EXAMPLE_FILES) {
    const target = join(dir, file);
    if (!opts.force && (await exists(target))) {
      log(`  ${file} already there, skipped (--force to replace)`);
      continue;
    }
    const data = await fetchExample(file, opts.version, fetchImpl);
    const partial = `${target}.partial`;
    try {
      await writeFile(partial, data);
      await rename(partial, target);
    } finally {
      await rm(partial, { force: true });
    }
    log(`  ${file}`);
  }

  log("");
  log("Try:");
  log(`  cd "${dir}"`);
  log("  aecdo explore maple-grove-library.jsonld");
  log("  aecdo explore sample-drawing-package-1and2family.jsonld   # type \"view\" to see the PDF page");
  return dir;
}
