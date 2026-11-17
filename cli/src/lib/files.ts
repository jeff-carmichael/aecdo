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

/** A drawing set that has its source PDF next to it: `house.jsonld` with `house.pdf`. */
export interface FolderSet {
  /** The shared name, without an extension. */
  name: string;
  file: string;
  pdf: string;
}

const stem = (file: string) => file.replace(/\.[^.]+$/, "").toLowerCase();

/** The `.jsonld` files in `dir` that have a `.pdf` of the same name (any case), in reading order. */
export async function listFolderSets(dir: string): Promise<FolderSet[]> {
  const [sets, pdfs] = await Promise.all([listJsonld(dir), listPdfs(dir)]);
  const pdfByStem = new Map(pdfs.map((p) => [stem(p), p]));
  return sets.flatMap((file) => {
    const pdf = pdfByStem.get(stem(file));
    return pdf ? [{ name: file.replace(/\.jsonld$/i, ""), file, pdf }] : [];
  });
}
