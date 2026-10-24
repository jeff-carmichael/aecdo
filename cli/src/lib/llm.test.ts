import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileCredentialStore,
  assistantForMention,
  getAssistantModelId,
  getDeviceId,
  setAssistantModelId,
  createLlmModels,
  ASSISTANTS,
} from "./llm.js";
import { parseMention, nodeSupportsAssistant } from "../commands/explore.js";

function tempConfig(): string {
  return join(mkdtempSync(join(tmpdir(), "aecdo-llm-")), "llm.json");
}

test("credential store persists to a private file", async () => {
  const path = tempConfig();
  const store = new FileCredentialStore(path);
  assert.equal(await store.read("openai"), undefined);

  await store.modify("openai", () => Promise.resolve({ type: "api_key", key: "sk-test" }));
  await store.modify("anthropic", () => Promise.resolve({ type: "api_key", key: "sk-ant" }));
  assert.deepEqual(await new FileCredentialStore(path).read("openai"), { type: "api_key", key: "sk-test" });
  assert.deepEqual(
    (await store.list()).map((c) => c.providerId).sort(),
    ["anthropic", "openai"]
  );
  if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);

  await store.delete("openai");
  assert.equal(await store.read("openai"), undefined);
  assert.ok(!readFileSync(path, "utf-8").includes("sk-test"));
});

test("device id and model choices are stable", async () => {
  const path = tempConfig();
  const id = await getDeviceId(path);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(await getDeviceId(path), id);

  assert.equal(await getAssistantModelId("claude", path), ASSISTANTS.claude.defaultModel);
  await setAssistantModelId("claude", "claude-opus-5-5", path);
  assert.equal(await getAssistantModelId("claude", path), "claude-opus-5-5");
});

test("default models exist in pi's catalog", async () => {
  const models = await createLlmModels(new FileCredentialStore(tempConfig()));
  for (const a of Object.values(ASSISTANTS)) {
    assert.ok(models.getModel(a.provider, a.defaultModel), `${a.provider}/${a.defaultModel}`);
  }
});

test("parses @mentions", () => {
  assert.equal(assistantForMention("ChatGPT")?.name, "chatgpt");
  assert.equal(assistantForMention("gpt")?.name, "chatgpt");
  assert.equal(assistantForMention("bard"), undefined);

  const m = parseMention("@claude, what's on this sheet?");
  assert.equal(m?.assistant?.name, "claude");
  assert.equal(m?.text, "what's on this sheet?");
  assert.equal(parseMention("@bard hi")?.assistant, undefined);
  assert.equal(parseMention("A101"), null);
  assert.equal(parseMention("@claude")?.text, "");
});

test("checks the Node version pi needs", () => {
  assert.equal(nodeSupportsAssistant("22.19.0", false), true);
  assert.equal(nodeSupportsAssistant("24.1.0", false), true);
  assert.equal(nodeSupportsAssistant("22.11.0", false), false);
  assert.equal(nodeSupportsAssistant("20.18.0", false), false);
  assert.equal(nodeSupportsAssistant("20.18.0", true), true);
});
