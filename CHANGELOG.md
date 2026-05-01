# Changelog

All notable changes to the AECDO schema and CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- DrawingBot API integration: `configure`, `process`, `upload`, `status`, `download` commands
- OAuth 2.0 authentication with token caching (`~/.aecdo/token.json`)
- Secure credential storage at `~/.aecdo/config.json` with 0o600 permissions and permission warnings
- Region selection (future-proofed for European endpoints)
- Live progress display during PDF processing (TTY-aware, writes to stderr)
- `--then` flag to pipe API results directly into validate/summary/explore
- `--poll` and `--wait` flags for status polling control
- API types: `ApiConfig`, `JobStatus`, `JobResult`, `UploadResponse`, `ProcessOptions`

## [0.1.0] - 2026-04-30

### Added
- Initial AECDO JSON Schema (`ontology/v0.1.0/aecdo.schema.json`)
- JSON-LD context file (`ontology/v0.1.0/context.jsonld`)
- TypeScript CLI with commands: `validate`, `summary`, `explore`
- Sample drawing set example (`examples/sample-drawing-set.jsonld`)
- Schema types: DrawingSet, Sheet, Drawing, Layer, Item, Table, Note
- Item types: `tag`, `thing`, `area`
- Drawing types: `plan`, `section`, `elevation`, `detail`
- UUID URN identifiers for all entities
- Bounding box support as `[xmin, ymin, xmax, ymax]` arrays
- Cross-reference support via `references` arrays
- Claude Code skill in skills directory format for AI agent integration
- CONTRIBUTING.md with schema versioning workflow
