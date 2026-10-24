import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getConfigDir } from "./config.js";
import type { Credential, CredentialInfo, CredentialStore, MutableModels, Model, Api } from "@earendil-works/pi-ai";

export type AssistantName = "claude" | "chatgpt";

export interface AssistantInfo {
  name: AssistantName;
  label: string;
  provider: "anthropic" | "openai";
  defaultModel: string;
  mentions: string[];
}

export const ASSISTANTS: Record<AssistantName, AssistantInfo> = {
  claude: {
    name: "claude",
    label: "Claude",
    provider: "anthropic",
    defaultModel: "claude-sonnet-5-5",
    mentions: ["claude"],
  },
  chatgpt: {
    name: "chatgpt",
    label: "ChatGPT",
    provider: "openai",
    defaultModel: "gpt-5.5",
    mentions: ["chatgpt", "gpt", "openai"],
  },
};

export const APP_NAME = "aecdo";

interface LlmConfigFile {
  deviceId?: string;
  models?: Partial<Record<AssistantName, string>>;
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
  constructor(private path = llmConfigPath()) {}

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

export async function getAssistantModelId(name: AssistantName, path = llmConfigPath()): Promise<string> {
  return (await readLlmConfig(path)).models?.[name] ?? ASSISTANTS[name].defaultModel;
}

export async function setAssistantModelId(name: AssistantName, modelId: string, path = llmConfigPath()): Promise<void> {
  await updateLlmConfig((config) => {
    config.models = { ...config.models, [name]: modelId };
  }, path);
}

export function assistantForMention(word: string): AssistantInfo | undefined {
  const w = word.toLowerCase();
  return Object.values(ASSISTANTS).find((a) => a.mentions.includes(w));
}

/**
 * pi needs Node 22.19+; loading it lazily keeps every other command working on
 * older Node versions and keeps startup fast.
 */
export async function createLlmModels(store: CredentialStore = new FileCredentialStore()): Promise<MutableModels> {
  const [pi, anthropic, openai] = await Promise.all([
    import("@earendil-works/pi-ai"),
    import("@earendil-works/pi-ai/providers/anthropic"),
    import("@earendil-works/pi-ai/providers/openai"),
  ]);
  const models = pi.createModels({
    credentials: store,
    identity: { attribution: { name: APP_NAME, url: "https://github.com/jeff-carmichael/aecdo" } },
  });
  models.setProvider(anthropic.anthropicProvider());
  models.setProvider(openai.openaiProvider());
  return models;
}

export async function resolveAssistantModel(models: MutableModels, name: AssistantName): Promise<Model<Api>> {
  const info = ASSISTANTS[name];
  const id = await getAssistantModelId(name);
  const model = models.getModel(info.provider, id);
  if (!model) {
    throw new Error(`Unknown ${info.label} model "${id}". Run "aecdo configure ai" to pick another.`);
  }
  return model;
}

export async function isAssistantConfigured(models: MutableModels, name: AssistantName): Promise<boolean> {
  return (await models.checkAuth(ASSISTANTS[name].provider)) !== undefined;
}
