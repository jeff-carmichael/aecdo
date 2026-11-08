---
title: Getting started
---

# Getting started with AECDO

A free tool for looking through, checking, and asking questions about the data in construction drawing sets.

**AECDO** (AEC Drawing Ontology) is an open format for data taken from architecture, engineering, and construction drawings: sheets, plans, sections, details, door tags, rooms, schedules, and notes, each with where it sits on the page. **`aecdo`** is a free, open-source (Apache 2.0) program that opens **any file in this format** (a `.jsonld` file), whichever tool made it.

With `aecdo` you can:

- **Explore** a drawing set sheet by sheet with the arrow keys, down to single door tags and walls, with a small map of each sheet showing where things are.
- **See** anything you pick outlined in red on the original PDF page.
- **Ask** an AI model such as Claude or ChatGPT about what you're looking at, and have it take notes, fill in a spreadsheet, or cloud problems on the PDF.
- **Check** files against the format and get summaries, for scripts or AI agents.
- **Process** PDFs into AECDO files through the [DrawingBot](https://aecdrawingbot.com) API (coming soon).

## New to the command line?

`aecdo` runs in a **terminal**: a window where you type commands instead of clicking. You only need a few things to use it.

**Open a terminal.**

- **Windows:** press the Windows key, type `Terminal` (or `PowerShell` on older Windows), and press Enter.
- **macOS:** press <kbd>⌘</kbd> <kbd>Space</kbd>, type `Terminal`, and press Enter.
- **Linux:** open your Terminal app, often with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>T</kbd>.

**Run a command.** Type it (or paste it) and press <kbd>Enter</kbd>. Each grey box on this site holds a command; the button in its corner copies it. To paste into a terminal, use <kbd>Ctrl</kbd> <kbd>V</kbd> on Windows (or right-click), <kbd>⌘</kbd> <kbd>V</kbd> on macOS, or <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>V</kbd> on Linux. Lines in a box that start with `#` are notes for you, not something to type.

**Go to a folder.** A terminal is always "in" one folder, shown before the spot where you type. `cd` moves to another folder, and `aecdo` looks for drawing files in the folder you're in:

```bash
cd Documents
```

The `~` you'll see in some commands means your home folder (like `C:\Users\you` or `/Users/you`). If you get lost, `cd ~` takes you home.

**Stop or leave.** Press <kbd>q</kbd> to leave `aecdo`'s screens, or <kbd>Ctrl</kbd> <kbd>C</kbd> to stop whatever is running.

## Quick start

<ol class="steps">
<li markdown="1">
**Install `aecdo`.** On Windows, open Terminal or PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

On macOS or Linux, open Terminal and run:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

At the end, it asks whether to download the example drawing sets. Press <kbd>Enter</kbd> twice to say yes and put them in a folder called `aecdo-examples` in your home folder.

**Close the terminal and open a new one**, then check it worked:

```bash
aecdo --version
```

It should print a version number like `0.5.1`. If it says the command isn't found, see [Troubleshooting](troubleshooting.md#installing). More options are on [Install and update](install.md).
</li>
<li markdown="1">
**Open the demo drawing set.** Go to the examples folder and open the [Maple Grove Library demo](demo.md), a made-up 19-sheet set. You don't need an account.

```bash
cd ~/aecdo-examples
aecdo explore maple-grove-library.jsonld
```

(If you skipped the examples, run `aecdo examples ~/aecdo-examples` first to download them.)
</li>
<li markdown="1">
**Move around with the arrow keys.** `explore` fills the window. The list of sheets is on the left; the right side shows what you've opened, with a small map of the sheet underneath.

- Press <kbd>↓</kbd> three times to highlight **A101 First Floor Plan**, then <kbd>Enter</kbd> to open it.
- <kbd>↑</kbd> <kbd>↓</kbd> move through what's on the sheet. The map shows where the highlighted drawing, table, or note is on the page.
- <kbd>Enter</kbd> opens the highlighted thing: a drawing opens its layers (Walls, Doors, Door Tags, …), a layer opens its items.
- <kbd>←</kbd> goes back.
- <kbd>?</kbd> lists every key, and <kbd>q</kbd> quits.

The bottom line of the screen always shows the keys that work. [Explore a drawing set](explore.md) explains the screen in detail, and the [demo walkthrough](demo.md) takes you through the set, including two mistakes hidden in it.
</li>
<li markdown="1">
**Open your own files.** Any `.jsonld` file that follows the [AECDO format](data-model.md) works. Go to its folder and run `explore` with no file name to pick from a list:

```bash
cd ~/Projects/my-building
aecdo explore
```
</li>
<li markdown="1">
**See it on the page.** Keep the original PDF in the same folder with the same name (`plans.pdf` beside `plans.jsonld`). In `explore`, highlight or open something and press <kbd>v</kbd>: the PDF page opens with it outlined in red. See [Explore a drawing set](explore.md#see-it-on-the-pdf-page).
</li>
<li markdown="1">
**Optional: add an AI assistant.** Quit `explore` with <kbd>q</kbd>, then run:

```bash
aecdo configure ai
```

Pick a way to connect (sign in with ChatGPT, or paste an API key) with the arrow keys and <kbd>Enter</kbd>. Then open `explore` again, press <kbd>a</kbd>, type a question such as `which doors on this floor are fire rated?`, and press <kbd>Enter</kbd>. See [AI assistant](assistant.md).
</li>
</ol>

> **Just type `aecdo`.** With nothing after it, `aecdo` opens a menu of things to do: explore a drawing set, download the examples, check a file, set up the AI assistant, or update. Pick with <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd>. Each time, it prints the command it ran, so you can type that directly next time.

> **Which version do I have?** This guide describes the latest version. Run `aecdo --version` to check yours, and `aecdo update` to get the latest. Leave `explore` (<kbd>q</kbd>) before running other `aecdo` commands.

## What's in this guide

| Page | What you'll learn |
|------|-------------------|
| [Install and update](install.md) | Installing on Windows, macOS, and Linux, the "Windows protected your PC" warning, updating, and uninstalling |
| [Explore a drawing set](explore.md) | The `explore` screen, its keys, the sheet map, seeing things on the PDF, and quick one-line commands |
| [AI assistant](assistant.md) | Setting up Claude, ChatGPT, or another model, what the assistant can do, and marking up PDFs |
| [Demo walkthrough](demo.md) | A guided tour of the 19-sheet Maple Grove Library set |
| [Data model and bbox](data-model.md) | How the data is organized, what the coordinates mean, and how to make your own files |
| [Claude Code and agents](agents.md) | Letting Claude Code and other AI agents use `aecdo` |
| [Process PDFs](process.md) | Turning PDFs into AECDO files with the DrawingBot API (coming soon) |
| [Troubleshooting](troubleshooting.md) | Fixes for common problems |

## Getting help

Type `aecdo` for the menu, or `aecdo --help` for every command and option. Found a bug or have an idea? [Open an issue](https://github.com/jeff-carmichael/aecdo/issues). Want to contribute? Read [CONTRIBUTING.md](https://github.com/jeff-carmichael/aecdo/blob/main/CONTRIBUTING.md).
