# AGENTS.md — Project Context for AI Coding Agents

Read by Codex, Cursor, and other agents directly, and by Claude Code via `CLAUDE.md`. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), which this file summarizes.

## What is this repo?

AECDO (AEC Drawing Ontology) — an open schema + CLI for structured data extracted from Architecture, Engineering, and Construction drawings. AEC DrawingBot produces JSON-LD files conforming to this schema.

## Key paths

- `ontology/v0.3.0/aecdo.schema.json` — the JSON Schema (source of truth)
- `ontology/v0.3.0/context.jsonld` — JSON-LD context
- `ontology/v0.3.0/diagram.mmd` — Mermaid class diagram
- `cli/` — TypeScript CLI source (compiled to `dist/` via `npm run build`)
- `cli/src/types.ts` — shared data model + API types (DrawingSet, ApiConfig, JobStatus, etc.)
- `cli/src/lib/config.ts` — API credential storage and region-to-endpoint mapping
- `cli/src/lib/auth.ts` — OAuth token management with caching
- `cli/src/lib/api.ts` — HTTP client for the DrawingBot API
- `cli/src/lib/picker.ts` — arrow-key list picker (raw-mode stdin, draws on stderr) used when `process`/`upload` get no file in a TTY
- `cli/src/commands/completion.ts` — bash/zsh/fish completion scripts for `aecdo completion`
- `cli/src/lib/llm.ts` — AI assistant setup on pi-ai: Claude/ChatGPT mapping, default models, credential store at `~/.aecdo/llm.json`; pi is imported lazily (needs Node 22.19+)
- `cli/src/lib/assistant.ts` — the `@claude`/`@chatgpt` agent in `explore` (pi-agent-core): system prompt, current-view context, and tools (navigate, read sheets, notes, spreadsheets) limited to the current folder
- `cli/src/commands/configure-ai.ts` — `aecdo configure ai` (Sign in with ChatGPT, API keys, model choice)
- `cli/src/lib/page-view.ts` — `view` in `explore`: finds the source PDF, copies the page with pdf-lib, draws the red bbox (top-left PDF points, rotation-aware), rasterizes with `pdftoppm`/`mutool` when installed
- `cli/src/lib/spreadsheet.ts`, `cli/src/lib/zip.ts` — dependency-free `.xlsx`/`.csv`/`.tsv` read and write; xlsx edits patch the sheet XML so formatting survives
- `cli/src/lib/update-check.ts` — daily background check for newer GitHub releases (detached worker + cache at `~/.aecdo/update-check.json`, notice on stderr)
- `package.json` — at repo root, npm-publishable as "aecdo"
- `examples/sample-drawing-set.jsonld` — validates against the schema (small; used by unit tests)
- `examples/maple-grove-library.jsonld` — detailed 19-sheet demo set (fictional library) for demos of `explore` and the assistant; `cli/src/lib/schema.test.ts` validates every file in `examples/`
- `.claude/skills/aecdo/SKILL.md` — installable Claude Code skill
- `scripts/postinstall.mjs` — copies the skill to `~/.claude/skills/` on a global npm install
- `cli/bin/standalone.ts`, `cli/bin/embed-assets.ts` — Bun entry for standalone binaries (embeds schema + version)
- `install.sh` — end-user installer for the standalone binary (`curl … | sh`)
- `.github/workflows/consistency.yml` — PR checks (build + test, lint, diagram, changelog)
- `.github/workflows/release.yml` — builds and publishes binaries when a `v*` tag is pushed
- `eslint.config.js` — ESLint flat config

## Data model

Hierarchy: **DrawingSet → Sheet → Drawing → Layer → Item**, plus Table, Note, and Image at the sheet level.

- All `@id` fields are UUID URNs (`urn:uuid:...`)
- `bbox` is always `[xmin, ymin, xmax, ymax]` (4-element number array) in PDF points (1/72 in), measured from the top-left of the page as displayed (after /Rotate), y down; not normalized
- Item types: `tag` (annotations/symbols), `thing` (physical elements), `area` (regions)
- Drawing types: `plan`, `section`, `elevation`, `detail`
- Item `data` is a freeform object — contents vary by what was extracted
- Table `content` is pipe-delimited text with newline-separated rows

## CLI usage

