import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getConfigDir } from "./config.js";
import type {
  ApiKeyAuth,
  Credential,
  CredentialInfo,
  CredentialStore,
  MutableModels,
  Model,
  Api,
  ProviderStreams,
} from "@earendil-works/pi-ai";

/** A model family the user can @mention. How it is reached (the route) is a separate setting. */
export type AssistantName = "claude" | "chatgpt" | "gemini" | "grok" | "deepseek" | "kimi";

/** A way to reach models: a pi provider id. "custom" is the user's own endpoint. */
export type RouteId = "anthropic" | "openai" | "amazon-bedrock" | "custom" | "openrouter";

/** Preferred order when more than one route is set up and the user hasn't picked one. */
export const ROUTE_ORDER: RouteId[] = ["anthropic", "openai", "amazon-bedrock", "custom", "openrouter"];

export const ROUTE_LABELS: Record<RouteId, string> = {
  anthropic: "Anthropic API",
  openai: "OpenAI",
  "amazon-bedrock": "Amazon Bedrock",
  custom: "Custom endpoint",
  openrouter: "OpenRouter",
};

export interface AssistantInfo {
  name: AssistantName;
  label: string;
  mentions: string[];
  /** Default model id for each route that can serve this family. Custom has none: the user names it. */
  routes: Partial<Record<RouteId, string>>;
  /** Picks this family's entries out of shared catalogs (Bedrock, OpenRouter). */
  match: RegExp;
}

export const ASSISTANTS: Record<AssistantName, AssistantInfo> = {
  claude: {
    name: "claude",
    label: "Claude",
    mentions: ["claude"],
    routes: {
      anthropic: "claude-sonnet-5-5",
      "amazon-bedrock": "global.anthropic.claude-sonnet-5-5",
      custom: "",
      openrouter: "~anthropic/claude-sonnet-latest",
    },
    match: /claude/i,
  },
  chatgpt: {
    name: "chatgpt",
    label: "ChatGPT",
    mentions: ["chatgpt", "gpt", "openai"],
    routes: { openai: "gpt-5.5", "amazon-bedrock": "openai.gpt-5.5", custom: "", openrouter: "openai/gpt-5.5" },
    match: /openai|gpt/i,
  },
  gemini: {
    name: "gemini",
    label: "Gemini",
    mentions: ["gemini"],
    routes: { custom: "", openrouter: "~google/gemini-pro-latest" },
    match: /gemini/i,
  },
  grok: {
    name: "grok",
    label: "Grok",
    mentions: ["grok"],
    routes: { "amazon-bedrock": "global.xai.grok-4.7", custom: "", openrouter: "~x-ai/grok-latest" },
    match: /grok/i,
  },
  deepseek: {
    name: "deepseek",
    label: "DeepSeek",
    mentions: ["deepseek"],
    routes: { "amazon-bedrock": "deepseek.v3.2", custom: "", openrouter: "~deepseek/deepseek-pro-latest" },
    match: /deepseek/i,
  },
  kimi: {
    name: "kimi",
    label: "Kimi",
    mentions: ["kimi"],
    routes: { "amazon-bedrock": "global.moonshotai.kimi-k3", custom: "", openrouter: "~moonshotai/kimi-latest" },
    match: /kimi|moonshot/i,
  },
};

/** Routes that can serve this family, in preference order. */
export function routesFor(name: AssistantName): RouteId[] {
  return ROUTE_ORDER.filter((r) => ASSISTANTS[name].routes[r] !== undefined);
}

/** Every @name that reaches an assistant, for completion and hints. */
export function allMentions(): string[] {
  return Object.values(ASSISTANTS).flatMap((a) => a.mentions);
}

export const APP_NAME = "aecdo";

export type CustomApi = "openai-completions" | "anthropic-messages";

