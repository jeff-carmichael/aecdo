#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../ontology/v0.1.0/aecdo.schema.json");
const outputPath = resolve(__dirname, "../ontology/v0.1.0/diagram.mmd");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const typeOrder = ["DrawingSet", "Sheet", "Drawing", "Layer", "Item", "Table", "Note"];

function getFields(properties, required = []) {
  const fields = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (name === "@context" || name === "@type") continue;
    let type;
    if (name === "@id") {
      type = "uuid4";
    } else if (prop.$ref === "#/$defs/BBox") {
      type = "array";
    } else if (prop.type === "string" && prop.format === "date-time") {
      type = "Date";
    } else if (prop.type === "string" && prop.format === "uri") {
      type = "URI";
    } else if (prop.type === "integer") {
      type = "int";
    } else if (prop.type === "string") {
      type = "String";
    } else if (prop.type === "object") {
      type = "Object";
    } else if (prop.type === "array") {
      continue; // relationships rendered separately
    } else {
      type = "String";
    }
    fields.push({ name, type });
  }
  return fields;
}

function getRelationships(typeName, properties) {
  const rels = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (prop.type !== "array") continue;
    if (name === "references") continue; // handled separately
    const ref = prop.items?.$ref;
    if (!ref) continue;
    const target = ref.replace("#/$defs/", "");
    const min = prop.minItems ?? 0;
    const card = min > 0 ? `"1..*"` : `"0..*"`;
    rels.push({ from: typeName, to: target, card, label: "contains" });
  }
  return rels;
}

function getReferenceRelationships(typeName, properties) {
  const refs = properties.references;
  if (!refs || refs.type !== "array") return [];
  const targets = [];
  if (typeName === "Item") targets.push("Drawing");
  if (typeName === "Drawing") targets.push("Drawing");
  return targets.map((t) => ({ from: typeName, to: t }));
}

const lines = [];
lines.push("---");
lines.push("title: AEC DrawingBot 2.0 Ontology");
lines.push("---");
lines.push("");
lines.push("classDiagram");

// Root class
const rootFields = getFields(schema.properties, schema.required);
lines.push("    class DrawingSet {");
for (const f of rootFields) {
  lines.push(`\t\t    +${f.type} ${f.name}`);
}
lines.push("    }");

// $defs classes
for (const name of typeOrder.slice(1)) {
  const def = schema.$defs[name];
  if (!def) continue;
  const fields = getFields(def.properties, def.required);
  lines.push(`    class ${name} {`);
  for (const f of fields) {
    lines.push(`\t\t    +${f.type} ${f.name}`);
  }
  lines.push("    }");
}

lines.push("");
lines.push("\t\t%% Structure Relationships");

// Root relationships
const rootRels = getRelationships("DrawingSet", schema.properties);
for (const r of rootRels) {
  lines.push(`    ${r.from} "1" --* ${r.card} ${r.to} : ${r.label}`);
}

// $defs relationships
for (const name of typeOrder.slice(1)) {
  const def = schema.$defs[name];
  if (!def) continue;
  const rels = getRelationships(name, def.properties);
  for (const r of rels) {
    lines.push(`    ${r.from} "1" --* ${r.card} ${r.to} : ${r.label}`);
  }
}

lines.push("");
lines.push("    %% The Reference Relationships");

for (const name of typeOrder.slice(1)) {
  const def = schema.$defs[name];
  if (!def) continue;
  const refs = getReferenceRelationships(name, def.properties);
  for (const r of refs) {
    lines.push(`    ${r.from} "1" ..> "1..*" ${r.to} : references`);
  }
}

lines.push("");

const output = lines.join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) {
    console.error("diagram.mmd is out of date. Run: node scripts/generate-diagram.mjs");
    process.exit(1);
  }
  console.log("diagram.mmd is up to date.");
} else {
  writeFileSync(outputPath, output);
  console.log("Generated diagram.mmd");
}
