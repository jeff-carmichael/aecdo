# AECDO — AEC Drawing Ontology

An open schema and CLI for structured data extracted from Architecture, Engineering, and Construction (AEC) drawings.

Tools like [AEC DrawingBot](https://aecdrawingbot.com) use AI to turn drawing sets (floor plans, sections, details, schedules) into JSON-LD files. AECDO defines that format and provides:

- **A schema** for validating extracted drawing data
- **A CLI** to process PDFs through the [DrawingBot API](https://aecdrawingbot.com/api), explore the results sheet by sheet, see any selection outlined on the PDF page, and ask Claude or ChatGPT about the drawings
- **A [Claude Code skill](.claude/skills/aecdo/SKILL.md)** so AI agents can work with the data

## 📖 [Read the Getting Started guide](https://jeff-carmichael.github.io/aecdo/)

The guide covers installing on every platform, processing PDFs, exploring a drawing set, the AI assistant, a walkthrough of the demo set, the data model and bbox coordinates, and using `aecdo` with Claude Code. Its source is in [`docs/`](docs/).

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
aecdo configure            # connect your DrawingBot API account (once)
aecdo process              # pick a PDF in this folder; saves plans.jsonld next to plans.pdf
aecdo explore plans.jsonld # browse it; type "view" to see the page, "@claude …" to ask
```

No account yet? Try the 19-sheet demo set: `aecdo explore examples/maple-grove-library.jsonld`, and follow the [demo walkthrough](https://jeff-carmichael.github.io/aecdo/demo.html). Run `aecdo --help` for every command.

## Schema

Current version: **v0.3.0** — [`ontology/v0.3.0/aecdo.schema.json`](ontology/v0.3.0/aecdo.schema.json). A drawing set is a tree of **DrawingSet → Sheet → Drawing → Layer → Item**, with Tables, Notes, and Images on each sheet. Every `bbox` is `[xmin, ymin, xmax, ymax]` in PDF points from the top-left of the page. See [Data model and bbox](https://jeff-carmichael.github.io/aecdo/data-model.html) for the diagram and details, and [`examples/`](examples/) for sample files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, schema change process, and releases.

AECDO is an open standard: [AEC DrawingBot](https://aecdrawingbot.com) is its main producer, but any tool can produce or consume conforming files.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
