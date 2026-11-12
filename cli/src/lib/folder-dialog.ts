import { spawn } from "node:child_process";

/** The system's "choose a folder" dialog, run as a command that prints the chosen path. */
export function folderDialogCommand(platform: NodeJS.Platform, start: string): string[][] {
  const title = "Open a folder in aecdo";
  switch (platform) {
    case "darwin":
      return [["osascript", "-e", `POSIX path of (choose folder with prompt "${title}" default location (POSIX file "${start.replace(/["\\]/g, "")}"))`]];
    case "win32":
      // The owner form keeps the dialog above the app window. Paths come in through the environment, never the script text.
      return [
        [
          "powershell.exe",
          "-NoProfile",
          "-STA",
          "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
            `$d.Description = '${title}'; $d.SelectedPath = $env:AECDO_DIALOG_START; ` +
            "$o = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }; " +
            "if ($d.ShowDialog($o) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
        ],
      ];
    default:
      return [
        ["zenity", "--file-selection", "--directory", `--title=${title}`, `--filename=${start.replace(/\/?$/, "/")}`],
        ["kdialog", "--getexistingdirectory", start, "--title", title],
      ];
  }
}

function run(command: string[], start: string): Promise<{ code: number | null; out: string } | undefined> {
  return new Promise((res) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: ["ignore", "pipe", "ignore"],
      // No windowsHide: on Windows it would also hide the dialog. PowerShell shares the app's (hidden) console instead.
      env: { ...process.env, AECDO_DIALOG_START: start },
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf-8")));
    child.on("error", () => res(undefined));
    child.on("exit", (code) => res({ code, out }));
  });
}

/**
 * Asks the user for a folder. Resolves its path, null when they cancel, or undefined when this
 * system has no dialog to show (Linux without zenity or kdialog).
 */
export async function chooseFolder(start: string, platform = process.platform): Promise<string | null | undefined> {
  for (const command of folderDialogCommand(platform, start)) {
    const result = await run(command, start);
    if (!result) continue;
    const path = result.out.trim();
    return result.code === 0 && path ? path : null;
  }
  return undefined;
}
