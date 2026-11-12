import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShortcutPlan, shortcutPlan } from "./shortcut.js";

test("on Linux it adds a .desktop entry and an icon under the data folder", async () => {
  const home = mkdtempSync(join(tmpdir(), "aecdo-shortcut-"));
  const plan = shortcutPlan("linux", ["/opt/my apps/aecdo", "__app"], {}, home, "1.2.3");
  const written = await applyShortcutPlan(plan);
  assert.deepEqual(written, [join(home, ".local/share/icons/hicolor/scalable/apps/aecdo.svg"), join(home, ".local/share/applications/aecdo.desktop")]);
  const desktop = readFileSync(written[1], "utf-8");
  assert.match(desktop, /^Exec="\/opt\/my apps\/aecdo" __app$/m);
  assert.match(desktop, /^Terminal=false$/m);
  assert.match(readFileSync(written[0], "utf-8"), /^<svg/);

  const xdg = shortcutPlan("linux", ["/usr/bin/aecdo", "__app"], { XDG_DATA_HOME: "/data" }, home, "1.2.3");
  assert.equal("path" in xdg.steps[1] && xdg.steps[1].path, "/data/applications/aecdo.desktop");
});

test("on macOS it builds aecdo.app in ~/Applications around a launcher script", async () => {
  const home = mkdtempSync(join(tmpdir(), "aecdo-shortcut-"));
  const written = await applyShortcutPlan(shortcutPlan("darwin", ["/usr/local/bin/aecdo", "__app"], {}, home, "1.2.3"));
  const contents = join(home, "Applications/aecdo.app/Contents");
  assert.deepEqual(written, [join(contents, "Info.plist"), join(contents, "MacOS/aecdo"), join(contents, "Resources/aecdo.icns")]);
  assert.match(readFileSync(written[0], "utf-8"), /<key>CFBundleExecutable<\/key><string>aecdo<\/string>/);
  assert.equal(readFileSync(written[1], "utf-8"), "#!/bin/sh\nexec '/usr/local/bin/aecdo' '__app'\n");
  assert.equal(statSync(written[1]).mode & 0o111, 0o111);
  assert.equal(readFileSync(written[2]).subarray(0, 4).toString("ascii"), "icns");
});

test("on Windows it makes a minimized Start menu shortcut with PowerShell", () => {
  const plan = shortcutPlan("win32", ["C:\\Programs\\aecdo\\aecdo.exe", "__app"], { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "C:\\Users\\a", "1.2.3");
  const run = plan.steps.find((s) => "run" in s);
  assert.ok(run && "run" in run);
  assert.equal(run.run[0], "powershell.exe");
  assert.match(run.run.at(-1)!, /WindowStyle = 7/);
  assert.equal(run.env.AECDO_TARGET, "C:\\Programs\\aecdo\\aecdo.exe");
  assert.equal(run.env.AECDO_ARGS, "__app");
  assert.match(run.env.AECDO_LNK, /Start Menu.Programs.aecdo\.lnk$/);
  assert.ok(plan.steps.some((s) => "icon" in s && s.icon === "ico"));
});