/** The user's own OpenAI- or Anthropic-compatible endpoint (LiteLLM, Azure, vLLM, ...). */
export interface CustomEndpoint {
  /** Shown in place of "Custom endpoint", e.g. "Company gateway". */
  name?: string;
  baseUrl: string;
  api: CustomApi;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

interface LlmConfigFile {
  deviceId?: string;
  /** Model id per family and route. A plain string is the older single-route form. */
  models?: Partial<Record<AssistantName, Partial<Record<RouteId, string>> | string>>;
  /** The route the user picked for a family when several are set up. */
  routes?: Partial<Record<AssistantName, RouteId>>;
  custom?: CustomEndpoint;
  credentials?: Record<string, Credential>;
}

export function llmConfigPath(): string {
  return join(getConfigDir(), "llm.json");
}

async function readLlmConfig(path = llmConfigPath()): Promise<LlmConfigFile> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as LlmConfigFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
}

async function writeLlmConfig(config: LlmConfigFile, path = llmConfigPath()): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
}

let writeChain: Promise<unknown> = Promise.resolve();

/** Serializes read-modify-write cycles of the config file within this process. */
async function updateLlmConfig<T>(fn: (config: LlmConfigFile) => Promise<T> | T, path = llmConfigPath()): Promise<T> {
  const run = writeChain.then(async () => {
    const config = await readLlmConfig(path);
    const result = await fn(config);
    await writeLlmConfig(config, path);
    return result;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

/** pi-ai credential store backed by ~/.aecdo/llm.json (0600), next to the DrawingBot credentials. */
export class FileCredentialStore implements CredentialStore {
  constructor(readonly path = llmConfigPath()) {}

  async read(providerId: string): Promise<Credential | undefined> {
    return (await readLlmConfig(this.path)).credentials?.[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const creds = (await readLlmConfig(this.path)).credentials ?? {};
    return Object.entries(creds).map(([providerId, c]) => ({ providerId, type: c.type }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    return updateLlmConfig(async (config) => {
      const current = config.credentials?.[providerId];
      const next = await fn(current);
      if (next === undefined) return current;
      config.credentials = { ...config.credentials, [providerId]: next };
      return next;
    }, this.path);
  }

  async delete(providerId: string): Promise<void> {
    await updateLlmConfig((config) => {
      if (config.credentials) delete config.credentials[providerId];
    }, this.path);
  }
}

export async function getDeviceId(path = llmConfigPath()): Promise<string> {
  return updateLlmConfig((config) => (config.deviceId ??= randomUUID()), path);
}

/** The direct route for a family, which an older string-valued model setting belongs to. */
function directRoute(name: AssistantName): RouteId | undefined {
  return (["anthropic", "openai"] as const).find((r) => ASSISTANTS[name].routes[r] !== undefined);
}

function storedModels(config: LlmConfigFile, name: AssistantName): Partial<Record<RouteId, string>> {
  const entry = config.models?.[name];
  if (typeof entry !== "string") return entry ?? {};
  const direct = directRoute(name);
  return direct ? { [direct]: entry } : {};
}

/** Model id for a family on a route; undefined only for a custom endpoint that doesn't serve the family. */
export async function getModelId(name: AssistantName, route: RouteId, path = llmConfigPath()): Promise<string | undefined> {
  const id = storedModels(await readLlmConfig(path), name)[route] ?? ASSISTANTS[name].routes[route];
  return id || undefined;
}

export async function setModelId(name: AssistantName, route: RouteId, modelId: string | undefined, path = llmConfigPath()): Promise<void> {
  await updateLlmConfig((config) => {
    const entry = { ...storedModels(config, name) };
    if (modelId) entry[route] = modelId;
    else delete entry[route];
    config.models = { ...config.models, [name]: entry };
  }, path);
}

export async function getPreferredRoute(name: AssistantName, path = llmConfigPath()): Promise<RouteId | undefined> {
  return (await readLlmConfig(path)).routes?.[name];
}

export async function setPreferredRoute(name: AssistantName, route: RouteId | undefined, path = llmConfigPath()): Promise<void> {
  await updateLlmConfig((config) => {
    const routes = { ...config.routes };
    if (route) routes[name] = route;
    else delete routes[name];
    config.routes = routes;
  }, path);
}

export async function getCustomEndpoint(path = llmConfigPath()): Promise<CustomEndpoint | undefined> {
  return (await readLlmConfig(path)).custom;
}

/** Saves the endpoint (or removes it with undefined, along with its token and model ids). */
export async function setCustomEndpoint(endpoint: CustomEndpoint | undefined, path = llmConfigPath()): Promise<void> {
  await updateLlmConfig((config) => {
    if (endpoint) {
      config.custom = endpoint;
      return;
    }
    delete config.custom;
    if (config.credentials) delete config.credentials.custom;
    for (const name of Object.keys(ASSISTANTS) as AssistantName[]) {
      const entry = storedModels(config, name);
      delete entry.custom;
      if (config.models?.[name]) config.models[name] = entry;
      if (config.routes?.[name] === "custom") delete config.routes[name];
    }
  }, path);
}

export function routeLabel(route: RouteId, custom?: CustomEndpoint): string {
  return route === "custom" && custom?.name ? custom.name : ROUTE_LABELS[route];
}

export function assistantForMention(word: string): AssistantInfo | undefined {
  const w = word.toLowerCase();
  return Object.values(ASSISTANTS).find((a) => a.mentions.includes(w));
}

/**
 * pi's Bedrock auth only counts ambient AWS credentials it can see in the environment, and
 * drops the stored env (where we keep AWS_REGION) for them. Once the user has set Bedrock up,
 * keep the stored env and let the AWS SDK's default chain (~/.aws, SSO) find the credentials.
 */
function bedrockAuth(base: ApiKeyAuth): ApiKeyAuth {
  return {
    ...base,
    resolve: async (input) => {
      const result = await base.resolve(input);
      const stored = input.credential?.env;
      if (result) return stored ? { ...result, env: { ...stored, ...result.env } } : result;
      if (!input.credential) return undefined;
      return { auth: {}, env: stored, source: "AWS default credentials" };
    },
  };
}

function customAuth(): ApiKeyAuth {
  return {
    name: "Custom endpoint token",
    resolve: ({ credential }) =>
      Promise.resolve(
        credential?.key
          ? { auth: { headers: { Authorization: `Bearer ${credential.key}` } }, source: "token" }
          : { auth: { apiKey: "none" }, source: "no token" }
      ),
  };
}

/**
 * Some gateways validate the request body and reject fields they don't
 * know (cache_control, eager_input_streaming, store), so custom endpoints get a plain request.
 */
const PLAIN_ANTHROPIC = {
  supportsEagerToolInputStreaming: false,
  supportsCacheControlOnTools: false,
  supportsLongCacheRetention: false,
  supportsStrictTools: false,
};
const PLAIN_OPENAI = { supportsStore: false, supportsLongCacheRetention: false, supportsStrictMode: false };

function withoutPromptCaching(api: ProviderStreams): ProviderStreams {
  return {
    ...api,
    stream: (model, context, options) => api.stream(model, context, { ...options, cacheRetention: "none" }),
    streamSimple: (model, context, options) => api.streamSimple(model, context, { ...options, cacheRetention: "none" }),
  };
}

function customModel(endpoint: CustomEndpoint, id: string): Model<Api> {
  const common = {
    id,
    name: id,
    provider: "custom",
    baseUrl: endpoint.baseUrl.replace(/\/+$/, ""),
    headers: endpoint.headers,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: 200_000,
    maxTokens: 16_384,
  };
  return endpoint.api === "anthropic-messages"
    ? { ...common, api: "anthropic-messages", compat: PLAIN_ANTHROPIC }
    : { ...common, api: "openai-completions", compat: PLAIN_OPENAI };
}

/**
 * pi needs Node 22.19+; loading it lazily keeps every other command working on
 * older Node versions and keeps startup fast.
 */
export async function createLlmModels(store: CredentialStore = new FileCredentialStore()): Promise<MutableModels> {
  const path = store instanceof FileCredentialStore ? store.path : llmConfigPath();
  const [pi, anthropic, openai, openrouter, bedrock, bedrockModels, bedrockApi, openaiApi, anthropicApi, config] =
    await Promise.all([
      import("@earendil-works/pi-ai"),
      import("@earendil-works/pi-ai/providers/anthropic"),
      import("@earendil-works/pi-ai/providers/openai"),
      import("@earendil-works/pi-ai/providers/openrouter"),
      import("@earendil-works/pi-ai/providers/amazon-bedrock"),
      import("@earendil-works/pi-ai/providers/amazon-bedrock.models"),
      import("@earendil-works/pi-ai/api/bedrock-converse-stream.lazy"),
      import("@earendil-works/pi-ai/api/openai-completions.lazy"),
      import("@earendil-works/pi-ai/api/anthropic-messages.lazy"),
      readLlmConfig(path),
    ]);
  const models = pi.createModels({
    credentials: store,
    identity: { attribution: { name: APP_NAME, url: "https://github.com/jeff-carmichael/aecdo" } },
  });
  models.setProvider(anthropic.anthropicProvider());
  models.setProvider(openai.openaiProvider());
  models.setProvider(openrouter.openrouterProvider());
  models.setProvider(
    pi.createProvider({
      id: "amazon-bedrock",
      name: "Amazon Bedrock",
      auth: { apiKey: bedrockAuth(bedrock.amazonBedrockProvider().auth.apiKey!) },
      models: Object.values(bedrockModels.AMAZON_BEDROCK_MODELS),
      api: bedrockApi.bedrockConverseStreamApi(),
    })
  );
  const endpoint = config.custom;
  if (endpoint) {
    const ids = new Set(
      (Object.keys(ASSISTANTS) as AssistantName[]).map((n) => storedModels(config, n).custom).filter((id): id is string => !!id)
    );
    models.setProvider(
      pi.createProvider({
        id: "custom",
        name: endpoint.name ?? ROUTE_LABELS.custom,
        auth: { apiKey: customAuth() },
        models: [...ids].map((id) => customModel(endpoint, id)),
        api: withoutPromptCaching(
          endpoint.api === "anthropic-messages" ? anthropicApi.anthropicMessagesApi() : openaiApi.openAICompletionsApi()
        ),
      })
    );
  }
  return models;
}

/** Whether a route has credentials. Bedrock counts only once set up in "aecdo configure ai", not from stray AWS env vars. */
export async function isRouteConfigured(models: MutableModels, route: RouteId, path = llmConfigPath()): Promise<boolean> {
  const config = await readLlmConfig(path);
  if (route === "amazon-bedrock") return config.credentials?.["amazon-bedrock"] !== undefined;
  if (route === "custom") return config.custom !== undefined;
  return (await models.checkAuth(route).catch(() => undefined)) !== undefined;
}

/** Routes that are set up and can serve this family, preferred first. */
export async function availableRoutes(models: MutableModels, name: AssistantName, path = llmConfigPath()): Promise<RouteId[]> {
  const out: RouteId[] = [];
  for (const route of routesFor(name)) {
    if (!(await isRouteConfigured(models, route, path))) continue;
    if (route === "custom" && !(await getModelId(name, "custom", path))) continue;
    out.push(route);
  }
  return out;
}

export interface ResolvedRoute {
  route: RouteId;
  modelId: string;
}

/** The user's chosen route if it's still set up, else the first one that is. */
export async function pickRoute(models: MutableModels, name: AssistantName, path = llmConfigPath()): Promise<ResolvedRoute | undefined> {
  const available = await availableRoutes(models, name, path);
  const preferred = await getPreferredRoute(name, path);
  const route = preferred && available.includes(preferred) ? preferred : available[0];
  if (!route) return undefined;
  return { route, modelId: (await getModelId(name, route, path))! };
}

export function resolveModel(models: MutableModels, name: AssistantName, { route, modelId }: ResolvedRoute): Model<Api> {
  const model = models.getModel(route, modelId);
  if (!model) {
    throw new Error(
      `Unknown ${ASSISTANTS[name].label} model "${modelId}" on ${ROUTE_LABELS[route]}. Run "aecdo configure ai" to pick another.`
    );
  }
  return model;
}
