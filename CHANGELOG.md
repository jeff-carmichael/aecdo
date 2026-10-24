# Changelog

All notable changes to the AECDO schema and CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### CLI
- Background update notifications: once every 24 hours a detached process checks GitHub Releases for a newer version and caches the result in `~/.aecdo/update-check.json`. When the cache shows a newer release, a notice prints to stderr after the command finishes, so commands are never delayed and piped stdout stays clean. Skipped when stderr is not a TTY or `CI` is set; opt out with `NO_UPDATE_CHECK=1`, `AECDO_NO_UPDATE_CHECK=1`, or `--no-update-check`.

## [0.3.1] - 2026-10-24

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Standalone binaries via `bun build --compile`: `build:bin` (current platform) and `build:bin:<target>` / `build:bin:all` for macOS x64/arm64, Linux x64/arm64, and Windows x64. The Bun entry (`cli/bin/standalone.ts`) embeds the default schema and version so the binary needs no files beside it.
- Release workflow (`.github/workflows/release.yml`) builds, packages, checksums, and publishes binaries on `v*` tags; `install.sh` installs the right binary via `curl -sSL … | sh`.
- Unhandled errors from the CLI entry point now print a message and exit with code 1 instead of an unhandled promise rejection.
- `explore` is now a step-by-step drill-down: opening a sheet lists its drawings, tables, notes, and images as a numbered menu; drawings open into layers, layers into items, and leaf entries print their details. Navigate with `back`/`..`, `top`, `all`, `ls`, and `quit`.
- Added `eslint.config.js` (ESLint 9 flat config with `typescript-eslint` type-checked recommended rules); `npm run lint` now covers `cli/` and runs in CI. Parsed JSON and API responses are now explicitly typed.
- Item labels and `data` values that are objects or arrays now print as JSON in `page`/`explore` instead of `[object Object]`.

### Security
- Updated `fast-uri` (via `ajv`) to 3.1.9 and `brace-expansion` (dev-only, via `eslint`) to 1.1.21 to resolve high-severity advisories

### Fixed
- `package.json` `exports` (`aecdo/schema`, `aecdo/context`) now point at `ontology/v0.3.0` instead of `v0.1.0`; package version bumped to `0.3.0` to match the latest release
- `scripts/generate-diagram.mjs` and the pre-commit hook target `ontology/v0.3.0`, and the generator now includes the `Image` class
- README schema version, Mermaid diagram, example JSON (`label` on Drawing), and explore walkthrough brought up to date

## [0.3.0] - 2026-06-02

### Schema
- New ontology version `v0.3.0` (`ontology/v0.3.0/`)
- BREAKING: renamed `title` → `label` on `Drawing` and `Table` to describe what the region is, distinct from the sheet's `title`. `Drawing.label` is required (replacing the previously required `title`); `Table.label` remains optional.
- The sheet-level `title` field is unchanged.
- Updated `context.jsonld` (added `label` term, kept `title` for the sheet) and `diagram.mmd`
- CLI now validates against v0.3.0 by default. Drawing/Table display reads `label` with a `title` fallback for pre-v0.3.0 documents.

## [0.2.0] - 2026-05-12

### Schema
- New ontology version `v0.2.0` (`ontology/v0.2.0/`)
- Added `Image` type at the sheet level (sibling of `Note` and `Table`) to record raster images embedded on a sheet. Fields: `@id`, `@type`, `role` (`logo` | `photo` | `detail-raster` | `diagram` | `other`), `caption`, `bbox`. Image bytes are not stored in the document.
- Added `images` array to `Sheet`
- Updated `context.jsonld` and `diagram.mmd` for the new type
- CLI now validates against v0.2.0 by default

### CLI
- DrawingBot API integration: `configure`, `process`, `upload`, `status`, `download` commands
- OAuth 2.0 authentication with token caching (`~/.aecdo/token.json`)
- Secure credential storage at `~/.aecdo/config.json` with 0o600 permissions and permission warnings
- Region selection (future-proofed for European endpoints)
- Live progress display during PDF processing (TTY-aware, writes to stderr)
- `--then` flag to pipe API results directly into validate/summary/explore
- `--poll` and `--wait` flags for status polling control
- API types: `ApiConfig`, `JobStatus`, `JobResult`, `UploadResponse`, `ProcessOptions`
- New `sheets <file>` command: list sheets non-interactively, with `--format json` for agent-friendly output
- New `page <file> <sheetNumber|pageIndex>` command: print one sheet by number or index. Supports `--format json`. Replaces the interactive REPL's sheet lookup for scripts and agents.
- `explore` now falls back to listing sheets (text or JSON) when stdin is not a TTY or `--format json` is passed, so agents and pipelines no longer hang on the interactive prompt

## [0.1.0] - 2026-04-30

### Schema
- Initial AECDO JSON Schema (`ontology/v0.1.0/aecdo.schema.json`)
- JSON-LD context file (`ontology/v0.1.0/context.jsonld`)
- Schema types: DrawingSet, Sheet, Drawing, Layer, Item, Table, Note
- Item types: `tag`, `thing`, `area`
- Drawing types: `plan`, `section`, `elevation`, `detail`
- UUID URN identifiers for all entities
- Bounding box support as `[xmin, ymin, xmax, ymax]` arrays
- Cross-reference support via `references` arrays

### CLI
- TypeScript CLI with commands: `validate`, `summary`, `explore`
- Sample drawing set example (`examples/sample-drawing-set.jsonld`)
- Claude Code skill in skills directory format for AI agent integration

### Other
- CONTRIBUTING.md with schema versioning workflow
