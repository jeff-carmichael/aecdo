import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  FileCredentialStore,
  assistantForMention,
  availableRoutes,
  getModelId,
  getDeviceId,
  setModelId,
  setPreferredRoute,
  setCustomEndpoint,
  pickRoute,
  resolveModel,
  routesFor,
  createLlmModels,
  ASSISTANTS,
  type RouteId,
} from "./llm.js";
import { parseMention, nodeSupportsAssistant, notSetUpMessage } from "../commands/explore.js";
import { modelChoices } from "../commands/configure-ai.js";

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

  assert.equal(await getModelId("claude", "anthropic", path), "claude-sonnet-5-5");
  await setModelId("claude", "anthropic", "claude-opus-5-5", path);
  assert.equal(await getModelId("claude", "anthropic", path), "claude-opus-5-5");
  assert.equal(await getModelId("claude", "openrouter", path), ASSISTANTS.claude.routes.openrouter);
  assert.equal(await getModelId("claude", "custom", path), undefined);
});

test("reads the older one-model-per-assistant setting as the direct route", async () => {
  const path = tempConfig();
  writeFileSync(path, JSON.stringify({ models: { claude: "claude-opus-5-5" } }));
  assert.equal(await getModelId("claude", "anthropic", path), "claude-opus-5-5");
  assert.equal(await getModelId("claude", "amazon-bedrock", path), ASSISTANTS.claude.routes["amazon-bedrock"]);
});

test("default models exist in pi's catalog", async () => {
  const models = await createLlmModels(new FileCredentialStore(tempConfig()));
  for (const a of Object.values(ASSISTANTS)) {
    for (const [route, id] of Object.entries(a.routes) as [RouteId, string][]) {
      if (route === "custom") continue;
      assert.ok(models.getModel(route, id), `${a.name}: ${route}/${id}`);
    }
  }
});