```bash
npm install
npm run build
npx aecdo validate examples/sample-drawing-set.jsonld
npx aecdo summary examples/sample-drawing-set.jsonld
npx aecdo sheets examples/sample-drawing-set.jsonld --format json
npx aecdo page examples/sample-drawing-set.jsonld A101
npx aecdo explore examples/sample-drawing-set.jsonld   # interactive drill-down (humans)
```

Agent-friendly, non-interactive commands: `validate`, `summary`, `sheets`, `page` — all support `--format json`. `configure` is human-interactive by design. `explore` detects non-TTY stdin or `--format json` and falls back to listing sheets so it won't hang in scripts.

`explore` is a drill-down navigator (`Explorer` class in `cli/src/commands/explore.ts`): sheet list → sheet contents (numbered drawings, tables, notes, images) → drawing layers → layer items → item detail. `back`/`..` goes up, `top` resets, `all` prints the full sheet via `printPage`. The `Explorer` takes an injectable logger so navigation is unit-tested without a TTY. Lines starting with `@claude`/`@chatgpt` go to the AI assistant (`cli/src/lib/assistant.ts`), which reads `Explorer.context()` and drives `Explorer.navigate()`; its tests use pi-ai's scripted `fauxProvider`, so no network or keys are needed.

### API commands (requires DrawingBot API credentials)

```bash
npx aecdo configure                          # set up credentials and region
npx aecdo process plans.pdf                  # end-to-end: upload → poll → download
npx aecdo process plans.pdf --then summary   # process and pipe into summary
npx aecdo upload plans.pdf                   # upload only, returns job ID
npx aecdo status <jobId> --wait              # poll until done
npx aecdo download <jobId> -o result.jsonld  # download completed result
```

`aecdo update` (`cli/src/commands/update.ts`) self-updates the standalone binary from GitHub Releases (checksum-verified, uses the system `tar` to unpack); for npm installs it only prints the npm command.

### Standalone binaries (Bun)

```bash
bun run build:bin       # dist-bin/aecdo for the current platform
bun run build:bin:all   # cross-compile all release targets into dist-bin/<target>/
```

`cli/bin/standalone.ts` is the Bun entry: it imports `embed-assets.ts` (bundles `package.json` version and the default schema into `cli/src/lib/embedded.ts`, and registers pi's OAuth flows, which a compiled binary can't load dynamically) before `aecdo.ts`. Both files are excluded from `tsc`. Any new runtime file read must also be embedded there or it will break the binary. Users install with `install.sh`.

API credentials are stored at `~/.aecdo/config.json` (0o600 permissions). Tokens are cached at `~/.aecdo/token.json` (4-hour validity).

## Code conventions

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- No comments unless explaining a non-obvious "why"
- Minimal dependencies (ajv for validation, native fetch for API calls, pi-ai/pi-agent-core for the AI assistant)
- Lint with `npm run lint` (ESLint flat config in `eslint.config.js`, `typescript-eslint` type-checked rules); CI enforces it
- Use Node.js built-in test runner (`node --test`); tests live next to source as `cli/src/**/*.test.ts` and run via `npm test`

## Workflow for changes

Before finishing any change, run what CI runs:

```bash
npm test               # builds, then runs tests
npm run lint
npm run diagram:check  # only if ontology/ changed
```

- Any change under `ontology/` or `cli/src/` needs a `CHANGELOG.md` entry under `[Unreleased]` — CI fails without one.
- New or changed command: update the `HELP` text in `cli/bin/aecdo.ts`, the README Usage section, and `.claude/skills/aecdo/SKILL.md`.
- Schema change: follow the "Files That Must Be Updated" checklist in CONTRIBUTING.md.
- `dist/` and `dist-bin/` are build output and gitignored — never commit them.
- Don't push tags or create GitHub releases unless a maintainer asks; see Releases below.

## Releases

The package version (`package.json`, tags like `v0.3.1`) tracks the CLI and is independent of the schema version (`ontology/v<x.y.z>/`). To release: a PR bumps `package.json` and moves `[Unreleased]` in `CHANGELOG.md` under the new version; after merge, a maintainer pushes the matching `v<x.y.z>` tag, and `release.yml` publishes the GitHub Release.

## Schema versioning

- Versions live in `ontology/v<semver>/`
- Additive changes go in the current version
- Breaking changes require a new version directory
- Update `CHANGELOG.md` for every schema change
