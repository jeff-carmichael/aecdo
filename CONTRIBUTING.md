# Contributing to AECDO

Thank you for your interest in contributing to the AEC Drawing Ontology. This guide covers how to contribute to both the schema/ontology and the CLI tool.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a branch for your changes

```bash
git clone https://github.com/<your-username>/aecdo.git
cd aecdo
npm install
npm run setup          # enable the pre-commit hook (regenerates the diagram, checks CHANGELOG)
git checkout -b your-feature-branch
```

## Before You Open a PR

CI runs these checks on every pull request. Run them locally first:

| CI check | What it enforces | Run locally |
|----------|------------------|-------------|
| Build and test | TypeScript compiles and tests pass | `npm test` (builds first) |
| ESLint | No lint errors in `cli/` | `npm run lint` |
| diagram.mmd is up to date | the current schema's `diagram.mmd` matches the schema | `npm run diagram:check` (fix with `npm run diagram`) |
| CHANGELOG updated | Any change under `ontology/` or `cli/src/` also updates `CHANGELOG.md` | add an entry under `[Unreleased]` |

Fill in the PR template checklist when you open the PR.

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
cp -r ontology/v0.3.0 ontology/v0.4.0

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
- `cli/src/commands/explore.ts` — add new sheet-level types to `sheetEntries`/`describeEntry` so they appear in the drill-down menu; new Drawing/Layer children need a new navigation level

**Examples & fixtures:**
- `examples/sample-drawing-set.jsonld` — bump the `@context` URL and include at least one instance of any new type/field
- Any other files under `examples/` — bump `@context` URLs

**Docs & metadata:**
- `README.md` — schema version references, Mermaid diagram, Types table
- `package.json` — `exports` paths for `./schema` and `./context`
- `scripts/generate-diagram.mjs` and `.githooks/pre-commit` — schema/diagram paths and the `typeOrder` list of classes
- `CHANGELOG.md` — a `Schema` entry under the new version describing what changed and why
- `AGENTS.md` — update the "Key paths" list and any data-model notes if shapes change
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

### Tests and lint

```bash
npm test
npm run lint
```

### Standalone binaries

Requires [Bun](https://bun.sh). Binaries embed the schema and version, so they run without `node_modules` or `ontology/`.

```bash
bun run build:bin        # current platform → dist-bin/aecdo
bun run build:bin:all    # darwin-x64, darwin-arm64, linux-x64, linux-arm64, windows-x64 → dist-bin/<target>/
```

If a command reads a file at runtime, embed it in `cli/bin/embed-assets.ts` too, or the binary will break.

### Adding a New Command

1. Create `cli/src/commands/yourcommand.ts` exporting an async function
2. Register it in `cli/bin/aecdo.ts` (import + switch case)
3. Add it to the `HELP` text in `cli/bin/aecdo.ts`
4. Export from `cli/src/index.ts`
5. Add tests next to the source (`cli/src/commands/yourcommand.test.ts`)
6. Support `--format json` if the command produces output, so agents can use it
7. Document it in `.claude/skills/aecdo/SKILL.md` and the README's Usage section
8. Add a `CHANGELOG.md` entry under `[Unreleased]`

### Code Style

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- Node.js >= 18 (use built-in test runner, `parseArgs`, native `fetch`, etc.)
- No comments unless explaining a non-obvious "why"
- Minimal dependencies

## Release Process

1. In a PR, bump the version in `package.json` (`npm version <x.y.z> --no-git-tag-version`) and move the `[Unreleased]` entries in `CHANGELOG.md` under the new version
2. After it merges, tag `main` and push the tag: `git tag v<x.y.z> && git push origin v<x.y.z>`

The tag triggers `.github/workflows/release.yml`, which checks that the tag matches `package.json`, builds binaries for all platforms, and publishes the GitHub Release with `checksums.txt`. Don't create the release by hand — the workflow will fail if it already exists.

### Package vs. schema versions

The two are versioned independently:

- **Package version** (`package.json`, release tags like `v0.3.1`) tracks the CLI and is what users install. Bump it for any release.
- **Schema version** (`ontology/v<x.y.z>/`) tracks the ontology and changes only when the schema does (see [Versioning Policy](#versioning-policy)). A CLI release can ship without a schema change, e.g. package `0.3.1` validates against schema `v0.3.0`.

When a release includes a new schema version, bump the package version at least as much (a new schema minor version means at least a new package minor version), and say which schema version the CLI validates against in the CHANGELOG.

## Reporting Issues

- **Schema issues**: Use the "Schema Change" or "Bug Report" issue template
- **CLI bugs**: Use the "Bug Report" template
- **Feature requests**: Use the "Feature Request" template

## Code of Conduct

Be respectful and constructive. We're building infrastructure for an industry that builds the physical world — let's bring the same care to our collaboration.
