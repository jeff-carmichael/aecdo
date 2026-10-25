import { createInterface } from "node:readline";
import { openWithDefaultApp } from "../lib/open.js";
import { pick, canPrompt } from "../lib/picker.js";
import {
  ASSISTANTS,
  APP_NAME,
  OPENROUTER_RECOMMENDED,
  PROVIDER_LABELS,
  configurableAssistants,
  FileCredentialStore,
  createLlmModels,
  getAssistantModelId,
  getDeviceId,
  llmConfigPath,
  setAssistantModelId,
  type AssistantName,
} from "../lib/llm.js";
import { nodeSupportsAssistant } from "./explore.js";
import type { AuthInteraction, AuthPrompt, MutableModels } from "@earendil-works/pi-ai";

const ACTIONS = {
  chatgptLogin: "Sign in with ChatGPT (uses your ChatGPT plan)",
  openaiKey: "Enter an OpenAI API key (ChatGPT, billed per use)",
  anthropicKey: "Enter an Anthropic API key (Claude, billed per use)",
  openrouterLogin: "Sign in with OpenRouter (Gemini, Grok, Claude, GPT and more)",
  openrouterKey: "Enter an OpenRouter API key",
  model: "Choose a model",
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
  const assistants = configurableAssistants();
  console.log(`\nAI assistants (use ${assistants.map((a) => `@${a.name}`).join(", ")} inside aecdo explore):`);
  for (const a of assistants) {
    const auth = await models.checkAuth(a.provider).catch(() => undefined);
    const how = !auth ? "not set up" : auth.type === "oauth" ? "signed in" : `API key (${auth.source ?? "stored"})`;
    console.log(`  ${a.label.padEnd(10)} ${how.padEnd(36)} model: ${await getAssistantModelId(a.name)}`);
  }
  const shortcuts = Object.values(ASSISTANTS).filter((a) => a.shortcut);
  console.log(`  Shortcuts through OpenRouter: ${shortcuts.map((a) => `@${a.name}`).join(", ")}`);
  console.log();
}

async function chooseAssistant(title: string): Promise<AssistantName | null> {
  const assistants = configurableAssistants();
  const picked = await pick(assistants.map((a) => a.label), { title });
  return assistants.find((a) => a.label === picked)?.name ?? null;
}

async function chooseModel(models: MutableModels, name: AssistantName): Promise<void> {
  const info = ASSISTANTS[name];
  const current = await getAssistantModelId(name);
  const ids = modelChoices(info.provider, models.getModels(info.provider).map((m) => m.id), current);
  const picked = await pick(ids, { title: `${info.label} model (type to filter):` });
  if (!picked) return;
  await setAssistantModelId(name, picked);
}

/**
 * Current model first. For OpenRouter, the recommended models come next and batch-only
 * variants are left out, since the full catalog has hundreds of entries.
 */
export function modelChoices(provider: string, catalog: string[], current: string): string[] {
  let ids = [...catalog].reverse();
  if (provider === "openrouter") {
    ids = ids.filter((id) => !id.endsWith(":batch"));
    const recommended = OPENROUTER_RECOMMENDED.filter((id) => ids.includes(id));
    ids = [...recommended, ...ids.filter((id) => !recommended.includes(id))];
  }
  return [current, ...ids.filter((id) => id !== current)];
}

async function saveApiKey(models: MutableModels, store: FileCredentialStore, name: AssistantName): Promise<void> {
  const info = ASSISTANTS[name];
  const key = (await askSecret(`${PROVIDER_LABELS[info.provider]} API key: `)).trim();
  if (!key) {
    console.log("No key entered; nothing changed.");
    return;
  }
  await store.modify(info.provider, () => Promise.resolve({ type: "api_key", key }));
  console.log(`Saved. ${info.label} is ready.`);
  await chooseModel(models, name);
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
  const models = await createLlmModels(store);

  for (;;) {
    await describe(models);
    const action = await pick(Object.values(ACTIONS), { title: "What would you like to do?" });
    try {
      switch (action) {
        case ACTIONS.chatgptLogin: {
          const deviceId = await getDeviceId();
          await models.login("openai", "oauth", interaction, { agentName: APP_NAME, getDeviceId: () => deviceId });
          console.log("Signed in with ChatGPT.");
          await chooseModel(models, "chatgpt");
          break;
        }
        case ACTIONS.openaiKey:
          await saveApiKey(models, store, "chatgpt");
          break;
        case ACTIONS.anthropicKey:
          await saveApiKey(models, store, "claude");
          break;
        case ACTIONS.openrouterLogin:
          await models.login("openrouter", "oauth", interaction);
          console.log("Signed in with OpenRouter.");
          await chooseModel(models, "openrouter");
          break;
        case ACTIONS.openrouterKey:
          await saveApiKey(models, store, "openrouter");
          break;
        case ACTIONS.model: {
          const name = await chooseAssistant("Which assistant?");
          if (name) await chooseModel(models, name);
          break;
        }
        case ACTIONS.logout: {
          const name = await chooseAssistant("Remove credentials for:");
          if (name) {
            await models.logout(ASSISTANTS[name].provider);
            console.log(`Removed stored ${ASSISTANTS[name].label} credentials.`);
          }
          break;
        }
        default:
          console.log(`Settings are in ${llmConfigPath()}`);
          return;
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
    }
  }
}
