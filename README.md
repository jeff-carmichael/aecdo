# AECDO — AEC Drawing Ontology

An open schema and CLI for structured data extracted from Architecture, Engineering, and Construction (AEC) drawings.

Tools like [AEC DrawingBot](https://aecdrawingbot.com) use AI to turn drawing sets (floor plans, sections, details, schedules) into JSON-LD files. AECDO defines that format and provides:

- **A schema** for validating extracted drawing data
- **A CLI** to validate, summarize, and explore those files, and to process PDFs through the [DrawingBot API](https://aecdrawingbot.com/api)
- **A [Claude Code skill](.claude/skills/aecdo/SKILL.md)** so AI agents can work with the data

## Install

macOS and Linux:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

Windows: download `aecdo-windows-x64.zip` from [Releases](https://github.com/jeff-carmichael/aecdo/releases).

## Getting started

### 1. Connect your DrawingBot API account (one time)

```bash
aecdo configure
```

Enter the Client ID and Client Secret from your [DrawingBot API](https://aecdrawingbot.com/api) account and pick a region. They are saved to `~/.aecdo/config.json`. To use `@claude` or `@chatgpt` inside `explore`, also run `aecdo configure ai` (see [Ask Claude or ChatGPT while you explore](#ask-claude-or-chatgpt-while-you-explore)).

### 2. Process a PDF

```bash
cd ~/Projects/my-building
aecdo process
```

With no file name, `process` lists the PDFs in the current folder. Use ↑/↓ to move, type to filter, Enter to select, and Esc to cancel. You can also name the file directly: `aecdo process plans.pdf`.

`process` uploads the PDF, shows progress while it is processed, and saves the result as `plans.jsonld` next to the PDF.

### 3. Look at the result

```bash
aecdo summary plans.jsonld                   # counts of sheets, drawings, items
aecdo explore plans.jsonld                   # browse sheet by sheet
```

### Optional: tab completion

Set this up once and `aecdo process <Tab>` offers only PDFs (and folders), while `summary`, `explore`, and the other file commands offer only `.jsonld`/`.json` files.

```bash
echo 'eval "$(aecdo completion bash)"' >> ~/.bashrc                 # bash
echo 'eval "$(aecdo completion zsh)"' >> ~/.zshrc                   # zsh
aecdo completion fish > ~/.config/fish/completions/aecdo.fish       # fish
```

Open a new terminal afterwards. `aecdo completion` with no shell name uses your `$SHELL`.

## Usage

Run `aecdo --help` for every command and option.

### Process PDFs

```bash
aecdo process                                # pick a PDF in this folder
aecdo process plans.pdf                      # upload, wait, save plans.jsonld next to the PDF
aecdo process plans.pdf -o result.jsonld     # save to a different path
aecdo process plans.pdf --then summary       # save, then summarize
aecdo process plans.pdf --stdout             # print the JSON-LD instead of saving it
```

`process` overwrites an existing file at the save path. The PDF picker only appears in a terminal; in scripts and pipes a missing file name is an error.

`upload`, `status <jobId> --wait`, and `download <jobId>` run each step separately, which is handy for scripts.

### Work with JSON-LD files

```bash
aecdo validate drawings.jsonld               # check a file against the schema
aecdo summary drawings.jsonld                # counts of sheets, drawings, items
aecdo sheets drawings.jsonld                 # list sheets
aecdo page drawings.jsonld A101              # print one sheet (by number or page index)
aecdo explore drawings.jsonld                # browse interactively
```

Add `--format json` to any of these for machine-readable output.

### Explore interactively

`explore` opens a sheet list, then lets you drill down: sheet → drawings, tables, notes, and images → layers → items. Type a number to open an entry, `back` (or `..`) to go up, `top` for the sheet list, `all` to print a whole sheet, `view` to see the page, and `quit` to exit.

```
✓ sample-drawing-set.jsonld is valid against AECDO schema.

  A101 - Ground Floor Plan (page 0)
  A201 - Building Sections (page 1)

  Enter a sheet number or page index to open it.
  "ls" reprints the current list, "quit" exits.
  "@claude …" or "@chatgpt …" asks an AI assistant about this view.

sheet> A101

════════════════════════════════════════════════════════════
  Sheet A101 — Ground Floor Plan (page 0)
════════════════════════════════════════════════════════════

  Drawings (1):
     1. Ground Floor Plan [plan, 1/4" = 1'-0"] — 3 layers, 3 items

  Tables (1):
     2. Door Schedule — 3 rows

  Notes (1):
     3. 1. All dimensions are to face of finish unless noted otherw…

  Images (1):
     4. [logo] Firm logo in title block

A101> 1

  Drawing: Ground Floor Plan [plan, 1/4" = 1'-0"] (sheet A101)
    id:   urn:uuid:22222222-2222-2222-2222-222222222222
    bbox: [72, 108, 720, 540]
    → Building Section A (A201, page 1)

  Layers (3):
     1. Walls — 1 item
     2. Doors & Windows — 1 item
     3. Annotations — 1 item

A101 › Ground Floor Plan> 1

  Layer: Walls
    bbox: [85, 120, 700, 520]

  Items (1):
     1. [THING] Exterior Wall

A101 › Ground Floor Plan › Walls> 1

      [THING] Exterior Wall
        id:   urn:uuid:44444444-4444-4444-4444-444444444444
        bbox: [85, 120, 700, 130]
        data:
          material: CMU 8"
          thickness: 8

A101 › Ground Floor Plan › Walls> q
```

### See the page with the selection outlined

Type `view` (or `/view`) inside `explore` to open the current sheet's page from the source PDF with a red box around what you're looking at: the drawing, the layer, or the last item, table, note, or image you opened. On a sheet with nothing selected it shows the whole page.

`explore` looks for the PDF next to the `.jsonld` (`plans.pdf` for `plans.jsonld`, which is where `aecdo process` saves it) and then by the `filename` stored in the set. If it's somewhere else, start with `aecdo explore plans.jsonld --pdf path/to/plans.pdf`, or type `view path/to/plans.pdf` once.

The page opens in your default image viewer as a PNG when [Poppler](https://poppler.freedesktop.org/) (`pdftoppm`) or MuPDF (`mutool`) is installed (`brew install poppler`, `apt install poppler-utils`), and otherwise as a one-page PDF in your PDF viewer. The files go in your temp folder under `aecdo-view/`. Boxes are read as PDF points from the top-left corner of the page.

### Ask Claude or ChatGPT while you explore

Inside `explore`, start a line with `@claude` or `@chatgpt` (also `@gpt`) to ask an AI assistant about what you're looking at. The name turns cyan as you type it when it matches an assistant. It sees the current view (the sheet, drawing, or layer on screen) and can:

- **navigate** the drawing set with the same commands you type, so you watch it move;
- **read** any other sheet without moving your view;
- **take notes** by appending Markdown to `notes.md` in the current folder;
- **fill in a spreadsheet** in the current folder: it looks for an existing `.xlsx`, `.csv`, or `.tsv` and works in that file's layout, or creates a new one. Before its first edit to an existing spreadsheet it asks `[y/N]`. Excel files are edited in place, so formatting, formulas, and other tabs are kept, and cells that hold formulas are never overwritten.

```
A101> @claude add every door in the schedule to doors.xlsx and note anything unusual
```

Press Ctrl+C to stop an answer. Each assistant keeps the conversation until you quit `explore`. File access is limited to the folder you ran `explore` from.

Set it up once with:

```bash
aecdo configure ai
```

- **ChatGPT:** choose *Sign in with ChatGPT* to use your ChatGPT Plus or Pro plan (usage counts against your plan, and you can cap it per app in ChatGPT's settings), or enter an OpenAI API key.
- **Claude:** enter an [Anthropic API key](https://console.anthropic.com/). Anthropic doesn't allow third-party tools to sign in with Claude Pro/Max accounts, so a key is the only option.

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` environment variables work too. Credentials and model choices are saved to `~/.aecdo/llm.json` (readable only by you). The assistant needs the standalone binary or, for npm installs, Node.js 22.19 or newer. It is built on the open-source [pi](https://github.com/earendil-works/pi) `pi-ai` and `pi-agent-core` libraries.

### Updating

Run `aecdo update` to replace the installed binary with the latest release. It downloads the build for your platform, checks it against the release's `checksums.txt`, and swaps it in. If the binary is in a folder you can't write to (such as `/usr/local/bin`), run `sudo aecdo update`. npm installs print `npm install -g aecdo@latest` instead.


Once a day, `aecdo` checks [GitHub Releases](https://github.com/jeff-carmichael/aecdo/releases) in the background for a newer version. The check never delays a command: it refreshes a cache at `~/.aecdo/update-check.json`, and the next run prints a notice to stderr suggesting `aecdo update` (so piped stdout stays clean). It is skipped when stderr is not a terminal or `CI` is set. Turn it off with `NO_UPDATE_CHECK=1` or `--no-update-check`.

## Schema

Current version: **v0.3.0** — [`ontology/v0.3.0/aecdo.schema.json`](ontology/v0.3.0/aecdo.schema.json). See [`examples/sample-drawing-set.jsonld`](examples/sample-drawing-set.jsonld) for a minimal complete file, and [`examples/maple-grove-library.jsonld`](examples/maple-grove-library.jsonld) for a detailed 19-sheet demo set (try `aecdo explore examples/maple-grove-library.jsonld`).

```mermaid
---
title: AEC DrawingBot Ontology
---

classDiagram
    class DrawingSet {
		    +uuid4 @id
		    +Date processedDate
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
		    +String label
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
		    +String itemType
		    +Object data
		    +array bbox
    }
    class Table {
		    +uuid4 @id
		    +String label
		    +String content
		    +array bbox
    }
    class Note {
		    +uuid4 @id
		    +String content
		    +array bbox
    }
    class Image {
		    +uuid4 @id
		    +String role
		    +String caption
		    +array bbox
    }

		%% Structure Relationships
    DrawingSet "1" --* "1..*" Sheet : contains
    Sheet "1" --* "0..*" Drawing : contains
    Sheet "1" --* "0..*" Table : contains
    Sheet "1" --* "0..*" Note : contains
    Sheet "1" --* "0..*" Image : contains
    Drawing "1" --* "1..*" Layer : contains
    Layer "1" --* "1..*" Item : contains

    %% The Reference Relationships
    Drawing "1" ..> "1..*" Drawing : references
    Item "1" ..> "1..*" Drawing : references
```


| Type | Description |
|------|-------------|
| **DrawingSet** | Root — source filename, processed date, and sheets |
| **Sheet** | A page from the PDF with sheet number, title, and page index |
| **Drawing** | A view on a sheet (plan, section, elevation, detail) with scale and layers |
| **Layer** | Groups related items (e.g. "Walls", "Doors & Windows", "Annotations") |
| **Item** | An extracted entity — `thing` (physical element), `tag` (annotation/symbol), or `area` (region) |
| **Table** | A schedule or table with pipe-delimited content |
| **Note** | A general notes text block |
| **Image** | A raster image on a sheet (`logo`, `photo`, `detail-raster`, `diagram`, `other`); image bytes are not stored |

## Using with Claude Code

Copy the skill into your Claude Code skills folder:

```bash
mkdir -p ~/.claude/skills/aecdo
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -o ~/.claude/skills/aecdo/SKILL.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, schema change process, and releases.

AECDO is an open standard: [AEC DrawingBot](https://aecdrawingbot.com) is its main producer, but any tool can produce or consume conforming files.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
