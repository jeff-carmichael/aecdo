import { readdir } from "node:fs/promises";

/** File names in `dir` with the extension (any case), sorted the way people read them. */
export async function listFiles(dir: string, extension: string): Promise<string[]> {
  const ext = extension.toLowerCase();
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.toLowerCase().endsWith(ext))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

export function listPdfs(dir: string): Promise<string[]> {
  return listFiles(dir, ".pdf");
}

export function listJsonld(dir: string): Promise<string[]> {
  return listFiles(dir, ".jsonld");
}
