# AECDO — AEC Drawing Ontology

An open schema and CLI for structured data extracted from Architecture, Engineering, and Construction (AEC) drawings.

## What is this?

AEC projects produce hundreds of drawing sheets — floor plans, sections, details, schedules. Tools like [AEC DrawingBot](https://aecdrawingbot.com) use AI to extract structured data from these drawings into machine-readable JSON-LD files.

**AECDO** provides:

1. **An ontology/schema** defining the standard format for extracted drawing data
2. **A CLI tool** for validating, summarizing, and interactively exploring these files
3. **A [skills guide](SKILLS.md)** for AI agents to work with drawing data programmatically

## Quick Start

### Install

> **Coming soon:** `npm install -g aecdo` — the package will be published to npm as the primary installation method. For now, install from source:

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
npm install
```

### Validate a file

```bash
npx aecdo validate examples/sample-drawing-set.jsonld
# ✓ sample-drawing-set.jsonld is valid against AECDO schema.
```

### Summarize

```bash
npx aecdo summary examples/sample-drawing-set.jsonld
```

### Explore interactively

```bash
npx aecdo explore examples/sample-drawing-set.jsonld
```

Loads the file once, validates it, shows the sheet overview, then drops into an interactive prompt. Type a sheet number (e.g. `A101`) or page index (e.g. `0`) to see everything on that sheet — drawings, layers, items with their data and references, tables, and notes.

```
✓ sample-drawing-set.jsonld is valid against AECDO schema.

  A101 - Ground Floor Plan (page 0)
  A201 - Building Sections (page 1)

Enter a sheet number or page index to view its contents.
Type "list" to show sheets again, or "quit" to exit.

sheet> A101

════════════════════════════════════════════════════════════
  Sheet A101 — Ground Floor Plan (page 0)
════════════════════════════════════════════════════════════

  Drawing: Ground Floor Plan [plan, 1/4" = 1'-0"]
    id:   urn:uuid:22222222-2222-2222-2222-222222222222
    bbox: [72, 108, 720, 540]
    → Section A (A201, page 1)

    Layer: Walls (1 items)
      bbox: [85, 120, 700, 520]

      [THING] Exterior Wall
        id:   urn:uuid:44444444-4444-4444-4444-444444444444
        bbox: [85, 120, 700, 130]
        data:
          material: CMU 8"
          thickness: 8

    Layer: Annotations (1 items)

      [TAG] Section Cut A
        id:   urn:uuid:88888888-8888-8888-8888-888888888888
        bbox: [400, 300, 420, 320]
        data:
          referenceId: A/A201
        → Section A (A201, page 1)

  Tables (1):

    Door Schedule
      ┌──────────────────────────────────────────────────┐
      │ Mark | Width | Height | Type | Hardware          │
      │ D101 | 3'-0" | 7'-0" | Single | Lever            │
      └──────────────────────────────────────────────────┘

sheet>
```

## Schema Overview

The schema is at **v0.1.0** (pre-release). Full definition: [`ontology/v0.1.0/aecdo.schema.json`](ontology/v0.1.0/aecdo.schema.json)

### Hierarchy

> The diagram source is at [`ontology/v0.1.0/diagram.mmd`](ontology/v0.1.0/diagram.mmd)

```mermaid
---
title: AEC DrawingBot 2.0 Ontology
---

classDiagram
    class DrawingSet {
		    +uuid4 @id
        +Date date
        +String filename
    }
    class Sheet {
		    +uuid4 @id
        +String sheetNumber
        +String title
        +int pageIndex
    }
    class Drawing {
		    +uuid4 @id
        +String title
        +String scale
        +String drawingType
        +array bbox
    }
    class Layer {
		    +uuid4 @id
        +String name
        +array bbox
    }
    class Item {
		    +uuid4 @id
		    +Object data
		    +String itemType
		    +array bbox
    }
    class Table {
		    +uuid4 @id
        +String title
        +String content
        +array bbox
    }
    class Note {
		    +uuid4 @id
        +String content
        +array bbox
    }

		%% Structure Relationships
    DrawingSet "1" --* "1..*" Sheet : contains
    Sheet "1" --* "0..*" Drawing : contains
    Sheet "1" --* "0..*" Table : contains
    Sheet "1" --* "0..*" Note : contains
    Drawing "1" --* "1..*" Layer : contains
    Layer "1" --* "0..*" Item : contains

    %% The Reference Relationships
    Item "1" ..> "1..*" Drawing : references
    Drawing "1" ..> "1..*"  Drawing : references
```

### Types

| Type | Description |
|------|-------------|
| **DrawingSet** | Root — source filename, processed date, and sheets |
| **Sheet** | A page from the PDF with sheet number, title, and page index |
| **Drawing** | A view on a sheet (plan, section, elevation, detail) with scale and layers |
| **Layer** | Groups related items (e.g. "Walls", "Doors & Windows", "Annotations") |
| **Item** | An extracted entity — `thing` (physical element), `tag` (annotation/symbol), or `area` (region) |
| **Table** | A schedule or table with pipe-delimited content |
| **Note** | A general notes text block |

### Example

```json
{
  "@context": "https://aecdrawingbot.com/ontology/v0.1.0/aecdo#",
  "@id": "urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "@type": "DrawingSet",
  "processedDate": "2026-04-10T14:30:00Z",
  "filename": "Example_Building_Plans.pdf",
  "sheets": [
    {
      "@id": "urn:uuid:11111111-1111-1111-1111-111111111111",
      "@type": "Sheet",
      "sheetNumber": "A101",
      "title": "Ground Floor Plan",
      "pageIndex": 0,
      "drawings": [
        {
          "@id": "urn:uuid:22222222-2222-2222-2222-222222222222",
          "@type": "Drawing",
          "title": "Ground Floor Plan",
          "drawingType": "plan",
          "bbox": [72, 108, 720, 540],
          "layers": [
            {
              "@id": "urn:uuid:33333333-3333-3333-3333-333333333333",
              "@type": "Layer",
              "name": "Walls",
              "items": [
                {
                  "@id": "urn:uuid:44444444-4444-4444-4444-444444444444",
                  "@type": "Item",
                  "itemType": "thing",
                  "data": { "label": "Exterior Wall", "material": "CMU 8\"" },
                  "bbox": [85, 120, 700, 130]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Project Structure

```
package.json            npm package root (publishes as "aecdo")
ontology/               Schema definitions (versioned)
  v0.1.0/
    aecdo.schema.json     JSON Schema for validation
    context.jsonld         JSON-LD context for linked data
    diagram.mmd            Mermaid class diagram of the ontology
cli/                    CLI tool
  bin/aecdo.js            Entry point (npx aecdo)
  src/commands/           validate, summary, explore, page
  src/lib/                Schema loading, output utilities
examples/               Sample JSON-LD files
SKILLS.md               Skill file for AI agents (skills directory format)
CONTRIBUTING.md         How to contribute (especially schema changes)
CHANGELOG.md            Version history
```

## For AI Agents

See [SKILLS.md](SKILLS.md) — installable via `openskills` and follows the [skills directory format](https://www.skillsdirectory.com/docs/skill-md-format).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Schema changes go through an issue-first process to maintain compatibility. The schema uses semantic versioning.

## Relationship to AEC DrawingBot

[AEC DrawingBot](https://aecdrawingbot.com) is the primary producer of AECDO-conformant files. The DrawingBot website will serve the schema directly from this repository. However, AECDO is an open standard — any tool can produce or consume conforming files.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
