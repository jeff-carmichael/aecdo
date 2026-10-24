import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { completionScript, detectShell, completion, SHELLS } from "./completion.js";

test("detectShell reads the shell name from $SHELL", () => {
  assert.equal(detectShell("/bin/zsh"), "zsh");
  assert.equal(detectShell("/usr/local/bin/fish"), "fish");
  assert.equal(detectShell("C:\\Program Files\\Git\\bin\\bash.exe"), undefined);
  assert.equal(detectShell("/bin/tcsh"), undefined);
  assert.equal(detectShell(undefined), undefined);
});

test("completion rejects unknown shells", () => {
  assert.throws(() => completion("tcsh"), /Unsupported shell/);
  assert.throws(() => completion(undefined, "/bin/tcsh"), /Could not detect/);
});

test("each script completes PDFs for process", () => {
  assert.match(completionScript("bash"), /process\|upload\) _aecdo_files "\$cur" pdf/);
  assert.match(completionScript("zsh"), /'1:PDF file:_files -g "\*\.\(#i\)pdf\(-\.\)"'/);
  assert.match(completionScript("fish"), /__fish_seen_subcommand_from process upload' -a '\(__aecdo_complete_files pdf\)'/);
});

for (const shell of SHELLS) {
  const probe = spawnSync(shell, ["-c", "true"]);
  test(`${shell} script parses`, { skip: probe.error ? `${shell} not installed` : false }, () => {
    const r = spawnSync(shell, ["-n", "-c", completionScript(shell)], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
  });
}
