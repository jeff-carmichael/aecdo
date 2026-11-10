import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AVAILABLE_REGIONS, DEFAULT_REGION, getConfigDir, saveConfig } from "../lib/config.js";
import {
  ASSISTANTS,
  APP_NAME,
  ROUTE_LABELS,
  ROUTE_ORDER,
  FileCredentialStore,
  availableRoutes,
  createLlmModels,
  getCustomEndpoint,
  getDeviceId,
  getModelId,
  isRouteConfigured,
  llmConfigPath,
  modelChoices,
  pickRoute,
  routeLabel,
  routesFor,
  setCustomEndpoint,
  setModelId,
  setPreferredRoute,
  type AssistantName,
  type CustomApi,
  type RouteId,
} from "../lib/llm.js";
import { nodeSupportsAssistant } from "../commands/explore.js";
import type { AuthInteraction, MutableModels } from "@earendil-works/pi-ai";
import type { ApiRegion } from "../types.js";

export interface RouteState {
  id: RouteId;
  label: string;
  configured: boolean;
}

export interface AssistantState {
  name: AssistantName;
  label: string;
  /** The way it's reached now and the model it uses there, when it's set up. */
  route?: RouteId;
  model?: string;
  /** Every way to reach it that's set up. */
  available: RouteId[];
  /** Every way it could be reached. */
  possible: RouteId[];
}

export interface SettingsInfo {
  ai: {
    /** False under a Node.js too old for the assistant. */
    supported: boolean;
    routes: RouteState[];
    assistants: AssistantState[];
    custom?: { name?: string; baseUrl: string; api: CustomApi; models: Partial<Record<AssistantName, string>> };
    path: string;
  };
  api: {
    configured: boolean;
    /** The client id with all but its last four characters hidden. */
    clientId?: string;
    region: string;
    regions: string[];
    path: string;
  };
}

export interface CustomSetup {
  name?: string;
  baseUrl: string;
  api: CustomApi;
  /** Blank keeps the saved token. */
  token?: string;
  models: Partial<Record<AssistantName, string>>;
}

type SavedApiConfig = { clientId?: string; clientSecret?: string; region?: string };

const KEY_ROUTES: RouteId[] = ["openai", "anthropic", "openrouter"];

/**
 * The app's Settings: the AI models and the DrawingBot API
 * credentials. Sign-ins ask their questions through `interaction`, which the app shows as dialogs.
 */
export class GuiSettings {
  private store: FileCredentialStore;

  constructor(
    private interaction: AuthInteraction,
    private opts: { llmPath?: string; configDir?: string } = {}
  ) {
    this.store = new FileCredentialStore(opts.llmPath);
  }

  private llmPath(): string {
    return this.opts.llmPath ?? llmConfigPath();
  }

  private apiPath(): string {
    return join(this.opts.configDir ?? getConfigDir(), "config.json");
  }

  private models(): Promise<MutableModels> {
    return createLlmModels(this.store);
  }

  private async savedApi(): Promise<SavedApiConfig | undefined> {
    try {
      return JSON.parse(await readFile(this.apiPath(), "utf-8")) as SavedApiConfig;
    } catch {
      return undefined;
    }
  }

  async info(): Promise<SettingsInfo> {
    const path = this.llmPath();
    const supported = nodeSupportsAssistant();
    const models = supported ? await this.models() : undefined;
    const custom = await getCustomEndpoint(path);
    const routes: RouteState[] = [];
    for (const id of ROUTE_ORDER) routes.push({ id, label: routeLabel(id, custom), configured: models ? await isRouteConfigured(models, id, path) : false });

    const assistants: AssistantState[] = [];
    const customModels: Partial<Record<AssistantName, string>> = {};
    for (const name of Object.keys(ASSISTANTS) as AssistantName[]) {
      const available = models ? await availableRoutes(models, name, path) : [];
      const using = models && available.length ? await pickRoute(models, name, path) : undefined;
      assistants.push({ name, label: ASSISTANTS[name].label, route: using?.route, model: using?.modelId, available, possible: routesFor(name) });
      const id = await getModelId(name, "custom", path);
      if (id) customModels[name] = id;
    }

    const api = await this.savedApi();
    return {
      ai: {
        supported,
        routes,
        assistants,
        ...(custom ? { custom: { name: custom.name, baseUrl: custom.baseUrl, api: custom.api, models: customModels } } : {}),
        path,
      },
      api: {
        configured: Boolean(api?.clientId && api.clientSecret),
        ...(api?.clientId ? { clientId: api.clientId.slice(-4).padStart(api.clientId.length, "•") } : {}),
        region: api?.region ?? DEFAULT_REGION,
        regions: AVAILABLE_REGIONS,
        path: this.apiPath(),
      },
    };
  }

