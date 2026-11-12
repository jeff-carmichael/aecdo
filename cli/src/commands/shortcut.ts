import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { assetPath } from "../gui/assets.js";
import { getConfigDir } from "../lib/config.js";
import { embedded } from "../lib/embedded.js";

/** A file the shortcut is made of, or a command that makes one (Windows .lnk files need the shell). */
export type ShortcutStep =
  | { path: string; icon: "svg" | "icns" | "ico" }
  | { path: string; text: string; executable?: boolean }
  | { dir: string }
  | { run: string[]; env: Record<string, string> };

export interface ShortcutPlan {
  steps: ShortcutStep[];
  /** Where people find it, for the message. */
  where: string;
}

const BUNDLE_ID = "io.github.jeff-carmichael.aecdo";

/** Quotes one argument of a .desktop Exec line (Desktop Entry spec, "Exec key"). */
function desktopArg(arg: string): string {
  if (!/[\s"'\\`$<>|&;*?#()]/.test(arg)) return arg;
  return `"${arg.replace(/(["`$\\])/g, "\\$1").replace(/\\/g, "\\\\")}"`;
}

function shArg(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * What `aecdo shortcut` writes so the app opens from an icon: a Start menu shortcut on Windows,
 * ~/Applications/aecdo.app on macOS, a .desktop entry on Linux. `command` starts the app (`<binary> __app`).
 */
export function shortcutPlan(platform: NodeJS.Platform, command: string[], env: NodeJS.ProcessEnv, home: string, version: string): ShortcutPlan {
  if (platform === "win32") {
    const appData = env.APPDATA ?? join(home, "AppData", "Roaming");
    const lnk = join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "aecdo.lnk");
    const ico = join(getConfigDir(), "aecdo.ico");
    // WindowStyle 7 starts minimized, so the console that aecdo.exe gets never shows before it hides itself.
    const script =
      "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:AECDO_LNK); " +
      "$s.TargetPath = $env:AECDO_TARGET; $s.Arguments = $env:AECDO_ARGS; $s.WorkingDirectory = $env:USERPROFILE; " +
      "$s.IconLocation = \"$env:AECDO_ICO,0\"; $s.WindowStyle = 7; $s.Description = 'Browse AEC drawing sets beside their PDFs'; $s.Save()";
    const args = command
      .slice(1)
      .map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
      .join(" ");
    return {
      steps: [
        { path: ico, icon: "ico" },
        { dir: dirname(lnk) },
        { run: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env: { AECDO_LNK: lnk, AECDO_TARGET: command[0], AECDO_ARGS: args, AECDO_ICO: ico } },
      ],
      where: "the Start menu",
    };
  }
  if (platform === "darwin") {
    const app = join(home, "Applications", "aecdo.app", "Contents");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>aecdo</string>
  <key>CFBundleDisplayName</key><string>aecdo</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleExecutable</key><string>aecdo</string>
  <key>CFBundleIconFile</key><string>aecdo</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${xml(version)}</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
    // `exec` keeps the process macOS launched, so the Dock shows this bundle's icon for the window.
    const launcher = `#!/bin/sh\nexec ${command.map(shArg).join(" ")}\n`;
    return {
      steps: [
        { path: join(app, "Info.plist"), text: plist },
        { path: join(app, "MacOS", "aecdo"), text: launcher, executable: true },
        { path: join(app, "Resources", "aecdo.icns"), icon: "icns" },
      ],
      where: "~/Applications (find it with Spotlight or Launchpad, or drag it to the Dock)",
    };
  }
  const data = env.XDG_DATA_HOME || join(home, ".local", "share");
  const desktop = `[Desktop Entry]
Type=Application
Name=aecdo
GenericName=Drawing set viewer
Comment=Browse AEC drawing sets beside their PDFs
Exec=${command.map(desktopArg).join(" ")}
Icon=aecdo
Terminal=false
Categories=Graphics;Viewer;
StartupWMClass=aecdo
`;
  return {
    steps: [
      { path: join(data, "icons", "hicolor", "scalable", "apps", "aecdo.svg"), icon: "svg" },
      { path: join(data, "applications", "aecdo.desktop"), text: desktop },
    ],
    where: "your app menu",
  };
}

function run(command: string[], env: Record<string, string>): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, env: { ...process.env, ...env } });
    let errors = "";
    child.stderr.on("data", (d: Buffer) => (errors += d.toString("utf-8")));
    child.on("error", rej);
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(errors.trim() || `${command[0]} exited with code ${code}`))));
  });
}

/** Carries out a plan; returns the paths written. */
export async function applyShortcutPlan(plan: ShortcutPlan): Promise<string[]> {
  const written: string[] = [];
  for (const step of plan.steps) {
    if ("run" in step) {
      await run(step.run, step.env);
      continue;
    }
    if ("dir" in step) {
      await mkdir(step.dir, { recursive: true });
      continue;
    }
    await mkdir(dirname(step.path), { recursive: true });
    if ("icon" in step) {
      const source = assetPath(`app/icon.${step.icon}`);
      if (!source) throw new Error("The app icon is missing from this build.");
      await writeFile(step.path, await readFile(source));
    } else {
      await writeFile(step.path, step.text);
      if (step.executable) await chmod(step.path, 0o755);
    }
    written.push(step.path);
  }
  return written;
}

/** `aecdo shortcut`: puts the app in the Start menu, Applications, or the app menu. */
export async function shortcut(): Promise<string> {
  if (!embedded.selfCommand) throw new Error("The app shortcut comes with the standalone aecdo binary (see the install guide); with npm, run \"aecdo gui\".");
  const plan = shortcutPlan(process.platform, [...embedded.selfCommand, "__app"], process.env, homedir(), embedded.version ?? "0.0.0");
  await applyShortcutPlan(plan);
  return `Added aecdo to ${plan.where}. It opens in the folder you used last; choose another with "Open folder" in the app.`;
}
