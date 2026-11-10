import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthInteraction } from "@earendil-works/pi-ai";
import { GuiSettings } from "./settings.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aecdo-settings-"));
  const interaction: AuthInteraction = { prompt: () => Promise.reject(new Error("Cancelled")), notify: () => undefined };
  return { dir, settings: new GuiSettings(interaction, { llmPath: join(dir, "llm.json"), configDir: dir }) };
}

test("an API key sets up the route and the @names it reaches", async () => {
  const { settings } = setup();
  const before = await settings.info();
  assert.equal(before.ai.supported, true);
  assert.ok(before.ai.routes.every((r) => !r.configured));
  assert.equal(before.ai.assistants.find((a) => a.name === "claude")?.available.length, 0);

  assert.match(await settings.saveKey("anthropic", "  sk-ant-test  "), /Saved the Anthropic/);
  const after = await settings.info();
  assert.equal(after.ai.routes.find((r) => r.id === "anthropic")?.configured, true);
  const claude = after.ai.assistants.find((a) => a.name === "claude");
  assert.equal(claude?.route, "anthropic");
  assert.ok(claude?.model);

  const choices = await settings.modelChoices("claude", "anthropic");
  assert.equal(choices[0], claude?.model);
  const other = choices.find((c) => c !== claude?.model);
  if (other) {
    await settings.choose("claude", "anthropic", other);
    assert.equal((await settings.info()).ai.assistants.find((a) => a.name === "claude")?.model, other);
  }
  await assert.rejects(settings.choose("claude", "openrouter"), /isn't set up/);
  await assert.rejects(settings.saveKey("amazon-bedrock", "x"), /doesn't use an API key/);
  await assert.rejects(settings.saveKey("openai", " "), /Paste the API key/);

  await settings.signOut("anthropic");
  assert.equal((await settings.info()).ai.routes.find((r) => r.id === "anthropic")?.configured, false);
});

test("a custom endpoint keeps its name, URL and a model id per @name", async () => {
  const { settings } = setup();
  await assert.rejects(settings.saveCustom({ baseUrl: "gateway.example", api: "openai-completions", models: {} }), /https:\/\//);
  await settings.saveCustom({ name: "Company gateway", baseUrl: "https://gateway.example/v1", api: "openai-completions", token: "tok", models: { claude: "claude-x" } });
  const info = await settings.info();
  assert.deepEqual(info.ai.custom, { name: "Company gateway", baseUrl: "https://gateway.example/v1", api: "openai-completions", models: { claude: "claude-x" } });
  assert.equal(info.ai.routes.find((r) => r.id === "custom")?.label, "Company gateway");
  assert.equal(info.ai.routes.find((r) => r.id === "custom")?.configured, true);
  assert.deepEqual(await settings.modelChoices("claude", "custom"), ["claude-x"]);

  // A blank token keeps the saved one.
  await settings.saveCustom({ name: "Company gateway", baseUrl: "https://gateway.example/v2", api: "anthropic-messages", models: { claude: "claude-x" } });
  assert.equal((await settings.info()).ai.routes.find((r) => r.id === "custom")?.configured, true);

  assert.match(await settings.signOut("custom"), /Removed Company gateway/);
  const gone = await settings.info();
  assert.equal(gone.ai.custom, undefined);
  assert.equal(gone.ai.routes.find((r) => r.id === "custom")?.configured, false);
});

test("DrawingBot API credentials are saved, shown masked, and kept when left blank", async () => {
  const { dir, settings } = setup();
  assert.equal((await settings.info()).api.configured, false);
  await assert.rejects(settings.saveApi("", "", "us-west-2"), /Client ID/);
  await assert.rejects(settings.saveApi("id", "secret", "mars-1"), /Unknown region/);

  await settings.saveApi("client-1234", "secret", "us-west-2");
  const info = await settings.info();
  assert.equal(info.api.configured, true);
  assert.equal(info.api.clientId, "•••••••1234");
  assert.ok(!JSON.stringify(info).includes('"secret"'), "the secret never goes to the page");

  await settings.saveApi("", "", info.api.regions[0]);
  const saved = JSON.parse(readFileSync(join(dir, "config.json"), "utf-8")) as { clientId: string; clientSecret: string; region: string };
  assert.deepEqual(saved, { clientId: "client-1234", clientSecret: "secret", region: info.api.regions[0] });
});
