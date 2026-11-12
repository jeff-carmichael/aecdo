import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseFolder, folderDialogCommand } from "./folder-dialog.js";

test("each system gets its own folder dialog", () => {
  assert.equal(folderDialogCommand("darwin", "/Users/a")[0][0], "osascript");
  assert.equal(folderDialogCommand("win32", "C:\\")[0][0], "powershell.exe");
  assert.deepEqual(
    folderDialogCommand("linux", "/home/a").map((c) => c[0]),
    ["zenity", "kdialog"]
  );
});

test("a system with no dialog to show says so", async () => {
  const path = process.env.PATH;
  process.env.PATH = "/nonexistent";
  try {
    assert.equal(await chooseFolder("/tmp", "linux"), undefined);
  } finally {
    process.env.PATH = path;
  }
});
