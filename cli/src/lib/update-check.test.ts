import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHECK_INTERVAL_MS,
  formatUpdateBanner,
  isCacheStale,
  isNewerVersion,
  isUpdateCheckDisabled,
  readCache,
  runUpdateCheckWorker,
} from "./update-check.js";

function tempCachePath(): string {
  return join(mkdtempSync(join(tmpdir(), "aecdo-update-")), "nested", "update-check.json");
}

function fakeFetch(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

test("isNewerVersion compares semver cores and handles v prefixes", () => {
  assert.equal(isNewerVersion("v0.3.2", "0.3.1"), true);
  assert.equal(isNewerVersion("0.4.0", "0.3.9"), true);
  assert.equal(isNewerVersion("1.0.0", "0.99.99"), true);
  assert.equal(isNewerVersion("0.3.1", "0.3.1"), false);
  assert.equal(isNewerVersion("0.3.0", "0.3.1"), false);
  assert.equal(isNewerVersion("0.10.0", "0.9.0"), true);
});

test("isNewerVersion treats prereleases conservatively", () => {
  assert.equal(isNewerVersion("0.4.0-beta.1", "0.3.1"), false);
  assert.equal(isNewerVersion("0.3.1", "0.3.1-rc.1"), true);
  assert.equal(isNewerVersion("garbage", "0.3.1"), false);
});

test("isUpdateCheckDisabled honors flag and env vars", () => {
  assert.equal(isUpdateCheckDisabled({}, ["summary", "x.jsonld"]), false);
  assert.equal(isUpdateCheckDisabled({}, ["summary", "--no-update-check"]), true);
  assert.equal(isUpdateCheckDisabled({ NO_UPDATE_CHECK: "1" }, []), true);
  assert.equal(isUpdateCheckDisabled({ AECDO_NO_UPDATE_CHECK: "true" }, []), true);
  assert.equal(isUpdateCheckDisabled({ NO_UPDATE_CHECK: "0" }, []), false);
  assert.equal(isUpdateCheckDisabled({ CI: "true" }, []), true);
});

test("isCacheStale uses a 24 hour window", () => {
  const now = 1_000_000_000_000;
  assert.equal(isCacheStale(null, now), true);
  assert.equal(isCacheStale({ lastChecked: now - 1000 }, now), false);
  assert.equal(isCacheStale({ lastChecked: now - CHECK_INTERVAL_MS }, now), true);
  assert.equal(isCacheStale({ lastChecked: now + 60_000 }, now), true);
});

test("runUpdateCheckWorker stores the latest release tag", async () => {
  const path = tempCachePath();
  await runUpdateCheckWorker(path, fakeFetch(200, { tag_name: "v0.4.0" }), 123);
  assert.deepEqual(readCache(path), { lastChecked: 123, latestVersion: "0.4.0" });
});

test("runUpdateCheckWorker keeps the previous version when the request fails", async () => {
  const path = tempCachePath();
  await runUpdateCheckWorker(path, fakeFetch(200, { tag_name: "v0.4.0" }), 1);
  await runUpdateCheckWorker(path, fakeFetch(403, { message: "rate limited" }), 2);
  assert.deepEqual(readCache(path), { lastChecked: 2, latestVersion: "0.4.0" });

  const failing = (() => Promise.reject(new Error("offline"))) as typeof fetch;
  await runUpdateCheckWorker(path, failing, 3);
  assert.deepEqual(readCache(path), { lastChecked: 3, latestVersion: "0.4.0" });
});

test("readCache ignores malformed files", () => {
  const path = join(mkdtempSync(join(tmpdir(), "aecdo-update-")), "update-check.json");
  assert.equal(readCache(path), null);
  writeFileSync(path, "{not json");
  assert.equal(readCache(path), null);
  writeFileSync(path, JSON.stringify({ latestVersion: "1.0.0" }));
  assert.equal(readCache(path), null);
});

test("formatUpdateBanner names both versions and the right upgrade path", () => {
  const npm = formatUpdateBanner("0.3.1", "0.4.0", false);
  assert.match(npm, /Update available! v0\.3\.1 → v0\.4\.0/);
  assert.match(npm, /npm install -g aecdo@latest/);
  const bin = formatUpdateBanner("0.3.1", "0.4.0", true);
  assert.match(bin, /Run 'aecdo update' to upgrade\./);
});
