---
title: Getting started
---

# Getting started with aecdo

A free app for looking through, checking, and asking questions about the data in construction drawing sets.

![The aecdo app: sheets on the left, a floor plan's rooms in the middle, the PDF on the right with the selected room outlined](assets/app.png){: .shot}

**AECDO** (AEC Drawing Ontology) is an open format for the data in architecture, engineering, and construction drawings: sheets, plans, sections, details, door tags, rooms, schedules, and notes, each with where it sits on the page. **aecdo** is a free, open-source app that opens any drawing set in this format (a `.jsonld` file), whichever tool made it.

In the app you can:

- **Look through** a set sheet by sheet, down to single door tags and walls, with the PDF page beside it and whatever you pick outlined.
- **Ask** an AI model such as Claude or ChatGPT about what you're looking at, and have it take notes or fill in a spreadsheet.
- **Mark up** the PDF with clouds, callouts, and notes that Bluebeam and Acrobat open as normal markups.

## Quick start

<ol class="steps">
<li markdown="1">
**Install aecdo.** Open a terminal (on Windows, press the Windows key, type `PowerShell`, and press Enter; on a Mac, press <kbd>⌘</kbd> <kbd>Space</kbd>, type `Terminal`, and press Enter). Paste the line for your computer and press <kbd>Enter</kbd>. The button in the corner of each box copies it.

Windows:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

macOS or Linux:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

At the end, it offers the example drawing set. Press <kbd>Enter</kbd> twice to put it in `aecdo-examples` in your home folder. That's the only time you need the terminal. More on [Install and update](install.md).
</li>
<li markdown="1">
**Open the app** like any other: **aecdo** in the Start menu (Windows), in Applications, Launchpad, or Spotlight (macOS), or in your app menu (Linux).
</li>
<li markdown="1">
**Open the example.** Click **Open another folder…** (or press <kbd>o</kbd>), choose `aecdo-examples` in your home folder, and pick **sample-drawing-package-1and2family**. It's the [Vancouver sample house](demo.md), a real 7-page permit set with its PDF.
</li>
<li markdown="1">
**Move around** with the arrow keys or the mouse. <kbd>↓</kbd> to sheet **2 Floor Plans**, <kbd>Enter</kbd> to open it, <kbd>Enter</kbd> again to open a drawing's layers and items, <kbd>←</kbd> to go back. What you pick is outlined on the PDF. Press <kbd>?</kbd> for every key. See [Use the app](app.md).
</li>
<li markdown="1">
**Optional: add an AI assistant.** Press <kbd>,</kbd> for **Settings** and **Sign in with ChatGPT** or paste an API key. Then press <kbd>a</kbd> and ask something like `which rooms on this floor have windows?`. See [AI assistant](assistant.md).
</li>
</ol>

For your own drawings, keep each set's PDF beside it with the same name (`plans.pdf` next to `plans.jsonld`), and open the folder they're in.

## Getting help

In the app, press <kbd>?</kbd> for every key. The [Troubleshooting](troubleshooting.md) page covers common problems. Found a bug or have an idea? [Open an issue](https://github.com/jeff-carmichael/aecdo/issues).

Using aecdo from scripts or an AI coding agent such as Claude Code? See [Command line and agents](agents.md).