  /** Saves the DrawingBot API credentials; a blank secret keeps the saved one. */
  async saveApi(clientId: string, clientSecret: string, region: string): Promise<string> {
    if (!AVAILABLE_REGIONS.includes(region as ApiRegion)) throw new Error(`Unknown region "${region}". Available: ${AVAILABLE_REGIONS.join(", ")}`);
    const saved = await this.savedApi();
    const id = clientId.trim() || saved?.clientId;
    const secret = clientSecret.trim() || saved?.clientSecret;
    if (!id) throw new Error("Enter the Client ID.");
    if (!secret) throw new Error("Enter the Client Secret.");
    await saveConfig(id, secret, region as ApiRegion, this.opts.configDir);
    return "Saved the DrawingBot API credentials.";
  }

  async saveKey(route: RouteId, key: string): Promise<string> {
    if (!KEY_ROUTES.includes(route)) throw new Error(`${ROUTE_LABELS[route] ?? route} doesn't use an API key here.`);
    const value = key.trim();
    if (!value) throw new Error("Paste the API key first.");
    await this.store.modify(route, () => Promise.resolve({ type: "api_key", key: value }));
    return `Saved the ${ROUTE_LABELS[route]} key.`;
  }

  /** Sign in with ChatGPT or OpenRouter in the browser. */
  async signIn(route: RouteId): Promise<string> {
    const models = await this.models();
    if (route === "openai") {
      const deviceId = await getDeviceId(this.llmPath());
      await models.login("openai", "oauth", this.interaction, { agentName: APP_NAME, getDeviceId: () => deviceId });
      return "Signed in with ChatGPT.";
    }
    if (route === "openrouter") {
      await models.login("openrouter", "oauth", this.interaction);
      return "Signed in with OpenRouter.";
    }
    throw new Error(`${ROUTE_LABELS[route] ?? route} has no browser sign-in.`);
  }

  /** Amazon Bedrock: asks how to sign in to AWS (through `interaction`), then saves the region. */
  async setupBedrock(region: string): Promise<string> {
    const models = await this.models();
    await models.login("amazon-bedrock", "api_key", this.interaction);
    const aws = region.trim() || process.env.AWS_REGION || "us-east-1";
    await this.store.modify("amazon-bedrock", (c) => Promise.resolve(c?.type === "api_key" ? { ...c, env: { ...c.env, AWS_REGION: aws } } : c));
    return "Amazon Bedrock is set up. Make sure your AWS account has access to the models you use.";
  }

  async saveCustom(setup: CustomSetup): Promise<string> {
    const baseUrl = setup.baseUrl.trim();
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error("The base URL needs to start with https:// (or http://).");
    if (setup.api !== "openai-completions" && setup.api !== "anthropic-messages") throw new Error("Pick which API the endpoint speaks.");
    const path = this.llmPath();
    const current = await getCustomEndpoint(path);
    const name = setup.name?.trim();
    await setCustomEndpoint({ ...current, name: name && name !== "Custom endpoint" ? name : undefined, baseUrl, api: setup.api }, path);
    if (setup.token?.trim()) await this.store.modify("custom", () => Promise.resolve({ type: "api_key", key: setup.token!.trim() }));
    for (const n of Object.keys(ASSISTANTS) as AssistantName[]) {
      if (n in setup.models) await setModelId(n, "custom", setup.models[n]?.trim() || undefined, path);
    }
    return `${name || "The custom endpoint"} is set up.`;
  }

  /** The models @name can use on a route, current one first. */
  async modelChoices(name: AssistantName, route: RouteId): Promise<string[]> {
    const current = (await getModelId(name, route, this.llmPath())) ?? (await this.currentModel(name, route)) ?? "";
    if (route === "custom") return current ? [current] : [];
    const models = await this.models();
    return modelChoices(route, models.getModels(route).map((m) => m.id), current, ASSISTANTS[name]);
  }

  private async currentModel(name: AssistantName, route: RouteId): Promise<string | undefined> {
    const models = await this.models();
    const using = await pickRoute(models, name, this.llmPath());
    return using?.route === route ? using.modelId : undefined;
  }

  /** Which way @name goes, and optionally which model it uses there. */
  async choose(name: AssistantName, route: RouteId, model?: string): Promise<string> {
    const path = this.llmPath();
    const models = await this.models();
    if (!(await availableRoutes(models, name, path)).includes(route)) throw new Error(`${routeLabel(route, await getCustomEndpoint(path))} isn't set up for @${name}.`);
    await setPreferredRoute(name, route, path);
    if (model?.trim()) await setModelId(name, route, model.trim(), path);
    return `@${name} now uses ${(await pickRoute(models, name, path))?.modelId ?? model} via ${routeLabel(route, await getCustomEndpoint(path))}.`;
  }

  async signOut(route: RouteId): Promise<string> {
    const path = this.llmPath();
    const label = routeLabel(route, await getCustomEndpoint(path));
    if (route === "custom") {
      await setCustomEndpoint(undefined, path);
      await this.store.delete("custom");
    } else {
      await (await this.models()).logout(route);
    }
    return `Removed ${label}.`;
  }
}
