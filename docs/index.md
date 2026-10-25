---
title: Getting started
---

# Getting started with AECDO

An open-source command-line tool for exploring, checking, and asking questions about structured data from construction drawings.

**AECDO** (AEC Drawing Ontology) is an open schema for data extracted from architecture, engineering, and construction drawings: sheets, plans, sections, details, door tags, rooms, schedules, and notes, each with its location on the page. **`aecdo`** is a free, open-source (Apache 2.0) CLI that works with **any JSON-LD file that matches the schema**, whichever tool produced it.

With `aecdo` you can:

- **Explore** a drawing set sheet by sheet, down to individual door tags and walls.
- **See** anything you select outlined in red on the original PDF page.
- **Ask** Claude or ChatGPT about what you're looking at, and have it take notes or fill in a spreadsheet for you.
- **Check** files against the schema and get summaries, for scripts, CI, or AI agents.
- **Process** PDFs into AECDO files through an optional built-in wrapper for the [DrawingBot](https://aecdrawingbot.com) API (coming soon).

## Quick start

<ol class="steps">
<li markdown="1">
**Install `aecdo`.** On macOS or Linux, in Terminal:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

Open a new terminal and check it worked with `aecdo --version`. More options are on [Install and update](install.md).
</li>
<li markdown="1">
**Try it on the demo set.** You don't need an account for this. Download the [Maple Grove Library demo](https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/maple-grove-library.jsonld) and open it:

```bash
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/maple-grove-library.jsonld
aecdo explore maple-grove-library.jsonld
```

In PowerShell, download it with `irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/maple-grove-library.jsonld -OutFile maple-grove-library.jsonld` instead.

Type `A101`, then `1`, and you're looking at the first floor plan's layers. The [demo walkthrough](demo.md) takes you through it, including two coordination issues hidden in the set.
</li>
<li markdown="1">
**Open your own files.** Any `.jsonld` file that follows the [AECDO schema](data-model.md) works. Check it, then explore it:

```bash
aecdo validate plans.jsonld
aecdo explore plans.jsonld
```
</li>
<li markdown="1">
**See it on the page.** Keep the original PDF next to the `.jsonld` (`plans.pdf` beside `plans.jsonld`). Inside `explore`, drill down with numbers, then type `view` to open the PDF page with your selection outlined in red. See [Explore a drawing set](explore.md).
</li>
<li markdown="1">
**Optional: add an AI assistant.** Run `aecdo configure ai` to sign in with ChatGPT or add an API key, then ask questions inside `explore`:

```
A101> @claude list every door on this floor and check it against the door schedule
```

See [AI assistant](assistant.md).
</li>
</ol>

Once the DrawingBot API launches, `aecdo process plans.pdf` will also turn a PDF into an AECDO file in one step. See [Process PDFs](process.md).

> **Which version do I have?** This guide describes the latest version of `aecdo`. Run `aecdo --version`. Version 0.3.2 and earlier don't have tab completion, `view`, or the AI assistant. These arrive in the next release, and `aecdo update` installs it once it's out.

## What's in this guide

| Page | What you'll learn |
|------|-------------------|
| [Install and update](install.md) | Installing on macOS, Linux, and Windows, the "Windows protected your PC" warning, tab completion, updating, and uninstalling |
| [Explore a drawing set](explore.md) | Moving around a drawing set, `view` with the red box, and the one-shot commands (`summary`, `sheets`, `page`) |
| [AI assistant](assistant.md) | Setting up Claude or ChatGPT, what the assistant can do, and project instructions in `AGENTS.md` |
| [Demo walkthrough](demo.md) | A guided tour of the 19-sheet Maple Grove Library set |
| [Data model and bbox](data-model.md) | How the data is structured, what bbox coordinates mean, and how to produce your own files |
| [Claude Code and agents](agents.md) | Letting Claude Code and other AI agents use `aecdo` |
| [Process PDFs](process.md) | The optional DrawingBot API wrapper (coming soon) |
| [Troubleshooting](troubleshooting.md) | Fixes for common problems |

## Getting help

Run `aecdo --help` for every command and option. Found a bug or have an idea? [Open an issue](https://github.com/jeff-carmichael/aecdo/issues). Want to contribute? Read [CONTRIBUTING.md](https://github.com/jeff-carmichael/aecdo/blob/main/CONTRIBUTING.md).
