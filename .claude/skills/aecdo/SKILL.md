---
name: aecdo
description: Validate, summarize, and interactively explore AEC drawing data (JSON-LD) using the AECDO CLI. Use when working with Architecture, Engineering, and Construction drawing files, DrawingBot output, or JSON-LD conforming to the AEC Drawing Ontology.
allowed-tools: Bash(npx aecdo *) Bash(aecdo *) Read Glob
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. Tools like [AEC DrawingBot](https://aecdrawingbot.com) produce JSON-LD files conforming to the AECDO schema. This CLI validates, summarizes, and explores those files.

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
