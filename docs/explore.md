---
title: Explore a drawing set
---

# Explore a drawing set

`aecdo explore` lets you look through a drawing set the way you'd flip through the sheets: pick a sheet, open a drawing, open a layer, open an item. Everything works with the arrow keys, and at any point you can press <kbd>v</kbd> to see what you've picked outlined on the PDF page.

## Open a drawing set

In a terminal, go to the folder with your drawing set and run `explore` with the file name:

```bash
cd ~/Projects/my-building
aecdo explore plans.jsonld
```

Or leave out the file name, and `aecdo` lists the `.jsonld` files in the folder for you to pick from: <kbd>↑</kbd> <kbd>↓</kbd> to move, type to filter, <kbd>Enter</kbd> to choose, <kbd>Esc</kbd> to cancel.

```bash
aecdo explore
```

You can also type just `aecdo` and choose **Explore a drawing set** from the menu.

New to the terminal? See [New to the command line?](index.md#new-to-the-command-line) first.

## The screen

`explore` fills the terminal window. This is the demo set with sheet A101 open:

```
 Maple Grove Branch Library 100CD  ❯  A101
────────────────────────────────────────────────────────────────────────────────
   G001  Cover Sheet           │ A101  First Floor Plan
   G002  Code Analysis & Life… │ PDF page 4
   C101  Site Plan             │
 ❯ A101  First Floor Plan      │ Drawings
   A102  Second Floor Plan     │ ❯ First Floor Plan  plan, 1/8" = 1'-0"
   A103  Roof Plan             │   Key Plan          plan
   A201  Exterior Elevations   │
   A301  Building & Wall Sect… │ Tables
   A501  Architectural Details │   Wall Types  6 rows
   A601  Door & Window Schedu… │
   A701  Room Finish Schedule  │ Notes
   S001  General Structural N… │   ↓ 6 more
   S101  Foundation Plan       ├────────────────────────────────────────────────
   S201  Second Floor & Roof … │        ╭──────────────────────────────╮
   M101  HVAC Plan - First Fl… │        │  ┏━━━━━━━━━━━━━━━━┓ ▪        │
   M601  Mechanical Schedules  │        │  ┃                ┃          │
   P101  Plumbing Plan - Firs… │        │  ┃                ┃ ▪        │
   E101  Lighting Plan - Firs… │        │  ┃                ┃ ┌──┐     │
   E601  Electrical Panel Sch… │        │  ┃                ┃ └──┘     │
                               │        │  ┗━━━━━━━━━━━━━━━━┛          │
                               │        │                     ▪    ▪   │
                               │        ╰──────────────────────────────╯

 ❯ Ask the AI about A101… press a
 ↑↓ move · Enter open · ← back · u up · v view PDF · a ask AI · ? help · q quit
```

From top to bottom:

- **The top line** names the drawing set and where you are, such as `A101 › First Floor Plan › Door Tags`.
- **The left column** lists the sheets, with the open one marked `❯`.
- **The right column, top half,** shows what you've opened. The `❯` marks the highlighted line, the one <kbd>Enter</kbd> opens. `↓ 6 more` means the list continues; keep pressing <kbd>↓</kbd>.
- **The right column, bottom-right corner,** has a small [map of the sheet](#the-sheet-map).
- **The chat bar** is where you [ask the AI](#ask-the-ai).
- **The bottom line** lists the keys that work right now.

## Moving around

A drawing set is organized in levels, like folders inside folders:

**Sheet list → sheet → drawing → layer → item**

A sheet holds drawings (plans, sections, elevations, details) plus tables (schedules), notes, and images. Each drawing has layers, such as Walls, Doors, Door Tags, or Room Tags, and each layer holds the items found on it, such as one door tag.

You start on the sheet list. Highlight a sheet with <kbd>↑</kbd> <kbd>↓</kbd> (the right side previews it), press <kbd>Enter</kbd> to open it, and keep going down a level the same way. <kbd>←</kbd> takes you back.

| Key | What it does |
|-----|--------------|
| <kbd>↑</kbd> <kbd>↓</kbd> | move the highlight (or scroll a table or note). <kbd>Page Up</kbd> <kbd>Page Down</kbd> jump a screen, <kbd>Home</kbd> <kbd>End</kbd> go to the top or bottom |
| <kbd>Enter</kbd> or <kbd>→</kbd> | open what's highlighted |
| <kbd>←</kbd> or <kbd>Esc</kbd> | go back to where you were |
| <kbd>u</kbd> | go up one level, to what this is on |
| <kbd>/</kbd> | find a sheet ([more](#find-a-sheet)) |
| <kbd>v</kbd> | open this page of the PDF, with what you picked outlined in red ([more](#see-it-on-the-pdf-page)) |
| <kbd>a</kbd> | ask the AI a question ([more](#ask-the-ai)) |
| <kbd>m</kbd> | review and save markups the AI suggested |
| <kbd>d</kbd> | show or hide ids and coordinates |
| <kbd>?</kbd> | list these keys (any key closes the list) |
| <kbd>q</kbd> | quit (it offers to save markups first, if there are any) |

What you see at each level:

- **A sheet** lists its drawings, tables, notes, and images.
- **A drawing** lists its layers and how many items each has. Below them, **Links to other drawings** lists the drawing's callouts, such as section cuts and elevation markers.
- **A layer** lists its items.
- **An item** shows what was read from the drawing as a list of fields, like `Mark 105A`. Which fields appear depends on the tool that made the file: a wall might have a material and thickness, a room tag a number and name. The line under the name says what kind of item it is: an **Element** (a physical thing, like a wall, door, or fixture), a **Tag** (an annotation, like a door tag or keynote), or an **Area** (a room or zone). Below the fields, **Related** lists things it links to, such as the door schedule.
- **A table** (a schedule) fills the whole window, with the sheet list out of the way, so wide schedules fit. <kbd>↑</kbd> <kbd>↓</kbd> scroll it.

### Following links

Lines under **Links to other drawings** and **Related** are links: highlight one and press <kbd>Enter</kbd> to jump there. A door tag might link to the door schedule on A601 and to the door itself. A note at the bottom of the screen says where you jumped.

<kbd>←</kbd> brings you back to where the link was, so you can follow its other links. If you'd rather look around where you landed, <kbd>u</kbd> goes up a level there instead (from the schedule to its sheet, for example), and <kbd>←</kbd> still brings you back afterwards.

### Find a sheet

Press <kbd>/</kbd> and start typing. The sheet list narrows as you type:

- the start of a sheet number: `a` lists the A sheets, `a1` the A1xx ones;
- or the start of words in a title: `fl pl` finds the Floor Plan sheets.

Use <kbd>↑</kbd> <kbd>↓</kbd> to pick one and <kbd>Enter</kbd> to open it. <kbd>Esc</kbd> stops searching and leaves you where you were; after opening a sheet, <kbd>←</kbd> takes you back.

### Large sets

When a set has more than 25 sheets, the sheet list shows groups first, one per discipline letter (G General, A Architectural, S Structural, and so on) with how many sheets each has. Open a group with <kbd>Enter</kbd> to see its sheets. <kbd>/</kbd> still searches every sheet.

### Ids and coordinates

Press <kbd>d</kbd> to also show ids, item types, and each thing's `bbox` (where it sits on the page, in PDF points). Press <kbd>d</kbd> again to hide them. See [Data model and bbox](data-model.md).

## The sheet map

The bottom-right corner of the right column holds a small map of the sheet, drawn from where each drawing, table, note, and image sits on the page. It's there to help you find your way: the box for the highlighted thing has thick, colored lines, so as you move up and down the list you can see which part of the sheet you're on. While you're inside a drawing (its layers and items), the drawing's box stays highlighted. Things too small to draw as a box show as a dot.

The map keeps the shape of the page and stays small, like a footnote, so the list above it keeps the full width. The rows beside it are shortened a little to make room. It needs some room, so it's hidden in short windows (and while a table is open). Make the window taller, or close the AI chat with <kbd>Esc</kbd>, to bring it back.

The data doesn't record the page size, so the map assumes the smallest standard sheet size (from Letter up to ARCH E) that holds everything on the sheet. If nothing on a sheet reaches its edges, the map may be a little off in shape.

## See it on the PDF page

Press <kbd>v</kbd> to open the current sheet's page from the original PDF with a **red box** around what you're looking at:

| Where you are | What's outlined |
|---------------|-----------------|
| On a sheet | Nothing; you see the whole page |
| On an open table, note, or image | That table, note, or image |
| Inside a drawing | The whole drawing |
| Inside a layer | The layer (or all of its items) |
| On an open item | That item |

The page opens in your normal image or PDF viewer. To outline one door, open the item (not just its layer) before pressing <kbd>v</kbd>.

### Finding the PDF

`v` needs the original PDF. The easiest setup is to keep it in the same folder as the `.jsonld`, with the same name: `plans.pdf` next to `plans.jsonld`. That's also where [`aecdo process`](process.md) saves its results. It also looks for the PDF file name stored inside the drawing set.

If your PDF is somewhere else, say where when you start:

```bash
aecdo explore plans.jsonld --pdf ~/Downloads/plans-rev3.pdf
```

If it can't find the PDF, `explore` lists the places it looked and the other PDFs in that folder. Of the examples, only `sample-drawing-package-1and2family.jsonld` comes with its PDF; the Maple Grove demo is data only.

### Image or PDF

If [Poppler](https://poppler.freedesktop.org/) (`pdftoppm`) or MuPDF (`mutool`) is installed, the page opens as a PNG image, which is fastest. Otherwise it opens as a one-page PDF in your PDF viewer, which works just as well. On Windows, there's nothing to install. On macOS or Linux, to install Poppler:

```bash
brew install poppler            # macOS (needs Homebrew)
sudo apt install poppler-utils  # Debian, Ubuntu
```

Poppler or MuPDF also keeps `v` quick on big sets. Without them, the first `v` reads the whole PDF, which can take 10 seconds or more on a 1000-page set; later ones in the same session are quick. The files go in your system's temp folder, under `aecdo-view/`.

The page also shows [markups](assistant.md#marking-up-the-pdf) the assistant has proposed or you've saved.

If the box is drawn in the wrong place, or `explore` warns that it "runs past the page", the file's coordinates may use different units. See [Data model and bbox](data-model.md#bbox-coordinates).

## Ask the AI

Once you've [set up an AI assistant](assistant.md#set-it-up), press <kbd>a</kbd>, type a question, and press <kbd>Enter</kbd>. A chat panel opens above the bar with your question, then the answer as it's written. The drawings stay on screen above it, and when the assistant opens a sheet or drawing for you, it shows up there right away.

```
── Ask the AI · Claude (claude-sonnet-5-5 via Anthropic) ──── type @name to change models ──
 ❯ which doors are fire rated?
 A101 has 26 door tags. The fire-rated ones are:

 - 101A (90 min)
 - 104B (20 min)

 ❯ ▏Type a question and press Enter
 Enter send · ↑↓ scroll · Esc close chat · @name change models
```

- The line above the chat shows which model answers. To ask another one, start with its name, such as `@chatgpt which rooms have carpet?`, or type just `@gemini` to switch.
- <kbd>↑</kbd> <kbd>↓</kbd> scroll back through long answers.
- <kbd>Esc</kbd> stops an answer while it's being written. Otherwise <kbd>Esc</kbd> closes the chat so the arrow keys move around the set again. Press <kbd>a</kbd> to open it again; the conversation is still there.
- When the assistant asks first (for example, before changing a spreadsheet), type `y` or `n` and press <kbd>Enter</kbd>.

While the chat is open, keys like <kbd>q</kbd> and <kbd>v</kbd> type letters into your question. Press <kbd>Esc</kbd> first to use them.

See [AI assistant](assistant.md) for what it can do.

## Running other aecdo commands

Commands like `aecdo configure ai` or `aecdo update` can't run inside `explore`. Leave it first: press <kbd>q</kbd> (or <kbd>Esc</kbd> then <kbd>q</kbd> if the chat is open), run the command, then start `explore` again. When `explore` or the assistant suggests one of these commands, it reminds you to quit first.

## Small windows and the typed prompt

- Windows narrower than 70 columns show one column at a time.
- Full screen turns off when the window is very small (under 50 × 12) and when `explore` isn't running in a terminal (in a script, for example).

If you'd rather type commands than use the arrow keys, start with `--classic`, or set `AECDO_EXPLORE=classic` to make it the default:

```bash
aecdo explore plans.jsonld --classic
```

It prints each list with numbers and waits at a prompt such as `A101 › First Floor Plan>`. Type a number (or a sheet number like `A101`) and press <kbd>Enter</kbd> to open it:

```
sheet> A101

  A101  First Floor Plan
  PDF page 4

  Drawings
  1  First Floor Plan                             plan, 1/8" = 1'-0"
  2  Key Plan                                     plan

  Tables
  3  Wall Types                                   6 rows
  …

A101> 1
```

| Type | To |
|------|----|
| a number from the list, or a sheet number (`4`, `A101`) | open it |
| a group number or letter (`3`, `A`) | list one group's sheets, in sets with more than 25 sheets |
| `r1`, `r2`, … | follow a link, shown as `→ [r1] …` |
| `up` or `..` | go up one level |
| `back` or `b` | go back to where you just were, such as before following a link |
| `top` | go back to the sheet list |
| `ls` | print the current list again |
| `all` | print everything on the current sheet at once |
| `details` | show or hide ids and coordinates |
| `view` | open the PDF page with the current selection outlined in red (`view path/to/plans.pdf` if it can't find the PDF) |
| `markups` | list markups the assistant proposed, and save, undo, or remove them ([details](assistant.md#marking-up-the-pdf)) |
| `@claude …`, `@chatgpt …` (and more) | ask the [AI assistant](assistant.md); <kbd>Tab</kbd> completes the name |
| `help` or `?` | show these commands |
| `quit`, `q`, or <kbd>Ctrl</kbd> <kbd>D</kbd> | exit |

If a sheet's number is itself a plain number (such as `1`), typing it opens that sheet rather than row 1. Colors follow your terminal's theme; set `NO_COLOR=1` to turn them off.

## Quick looks without exploring

These commands print their answer and finish, which is handy when you know what you want, or in scripts:

```bash
aecdo summary plans.jsonld          # counts of sheets, drawings, items, tables, notes, images
aecdo sheets plans.jsonld           # one line per sheet: number, title, page
aecdo page plans.jsonld A101        # everything on one sheet (by sheet number or page index)
aecdo validate plans.jsonld         # check the file against the AECDO format
```

`explore` also checks the file when it opens, and only mentions it when something doesn't match. Run `aecdo validate` to see the details.

Add `--format json` to any of these for machine-readable output (`--pretty` to indent it), and `-o file` to save it to a file:

```bash
aecdo page plans.jsonld A601 --format json --pretty -o a601.json
```

When `explore` isn't running in a terminal (in a script, or with `--format json`), it prints the sheet list and finishes instead of waiting for keys.
