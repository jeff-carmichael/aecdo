---
name: aecdo
description: Validate, summarize, read, and process AEC drawing data (JSON-LD) using the AECDO CLI. Use when working with Architecture, Engineering, and Construction drawing files, DrawingBot output, JSON-LD conforming to the AEC Drawing Ontology, or processing PDFs via the DrawingBot API.
allowed-tools: Bash(npx aecdo *) Bash(aecdo *) Read Glob
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. [AEC DrawingBot](https://aecdrawingbot.com) processes PDF drawings into JSON-LD files conforming to the AECDO schema. This CLI validates, summarizes, and prints those files as plain text or JSON, opens them in a desktop app for people, and can process PDFs directly via the DrawingBot API.

## Setup

Check whether it's installed with `aecdo --version`. If not, install the standalone binary (macOS and Linux):

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

On Windows, in PowerShell (installs to `%LOCALAPPDATA%\Programs\aecdo` and adds it to the user PATH; open a new terminal afterwards):

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

Inside a clone of the aecdo repo, you can instead run `npm install && npm run build` and use `npx aecdo` in place of `aecdo`.

## Commands

Bare `aecdo` opens the app in a terminal and prints the help otherwise. Agents should always call a subcommand directly. Output is plain text with no colors or redrawing, so it reads the same in logs.

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

Uploads the PDF to the DrawingBot API, polls for completion (a progress line on stderr each time it changes), then downloads the JSON-LD result and saves it as `<pdf name>.jsonld` next to the PDF (e.g. `plans.pdf` → `plans.jsonld`), overwriting any existing file. The saved path is printed to stderr. Use `-o` to choose a different path, `--then` to also pipe into validate or summary, or `--stdout` to print the JSON-LD to stdout instead of saving a file.

`process` and `upload` need the file path; a missing file is an error.

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
aecdo download <jobId> --then summary
```

Downloads the JSON-LD result of a completed job. Results expire after 7 days.

### Update the CLI

```bash
aecdo update
```

Replaces the standalone binary with the latest GitHub release after verifying its SHA-256 checksum. Prints "already the latest version" when current. If the install folder is not writable it exits 1 and suggests `sudo aecdo update`. For npm installs it only prints `npm install -g aecdo@latest`.

### Download the example drawing sets

```bash
aecdo examples [folder]   # default ./aecdo-examples; --force replaces existing files
```

Downloads `maple-grove-library.jsonld` (19-sheet demo, data only), `sample-drawing-package-1and2family.{jsonld,pdf}` (real permit set with its PDF), `sample-drawing-set.jsonld`, and a README from the GitHub tag matching the CLI version (falls back to `main`). Existing files are skipped unless `--force`. The install scripts offer this at the end in a terminal; `AECDO_EXAMPLES=1|0` and `AECDO_EXAMPLES_DIR` answer it ahead of time.

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

Prints each sheet's number, title, and page index. It completes in one shot and supports JSON.

### Print one sheet

```bash
aecdo page examples/sample-drawing-set.jsonld A101
aecdo page examples/sample-drawing-set.jsonld 0 --format json
```

Prints everything on a sheet — drawings, layers, items with their data and references, tables, notes, and images — selected by sheet number (e.g. `A101`) or page index (e.g. `0`). With `--format json`, emits the raw sheet object. Exits non-zero if no sheet matches.

### The app (people only)

```bash
aecdo gui examples/maple-grove-library.jsonld
```

`aecdo gui [file]` (also bare `aecdo` in a terminal, and `aecdo explore [file]`) opens a desktop window for people: the sheet list, what's open, and the PDF page with the selection outlined in red, AI chats (`@claude`, `@chatgpt`, `@gemini`, `@grok`, `@deepseek`, `@kimi`, set up with `aecdo configure ai`), and PDF markups. It waits until the window is closed, so **agents should never run `gui`**, nor bare `aecdo` in a terminal. Without a TTY, bare `aecdo` prints the help, and `explore <file>` (or `explore --format json`) prints the sheet list like `sheets`.

For a richer file to try commands on, `examples/maple-grove-library.jsonld` is a 19-sheet demo set (fictional library, all disciplines) with door, window, finish, equipment, and panel schedules. `examples/sample-drawing-package-1and2family.jsonld` comes with its source PDF (a 7-page house permit set from the City of Vancouver).

### Validate all JSON-LD files in a directory

```bash
for f in *.jsonld; do aecdo validate "$f" --format json; done
```

## Data model

A file is a **DrawingSet → Sheet → Drawing → Layer → Item** tree, with Tables, Notes, and Images directly on each Sheet. `pageIndex` is the zero-based page in the source PDF. Items are `tag` (annotations, symbols), `thing` (physical elements), or `area` (regions); their `data` object is freeform. Table `content` is pipe-delimited rows separated by newlines. `references` hold `@id`s of other entities (e.g. a section tag pointing to its section drawing).

Every `bbox` is `[xmin, ymin, xmax, ymax]` in PDF points (1/72 inch) from the top-left corner of the page as displayed (after any rotation), y increasing downward, not normalized. Divide by 72 for inches; on a 72 DPI render of the page, one pixel is one point. Use bboxes to tell where things sit relative to each other (e.g. which tags fall inside a drawing's box).

## Common Options

| Flag | Description |
|------|-------------|
| `--format json\|text` | Output format (default: text) |
| `--pretty` | Pretty-print JSON output |
| `-o, --output <file>` | Write to file instead of stdout |
| `--schema <path>` | Use a custom schema file for validation |
| `--pdf <file>` | `gui` only: source PDF for the app (default: `<name>.pdf` next to the `.jsonld`, or the set's `filename`) |
| `--no-update-check` | Skip the daily background check for a newer release (or set `NO_UPDATE_CHECK=1`). Update notices go to stderr only, so stdout JSON is never affected. |

## API Options

| Flag | Description |
|------|-------------|
| `--poll <seconds>` | Polling interval for status checks (default: 5) |
| `--wait` | Wait for job completion (used with `status`) |
| `--then <command>` | Pipe downloaded result into: validate, summary |
| `--stdout` | `process` only: print the result to stdout instead of saving `<pdf name>.jsonld` |
