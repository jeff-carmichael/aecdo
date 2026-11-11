import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createValidator, loadSchema } from "./schema.js";

const dirs = ["examples/", "test/fixtures/"].map((d) => new URL(`../../../${d}`, import.meta.url));
const examples = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".jsonld")).map((f) => new URL(f, dir)));

test("every file in examples/ and test/fixtures/ validates against the schema", async () => {
  assert.ok(examples.length > 0);
  const validate = createValidator(await loadSchema());
  for (const file of examples) {
    const data: unknown = JSON.parse(readFileSync(file, "utf-8"));
    assert.ok(validate(data), `${file}: ${JSON.stringify(validate.errors)}`);
  }
});

test("@id values in examples are unique and references resolve", () => {
  for (const file of examples) {
    const ids: string[] = [];
    const refs: string[] = [];
    JSON.parse(readFileSync(file, "utf-8"), (key: string, value: unknown) => {
      if (key === "@id" && typeof value === "string") ids.push(value);
      if (key === "references" && Array.isArray(value)) refs.push(...(value as string[]));
      return value;
    });
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicate @id`);
    const known = new Set(ids);
    assert.deepEqual(refs.filter((r) => !known.has(r)), [], `${file}: dangling references`);
  }
});
