# AECDO — AEC Drawing Ontology

An open schema and open-source CLI for structured data extracted from Architecture, Engineering, and Construction (AEC) drawings.

- **The schema** defines a JSON-LD format for drawing sets: sheets, drawings, layers, items like door tags and walls, schedules, and notes, each with its location on the page.
- **The `aecdo` CLI** works with any JSON-LD file that matches the schema, whichever tool produced it. Validate and summarize files, explore them sheet by sheet, see any selection outlined on the PDF page, and ask Claude or ChatGPT about the drawings.
- **A [Claude Code skill](.claude/skills/aecdo/SKILL.md)** lets AI agents work with the data.

The CLI also includes an optional wrapper for the [DrawingBot](https://aecdrawingbot.com) API, which turns PDFs into AECDO files.

> [!IMPORTANT]
> **The DrawingBot API isn't available yet.** `aecdo process`, `upload`, `status`, `download`, and `configure` will work once it launches. Everything else works today with any AECDO JSON-LD file, including the [demo set](examples/maple-grove-library.jsonld).

## 📖 [Read the Getting Started guide](https://jeff-carmichael.github.io/aecdo/)

The guide covers installing on every platform, exploring a drawing set, the AI assistant, a walkthrough of the demo set, the data model and bbox coordinates, using `aecdo` with Claude Code, and processing PDFs. Its source is in [`docs/`](docs/).

## Install

macOS and Linux:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

See [Install and update](https://jeff-carmichael.github.io/aecdo/install.html) for other options and the "Windows protected your PC" warning.

## Quick start

```bash
aecdo explore maple-grove-library.jsonld            # browse the 19-sheet demo set
aecdo validate plans.jsonld                          # check your own file against the schema
aecdo explore plans.jsonld                           # type "view" to see the page, "@claude …" to ask
```

The installer offers to download the example drawing sets to a folder (or run `aecdo examples` later). Open the demo set, [`maple-grove-library.jsonld`](examples/maple-grove-library.jsonld), and follow the [demo walkthrough](https://jeff-carmichael.github.io/aecdo/demo.html) for a first tour. To try `view` and markups, use [`examples/sample-drawing-package-1and2family.jsonld`](examples/sample-drawing-package-1and2family.jsonld) with its PDF, the City of Vancouver's sample house permit set. Run `aecdo --help` for every command.

## Schema

Current version: **v0.3.0** — [`ontology/v0.3.0/aecdo.schema.json`](ontology/v0.3.0/aecdo.schema.json). A drawing set is a tree of **DrawingSet → Sheet → Drawing → Layer → Item**, with Tables, Notes, and Images on each sheet. Every `bbox` is `[xmin, ymin, xmax, ymax]` in PDF points from the top-left of the page. See [Data model and bbox](https://jeff-carmichael.github.io/aecdo/data-model.html) for the diagram and details, and [`examples/`](examples/) for sample files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, schema change process, and releases.

AECDO is an open standard: any tool can produce or consume conforming files.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
