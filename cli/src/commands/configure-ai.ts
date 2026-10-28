import { createInterface } from "node:readline";
import { openWithDefaultApp } from "../lib/open.js";
import { pick, canPrompt } from "../lib/picker.js";
import {
  ASSISTANTS,
  APP_NAME,
  ROUTE_LABELS,
  FileCredentialStore,
  availableRoutes,
  createLlmModels,
  getCustomEndpoint,
  getDeviceId,
  getModelId,
  isRouteConfigured,
  llmConfigPath,
  pickRoute,
  routeLabel,
  routesFor,
  setCustomEndpoint,
  setModelId,
  setPreferredRoute,
  type AssistantInfo,
  type AssistantName,
  type CustomApi,
  type RouteId,
} from "../lib/llm.js";
import { nodeSupportsAssistant } from "./explore.js";
import type { AuthInteraction, AuthPrompt, MutableModels } from "@earendil-works/pi-ai";

const ACTIONS = {
  chatgptLogin: "Sign in with ChatGPT (uses your ChatGPT plan)",
  openaiKey: "Enter an OpenAI API key (ChatGPT, billed per use)",
  anthropicKey: "Enter an Anthropic API key (Claude, billed per use)",
  bedrock: "Set up Amazon Bedrock (Claude, GPT, Grok, DeepSeek, Kimi)",
  custom: "Set up a custom endpoint (base URL + token)",
  openrouterLogin: "Sign in with OpenRouter (every model)",
  openrouterKey: "Enter an OpenRouter API key",
  model: "Choose the model or route for an @mention",
  logout: "Sign out / remove a key",
  done: "Done",
} as const;

function ask(question: string, signal?: AbortSignal): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      rl.close();
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    rl.question(question, (answer) => {
      signal?.removeEventListener("abort", onAbort);
      rl.close();
      resolve(answer);
    });
  });
}

/** Reads a line without echoing it, for API keys. */
function askSecret(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) return ask(question);
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf-8");
    const done = (err?: Error) => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new Error("Cancelled"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    input.on("data", onData);
  });
}

const interaction: AuthInteraction = {
  async prompt(p: AuthPrompt): Promise<string> {
    if (p.type === "secret") return askSecret(`${p.message} `);
    if (p.type === "select") {
      const picked = await pick(p.options.map((o) => o.label), { title: p.message });
      const option = p.options.find((o) => o.label === picked);
      if (!option) throw new Error("Cancelled");
      return option.id;
    }
    return ask(`${p.message} `, p.signal);
  },
  notify(event) {
    switch (event.type) {
      case "auth_url":
        console.log(`\nOpening your browser to sign in. If it doesn't open, visit:\n  ${event.url}\n`);
        openWithDefaultApp(event.url);
        break;
      case "device_code":
        console.log(`\nEnter code ${event.userCode} at ${event.verificationUri}\n`);
        break;
      case "info":
      case "progress":
        console.log(event.message);
        break;
    }
  },
};

async function describe(models: MutableModels): Promise<void> {
  const custom = await getCustomEndpoint();
  const ready: string[] = [];
  for (const route of Object.keys(ROUTE_LABELS) as RouteId[]) {
    if (await isRouteConfigured(models, route)) ready.push(routeLabel(route, custom));
  }
  console.log(`\nSet up: ${ready.length ? ready.join(", ") : "nothing yet"}`);
  console.log("AI assistants in aecdo explore (each @mention uses whichever way is set up):");
  for (const a of Object.values(ASSISTANTS)) {
    const r = await pickRoute(models, a.name);
    const how = r ? `${routeLabel(r.route, custom)}: ${r.modelId}` : "not set up";
    console.log(`  @${a.name.padEnd(9)} ${how}`);
  }
  console.log();
}

async function chooseAssistant(title: string, names = Object.keys(ASSISTANTS) as AssistantName[]): Promise<AssistantInfo | null> {
  const options = names.map((n) => ASSISTANTS[n]);
  const picked = await pick(options.map((a) => `@${a.name} (${a.label})`), { title });
  return options.find((a) => `@${a.name} (${a.label})` === picked) ?? null;
}

