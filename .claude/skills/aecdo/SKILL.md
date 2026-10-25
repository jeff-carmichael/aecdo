---
name: aecdo
description: Validate, summarize, explore, and process AEC drawing data (JSON-LD) using the AECDO CLI. Use when working with Architecture, Engineering, and Construction drawing files, DrawingBot output, JSON-LD conforming to the AEC Drawing Ontology, or processing PDFs via the DrawingBot API.
allowed-tools: Bash(npx aecdo *) Bash(aecdo *) Read Glob
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. [AEC DrawingBot](https://aecdrawingbot.com) processes PDF drawings into JSON-LD files conforming to the AECDO schema. This CLI validates, summarizes, and explores those files — and can process PDFs directly via the DrawingBot API.

## Setup

Check whether it's installed with `aecdo --version`. If not, install the standalone binary (macOS and Linux):

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

Inside a clone of the aecdo repo, you can instead run `npm install && npm run build` and use `npx aecdo` in place of `aecdo`.

## Commands

### Configure API credentials (one-time)

```bash
aecdo configure
```

Prompts for Client ID, Client Secret, and region. Saves to `~/.aecdo/config.json`. Required before using `process`, `upload`, `status`, or `download`.

### Process a PDF (end-to-end)

```bash
aecdo process plans.pdf
aecdo process plans.pdf --then summary
aecdo process plans.pdf -o result.jsonld
aecdo process plans.pdf --stdout
```

Uploads the PDF to the DrawingBot API, polls for completion with live progress, then downloads the JSON-LD result and saves it as `<pdf name>.jsonld` next to the PDF (e.g. `plans.pdf` → `plans.jsonld`), overwriting any existing file. The saved path is printed to stderr. Use `-o` to choose a different path, `--then` to also pipe into validate, summary, or explore, or `--stdout` to print the JSON-LD to stdout instead of saving a file.

With no file in an interactive terminal, `process` and `upload` open an arrow-key picker of the PDFs in the current folder. Agents should always pass the file path: without a TTY a missing file is an error, not a prompt.

### Upload a PDF

```bash
aecdo upload plans.pdf
```

Uploads the PDF and prints the job ID to stdout. Useful for scripting: `JOB=$(aecdo upload plans.pdf)`.

### Check job status

```bash
aecdo status <jobId>
aecdo status <jobId> --wait
aecdo status <jobId> --format json
```

Shows current processing status. With `--wait`, polls until completion. Use `--poll <seconds>` to control interval (default: 5).

### Download a result

```bash
aecdo download <jobId>
aecdo download <jobId> -o result.jsonld
aecdo download <jobId> --then explore
```

Downloads the JSON-LD result of a completed job. Results expire after 7 days.

### Update the CLI

```bash
aecdo update
```

Replaces the standalone binary with the latest GitHub release after verifying its SHA-256 checksum. Prints "already the latest version" when current. If the install folder is not writable it exits 1 and suggests `sudo aecdo update`. For npm installs it only prints `npm install -g aecdo@latest`.

### Shell tab completion

```bash
aecdo completion bash   # or zsh, fish; defaults to $SHELL
```

Prints a completion script for a human's shell (`process <Tab>` lists only PDFs). Install with `eval "$(aecdo completion bash)"` in `~/.bashrc` (zsh: `~/.zshrc`), or `aecdo completion fish > ~/.config/fish/completions/aecdo.fish`.

### Validate a file

```bash
aecdo validate examples/sample-drawing-set.jsonld
```

Output: `✓ file.jsonld is valid against AECDO schema.` or lists errors. Exit code 1 on failure.

For machine-readable output:

```bash
aecdo validate file.jsonld --format json
```

Returns: `{"valid": true, "file": "...", "errors": []}`

### Get a summary

```bash
aecdo summary examples/sample-drawing-set.jsonld
aecdo summary examples/sample-drawing-set.jsonld --format json
```

Prints totals: sheet count, drawing count, item count, breakdowns by drawing type and item type.

### List sheets (non-interactive)

```bash
aecdo sheets examples/sample-drawing-set.jsonld
aecdo sheets examples/sample-drawing-set.jsonld --format json
```

Prints each sheet's number, title, and page index. Use this instead of `explore` when scripting or running as an agent — it completes in one shot and supports JSON.

### Print one sheet

```bash
aecdo page examples/sample-drawing-set.jsonld A101
aecdo page examples/sample-drawing-set.jsonld 0 --format json
```

Prints everything on a sheet — drawings, layers, items with their data and references, tables, notes, and images — selected by sheet number (e.g. `A101`) or page index (e.g. `0`). With `--format json`, emits the raw sheet object. Exits non-zero if no sheet matches.

### Explore a drawing set interactively (humans)

```bash
aecdo explore examples/sample-drawing-set.jsonld
```

Loads the file once, validates it, shows the sheet list, then drops into a drill-down prompt. Type a sheet number (e.g. `A101`) or page index (e.g. `0`) to open a sheet: it lists the drawings, tables, notes, and images on that sheet as a numbered menu. Pick a number to dive in — a drawing opens its layers, a layer opens its items, and an item, table, note, or image prints its full details. Type `back` (or `..`) to go up a level, `top` to return to the sheet list, `all` on a sheet to print everything at once, `view` to open the PDF page with the current drawing, layer, or item outlined in red (needs the source PDF next to the `.jsonld`, or `--pdf <file>`), `ls` to reprint the current list, and `quit` to exit.

Humans can also type `@claude …` or `@chatgpt …` at the explore prompt to ask an AI assistant about the current view. The assistant can navigate, open the page view with a red box (like `view`), append notes to `notes.md`, and add rows or cells to a spreadsheet (`.xlsx`, `.csv`, `.tsv`) in the current folder. Set it up with `aecdo configure ai` (Sign in with ChatGPT, or an OpenAI/Anthropic API key; stored in `~/.aecdo/llm.json`). Both commands are interactive; agents should not run them.

For a richer file to try commands on, `examples/maple-grove-library.jsonld` is a 19-sheet demo set (fictional library, all disciplines) with door, window, finish, equipment, and panel schedules.

**Agents / non-interactive use:** `explore` detects when stdin is not a TTY or when `--format json` is passed and falls back to listing sheets, so it won't hang on the prompt. Prefer `sheets` and `page` for scripted workflows.

### Validate all JSON-LD files in a directory

```bash
for f in *.jsonld; do aecdo validate "$f" --format json; done
```

## Common Options

| Flag | Description |
|------|-------------|
| `--format json\|text` | Output format (default: text) |
| `--pretty` | Pretty-print JSON output |
| `-o, --output <file>` | Write to file instead of stdout |
| `--schema <path>` | Use a custom schema file for validation |
| `--pdf <file>` | `explore` only: source PDF for `view` (default: `<name>.pdf` next to the `.jsonld`, or the set's `filename`) |
| `--no-update-check` | Skip the daily background check for a newer release (or set `NO_UPDATE_CHECK=1`). Update notices go to stderr only, so stdout JSON is never affected. |

## API Options

| Flag | Description |
|------|-------------|
| `--poll <seconds>` | Polling interval for status checks (default: 5) |
| `--wait` | Wait for job completion (used with `status`) |
| `--then <command>` | Pipe downloaded result into: validate, summary, explore |
| `--stdout` | `process` only: print the result to stdout instead of saving `<pdf name>.jsonld` |
