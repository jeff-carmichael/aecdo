import _Ajv2020 from "ajv/dist/2020.js";
import _addFormats from "ajv-formats";

const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = resolve(
  __dirname,
  "../../../ontology/v0.3.0/aecdo.schema.json"
);

export async function loadSchema(customPath?: string): Promise<Record<string, unknown>> {
  const schemaPath = customPath || DEFAULT_SCHEMA_PATH;
  const raw = await readFile(schemaPath, "utf-8");
  return JSON.parse(raw);
}

export function createValidator(schema: Record<string, unknown>) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}
