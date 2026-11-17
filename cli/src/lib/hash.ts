import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const fileHashes = new Map<string, { size: number; mtimeMs: number; hash: string }>();

/** A file's SHA-256, streamed so large PDFs aren't read into memory, and cached until the file changes. */
export async function fileSha256(path: string): Promise<string> {
  const { size, mtimeMs } = statSync(path);
  const cached = fileHashes.get(path);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs) return cached.hash;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  const hex = hash.digest("hex");
  fileHashes.set(path, { size, mtimeMs, hash: hex });
  return hex;
}
