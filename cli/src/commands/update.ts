import { spawn, spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rename, rm, unlink, writeFile, constants } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { sha256 } from "../lib/hash.js";
import { fetchLatestVersion, isNewerVersion, NPM_UPDATE_COMMAND, writeCache } from "../lib/update-check.js";

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
  /**
   * Moves the new binary over the old one as an administrator, when the folder needs that
   * (the app asks for the password with the system's own dialog). Without it, that's an error.
   */
  elevate?: (staged: string, target: string) => Promise<void>;
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

/**
 * How the app moves the new binary into a folder only an administrator can change (such as
 * /usr/local/bin, where install.sh puts it): the Mac's password dialog, or pkexec's on Linux.
 * Undefined on Windows, which installs to the user's own folder.
 */
export function adminMoveCommand(platform: NodeJS.Platform, staged: string, target: string): string[] | undefined {
  if (platform === "darwin") {
    // The paths are arguments, never part of the script text.
    return [
      "osascript",
      "-e",
      "on run argv",
      "-e",
      'do shell script "/bin/mv -f " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv with prompt "aecdo needs your password to install its update." with administrator privileges',
      "-e",
      "end run",
      staged,
      target,
    ];
  }
  if (platform === "linux") return ["pkexec", "/bin/mv", "-f", staged, target];
  return undefined;
}

/** Runs `adminMoveCommand`; rejects "Cancelled" when the password dialog is dismissed. */
export function adminMove(staged: string, target: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const command = adminMoveCommand(platform, staged, target);
  if (!command) return Promise.reject(new Error(`Cannot write to ${dirname(target)}.`));
  return new Promise((res, rej) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (d: Buffer) => (errors += d.toString("utf-8")));
    child.on("error", (err) => rej(new Error(`Couldn't ask for the administrator password (${err.message}). Run 'sudo aecdo update' in a terminal.`)));
    child.on("exit", (code) => {
      if (code === 0) return res();
      // osascript: "User canceled. (-128)"; pkexec: 126 when the dialog is dismissed, 127 when not authorized.
      if (/-128|cancel/i.test(errors) || code === 126) return rej(new Error("Cancelled"));
      rej(new Error(`Couldn't install the update in ${dirname(target)}: ${errors.trim() || `exit code ${code}`}. Run 'sudo aecdo update' in a terminal.`));
    });
  });
}

export async function cleanupOldBinary(execPath = process.execPath): Promise<void> {
  try {
    await unlink(`${execPath}.old`);
  } catch {
    // nothing to clean up
  }
}

/**
 * The tar to run on this machine. On Windows it's the system tar.exe (bsdtar): it reads zip
 * files, while a Git Bash tar on PATH doesn't and reads "C:\…" as a remote host.
 */
export function systemTar(host: NodeJS.Platform = process.platform): string {
  return host === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}

function extract(archivePath: string, destDir: string): void {
  const tar = systemTar();
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

/** Replaces the standalone binary with the latest release; resolves the version installed, if any. */
export async function update(opts: UpdateOptions): Promise<string | undefined> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const platform = opts.platform ?? process.platform;

  if (!opts.standalone) {
    log(`aecdo v${opts.currentVersion} was installed with npm. To upgrade, run:`);
    log(`  ${NPM_UPDATE_COMMAND}`);
    return undefined;
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
    return undefined;
  }

  const asset = resolveAsset(platform, opts.arch ?? process.arch);
  const targetPath = realpathSync(opts.execPath ?? process.execPath);
  const installDir = dirname(targetPath);

  const notWritable = () => {
    const hint = platform === "win32" ? "Run 'aecdo update' in an administrator terminal." : "Run 'sudo aecdo update' in a terminal.";
    return new Error(`Cannot write to ${installDir}. ${hint}`);
  };
  let writable = true;
  try {
    await access(installDir, constants.W_OK);
  } catch {
    writable = false;
  }
  if (!writable && !opts.elevate) throw notWritable();

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
  // Stage beside the target so the final rename stays on one filesystem; an administrator's move copies if it must.
  const staged = writable ? join(installDir, `.${asset.binary}.new-${process.pid}`) : join(work, `${asset.binary}.new`);
  try {
    const archivePath = join(work, asset.archive);
    await writeFile(archivePath, archive);
    extract(archivePath, work);

    let binary: Buffer;
    try {
      binary = await readFile(join(work, asset.binary));
    } catch {
      throw new Error(`${asset.archive} did not contain ${asset.binary}`);
    }
    try {
      await writeFile(staged, binary);
      if (writable) await replaceBinary(staged, targetPath, platform);
      else {
        await chmod(staged, 0o755);
        await opts.elevate!(staged, targetPath);
      }
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
  return latest;
}
