# CLAUDE.md — Project Context for Claude Code

## What is this repo?

AECDO (AEC Drawing Ontology) — an open schema + CLI for structured data extracted from Architecture, Engineering, and Construction drawings. AEC DrawingBot produces JSON-LD files conforming to this schema.

## Key paths

- `ontology/v0.1.0/aecdo.schema.json` — the JSON Schema (source of truth)
- `ontology/v0.1.0/context.jsonld` — JSON-LD context
- `ontology/v0.1.0/diagram.mmd` — Mermaid class diagram
- `cli/` — TypeScript CLI source (compiled to `dist/` via `npm run build`)
- `cli/src/types.ts` — shared data model + API types (DrawingSet, ApiConfig, JobStatus, etc.)
- `cli/src/lib/config.ts` — API credential storage and region-to-endpoint mapping
- `cli/src/lib/auth.ts` — OAuth token management with caching
- `cli/src/lib/api.ts` — HTTP client for the DrawingBot API
- `package.json` — at repo root, npm-publishable as "aecdo"
- `examples/sample-drawing-set.jsonld` — validates against the schema
- `.claude/skills/aecdo/SKILL.md` — installable Claude Code skill
- `scripts/postinstall.mjs` — copies skill to `~/.claude/skills/` on `npm install -g`

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
npx aecdo summary examples/sample-drawing-set.jsonld
npx aecdo sheets examples/sample-drawing-set.jsonld --format json
npx aecdo page examples/sample-drawing-set.jsonld A101
npx aecdo explore examples/sample-drawing-set.jsonld   # interactive (humans)
```

Agent-friendly, non-interactive commands: `validate`, `summary`, `sheets`, `page` — all support `--format json`. `configure` is human-interactive by design. `explore` detects non-TTY stdin or `--format json` and falls back to listing sheets so it won't hang in scripts.

### API commands (requires DrawingBot API credentials)

```bash
npx aecdo configure                          # set up credentials and region
npx aecdo process plans.pdf                  # end-to-end: upload → poll → download
npx aecdo process plans.pdf --then summary   # process and pipe into summary
npx aecdo upload plans.pdf                   # upload only, returns job ID
npx aecdo status <jobId> --wait              # poll until done
npx aecdo download <jobId> -o result.jsonld  # download completed result
```

After `npm install -g aecdo` (once published), `aecdo` works directly without `npx`.

API credentials are stored at `~/.aecdo/config.json` (0o600 permissions). Tokens are cached at `~/.aecdo/token.json` (4-hour validity).

## Code conventions

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- No comments unless explaining a non-obvious "why"
- Minimal dependencies (ajv for validation, native fetch for API calls)
- Use Node.js built-in test runner (`node --test`)

## Schema versioning

- Versions live in `ontology/v<semver>/`
- Additive changes go in the current version
- Breaking changes require a new version directory
- Update `CHANGELOG.md` for every schema change
