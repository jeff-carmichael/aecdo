---
name: aecdo
description: Validate, inspect, summarize, and convert AEC drawing data (JSON-LD) using the AECDO CLI
version: 0.1.0
author: jeff-carmichael
tags:
  - aec
  - architecture
  - engineering
  - construction
  - drawings
  - json-ld
  - ontology
---

# AECDO CLI

Command-line tool for working with structured data extracted from Architecture, Engineering, and Construction (AEC) drawings. Tools like [AEC DrawingBot](https://aecdrawingbot.com) produce JSON-LD files conforming to the AECDO schema. This CLI validates, inspects, and transforms those files.

## Setup

> **Coming soon:** `npm install -g aecdo` will be the primary install method. For now, install from source:

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
npm install
npm run build
```

All commands below assume you are in the repo root directory.

## Commands

### Validate a file

```bash
npx aecdo validate examples/sample-drawing-set.jsonld
```

Output: `✓ file.jsonld is valid against AECDO schema.` or lists errors. Exit code 1 on failure.

For machine-readable output:

```bash
npx aecdo validate file.jsonld --format json
```

Returns: `{"valid": true, "file": "...", "errors": []}`

### Inspect a drawing set

```bash
npx aecdo inspect examples/sample-drawing-set.jsonld
```

Shows the full hierarchy: sheets → drawings → layers with item counts, plus table/note counts.

### Get a summary

```bash
npx aecdo summary examples/sample-drawing-set.jsonld
```

Prints totals: sheet count, drawing count, item count, breakdowns by drawing type and item type.

### Convert between JSON-LD and plain JSON

```bash
# JSON-LD → plain JSON (strips @context, @type → type, @id → id)
npx aecdo convert file.jsonld -o plain.json

# Plain JSON → JSON-LD (adds @context)
npx aecdo convert plain.json
```

### Validate all JSON-LD files in a directory

```bash
for f in *.jsonld; do npx aecdo validate "$f" --format json; done
```

## Common Options

| Flag | Description |
|------|-------------|
| `--format json\|text` | Output format (default: text) |
| `--pretty` | Pretty-print JSON output |
| `-o, --output <file>` | Write to file instead of stdout |
| `--schema <path>` | Use a custom schema file for validation |