async function chooseModel(models: MutableModels, info: AssistantInfo, route: RouteId): Promise<void> {
  const current = (await getModelId(info.name, route)) ?? "";
  if (route === "custom") {
    const id = (await ask(`Model id for @${info.name} on ${routeLabel(route, await getCustomEndpoint())}${current ? ` [${current}]` : ""}: `)).trim();
    if (id) await setModelId(info.name, route, id);
    return;
  }
  const catalog = models.getModels(route).map((m) => m.id);
  const ids = modelChoices(route, catalog, current, info);
  const picked = await pick(ids, { title: `@${info.name} model on ${ROUTE_LABELS[route]} (type to filter):` });
  if (picked) await setModelId(info.name, route, picked);
}

/**
 * Current model first. Shared catalogs (Bedrock, OpenRouter) are narrowed to the family and
 * lead with its default; OpenRouter's batch-only variants are left out.
 */
export function modelChoices(route: RouteId, catalog: string[], current: string, info: AssistantInfo): string[] {
  let ids = [...catalog].reverse();
  if (route === "openrouter") ids = ids.filter((id) => !id.endsWith(":batch"));
  if (route === "openrouter" || route === "amazon-bedrock") {
    ids = ids.filter((id) => info.match.test(id));
    const preferred = info.routes[route];
    if (preferred) ids = [preferred, ...ids.filter((id) => id !== preferred)];
  }
  return [...new Set([current, ...ids].filter(Boolean))];
}

/** After a route is added: pick models for the families it serves that now use it. */
async function afterSetup(models: MutableModels, route: RouteId): Promise<void> {
  const served = (Object.keys(ASSISTANTS) as AssistantName[]).filter((n) => routesFor(n).includes(route));
  for (const name of served) {
    const available = await availableRoutes(models, name);
    if (!available.includes(route)) continue;
    const using = await pickRoute(models, name);
    if (using?.route !== route && available.length > 1) {
      const yes = await ask(`@${name} uses ${ROUTE_LABELS[using!.route]} now. Switch it to ${ROUTE_LABELS[route]}? [y/N] `);
      if (!/^y(es)?$/i.test(yes.trim())) continue;
      await setPreferredRoute(name, route);
    }
  }
}

async function saveApiKey(models: MutableModels, store: FileCredentialStore, route: RouteId): Promise<void> {
  const key = (await askSecret(`${ROUTE_LABELS[route]} API key: `)).trim();
  if (!key) {
    console.log("No key entered; nothing changed.");
    return;
  }
  await store.modify(route, () => Promise.resolve({ type: "api_key", key }));
  console.log(`Saved ${ROUTE_LABELS[route]} key.`);
  await afterSetup(models, route);
}

async function setupBedrock(models: MutableModels, store: FileCredentialStore): Promise<void> {
  await models.login("amazon-bedrock", "api_key", interaction);
  const current = await store.read("amazon-bedrock");
  const region = (current?.type === "api_key" && current.env?.AWS_REGION) || process.env.AWS_REGION || "us-east-1";
  const answer = (await ask(`AWS region [${region}]: `)).trim() || region;
  await store.modify("amazon-bedrock", (c) =>
    Promise.resolve(c?.type === "api_key" ? { ...c, env: { ...c.env, AWS_REGION: answer } } : c)
  );
  console.log("Amazon Bedrock is set up. Make sure your account has access to the models you pick.");
  await afterSetup(models, "amazon-bedrock");
}

const API_STYLES: Record<string, CustomApi> = {
  "OpenAI-compatible (Chat Completions)": "openai-completions",
  "Anthropic-compatible (Messages)": "anthropic-messages",
};

