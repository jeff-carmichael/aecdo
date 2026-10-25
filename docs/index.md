---
title: Getting started
---

# Getting started with AECDO

Turn a PDF drawing set into structured data you can search, check, and hand to an AI assistant, all from the command line.

[AEC DrawingBot](https://aecdrawingbot.com) reads architecture, engineering, and construction drawings and extracts what's on them: sheets, plans, sections, details, door tags, rooms, schedules, notes. **AECDO** (AEC Drawing Ontology) is the open format for that data, and `aecdo` is the command-line tool that sends PDFs to DrawingBot and lets you work with the results.

With `aecdo` you can:

- **Process** a PDF through the DrawingBot API and get back a `.jsonld` file next to it.
- **Explore** the result sheet by sheet, down to individual door tags and walls.
- **See** anything you select outlined in red on the original PDF page.
- **Ask** Claude or ChatGPT about what you're looking at, and have it take notes or fill in a spreadsheet for you.
- **Check** files against the schema and get summaries, for scripts or AI agents.

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
**Connect your DrawingBot account** (one time). You need a Client ID and Client Secret from [DrawingBot API](https://aecdrawingbot.com/api).

```bash
aecdo configure
```
</li>
<li markdown="1">
**Process your own PDF.** Go to the folder with your drawings and run `process` with no file name to pick one from a list:

```bash
cd ~/Projects/my-building
aecdo process
```

When it finishes, the result is saved as `plans.jsonld` next to `plans.pdf`. See [Process PDFs](process.md).
</li>
<li markdown="1">
**Explore it, and see it on the page.**

```bash
aecdo explore plans.jsonld
```

Drill down with numbers, then type `view` to open the PDF page with your selection outlined in red. See [Explore a drawing set](explore.md).
</li>
<li markdown="1">
**Optional: add an AI assistant.** Run `aecdo configure ai` to sign in with ChatGPT or add an API key, then ask questions inside `explore`:

```
A101> @claude list every door on this floor and check it against the door schedule
```

See [AI assistant](assistant.md).
</li>
</ol>

> **Which version do I have?** This guide describes the latest version of `aecdo`. Run `aecdo --version`. Version 0.3.2 and earlier don't have the PDF picker, saving next to the PDF, tab completion, `view`, or the AI assistant. These arrive in the next release, and `aecdo update` installs it once it's out.

## What's in this guide

| Page | What you'll learn |
|------|-------------------|
| [Install and update](install.md) | Installing on macOS, Linux, and Windows, the "Windows protected your PC" warning, updating, and uninstalling |
| [Process PDFs](process.md) | Connecting your DrawingBot account, processing PDFs, where results go, scripting, and tab completion |
| [Explore a drawing set](explore.md) | Moving around a drawing set, `view` with the red box, and the one-shot commands (`summary`, `sheets`, `page`) |
| [AI assistant](assistant.md) | Setting up Claude or ChatGPT, what the assistant can do, and project instructions in `AGENTS.md` |
| [Demo walkthrough](demo.md) | A guided tour of the 19-sheet Maple Grove Library set |
| [Data model and bbox](data-model.md) | How the data is structured, and what bbox coordinates mean |
| [Claude Code and agents](agents.md) | Letting Claude Code and other AI agents use `aecdo` |
| [Troubleshooting](troubleshooting.md) | Fixes for common problems |

## Getting help

Run `aecdo --help` for every command and option. Found a bug or have an idea? [Open an issue](https://github.com/jeff-carmichael/aecdo/issues). Want to contribute? Read [CONTRIBUTING.md](https://github.com/jeff-carmichael/aecdo/blob/main/CONTRIBUTING.md).
