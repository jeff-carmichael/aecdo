# AGENTS.md — Project Context for AI Coding Agents

Read by Codex, Cursor, and other agents directly, and by Claude Code via `CLAUDE.md`. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), which this file summarizes.

## What is this repo?

AECDO (AEC Drawing Ontology) — an open schema + CLI for structured data extracted from Architecture, Engineering, and Construction drawings. AEC DrawingBot produces JSON-LD files conforming to this schema.

You should work to keep the codebase clean at all times. Merge repeated code and make fixes as you see them

## Key paths

- `ontology/v0.3.0/aecdo.schema.json` — the JSON Schema (source of truth)
- `ontology/v0.3.0/context.jsonld` — JSON-LD context
- `ontology/v0.3.0/diagram.mmd` — Mermaid class diagram
- `cli/` — TypeScript CLI source (compiled to `dist/` via `npm run build`)
- `cli/src/types.ts` — shared data model + API types (DrawingSet, ApiConfig, JobStatus, etc.)
- `cli/src/lib/config.ts` — API credential storage and region-to-endpoint mapping
- `cli/src/lib/auth.ts` — OAuth token management with caching
- `cli/src/lib/api.ts` — HTTP client for the DrawingBot API
- `cli/src/commands/examples.ts` — `aecdo examples [folder]`: downloads the files listed in `EXAMPLE_FILES` from the matching release tag, falling back to `main`; `install.sh`/`install.ps1` offer it at the end of an interactive install
- `cli/src/commands/completion.ts` — bash/zsh/fish completion scripts for `aecdo completion`
- `cli/src/lib/llm.ts` — AI assistant setup on pi-ai: each `@mention` is a model family (claude, chatgpt, gemini, grok, deepseek, kimi) reached by a route (anthropic, openai, amazon-bedrock, custom endpoint, openrouter) picked from what's set up; default models per route, credential store at `~/.aecdo/llm.json`; pi is imported lazily (needs Node 22.19+)
- `cli/src/lib/assistant.ts` — the `@claude`/`@chatgpt` agent in the app's chats (pi-agent-core): system prompt, current-view context, and tools (navigate, read sheets, `show_page`, notes, spreadsheets) limited to the current folder; appends an `AGENTS.md` from the cwd (if any) to the system prompt
- `cli/src/lib/markup.ts` — PDF markups (cloud = Polygon with cloud border, callout = FreeText, note = Text) with our own appearance streams, saved as an incremental update so the original bytes stay intact; tagged `/NM aecdo-…` for list/remove; undo truncates only if the file is unchanged
- `cli/src/commands/markups.ts` — `MarkupSession` behind the app's Markups panel and the assistant's `add_markup`/`list_markups`/`remove_markup` tools; markups stay pending until the user saves, which writes `<name>-markups.pdf` (or the original in place)
- `cli/src/lib/pdf-page.ts` — where to look for a set's source PDF, and bbox geometry (top-left PDF points to PDF user space, rotation-aware) used by markups
- `cli/src/lib/spreadsheet.ts`, `cli/src/lib/zip.ts` — dependency-free `.xlsx`/`.csv`/`.tsv` read and write; xlsx edits patch the sheet XML so formatting survives
- `cli/src/commands/shortcut.ts` — `aecdo shortcut`: Start menu `.lnk` (via PowerShell), `~/Applications/aecdo.app` (launcher script + `.icns`), or a `.desktop` entry, each running `aecdo __app`; the installers run it. `cli/bin/app-launch.ts` handles `__app`: the window runs in the launched process and the server in a child (`__app-server`, which prints its URL, then `connected`, and quits when stdin closes), so the Dock/taskbar show the app; on Windows it first restarts itself without a console. App icon: `cli/gui/icon.svg`, with `icon.ico`/`icon.icns` made by `scripts/make-icons.mjs`
- `cli/src/lib/folder-dialog.ts` — the system folder picker (osascript, PowerShell, zenity/kdialog) behind the app's **Open folder**
- `cli/src/commands/gui.ts` — `aecdo gui`: starts the local server and opens the window (the standalone binary re-runs itself as `__gui-window <url>`, see `cli/bin/gui-window.ts`, since webview-bun's `run()` blocks), else the default browser; quits with the window or 20 s after the last browser tab closes
- `cli/src/gui/` — the app's backend: `GuiApp` (open set, home screen, current folder (`openFolder` also `chdir`s), recent files and folders in `~/.aecdo/gui.json`, confirm questions, sign-in prompts, opening `file://` links the assistant gives for files it wrote), `GuiSettings` in `settings.ts` (the Settings screen: AI routes, keys, sign-ins, model per @mention, DrawingBot API credentials; `aecdo configure` opens the app at `#settings`), `GuiSession` (one set: wraps `Explorer` into JSON states with row bboxes, PDF lookup, markups, and AI chat threads, each its own `AssistantBridge` with `surface: "app"`), `server.ts` (127.0.0.1, random token path prefix, Host check, SSE events, PDF byte ranges), `assets.ts` (frontend and PDF.js file paths, embedded in the binary)
- `cli/gui/` — the app's frontend, plain ES modules with JSDoc types (checked by `tsc -p cli/gui/tsconfig.json` in `npm run lint`), no framework: `app.js` (layout, keys, modals), `pdf-view.js` (PDF.js page with instant CSS zoom/pan, sharp re-render of the visible area, box overlay), `list.js` (virtual list), `chat.js`, `keys.js`. PDF.js is `pdfjs-dist`'s legacy build; `cli/bin/gui-assets.js` lists the files Bun embeds
- `cli/src/lib/table.ts` — splits pipe-delimited table content into cells
- `cli/src/lib/progress.ts` — plain progress lines on stderr for `process` and `status --wait`
- `cli/src/lib/prompt.ts` — `canPrompt()`: whether a person is at the terminal (decides whether bare `aecdo` opens the app); `cli/src/lib/files.ts` lists `.jsonld`/`.pdf` files for the app's home screen
- `cli/src/lib/update-check.ts` — daily background check for newer GitHub releases (detached worker + cache at `~/.aecdo/update-check.json`, notice on stderr)
- `package.json` — at repo root, npm-publishable as "aecdo"
- `docs/` — user guide (Jekyll, served by GitHub Pages from `main`/`docs` at https://jeff-carmichael.github.io/aecdo/); one Markdown page per topic, sidebar order in `docs/_config.yml`; README is short and links here
- `examples/` — only example sets that come with their source PDF, all downloaded by `aecdo examples`: `sample-drawing-package-1and2family.{pdf,jsonld}`, the City of Vancouver sample house permit set (7 pages) with a hand-built JSON-LD, for the demo walkthrough, the PDF pane, and markups; source and copyright in `docs/demo.md`. The PDF is left out of the npm package
- `test/fixtures/` — data-only sets for tests: `sample-drawing-set.jsonld` (small, every type) and `maple-grove-library.jsonld` (19-sheet fictional library, used by the explore/app tests and `npm run bench`); `cli/src/lib/schema.test.ts` validates every `.jsonld` file here and in `examples/`
- `.claude/skills/aecdo/SKILL.md` — installable Claude Code skill
- `scripts/bench-large-set.mjs` — `npm run bench -- 1000` times parse/validate/navigation on a synthetic large set (copies of `test/fixtures/maple-grove-library.jsonld`); run after `npm run build`
- `scripts/postinstall.mjs` — copies the skill to `~/.claude/skills/` on a global npm install
- `cli/bin/standalone.ts`, `cli/bin/embed-assets.ts` — Bun entry for standalone binaries (embeds schema + version)
- `install.sh` — end-user installer for the standalone binary (`curl … | sh`)
- `install.ps1` — Windows installer (`irm … | iex`): installs to `%LOCALAPPDATA%\Programs\aecdo`, adds it to the user PATH; downloads via PowerShell so SmartScreen doesn't block the unsigned exe
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
npx aecdo validate test/fixtures/sample-drawing-set.jsonld
npx aecdo summary test/fixtures/sample-drawing-set.jsonld
npx aecdo sheets test/fixtures/sample-drawing-set.jsonld --format json
npx aecdo page test/fixtures/sample-drawing-set.jsonld A101
npx aecdo gui examples/sample-drawing-package-1and2family.jsonld   # the app (humans)
```

The CLI is for scripts and agents: plain output (no colors, spinners, pickers, or screens), and nothing waits for input. `configure` opens the app at Settings (`#settings`). `validate`, `summary`, `sheets`, `page` all support `--format json`. People use the app: bare `aecdo` in a TTY opens it (non-TTY prints `HELP`), and `explore` is an alias for `gui` that falls back to listing sheets without a TTY or with `--format json`.

`Explorer` (`cli/src/commands/explore.ts`) is the navigation model behind the app and the assistant: sheet list → sheet contents (numbered drawings, tables, notes, images) → drawing layers → layer items → item detail. `up`/`..` goes up, `back` returns, `top` resets, `r1`/`r2`/… follow the references tagged `→ [r1]` (`Explorer.jump()`, pushed on the stack so `back` returns), `all` prints the full sheet via `printPage`. `screenModel()`/`sheetPane()` give the app its data; `viewTarget()` is what the PDF pane outlines; the text it logs is what the assistant reads through `context()`/`navigate()`. It takes an injectable logger so navigation is unit-tested without a TTY. The assistant's tests use pi-ai's scripted `fauxProvider`, so no network or keys are needed.

### API commands (requires DrawingBot API credentials)

```bash
npx aecdo configure                          # opens the app's Settings: API credentials, AI models
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

`cli/bin/standalone.ts` is the Bun entry: it imports `embed-assets.ts` (bundles `package.json` version and the default schema into `cli/src/lib/embedded.ts`, registers pi's OAuth flows, and the Bedrock client, which a compiled binary can't load dynamically) before `aecdo.ts`. Both files are excluded from `tsc`. Any new runtime file read must also be embedded there or it will break the binary. Users install with `install.sh` (macOS/Linux) or `install.ps1` (Windows).

API credentials are stored at `~/.aecdo/config.json` (0o600 permissions). Tokens are cached at `~/.aecdo/token.json` (4-hour validity).

## Code conventions

- TypeScript with strict mode, compiled via `tsc`
- ES modules (`import`/`export`), no CommonJS
- No comments unless explaining a non-obvious "why"
- Minimal dependencies (ajv for validation, native fetch for API calls, pi-ai/pi-agent-core for the AI assistant, pdf-lib for markups, pdfjs-dist for the app; webview-bun is a devDependency, bundled only into the standalone binary)
- Lint with `npm run lint` (ESLint flat config in `eslint.config.js`, `typescript-eslint` type-checked rules, plus a type check of `cli/gui/`); CI enforces it
- Use Node.js built-in test runner (`node --test`); tests live next to source as `cli/src/**/*.test.ts` and run via `npm test`

## Workflow for changes

Before finishing any change, run what CI runs:

```bash
npm test               # builds, then runs tests
npm run lint
npm run diagram:check  # only if ontology/ changed
```

- Any change under `ontology/` or `cli/src/` needs a `CHANGELOG.md` entry under `[Unreleased]` — CI fails without one.
- New or changed command: update the `HELP` text in `cli/bin/aecdo.ts`, the matching page of the user guide in `docs/`, and `.claude/skills/aecdo/SKILL.md`.
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
