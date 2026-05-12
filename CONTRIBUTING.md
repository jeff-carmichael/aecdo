# Contributing to AECDO

Thank you for your interest in contributing to the AEC Drawing Ontology. This guide covers how to contribute to both the schema/ontology and the CLI tool.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a branch for your changes

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
git checkout -b your-feature-branch
```

## Project Structure

- **`ontology/`** — The schema definitions (versioned). This is the core of the project.
- **`cli/`** — TypeScript CLI for working with AECDO JSON-LD files (compiled to `dist/` via `npm run build`).
- **`examples/`** — Sample JSON-LD files used for testing and documentation.
- **`.claude/skills/aecdo/SKILL.md`** — Claude Code skill for AI agents working with drawing data.

## Contributing to the Ontology/Schema

The schema is the most important part of this project. Changes must be carefully managed to avoid breaking existing consumers.

### Versioning Policy

We use [Semantic Versioning](https://semver.org/) for the schema:

- **Patch (0.1.x)**: Documentation fixes, clarifications, adding `description` fields. No structural changes.
- **Minor (0.x.0)**: Additive changes — new optional properties, new types, new enum values. Existing valid documents remain valid.
- **Major (x.0.0)**: Breaking changes — removing properties, making optional fields required, changing types, renaming fields.

Pre-1.0, minor versions may include breaking changes (per semver convention), but we still aim for backwards compatibility wherever possible.

### How to Propose a Schema Change

1. **Open an issue first.** Describe the change, why it's needed, and what AEC use case it supports. Use the "Schema Change" issue template.

2. **Discussion period.** Schema changes need at least one approval from a maintainer before implementation.

3. **Implement the change:**
   - For additive/patch changes: edit the current version in `ontology/v<current>/`
   - For breaking changes: create a new version directory `ontology/v<new>/`
   - Update `context.jsonld` to match any schema changes
   - Update example files to demonstrate new features
   - Update `CHANGELOG.md`

4. **Validate your changes:**
   ```bash
   npm install && npm test
   npx aecdo validate examples/sample-drawing-set.jsonld
   ```

5. **Submit a pull request** referencing the issue.

### Creating a New Schema Version

```bash
# Copy current version as starting point
cp -r ontology/v0.2.0 ontology/v0.3.0

# Update $id in the schema
# Update @context URLs
# Make your changes
# Update CHANGELOG.md
```

Update the `$id` field in `aecdo.schema.json` and all context URLs to reflect the new version.

### Files That Must Be Updated for a Schema Change

Whenever you add, remove, rename, or restructure a type or field, walk this checklist. Missing any of these will leave the schema, CLI, and docs out of sync.

**Ontology (required):**
- `ontology/v<version>/aecdo.schema.json` — the JSON Schema itself (type definition + any parent `properties` that embed it)
- `ontology/v<version>/context.jsonld` — add a term for every new type and every new property
- `ontology/v<version>/diagram.mmd` — add the class, its fields, and any containment/reference edges

**CLI (required if the field is user-visible):**
- `cli/src/types.ts` — TypeScript interfaces mirroring the schema
- `cli/src/lib/schema.ts` — bump `DEFAULT_SCHEMA_PATH` when creating a new version directory
- `cli/src/commands/summary.ts` — count and report the new type/field if it's summary-worthy
- `cli/src/commands/page.ts` — render the new type/field in the per-sheet view (add a `printX` helper if it's a new type)
- `cli/src/commands/explore.ts` — only if interactive flow changes (rarely needed for additive changes)

**Examples & fixtures:**
- `examples/sample-drawing-set.jsonld` — bump the `@context` URL and include at least one instance of any new type/field
- Any other files under `examples/` — bump `@context` URLs

**Docs & metadata:**
- `README.md` — schema version references, Mermaid diagram, Types table, example JSON, Project Structure tree
- `CHANGELOG.md` — a `Schema` entry under the new version describing what changed and why
- `CLAUDE.md` — update the "Key paths" list and any data-model notes if shapes change
- `.claude/skills/aecdo/SKILL.md` — update if new commands, fields, or types affect how agents should interact with the data

**Verify before opening a PR:**
```bash
npm run build
npx aecdo validate examples/sample-drawing-set.jsonld
npx aecdo summary examples/sample-drawing-set.jsonld
npm test
```

### Schema Design Principles

- **AEC domain accuracy**: Property names and structures should reflect how AEC professionals think about drawings.
- **Tool-agnostic**: The schema should work for any tool that extracts structured data from drawings, not just DrawingBot.
- **Linked data friendly**: Maintain valid JSON-LD structure. Use URIs for identifiers where possible.
- **Spatially aware**: Include `bbox` coordinates so extracted data can be mapped back to locations on the source drawing.
- **Minimal required fields**: Only require what is truly essential. Be generous with optional properties.

## Contributing to the CLI

### Setup

```bash
npm install
npm run build
```

### Running

```bash
npx aecdo --help
npx aecdo validate examples/sample-drawing-set.jsonld
```

### Tests

```bash
npm test
```

### Adding a New Command

1. Create `cli/src/commands/yourcommand.ts` exporting an async function
2. Register it in `cli/bin/aecdo.ts` (import + switch case)
3. Export from `cli/src/index.ts`
4. Add tests
5. Document in `SKILL.md` and `README.md`

### Code Style

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- Node.js >= 18 (use built-in test runner, `parseArgs`, native `fetch`, etc.)
- No comments unless explaining a non-obvious "why"
- Minimal dependencies

## Release Process

1. Update `CHANGELOG.md` with the new version
2. Update version in `package.json`
3. Create a git tag: `git tag v0.1.0`
4. Push the tag: `git push origin v0.1.0`
5. Create a GitHub release from the tag

For schema-only releases, the tag should reflect the schema version. For CLI releases, use the CLI version. If both change together, use the schema version.

## Reporting Issues

- **Schema issues**: Use the "Schema Change" or "Bug Report" issue template
- **CLI bugs**: Use the "Bug Report" template
- **Feature requests**: Use the "Feature Request" template

## Code of Conduct

Be respectful and constructive. We're building infrastructure for an industry that builds the physical world — let's bring the same care to our collaboration.
