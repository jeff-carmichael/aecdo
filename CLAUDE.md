# CLAUDE.md — Project Context for Claude Code

## What is this repo?

AECDO (AEC Drawing Ontology) — an open schema + CLI for structured data extracted from Architecture, Engineering, and Construction drawings. AEC DrawingBot produces JSON-LD files conforming to this schema.

## Key paths

- `ontology/v0.1.0/aecdo.schema.json` — the JSON Schema (source of truth)
- `ontology/v0.1.0/context.jsonld` — JSON-LD context
- `ontology/v0.1.0/diagram.mmd` — Mermaid class diagram
- `cli/` — TypeScript CLI source (compiled to `dist/` via `npm run build`)
- `cli/src/types.ts` — shared data model types (DrawingSet, Sheet, Drawing, etc.)
- `package.json` — at repo root, npm-publishable as "aecdo"
- `examples/sample-drawing-set.jsonld` — validates against the schema
- `SKILLS.md` — skill file for AI agents (skills directory format with YAML frontmatter)

## Data model

Hierarchy: **DrawingSet → Sheet → Drawing → Layer → Item**, plus Table and Note at the sheet level.

- All `@id` fields are UUID URNs (`urn:uuid:...`)
- `bbox` is always `[xmin, ymin, xmax, ymax]` (4-element number array)
- Item types: `tag` (annotations/symbols), `thing` (physical elements), `area` (regions)
- Drawing types: `plan`, `section`, `elevation`, `detail`
- Item `data` is a freeform object — contents vary by what was extracted
- Table `content` is pipe-delimited text with newline-separated rows

## CLI usage

```bash
npm install
npm run build
npx aecdo validate examples/sample-drawing-set.jsonld
npx aecdo inspect examples/sample-drawing-set.jsonld
npx aecdo summary examples/sample-drawing-set.jsonld
npx aecdo convert examples/sample-drawing-set.jsonld
```

After `npm install -g aecdo` (once published), `aecdo` works directly without `npx`.

## Code conventions

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- No comments unless explaining a non-obvious "why"
- Minimal dependencies (only ajv for validation)
- Use Node.js built-in test runner (`node --test`)

## Schema versioning

- Versions live in `ontology/v<semver>/`
- Additive changes go in the current version
- Breaking changes require a new version directory
- Update `CHANGELOG.md` for every schema change