test("parses @mentions by model, not provider", () => {
  assert.equal(assistantForMention("ChatGPT")?.name, "chatgpt");
  assert.equal(assistantForMention("gpt")?.name, "chatgpt");
  assert.equal(assistantForMention("Grok")?.name, "grok");
  assert.equal(assistantForMention("bard"), undefined);
  assert.equal(assistantForMention("openrouter"), undefined);

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

test("each @mention uses whichever route is set up, or the one the user picked", async () => {
  const path = tempConfig();
  const store = new FileCredentialStore(path);
  const models = await createLlmModels(store);
  assert.equal(await pickRoute(models, "claude", path), undefined);

  await store.modify("openrouter", () => Promise.resolve({ type: "api_key", key: "sk-or" }));
  assert.deepEqual(await pickRoute(models, "grok", path), { route: "openrouter", modelId: "~x-ai/grok-latest" });

  await store.modify("amazon-bedrock", () => Promise.resolve({ type: "api_key", env: { AWS_REGION: "us-west-2" } }));
  assert.deepEqual(await availableRoutes(models, "claude", path), ["amazon-bedrock", "openrouter"]);
  assert.equal((await pickRoute(models, "claude", path))?.route, "amazon-bedrock");
  assert.equal((await pickRoute(models, "gemini", path))?.route, "openrouter");

  await setPreferredRoute("claude", "openrouter", path);
  assert.equal((await pickRoute(models, "claude", path))?.route, "openrouter");
  await models.logout("openrouter");
  assert.equal((await pickRoute(models, "claude", path))?.route, "amazon-bedrock");

  const resolved = resolveModel(models, "claude", (await pickRoute(models, "claude", path))!);
  assert.equal(resolved.api, "bedrock-converse-stream");
});

test("Bedrock keeps the stored region and uses the AWS default credentials", async () => {
  const path = tempConfig();
  const store = new FileCredentialStore(path);
  const models = await createLlmModels(store);
  await store.modify("amazon-bedrock", () => Promise.resolve({ type: "api_key", env: { AWS_REGION: "eu-west-1" } }));
  const model = resolveModel(models, "claude", { route: "amazon-bedrock", modelId: "global.anthropic.claude-sonnet-5-5" });
  const auth = await models.getAuth(model);
  assert.equal(auth?.env?.AWS_REGION, "eu-west-1");
});

test("a custom endpoint serves the @mentions it has a model for", async () => {
  const path = tempConfig();
  const store = new FileCredentialStore(path);
  await setCustomEndpoint({ name: "Gateway", baseUrl: "https://example.test/llm/v1/", api: "anthropic-messages" }, path);
  await setModelId("claude", "custom", "claude-sonnet-5-5", path);
  await store.modify("custom", () => Promise.resolve({ type: "api_key", key: "tok" }));
  const models = await createLlmModels(store);

  assert.deepEqual(await availableRoutes(models, "claude", path), ["custom"]);
  assert.deepEqual(await availableRoutes(models, "chatgpt", path), []);
  const model = resolveModel(models, "claude", (await pickRoute(models, "claude", path))!);
  assert.equal(model.baseUrl, "https://example.test/llm/v1");
  assert.equal(model.api, "anthropic-messages");
  const auth = await models.getAuth(model);
  assert.equal(auth?.auth.headers?.Authorization, "Bearer tok");

  await setPreferredRoute("claude", "custom", path);
  await setCustomEndpoint(undefined, path);
  assert.equal(await getModelId("claude", "custom", path), undefined);
  assert.equal(await store.read("custom"), undefined);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { routes?: Record<string, string> };
  assert.equal(raw.routes?.claude, undefined);
});

test("model picker narrows shared catalogs to the family and leads with its default", () => {
  const catalog = ["z/other", "openai/gpt-5.5", "z/claude:batch", "~anthropic/claude-sonnet-latest", "anthropic/claude-opus"];
  assert.deepEqual(modelChoices("openrouter", catalog, "anthropic/claude-opus", ASSISTANTS.claude), [
    "anthropic/claude-opus",
    "~anthropic/claude-sonnet-latest",
  ]);
  assert.deepEqual(modelChoices("anthropic", ["a", "b", "c"], "b", ASSISTANTS.claude), ["b", "c", "a"]);
  assert.deepEqual(modelChoices("custom", [], "", ASSISTANTS.claude), []);
});

test("not-set-up message lists every way to reach the model", () => {
  assert.equal(
    notSetUpMessage(ASSISTANTS.claude),
    'Claude isn\'t set up yet. Run "aecdo configure ai" to add an Anthropic API key, Amazon Bedrock, a custom endpoint, or OpenRouter.'
  );
  assert.match(notSetUpMessage(ASSISTANTS.gemini), /a custom endpoint, or OpenRouter\.$/);
  assert.deepEqual(routesFor("gemini"), ["custom", "openrouter"]);
});

test("a custom OpenAI-compatible endpoint gets the token and extra headers", async () => {
  const seen: { path?: string; auth?: string; extra?: string; model?: string } = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      seen.path = req.url;
      seen.auth = req.headers.authorization;
      seen.extra = req.headers["x-team"] as string | undefined;
      seen.model = (JSON.parse(body) as { model: string }).model;
      const chunk = (delta: object, finish: string | null) =>
        `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(chunk({ role: "assistant", content: "hello from custom" }, null) + chunk({}, "stop") + "data: [DONE]\n\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address() as AddressInfo;
    const path = tempConfig();
    const store = new FileCredentialStore(path);
    await setCustomEndpoint(
      { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", headers: { "x-team": "drawings" } },
      path
    );
    await setModelId("grok", "custom", "grok-on-prem", path);
    await store.modify("custom", () => Promise.resolve({ type: "api_key", key: "secret-token" }));
    const models = await createLlmModels(store);
    const model = resolveModel(models, "grok", (await pickRoute(models, "grok", path))!);
    const reply = await models.complete(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] });

    assert.equal(reply.stopReason, "stop", reply.errorMessage);
    assert.deepEqual(reply.content, [{ type: "text", text: "hello from custom" }]);
    assert.equal(seen.path, "/v1/chat/completions");
    assert.equal(seen.auth, "Bearer secret-token");
    assert.equal(seen.extra, "drawings");
    assert.equal(seen.model, "grok-on-prem");
  } finally {
    server.close();
  }
});

test("a custom Anthropic-compatible endpoint gets a plain request, without caching fields", async () => {
  let body = "";
  const server = createServer((req, res) => {
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        sse("message_start", {
          message: { id: "m1", type: "message", role: "assistant", model: "m", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } },
        }) +
          sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
          sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "ok" } }) +
          sse("content_block_stop", { index: 0 }) +
          sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }) +
          sse("message_stop", {})
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address() as AddressInfo;
    const path = tempConfig();
    const store = new FileCredentialStore(path);
    await setCustomEndpoint({ name: "Gateway", baseUrl: `http://127.0.0.1:${port}`, api: "anthropic-messages" }, path);
    await setModelId("claude", "custom", "claude-sonnet", path);
    await store.modify("custom", () => Promise.resolve({ type: "api_key", key: "tok" }));
    const models = await createLlmModels(store);
    const model = resolveModel(models, "claude", (await pickRoute(models, "claude", path))!);
    const reply = await models.complete(model, {
      systemPrompt: "You are a test.",
      messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
      tools: [{ name: "list_sheets", description: "List sheets", parameters: { type: "object", properties: {} } }],
    });

    assert.equal(reply.stopReason, "stop", reply.errorMessage);
    assert.ok(body.includes('"list_sheets"'), body);
    assert.doesNotMatch(body, /cache_control|eager_input_streaming/);
  } finally {
    server.close();
  }
});
