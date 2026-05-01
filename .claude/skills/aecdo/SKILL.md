---
name: aecdo
description: Validate, summarize, explore, and process AEC drawing data (JSON-LD) using the AECDO CLI. Use when working with Architecture, Engineering, and Construction drawing files, DrawingBot output, JSON-LD conforming to the AEC Drawing Ontology, or processing PDFs via the DrawingBot API.
allowed-tools: Bash(npx aecdo *) Bash(aecdo *) Read Glob
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. [AEC DrawingBot](https://aecdrawingbot.com) processes PDF drawings into JSON-LD files conforming to the AECDO schema. This CLI validates, summarizes, and explores those files — and can process PDFs directly via the DrawingBot API.

## Setup

```bash
npm install -g aecdo
```

Or from source:

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
npm install
npm run build
```

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
```

Uploads the PDF to the DrawingBot API, polls for completion with live progress, then downloads the JSON-LD result. Use `--then` to pipe into validate, summary, or explore.

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
```

Prints totals: sheet count, drawing count, item count, breakdowns by drawing type and item type.

### Explore a drawing set interactively

```bash
aecdo explore examples/sample-drawing-set.jsonld
```

Loads the file once, validates it, shows the inspection overview, then drops into an interactive prompt. Type a sheet number (e.g. `A101`) or page index (e.g. `0`) to see everything on that sheet — drawings, layers, items with their data and references, tables, and notes. Type `list` to see sheets again, `quit` to exit.

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

## API Options

| Flag | Description |
|------|-------------|
| `--poll <seconds>` | Polling interval for status checks (default: 5) |
| `--wait` | Wait for job completion (used with `status`) |
| `--then <command>` | Pipe downloaded result into: validate, summary, explore |
