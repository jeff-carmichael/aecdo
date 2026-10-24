import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rename, rm, unlink, writeFile, constants } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fetchLatestVersion, isNewerVersion, writeCache } from "../lib/update-check.js";

const REPO = "jeff-carmichael/aecdo";
const DOWNLOAD_TIMEOUT_MS = 120_000;
const SUPPORTED = new Set(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]);

export interface UpdateOptions {
  currentVersion: string;
  standalone: boolean;
  execPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  fetchImpl?: typeof fetch;
  cachePath?: string;
  log?: (line: string) => void;
}

export interface ReleaseAsset {
  target: string;
  archive: string;
  binary: string;
}

export function resolveAsset(platform: NodeJS.Platform, arch: string): ReleaseAsset {
  const key = `${platform}-${arch}`;
  if (!SUPPORTED.has(key)) {
    throw new Error(`No prebuilt binary for ${key}. Download one from https://github.com/${REPO}/releases or install with npm.`);
  }
  if (platform === "win32") {
    return { target: "windows-x64", archive: "aecdo-windows-x64.zip", binary: "aecdo.exe" };
  }
  const target = key;
  return { target, archive: `aecdo-${target}.tar.gz`, binary: "aecdo" };
}

export function releaseUrl(version: string, file: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/${file}`;
}

export function expectedChecksum(checksums: string, file: string): string {
  for (const line of checksums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+\*?/);
    if (name === file && hash) return hash.toLowerCase();
  }
  throw new Error(`checksums.txt does not list ${file}`);
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

// The old binary is moved aside on Windows because a running .exe cannot be
// overwritten; it is deleted on a later run by cleanupOldBinary.
export async function replaceBinary(newPath: string, targetPath: string, platform: NodeJS.Platform): Promise<void> {
  if (platform === "win32") {
    const old = `${targetPath}.old`;
    await rm(old, { force: true });
    await rename(targetPath, old);
    try {
      await rename(newPath, targetPath);
    } catch (err) {
      await rename(old, targetPath);
      throw err;
    }
  } else {
    await chmod(newPath, 0o755);
    await rename(newPath, targetPath);
  }
}

export async function cleanupOldBinary(execPath = process.execPath): Promise<void> {
  try {
    await unlink(`${execPath}.old`);
  } catch {
    // nothing to clean up
  }
}

// Windows' own tar.exe (bsdtar) reads zip files; a Git Bash tar on PATH does not.
function extract(archivePath: string, destDir: string, platform: NodeJS.Platform): void {
  const tar = platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const result = spawnSync(tar, ["-xf", archivePath, "-C", destDir], { stdio: ["ignore", "ignore", "pipe"] });
  if (result.error) throw new Error(`Could not run tar to unpack the update: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Could not unpack ${basename(archivePath)}: ${result.stderr.toString().trim()}`);
  }
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "aecdo-cli" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function update(opts: UpdateOptions): Promise<void> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const platform = opts.platform ?? process.platform;

  if (!opts.standalone) {
    log(`aecdo v${opts.currentVersion} was installed with npm. To upgrade, run:`);
    log("  npm install -g aecdo@latest");
    return;
  }

  let latest: string | undefined;
  try {
    latest = await fetchLatestVersion(fetchImpl);
  } catch (err) {
    throw new Error(`Could not reach GitHub to check for updates: ${(err as Error).message}`);
  }
  if (!latest) throw new Error(`Could not find the latest release at https://github.com/${REPO}/releases`);

  const recordLatest = () => {
    try {
      writeCache({ lastChecked: Date.now(), latestVersion: latest }, opts.cachePath);
    } catch {
      // the cache is only for the update notice
    }
  };

  if (!isNewerVersion(latest, opts.currentVersion)) {
    recordLatest();
    log(`aecdo v${opts.currentVersion} is already the latest version.`);
    return;
  }

  const asset = resolveAsset(platform, opts.arch ?? process.arch);
  const targetPath = realpathSync(opts.execPath ?? process.execPath);
  const installDir = dirname(targetPath);

  const notWritable = () => {
    const hint = platform === "win32" ? "Run it again from an administrator terminal." : "Run it again with: sudo aecdo update";
    return new Error(`Cannot write to ${installDir}. ${hint}`);
  };
  try {
    await access(installDir, constants.W_OK);
  } catch {
    throw notWritable();
  }

  log(`Updating aecdo v${opts.currentVersion} → v${latest} (${asset.target})...`);
  const [archive, checksums] = await Promise.all([
    download(releaseUrl(latest, asset.archive), fetchImpl),
    download(releaseUrl(latest, "checksums.txt"), fetchImpl),
  ]);

  const expected = expectedChecksum(new TextDecoder().decode(checksums), asset.archive);
  const actual = sha256(archive);
  if (expected !== actual) {
    throw new Error(`Checksum mismatch for ${asset.archive} (expected ${expected}, got ${actual}). Nothing was changed.`);
  }

  const work = await mkdtemp(join(tmpdir(), "aecdo-update-"));
  const staged = join(installDir, `.${asset.binary}.new-${process.pid}`);
  try {
    const archivePath = join(work, asset.archive);
    await writeFile(archivePath, archive);
    extract(archivePath, work, platform);

    let binary: Buffer;
    try {
      binary = await readFile(join(work, asset.binary));
    } catch {
      throw new Error(`${asset.archive} did not contain ${asset.binary}`);
    }
    // Stage beside the target so the final rename stays on one filesystem.
    try {
      await writeFile(staged, binary);
      await replaceBinary(staged, targetPath, platform);
    } catch (err) {
      // Windows' access() check ignores ACLs, so permission errors can surface here instead.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") throw notWritable();
      throw err;
    }
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(staged, { force: true });
  }

  recordLatest();
  log(`Updated ${targetPath} to v${latest}.`);
}
