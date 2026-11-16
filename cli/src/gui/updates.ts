import { adminMove, adminMoveCommand, update } from "../commands/update.js";
import { fetchLatestVersion, getCachePath, isCacheStale, isNewerVersion, isUpdateCheckDisabled, NPM_UPDATE_COMMAND, readCache, writeCache } from "../lib/update-check.js";

export interface UpdateState {
  current: string;
  /** The newest release seen, if any check has worked. */
  latest?: string;
  /** Whether `latest` is newer than this one. */
  available: boolean;
  /** Set for an npm install, which the app can't replace: the command to run instead. */
  npmCommand?: string;
  checking: boolean;
  installing: boolean;
  /** The version just installed, which runs once the app is opened again. */
  installed?: string;
  /** When GitHub was last asked (ms since the epoch). */
  checkedAt?: number;
  /** Why the last check or install failed. */
  error?: string;
}

export interface GuiUpdatesOptions {
  currentVersion: string;
  standalone: boolean;
  /** Called whenever the state changes, so the page can show it. */
  onChange: (state: UpdateState) => void;
  cachePath?: string;
  fetchImpl?: typeof fetch;
  /** Passed to `update`; tests point it at a fake binary. */
  execPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Moves the binary as an administrator when its folder needs that; tests replace it. */
  elevate?: (staged: string, target: string) => Promise<void>;
}

/**
 * Updates in the app: whether a newer release is out (the same daily check and cache as the
 * CLI's notice) and installing it with `aecdo update`'s code. The new binary takes over on the
 * next launch; the running one keeps going until then.
 */
export class GuiUpdates {
  private latest?: string;
  private checkedAt?: number;
  private checking?: Promise<void>;
  private installing = false;
  private installed?: string;
  private error?: string;

  constructor(private opts: GuiUpdatesOptions) {
    const cache = readCache(this.cachePath());
    this.latest = cache?.latestVersion;
    this.checkedAt = cache?.lastChecked;
  }

  private cachePath(): string {
    return this.opts.cachePath ?? getCachePath();
  }

  state(): UpdateState {
    const latest = this.installed ?? this.latest;
    return {
      current: this.opts.currentVersion,
      ...(latest ? { latest } : {}),
      available: !this.installed && Boolean(latest && isNewerVersion(latest, this.opts.currentVersion)),
      ...(this.opts.standalone ? {} : { npmCommand: NPM_UPDATE_COMMAND }),
      checking: this.checking !== undefined,
      installing: this.installing,
      ...(this.installed ? { installed: this.installed } : {}),
      ...(this.checkedAt ? { checkedAt: this.checkedAt } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  private changed(): void {
    this.opts.onChange(this.state());
  }

  /** The check when the app starts: only if the last one was a day ago, and not when turned off (NO_UPDATE_CHECK, CI). */
  checkInBackground(env: NodeJS.ProcessEnv = process.env): void {
    if (isUpdateCheckDisabled(env, [])) return;
    if (!isCacheStale(readCache(this.cachePath()), Date.now())) return;
    void this.check();
  }

  /** Asks GitHub for the latest release now. */
  check(): Promise<UpdateState> {
    this.checking ??= this.runCheck().finally(() => {
      this.checking = undefined;
      this.changed();
    });
    this.changed();
    return this.checking.then(() => this.state());
  }

  private async runCheck(): Promise<void> {
    const now = Date.now();
    try {
      const latest = await fetchLatestVersion(this.opts.fetchImpl);
      if (!latest) throw new Error("GitHub didn't say which release is the latest.");
      this.latest = latest;
      this.error = undefined;
    } catch (err) {
      this.error = `Couldn't check for updates: ${(err as Error).message}`;
    }
    this.checkedAt = now;
    try {
      writeCache({ lastChecked: now, latestVersion: this.latest }, this.cachePath());
    } catch {
      // the cache only saves asking again today
    }
  }

  /** Downloads and installs the latest release over this binary; resolves a message for the page. */
  async install(): Promise<string> {
    if (!this.opts.standalone) throw new Error(`aecdo was installed with npm. To update it, run: ${NPM_UPDATE_COMMAND}`);
    if (this.installing) throw new Error("The update is already being installed.");
    if (this.installed) return installedMessage(this.installed);
    const platform = this.opts.platform ?? process.platform;
    this.installing = true;
    this.error = undefined;
    this.changed();
    try {
      const version = await update({
        currentVersion: this.opts.currentVersion,
        standalone: true,
        execPath: this.opts.execPath,
        platform: this.opts.platform,
        arch: this.opts.arch,
        fetchImpl: this.opts.fetchImpl,
        cachePath: this.cachePath(),
        log: () => {},
        elevate: this.opts.elevate ?? (adminMoveCommand(platform, "", "") ? (staged, target) => adminMove(staged, target, platform) : undefined),
      });
      this.checkedAt = Date.now();
      if (!version) {
        this.latest = this.opts.currentVersion;
        return `aecdo v${this.opts.currentVersion} is already the latest version.`;
      }
      this.installed = version;
      return installedMessage(version);
    } catch (err) {
      const message = (err as Error).message;
      if (message !== "Cancelled") this.error = message;
      throw err;
    } finally {
      this.installing = false;
      this.changed();
    }
  }
}

function installedMessage(version: string): string {
  return `Installed aecdo v${version}. Quit and open aecdo again to use it.`;
}
