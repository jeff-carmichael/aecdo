# Changelog

All notable changes to the AECDO schema and CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### CLI
- `explore` tags each reference with a short label (`→ [r1] Door Schedule (A601, page 9)`). Type `r1`, `r2`, … to jump to that drawing, schedule, or item, or just `r` when there is only one; `back` returns to where you were. The assistant can follow references the same way.
- References to items, layers, tables, notes, and images now print as names (in `explore` and `page`) instead of raw `urn:uuid:` ids.

## [0.4.1] - 2026-10-26

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- `aecdo explore` with no file in an interactive terminal opens the same arrow-key picker as `process`, listing the `.jsonld` files in the current folder. In scripts, or with `--format json`, a missing file is still an error.
- Tables in `explore` and `page` now print with aligned, padded columns and a header divider. Long cells wrap to fit the terminal width instead of running past the box.
- The `explore` prompt (`sheet>`, `E601>`) is shown in green so your navigation lines stand out from the output. Color is off for `NO_COLOR`, `TERM=dumb`, and non-terminal output.

## [0.4.0] - 2026-10-26

No schema validation changes; the CLI still validates against `ontology/v0.3.0`. `aecdo process` now saves to a file by default instead of printing to stdout (use `--stdout` for the old behavior).

### Docs
- New getting-started guide at https://jeff-carmichael.github.io/aecdo/, built by GitHub Pages from `docs/`: install and update on each platform (including the Windows SmartScreen warning), processing PDFs, tab completion, exploring and `view`, the `@claude`/`@chatgpt` assistant and `AGENTS.md`, a walkthrough of the Maple Grove demo set, the data model and bbox units, using `aecdo` with Claude Code, and troubleshooting. The README is now a short overview that links to it.
- README and guide now present `aecdo` as an open-source CLI for any AECDO JSON-LD file, with the DrawingBot API as an optional wrapper, and say prominently that the DrawingBot API isn't available yet (a site-wide notice, switched off with `api_notice: false` in `docs/_config.yml`). Tab completion moved to the Install page, and the guide's data model page gains a "Producing your own files" section.

### Schema
- `BBox` description in `ontology/v0.3.0` now states the coordinate system DrawingBot already uses: PDF points (1/72 in), unscaled, from the top-left corner of the page as displayed (crop box, after /Rotate), with y increasing downward, as `[xmin, ymin, xmax, ymax]` corners. Documentation only; no validation change.

### Examples
- New `examples/maple-grove-library.jsonld`: a detailed demo set for a fictional two-story, 36,000 SF branch library (19 sheets across general, civil, architectural, structural, mechanical, plumbing, and electrical; about 1,000 items, 28 tables). Door tags, room tags, and callouts reference the matching schedules and drawings, so `explore` and the `@claude`/`@chatgpt` assistant can follow them. It includes two deliberate coordination issues to find in a demo: door 209B is on the second floor plan but missing from the door schedule, and door 105A calls for hardware set 9, which doesn't exist.
- New test checks that every file in `examples/` validates against the schema and that its `@id`s are unique and its `references` resolve.

