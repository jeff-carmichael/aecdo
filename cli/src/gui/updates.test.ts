import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { GuiUpdates, type GuiUpdatesOptions, type UpdateState } from "./updates.js";
import { adminMoveCommand } from "../commands/update.js";
import { readCache, RELEASES_URL, writeCache } from "../lib/update-check.js";
import { fakeFetch, installedBinary, makeTarball, releaseRoutes, tmp } from "../commands/update.test-helpers.js";

function make(opts: Partial<GuiUpdatesOptions> = {}) {
  const changes: UpdateState[] = [];
  const cachePath = opts.cachePath ?? join(tmp(), "update-check.json");
  const updates = new GuiUpdates({ currentVersion: "0.6.4", standalone: true, cachePath, fetchImpl: fakeFetch({}), ...opts, onChange: (s) => changes.push(s) });
  return { updates, changes, cachePath };
}

test("shows an update the daily check already found", () => {
  const cachePath = join(tmp(), "update-check.json");
  writeCache({ lastChecked: 1, latestVersion: "0.6.5" }, cachePath);
  const { updates } = make({ cachePath });
  assert.deepEqual(updates.state(), { current: "0.6.4", latest: "0.6.5", available: true, checking: false, installing: false, checkedAt: 1 });
  assert.equal(make({ cachePath, currentVersion: "0.6.5" }).updates.state().available, false);
  assert.equal(make({ cachePath, standalone: false }).updates.state().npmCommand, "npm install -g aecdo@latest");
});

test("checks GitHub, saves the answer, and tells the page", async () => {
  const { updates, changes, cachePath } = make({ fetchImpl: fakeFetch({ [RELEASES_URL]: () => Response.json({ tag_name: "v0.7.0" }) }) });
  const state = await updates.check();
  assert.equal(state.latest, "0.7.0");
  assert.equal(state.available, true);
  assert.equal(readCache(cachePath)?.latestVersion, "0.7.0");
  assert.deepEqual(
    changes.map((c) => c.checking),
    [true, false]
  );
});

test("a failed check says why and keeps the last answer", async () => {
  const cachePath = join(tmp(), "update-check.json");
  writeCache({ lastChecked: 1, latestVersion: "0.6.5" }, cachePath);
  const { updates } = make({ cachePath, fetchImpl: () => Promise.reject(new Error("offline")) });
  const state = await updates.check();
  assert.equal(state.latest, "0.6.5");
  assert.match(state.error ?? "", /Couldn't check for updates: offline/);
});

test("the check at startup waits a day and can be turned off", async () => {
  let asked = 0;
  const fetchImpl = fakeFetch({
    [RELEASES_URL]: () => {
      asked++;
      return Response.json({ tag_name: "v0.7.0" });
    },
  });
  const cachePath = join(tmp(), "update-check.json");
  writeCache({ lastChecked: Date.now(), latestVersion: "0.6.4" }, cachePath);
  make({ cachePath, fetchImpl }).updates.checkInBackground({});
  writeCache({ lastChecked: 1, latestVersion: "0.6.4" }, cachePath);
  make({ cachePath, fetchImpl }).updates.checkInBackground({ NO_UPDATE_CHECK: "1" });
  assert.equal(asked, 0);
  const { updates } = make({ cachePath, fetchImpl });
  updates.checkInBackground({});
  assert.equal((await updates.check()).latest, "0.7.0");
  assert.equal(asked, 1);
});

test("installs the new binary, which runs once the app is opened again", async () => {
  const execPath = installedBinary();
  const { updates, changes } = make({
    execPath,
    platform: "linux",
    arch: "x64",
    fetchImpl: fakeFetch(releaseRoutes("0.7.0", makeTarball("new binary"))),
  });
  assert.equal(await updates.install(), "Installed aecdo v0.7.0. Quit and open aecdo again to use it.");
  assert.equal(readFileSync(execPath, "utf-8"), "new binary");
  assert.equal(changes[0].installing, true);
  const state = updates.state();
  assert.equal(state.installed, "0.7.0");
  assert.equal(state.available, false);
  assert.equal(state.installing, false);
});

test("a failed install leaves the binary alone and says why", async () => {
  const execPath = installedBinary();
  const { updates } = make({ execPath, platform: "linux", arch: "x64", fetchImpl: fakeFetch(releaseRoutes("0.7.0", makeTarball("x"), "f".repeat(64))) });
  await assert.rejects(updates.install(), /Checksum mismatch/);
  assert.equal(readFileSync(execPath, "utf-8"), "old binary");
  assert.match(updates.state().error ?? "", /Checksum mismatch/);
});

test("an npm install is told to use npm", async () => {
  await assert.rejects(make({ standalone: false }).updates.install(), /npm install -g aecdo@latest/);
});

test("a folder only an administrator can change is updated through the password dialog", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async () => {
  const execPath = installedBinary();
  const dir = join(execPath, "..");
  chmodSync(dir, 0o555);
  const moved: string[][] = [];
  try {
    const { updates } = make({
      execPath,
      platform: "linux",
      arch: "x64",
      fetchImpl: fakeFetch(releaseRoutes("0.7.0", makeTarball("new binary"))),
      elevate: async (staged, target) => {
        moved.push([staged, target]);
        chmodSync(dir, 0o755);
        await rename(staged, target);
      },
    });
    assert.match(await updates.install(), /Installed aecdo v0.7.0/);
    assert.equal(moved[0][1], execPath);
    assert.equal(readFileSync(execPath, "utf-8"), "new binary");
  } finally {
    chmodSync(dir, 0o755);
  }
});

test("asks for the administrator password with the system's dialog", () => {
  const mac = adminMoveCommand("darwin", "/tmp/a b", "/usr/local/bin/aecdo");
  assert.equal(mac?.[0], "osascript");
  assert.deepEqual(mac?.slice(-2), ["/tmp/a b", "/usr/local/bin/aecdo"]);
  assert.match(mac?.join(" ") ?? "", /with administrator privileges/);
  assert.deepEqual(adminMoveCommand("linux", "/tmp/new", "/usr/local/bin/aecdo"), ["pkexec", "/bin/mv", "-f", "/tmp/new", "/usr/local/bin/aecdo"]);
  assert.equal(adminMoveCommand("win32", "a", "b"), undefined);
});
