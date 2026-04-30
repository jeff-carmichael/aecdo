import { output } from "../lib/output.js";
import type { DrawingSet, CommandOptions } from "../types.js";

export async function convert(data: DrawingSet, filePath: string, opts: CommandOptions = {}): Promise<void> {
  const hasContext = "@context" in data;

  if (hasContext && opts.format !== "jsonld") {
    const plain = stripJsonLd(data);
    await output(plain, { ...opts, pretty: true });
  } else if (!hasContext) {
    const jsonld = addJsonLdContext(data);
    await output(jsonld, { ...opts, pretty: true });
  } else {
    await output(data, { ...opts, pretty: true });
  }
}

function stripJsonLd(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripJsonLd);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "@context") continue;
      const newKey = key.startsWith("@") ? key.slice(1) : key;
      result[newKey] = stripJsonLd(value);
    }
    return result;
  }
  return obj;
}

function addJsonLdContext(obj: DrawingSet): Record<string, unknown> {
  return {
    "@context":
      "https://aecdrawingbot.com/ontology/v0.1.0/context.jsonld",
    ...obj,
    "@type": obj["@type"] || "DrawingSet",
  };
}
