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
import { parseMention, nodeSupportsAssistant, notSetUpMessage } from "../commands/explore.js";
import { modelChoices } from "../commands/configure-ai.js";
import type { MutableModels } from "@earendil-works/pi-ai";

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
  assert.equal(assistantForMention("OpenRouter")?.name, "openrouter");
  assert.equal(assistantForMention("or")?.name, "openrouter");
  assert.equal(assistantForMention("gemini")?.provider, "openrouter");

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

test("OpenRouter shortcuts use their fixed model", async () => {
  const path = tempConfig();
  await setAssistantModelId("gemini", "openai/gpt-5.5", path);
  assert.equal(await getAssistantModelId("gemini", path), "~google/gemini-pro-latest");
  assert.equal(await getAssistantModelId("openrouter", path), ASSISTANTS.openrouter.defaultModel);
});

test("OpenRouter model picker puts recommended models first and hides batch variants", () => {
  const catalog = ["z/other", "openai/gpt-5.5", "z/other:batch", "~anthropic/claude-sonnet-latest"];
  assert.deepEqual(modelChoices("openrouter", catalog, "~anthropic/claude-sonnet-latest"), [
    "~anthropic/claude-sonnet-latest",
    "openai/gpt-5.5",
    "z/other",
  ]);
  assert.deepEqual(modelChoices("anthropic", ["a", "b", "c"], "b"), ["b", "c", "a"]);
});

test("not-set-up message points to OpenRouter when it is ready", async () => {
  const fake = (ready: string[]) =>
    ({ checkAuth: (p: string) => Promise.resolve(ready.includes(p) ? { type: "api_key" } : undefined) }) as unknown as MutableModels;
  assert.match(await notSetUpMessage(fake(["openrouter"]), ASSISTANTS.claude), /@openrouter/);
  assert.doesNotMatch(await notSetUpMessage(fake([]), ASSISTANTS.claude), /@openrouter/);
  assert.match(await notSetUpMessage(fake([]), ASSISTANTS.grok), /goes through OpenRouter/);
});
