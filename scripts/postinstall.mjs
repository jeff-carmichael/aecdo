#!/usr/bin/env node

import { mkdir, copyFile, access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, "..", ".claude", "skills", "aecdo", "SKILL.md");
const target = join(homedir(), ".claude", "skills", "aecdo", "SKILL.md");

try {
  await access(source);
} catch {
  process.exit(0);
}

try {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log("✓ AECDO skill installed to ~/.claude/skills/aecdo/SKILL.md");
} catch {
  // Non-fatal — skill install is optional
}
