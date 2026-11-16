// A fake GitHub release for the update tests (here and in the app's).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256, systemTar } from "./update.js";
import { RELEASES_URL } from "../lib/update-check.js";

export const tmp = () => mkdtempSync(join(tmpdir(), "aecdo-update-test-"));

export function makeTarball(binaryContent: string): Buffer {
  const dir = tmp();
  writeFileSync(join(dir, "aecdo"), binaryContent);
  writeFileSync(join(dir, "README.md"), "readme");
  const out = join(tmp(), "aecdo-linux-x64.tar.gz");
  const res = spawnSync(systemTar(), ["-C", dir, "-czf", out, "."]);
  assert.equal(res.status, 0, res.stderr.toString());
  return readFileSync(out);
}

export function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    const route = routes[url];
    return Promise.resolve(route ? route() : new Response("not found", { status: 404 }));
  };
}

export function releaseRoutes(version: string, archive: Buffer, checksum = sha256(archive)) {
  const base = `https://github.com/jeff-carmichael/aecdo/releases/download/v${version}`;
  return {
    [RELEASES_URL]: () => Response.json({ tag_name: `v${version}` }),
    [`${base}/aecdo-linux-x64.tar.gz`]: () => new Response(new Uint8Array(archive)),
    [`${base}/checksums.txt`]: () =>
      new Response(`${"0".repeat(64)}  aecdo-darwin-arm64.tar.gz\n${checksum}  aecdo-linux-x64.tar.gz\n`),
  };
}

export function installedBinary(content = "old binary"): string {
  const path = join(tmp(), "aecdo");
  writeFileSync(path, content, { mode: 0o755 });
  return path;
}