### CLI
- The `explore` assistant can mark up the drawing set's PDF: ask it to cloud, call out, or note something and it proposes real PDF annotations (a revision cloud, a callout with a leader arrow, or a sticky note) placed from the item's bbox, with author "aecdo assistant" and the item's AECDO `@id` stored with each one, so Bluebeam Revu and Acrobat list them as normal markups. New assistant tools `add_markup`, `list_markups`, and `remove_markup`. Nothing is written until you review and save with the new `markups` command in `explore`: `markups` lists pending and saved markups, `view` draws pending ones on the page, `markups save` writes them to `<name>-markups.pdf` next to the PDF (`--in-place` for the original), `markups undo` takes back the last save, `markups remove` deletes every aecdo markup (and replies to them) while keeping other people's, and `markups drop <n>` / `markups clear` discard pending ones. Quitting with pending markups asks whether to save them. Saves are appended as a PDF incremental update, so the original bytes, and any digital signature, stay intact. Works on rotated sheets. Uses `pdf-lib`, which `view` already depends on; encrypted PDFs aren't supported.
- OpenRouter in the `explore` assistant: `@openrouter` (or `@or`) uses the OpenRouter model chosen in `aecdo configure ai` (default `~anthropic/claude-sonnet-latest`), and `@gemini`, `@grok`, `@deepseek`, and `@kimi` are shortcuts to OpenRouter's latest model in each family. `aecdo configure ai` adds *Sign in with OpenRouter* and *Enter an OpenRouter API key* (`OPENROUTER_API_KEY` also works), and its model picker lists five recommended OpenRouter models first and hides batch-only variants. `@claude` and `@chatgpt` stay direct; when they aren't set up but OpenRouter is, the message suggests `@or`. Uses the OpenRouter provider already in `pi-ai`, so no new dependency.
- Tab completes an `@` assistant name at the start of a line in `explore`.
- New Windows installer: `irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex` in PowerShell downloads the latest release, checks its SHA-256 checksum, installs `aecdo.exe` to `%LOCALAPPDATA%\Programs\aecdo` (no admin rights), and adds that folder to the user PATH. Set `AECDO_VERSION` or `AECDO_INSTALL_DIR` to override. Installing this way avoids the "Windows protected your PC" SmartScreen prompt, which the unsigned exe triggers when the zip is downloaded in a browser. The README explains that prompt and how to get past it for the zip.
- README and the Claude Code skill now explain bbox units, and the skill gains a short data-model section for agents.
- The `@claude`/`@chatgpt` assistant now reads an `AGENTS.md` (any capitalization) from the folder you run `explore` in and follows it as your standing instructions for that project, e.g. which checks to run or which spreadsheet to log issues in. It prints "Using AGENTS.md from this folder" when it does. Read once per assistant session, up to 20,000 characters; it can't widen what the assistant's tools may do.
- The `@claude`/`@chatgpt` assistant is told the bbox units (PDF points from the top-left), so it can reason about where things sit on a sheet and how big they are.
- New `view` command in `explore` (also `/view`): opens the current sheet's page from the source PDF with the current selection outlined in red. On a drawing it outlines the drawing, on a layer the layer (or its items when the layer has no bbox), and after you open an item, table, note, or image, that entry. bbox values are read as PDF points from the top-left of the page as displayed; a box that runs past the page prints a warning. The PDF is found next to the `.jsonld` (`plans.pdf` for `plans.jsonld`) or by the set's `filename`; otherwise pass `--pdf <file>` or type `view <path>`. `process --then explore` uses the uploaded PDF. The page is saved as a PNG when `pdftoppm` (Poppler) or `mutool` (MuPDF) is installed, or as a one-page PDF otherwise, in the system temp folder (`aecdo-view/`), and opened in the default viewer. Uses the MIT-licensed `pdf-lib` (new dependency, pure JavaScript, loaded only by `view`; about 450 KB in the standalone binary).
- The `@claude`/`@chatgpt` assistant has a new `show_page` tool that does the same as `view`, so "show me door 105A" navigates to the door and opens the page with it outlined. The assistant only opens the image for you; it does not see it.
- `explore` now colors `@claude`, `@chatgpt`, or `@gpt` as you type it at the start of a line, so you can see the mention will reach an assistant. Unknown names stay plain. Respects `NO_COLOR` and non-color terminals.
- AI assistant in `aecdo explore`: start a line with `@claude` or `@chatgpt` (also `@gpt`) to ask about the current view. The assistant gets the sheet, drawing, or layer on screen as context, can navigate with the same commands a user types, read other sheets, append Markdown notes to `notes.md`, and read, fill in, or create spreadsheets (`.xlsx`, `.csv`, `.tsv`) in the current folder. It asks before its first edit to an existing spreadsheet, keeps `.xlsx` formatting, formulas, and other tabs, and never overwrites formula cells. Ctrl+C stops an answer. Built on the MIT-licensed `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` (new dependencies, loaded only when the assistant is used); needs Node.js 22.19+ for npm installs.
- New `aecdo configure ai`: Sign in with ChatGPT (uses the ChatGPT plan), or save an OpenAI or Anthropic API key, choose each assistant's model, or sign out. Settings go to `~/.aecdo/llm.json` (0600). `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` also work. Claude Pro/Max sign-in is not offered because Anthropic doesn't allow it in third-party tools.
- `aecdo process` now saves the result by default as `<pdf name>.jsonld` next to the PDF (e.g. `plans.pdf` → `plans.jsonld`) and prints the path to stderr. `-o` still picks a different path, and `--then` runs after the file is saved. Pass the new `--stdout` flag to print the JSON-LD to stdout without saving, which was the old default.
- `aecdo process` and `aecdo upload` with no file now open an arrow-key picker of the PDFs in the current folder (type to filter, Enter to select, Esc to cancel). It only appears when stdin and stderr are terminals, so scripts still get the "No input file specified" error.
- New `aecdo completion [bash|zsh|fish]` command prints a tab-completion script (shell detected from `$SHELL` if omitted). `process`/`upload` complete only PDFs, and `validate`/`summary`/`sheets`/`page`/`explore` only `.jsonld`/`.json` files; commands, flags, `--format`, and `--then` values complete too.

## [0.3.2] - 2026-10-24

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Background update notifications: once every 24 hours a detached process checks GitHub Releases for a newer version and caches the result in `~/.aecdo/update-check.json`. When the cache shows a newer release, a notice prints to stderr after the command finishes, so commands are never delayed and piped stdout stays clean. Skipped when stderr is not a TTY or `CI` is set; opt out with `NO_UPDATE_CHECK=1`, `AECDO_NO_UPDATE_CHECK=1`, or `--no-update-check`.
- New `aecdo update` command: downloads the latest release for the current platform, verifies it against the release's `checksums.txt`, and replaces the running standalone binary (on Windows the old `.exe` is moved aside and removed on the next run). npm installs are told to run `npm install -g aecdo@latest`. The update notice now suggests `aecdo update` for standalone installs.

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
