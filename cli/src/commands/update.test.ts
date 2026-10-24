import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedChecksum, replaceBinary, resolveAsset, sha256, update } from "./update.js";
import { readCache, RELEASES_URL } from "../lib/update-check.js";

const tmp = () => mkdtempSync(join(tmpdir(), "aecdo-update-test-"));

function makeTarball(binaryContent: string): Buffer {
  const dir = tmp();
  writeFileSync(join(dir, "aecdo"), binaryContent);
  writeFileSync(join(dir, "README.md"), "readme");
  const out = join(tmp(), "aecdo-linux-x64.tar.gz");
  const res = spawnSync("tar", ["-C", dir, "-czf", out, "."]);
  assert.equal(res.status, 0, res.stderr.toString());
  return readFileSync(out);
}

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    const route = routes[url];
    return Promise.resolve(route ? route() : new Response("not found", { status: 404 }));
  };
}

function releaseRoutes(version: string, archive: Buffer, checksum = sha256(archive)) {
  const base = `https://github.com/jeff-carmichael/aecdo/releases/download/v${version}`;
  return {
    [RELEASES_URL]: () => Response.json({ tag_name: `v${version}` }),
    [`${base}/aecdo-linux-x64.tar.gz`]: () => new Response(new Uint8Array(archive)),
    [`${base}/checksums.txt`]: () =>
      new Response(`${"0".repeat(64)}  aecdo-darwin-arm64.tar.gz\n${checksum}  aecdo-linux-x64.tar.gz\n`),
  };
}

function installedBinary(content = "old binary"): string {
  const path = join(tmp(), "aecdo");
  writeFileSync(path, content, { mode: 0o755 });
  return path;
}

test("resolveAsset maps platforms to release archives", () => {
  assert.deepEqual(resolveAsset("darwin", "arm64"), { target: "darwin-arm64", archive: "aecdo-darwin-arm64.tar.gz", binary: "aecdo" });
  assert.deepEqual(resolveAsset("linux", "x64"), { target: "linux-x64", archive: "aecdo-linux-x64.tar.gz", binary: "aecdo" });
  assert.deepEqual(resolveAsset("win32", "x64"), { target: "windows-x64", archive: "aecdo-windows-x64.zip", binary: "aecdo.exe" });
  assert.throws(() => resolveAsset("win32", "arm64"), /No prebuilt binary for win32-arm64/);
  assert.throws(() => resolveAsset("freebsd", "x64"), /No prebuilt binary/);
});

test("expectedChecksum finds the listed file", () => {
  const sums = "AAA  aecdo-linux-x64.tar.gz\nbbb *aecdo-windows-x64.zip\n";
  assert.equal(expectedChecksum(sums, "aecdo-linux-x64.tar.gz"), "aaa");
  assert.equal(expectedChecksum(sums, "aecdo-windows-x64.zip"), "bbb");
  assert.throws(() => expectedChecksum(sums, "aecdo-darwin-x64.tar.gz"), /does not list/);
});

test("replaceBinary on Windows keeps the old file aside", async () => {
  const target = installedBinary("old");
  const staged = join(tmp(), "new");
  writeFileSync(staged, "new");
  await replaceBinary(staged, target, "win32");
  assert.equal(readFileSync(target, "utf-8"), "new");
  assert.equal(readFileSync(`${target}.old`, "utf-8"), "old");
});

test("npm installs get the npm command instead of a self-update", async () => {
  const lines: string[] = [];
  await update({ currentVersion: "0.3.1", standalone: false, log: (l) => lines.push(l), fetchImpl: fakeFetch({}) });
  assert.match(lines.join("\n"), /npm install -g aecdo@latest/);
});

test("reports when already on the latest version", async () => {
  const lines: string[] = [];
  const cachePath = join(tmp(), "update-check.json");
  await update({
    currentVersion: "0.4.0",
    standalone: true,
    fetchImpl: fakeFetch(releaseRoutes("0.4.0", Buffer.alloc(0))),
    cachePath,
    log: (l) => lines.push(l),
  });
  assert.match(lines.join("\n"), /already the latest/);
  assert.equal(readCache(cachePath)?.latestVersion, "0.4.0");
});

test("downloads, verifies, and swaps in the new binary", async () => {
  const execPath = installedBinary();
  const cachePath = join(tmp(), "update-check.json");
  await update({
    currentVersion: "0.3.1",
    standalone: true,
    execPath,
    platform: "linux",
    arch: "x64",
    fetchImpl: fakeFetch(releaseRoutes("0.4.0", makeTarball("new binary"))),
    cachePath,
    log: () => {},
  });
  assert.equal(readFileSync(execPath, "utf-8"), "new binary");
  assert.equal(statSync(execPath).mode & 0o777, 0o755);
  assert.deepEqual(readdirSync(join(execPath, "..")), ["aecdo"]);
  assert.equal(readCache(cachePath)?.latestVersion, "0.4.0");
});

test("a checksum mismatch leaves the installed binary alone", async () => {
  const execPath = installedBinary();
  await assert.rejects(
    update({
      currentVersion: "0.3.1",
      standalone: true,
      execPath,
      platform: "linux",
      arch: "x64",
      fetchImpl: fakeFetch(releaseRoutes("0.4.0", makeTarball("tampered"), "f".repeat(64))),
      cachePath: join(tmp(), "update-check.json"),
      log: () => {},
    }),
    /Checksum mismatch/
  );
  assert.equal(readFileSync(execPath, "utf-8"), "old binary");
  assert.equal(existsSync(`${execPath}.old`), false);
});
