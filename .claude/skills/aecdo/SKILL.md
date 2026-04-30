---
name: aecdo
description: Validate, inspect, summarize, and convert AEC drawing data (JSON-LD) using the AECDO CLI. Use when working with Architecture, Engineering, and Construction drawing files, DrawingBot output, or JSON-LD conforming to the AEC Drawing Ontology.
allowed-tools: Bash(npx aecdo *) Bash(aecdo *) Read Glob
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. Tools like [AEC DrawingBot](https://aecdrawingbot.com) produce JSON-LD files conforming to the AECDO schema. This CLI validates, inspects, and transforms those files.

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

### Inspect a drawing set

```bash
aecdo inspect examples/sample-drawing-set.jsonld
```

Shows the full hierarchy: sheets → drawings → layers with item counts, plus table/note counts.

### Get a summary

```bash
aecdo summary examples/sample-drawing-set.jsonld
```

Prints totals: sheet count, drawing count, item count, breakdowns by drawing type and item type.

### Convert between JSON-LD and plain JSON

```bash
# JSON-LD → plain JSON (strips @context, @type → type, @id → id)
aecdo convert file.jsonld -o plain.json

# Plain JSON → JSON-LD (adds @context)
aecdo convert plain.json
```

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