async function setupCustom(store: FileCredentialStore): Promise<MutableModels> {
  const current = await getCustomEndpoint();
  const name = (await ask(`Name for this endpoint [${current?.name ?? "Custom endpoint"}]: `)).trim() || current?.name;
  const baseUrl = (await ask(`Base URL${current ? ` [${current.baseUrl}]` : ""}: `)).trim() || current?.baseUrl;
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    console.log("A base URL starting with https:// is needed; nothing changed.");
    return createLlmModels(store);
  }
  const style = await pick(Object.keys(API_STYLES), { title: "Which API does it speak?" });
  if (!style) return createLlmModels(store);
  const token = (await askSecret("Token (sent as Authorization: Bearer; leave blank for none or to keep the current one): ")).trim();
  await setCustomEndpoint({ ...current, name: name && name !== "Custom endpoint" ? name : undefined, baseUrl, api: API_STYLES[style] });
  if (token) await store.modify("custom", () => Promise.resolve({ type: "api_key", key: token }));

  console.log("Now say which @mentions this endpoint serves and the model id it uses for each.");
  for (;;) {
    const info = await chooseAssistant("Model family served by this endpoint:");
    if (!info) break;
    const current = await getModelId(info.name, "custom");
    const id = (await ask(`Model id for @${info.name}${current ? ` [${current}]` : ""}: `)).trim() || current;
    if (id) await setModelId(info.name, "custom", id);
    if (!/^y(es)?$/i.test((await ask("Add another model? [y/N] ")).trim())) break;
  }
  const models = await createLlmModels(store);
  console.log(`${name ?? "Custom endpoint"} is set up.`);
  await afterSetup(models, "custom");
  return models;
}

async function chooseRouteAndModel(models: MutableModels): Promise<void> {
  const info = await chooseAssistant("Which @mention?");
  if (!info) return;
  const available = await availableRoutes(models, info.name);
  if (available.length === 0) {
    console.log(`@${info.name} isn't set up yet.`);
    return;
  }
  let route = available[0];
  if (available.length > 1) {
    const custom = await getCustomEndpoint();
    const labels = available.map((r) => routeLabel(r, custom));
    const picked = await pick(labels, { title: `Route for @${info.name}:` });
    if (!picked) return;
    route = available[labels.indexOf(picked)];
    await setPreferredRoute(info.name, route);
  }
  await chooseModel(models, info, route);
}

async function logout(models: MutableModels, store: FileCredentialStore): Promise<MutableModels> {
  const custom = await getCustomEndpoint();
  const routes: RouteId[] = [];
  for (const r of Object.keys(ROUTE_LABELS) as RouteId[]) if (await isRouteConfigured(models, r)) routes.push(r);
  const labels = routes.map((r) => routeLabel(r, custom));
  const picked = await pick(labels, { title: "Remove credentials for:" });
  const route = routes[labels.indexOf(picked ?? "")];
  if (!route) return models;
  if (route === "custom") await setCustomEndpoint(undefined);
  else await models.logout(route);
  console.log(`Removed ${routeLabel(route, custom)}.`);
  return route === "custom" ? createLlmModels(store) : models;
}

export async function configureAi(): Promise<void> {
  if (!canPrompt()) {
    console.error('Error: "aecdo configure ai" is interactive; run it in a terminal.');
    process.exit(1);
  }
  if (!nodeSupportsAssistant()) {
    console.error(`Error: the AI assistant needs Node.js 22.19 or newer (you have ${process.versions.node}), or the standalone aecdo binary.`);
    process.exit(1);
  }

  const store = new FileCredentialStore();
  let models = await createLlmModels(store);

  for (;;) {
    await describe(models);
    const action = await pick(Object.values(ACTIONS), { title: "What would you like to do?" });
    try {
      switch (action) {
        case ACTIONS.chatgptLogin: {
          const deviceId = await getDeviceId();
          await models.login("openai", "oauth", interaction, { agentName: APP_NAME, getDeviceId: () => deviceId });
          console.log("Signed in with ChatGPT.");
          await afterSetup(models, "openai");
          break;
        }
        case ACTIONS.openaiKey:
          await saveApiKey(models, store, "openai");
          break;
        case ACTIONS.anthropicKey:
          await saveApiKey(models, store, "anthropic");
          break;
        case ACTIONS.bedrock:
          await setupBedrock(models, store);
          break;
        case ACTIONS.custom:
          models = await setupCustom(store);
          break;
        case ACTIONS.openrouterLogin:
          await models.login("openrouter", "oauth", interaction);
          console.log("Signed in with OpenRouter.");
          await afterSetup(models, "openrouter");
          break;
        case ACTIONS.openrouterKey:
          await saveApiKey(models, store, "openrouter");
          break;
        case ACTIONS.model:
          await chooseRouteAndModel(models);
          break;
        case ACTIONS.logout:
          models = await logout(models, store);
          break;
        default:
          console.log(`Settings are in ${llmConfigPath()}`);
          return;
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
    }
  }
}
