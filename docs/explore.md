---
title: Explore a drawing set
---

# Explore a drawing set

`aecdo explore` lets you walk through a drawing set the way you'd flip through the sheets: pick a sheet, open a drawing, open a layer, open an item. At any point you can type `view` to see what you've selected outlined on the PDF page.

```bash
aecdo explore plans.jsonld
```

Or go to the folder with your drawing sets and run `explore` with no file name. `aecdo` lists the `.jsonld` files in the folder, using the same picker as [`process`](process.md#process-a-pdf): **↑ / ↓** to move, **type** to filter, **Enter** to choose, **Esc** to cancel.

```bash
cd ~/Projects/my-building
aecdo explore
```

## Full screen

In a terminal, `explore` fills the window: the sheet list on the left, what you've opened on the right, a bar for asking the AI, and the keys that work along the bottom.

```
 Maple Grove Branch Library 100CD  ❯  A101 › First Floor Plan › Door Tags
──────────────────────────────────────────────────────────────────────────────
   G001  Cover Sheet                │ Door Tags
   C101  Site Plan                  │ 26 items on First Floor Plan, A101
 ❯ A101  First Floor Plan           │
   A102  Second Floor Plan          │ ❯ Door tag 101A
   …                                │   Door tag 101B
                                    │   …

 ❯ Ask the AI about A101 › First Floor Plan › Door Tags… press a
 ↑↓ move · Enter open · ← back · u up · v view PDF · a ask AI · ? help · q quit
```

| Key | Does |
|-----|------|
| ↑ ↓ (Page Up/Down, Home/End) | move through the list, or scroll a table or note |
| Enter or → | open what's highlighted, including a link under **Related** or **Links to other drawings** |
| ← or Esc (or `b`) | go back to where you were; after following a link, this returns to where the link was |
| `u` | go up one level, to what this is on (after following a link, this climbs the linked sheet instead) |
| `/` | find a sheet: type the start of its number (`a` lists the A sheets, `a1` the A1xx ones) or the start of words in its title (`fl pl` finds Floor Plan), then Enter (Esc leaves you where you were, and ← comes back after opening it) |
| `v` | open this page of the PDF with what's selected outlined in red |
| `a` | type a question for the AI in the bar at the bottom ([more](#asking-the-ai-in-full-screen)) |
| `m` | review markups the AI suggested, and save them |
| `d` | show or hide ids and coordinates |
| `?` | list these keys |
| `q` | quit (it offers to save pending markups first) |

While a sheet list is showing, the right side previews the highlighted sheet. A table takes the whole width while it's open, so schedules wrap as little as possible.

Reviewing markups (`m`) briefly returns to the normal terminal so you can type commands like `save`; press Enter to go back.

### Asking the AI in full screen

The bar above the keys is where you ask the [AI assistant](assistant.md). Press `a`, type a question, and press Enter. A panel opens above the bar: your question, then the answer as it's written. The drawings stay on screen above it, and when the assistant opens a sheet or drawing, it shows up there right away, and the chat notes where it went (for example "Now showing A601 › Door Schedule above").

```
── Ask the AI · Claude (claude-sonnet-5-5 via Anthropic) ──── type @name to change models ──
 ❯ which doors are fire rated?
 A101 has 26 door tags. The fire-rated ones are:

 - 101A (90 min)
 - 104B (20 min)

 ❯ ▏Type a question and press Enter
 Enter send · ↑↓ scroll · Esc close chat · @name change models
```

- The line above the chat shows which model answers and how it's reached. Questions go to the first model you've set up (Claude, then ChatGPT, Gemini, …) unless you start with another name, such as `@chatgpt which rooms have carpet?`. After that, questions without a name go to the same model. Type just a name, like `@gemini`, to switch without asking anything.
- ↑ and ↓ scroll back through long answers.
- Esc stops an answer while it's being written. Otherwise it closes the chat and goes back to moving around; press `a` to open it again with the conversation still there.
- When the assistant asks first (for example before creating a spreadsheet), type `y` or `n` in the bar and press Enter.

Windows narrower than 70 columns show one side at a time. To use the typed prompt described below instead of full screen, run `aecdo explore --classic` or set `AECDO_EXPLORE=classic`. Full screen also turns off when the window is very small (under 50 × 12), and when the output isn't a terminal.

## The typed prompt

With `--classic`, `explore` prints each list and waits for you to type. It opens on the sheet list, titled with the name of the set's PDF. Sheets are numbered from 1, and a blank line separates each discipline:

```
  Maple Grove Branch Library 100CD
  19 sheets

   1  G001  Cover Sheet
   2  G002  Code Analysis & Life Safety Plan

   3  C101  Site Plan

   4  A101  First Floor Plan
   5  A102  Second Floor Plan
   …

  Type a number or sheet number (like A101) and press Enter to open it. Type "help" for more.

sheet>
```

Type `4` or `A101` to open the First Floor Plan. If a sheet's number is itself a plain number (such as `1`), typing it opens that sheet rather than row 1. A one-line tip like the one above appears the first time you see each kind of list.

`explore` also checks the file against the schema. It only mentions this when something doesn't match, and keeps going; run `aecdo validate` to see the details.

## Sheet groups in large sets

When a set has more than 25 sheets, the sheet list shows groups first, one per sheet-number prefix (the letters before the number), with the discipline name and how many sheets each holds:

```
  Riverside Clinic CD Set
  42 sheets in 7 groups

  1  G  General         3 sheets
  2  C  Civil           4 sheets
  3  A  Architectural  18 sheets
  4  S  Structural      6 sheets
  5  M  Mechanical      4 sheets
  6  P  Plumbing        3 sheets
  7  E  Electrical      4 sheets

sheet> A
```

Type a group's number (`3`), its prefix (`A`), or its discipline name (`architectural`) to list its sheets, then a sheet's number in that list or its sheet number to open one. `up` (or `..`) from a sheet returns to its group, and `up` again returns to the groups. You can also type a sheet number (`A101`) straight from the group list. Groups appear in the order their first sheet appears in the set. Two-letter prefixes such as `AD` or `FP` get their own group, and sheet numbers with no leading letters go under **Other**. Sets with 25 sheets or fewer list every sheet directly.

## Moving around

A drawing set is organized in levels:

**Sheet list → sheet → drawing → layer → item**

A sheet holds drawings (plans, sections, elevations, details) plus tables (schedules), notes, and images. Each drawing has layers, such as Walls, Doors, Door Tags, or Room Tags, and each layer holds the items found on it.

Each screen starts with a bold name and a dim line saying where it is, such as "26 items on First Floor Plan, A101". In a terminal, names are bold and secondary details (counts, scales, row numbers) are dimmed. It uses your terminal's own color theme, so it reads on light and dark backgrounds. Set `NO_COLOR=1` to turn colors off; they are also off when the output is piped or redirected.

At every level, the prompt (in cyan) shows where you are, such as `A101 › First Floor Plan › Door Tags › Door tag 105A`, and you type one of these:

| Type | To |
|------|----|
| a sheet number or its number in the list (`A101`, `4`) | open a sheet, from the sheet list |
| a group number or prefix (`3`, `A`) | list one group's sheets, in [sets with more than 25 sheets](#sheet-groups-in-large-sets) |
| a number from the list (`1`, `4`) | open that drawing, table, note, image, layer, or item |
| `r1`, `r2`, … (or `r` if there's only one) | jump to a [reference](#following-references) |
| `up` or `..` | go up one level, to what the prompt shows before the last `›` |
| `back` or `b` | go back to where you just were, such as before a jump |
| `top` | go back to the sheet list (or the groups) |
| `ls` | print the current list again |
| `details` | show or hide ids and coordinates ([more](#ids-and-coordinates)) |
| `all` | print everything on the current sheet at once |
| `view` | open the PDF page with the current selection outlined in red |
| `markups` | list markups the assistant proposed, and save, undo, or remove them ([details](assistant.md#marking-up-the-pdf)) |
| `help` or `?` | show these commands |
| `@claude …`, `@chatgpt …`, `@grok …` (and more) | ask the [AI assistant](assistant.md); Tab completes the name |
| `quit`, `q`, or Ctrl+D | exit |

Tables print as a box with aligned columns, the first row as the header. Cells too long for your terminal wrap onto extra lines, so widen the window to see more on one line.

Here's a short session with the demo set:

```
sheet> A101

  A101  First Floor Plan
  PDF page 4

  Drawings
  1  First Floor Plan                             plan, 1/8" = 1'-0"
  2  Key Plan                                     plan

  Tables
  3  Wall Types                                   6 rows

  Notes
  4  GENERAL NOTES: 1. All dimensions are to face of stud or fac…
  5  KEYNOTES: 4.01 Brick veneer over CMU; 8.12 Aluminum storefr…

  Images
  6  Hollis Reyes Architects logo in title block  logo
  7  North arrow and graphic scale                diagram

A101> 1

  First Floor Plan
  Plan, 1/8" = 1'-0", on A101

  Layers
   1  Grids & Dimensions         16 items
   2  Walls                      27 items
   3  Doors                      26 items
   4  Door Tags                  26 items
   …

  Links to other drawings  type r1 to r10 to open one
  → [r1] Building Section 1 (A301, PDF page 8)
  → [r2] Building Section 2 (A301, PDF page 8)
  …

A101 › First Floor Plan> 4

  Door Tags
  26 items on First Floor Plan, A101

   1  Door tag 101A
   …
   5  Door tag 105A
   …

A101 › First Floor Plan › Door Tags> 5

  Door tag 105A
  Tag on Door Tags, First Floor Plan, A101

  Mark   105A

  Related  type r1 to r2 to open one
  → [r1] Table Door Schedule (A601, PDF page 10)
  → [r2] Door 105A (A101 › First Floor Plan › Doors)
```

### Following references

Lines starting with `→` are **references**: a drawing's callouts to other drawings (a section cut, an elevation marker), or an item's links to related things, such as a door tag pointing at the door schedule and at its door.

Each reference on screen has a tag, `[r1]`, `[r2]`, and so on. Type the tag to jump there: a drawing opens its layers, a schedule, note, or image prints on its sheet, and an item prints its details. Type `r` alone when there's only one reference. Type `back` to return to where you were, with the item still open so you can follow its other references. `up` instead climbs the tree of where you jumped to (from the schedule to its sheet, for example), and `back` still brings you to where the jump started.

```
A101 › First Floor Plan › Door Tags> r1

  Jumped to Table Door Schedule (A601, PDF page 10). "back" returns.

    Door Schedule
      ┌──────┬───────────┬───────┬───
      │ Mark │ Room      │ Width │ …
      …

A601 › Door Schedule> back

  Door tag 105A
  …

A101 › First Floor Plan › Door Tags › Door tag 105A> r2
```

After a jump, `view` outlines what you jumped to, so `r1` then `view` shows the schedule on its page. A reference to something that isn't in the file says so instead of jumping.

An item shows what was read from the drawing as a list of fields, like **Mark 105A** above. Which fields appear depends on what the tool that made the file extracted: a wall might have a material and thickness, a room tag a number and name. The line under the name says what kind of item it is:

- **Element**: a physical thing, such as a wall, door, window, or fixture.
- **Tag**: an annotation or symbol, such as a door tag, room tag, grid bubble, or keynote.
- **Area**: a region, such as a room or zone.

### Ids and coordinates

Type `details` to also show each item's id, its `[THING]`/`[TAG]`/`[AREA]` type, and its `bbox` (where it sits on the page, in PDF points), and the raw `data:` fields. Type `details` again to hide them. `aecdo page` always shows them.

## See it on the page: view

Type `view` (or `/view`) to open the current sheet's page from the original PDF with a **red box** around what you're looking at:

| Where you are | What's outlined |
|---------------|-----------------|
| On a sheet, nothing opened yet | Nothing; you see the whole page |
| On an open table, note, or image | That table, note, or image |
| Inside a drawing | The whole drawing |
| Inside a layer | The layer (or all of its items, if the layer has no box of its own) |
| On an open item | That item |

`aecdo` prints which sheet and page it's opening and where it saved the image, then opens it in your default viewer.

### Finding the PDF

`view` needs the original PDF. It looks:

1. next to the `.jsonld` with the same name (`plans.pdf` for `plans.jsonld`), which is also where [`aecdo process`](process.md) saves its results;
2. by the PDF file name stored in the drawing set, in the `.jsonld`'s folder and the current folder.

If your PDF is somewhere else, tell `explore` where it is, either when you start:

```bash
aecdo explore plans.jsonld --pdf ~/Downloads/plans-rev3.pdf
```

or once during the session:

```
A101> view ~/Downloads/plans-rev3.pdf
```

If it can't find the PDF, `view` names the `.jsonld` that's open, lists each path it tried and why, and lists the other PDFs in that folder (noting when one is named after a different `.jsonld`). The sheet list is titled with the name of the set's PDF, so you can check which set you're in. Of the [examples](https://github.com/jeff-carmichael/aecdo/tree/main/examples), only `sample-drawing-package-1and2family.jsonld` comes with its PDF; the Maple Grove demo and the small sample set are data only.

### Image or PDF

If [Poppler](https://poppler.freedesktop.org/) (`pdftoppm`) or MuPDF (`mutool`) is installed, the page opens as a PNG image, which opens fastest. Otherwise it opens as a one-page PDF in your PDF viewer, which works just as well. To install Poppler:

```bash
brew install poppler            # macOS (Homebrew)
sudo apt install poppler-utils  # Debian, Ubuntu
```

Poppler or MuPDF also keeps `view` quick on big sets: `aecdo` cuts out just the page it needs (`pdfseparate` or `mutool merge`) instead of reading the whole PDF. Without them, the first `view` reads the whole file, which can take 10 seconds or more on a 1000-page set; later views in the same session reuse it.

On Windows, the one-page PDF opens in your default PDF viewer, so there's nothing to install.

The files go in your system's temp folder, under `aecdo-view/`.

`view` also shows [markups](assistant.md#marking-up-the-pdf): pending ones the assistant proposed are drawn on the page, and once you've saved some, `view` opens the page from `<name>-markups.pdf` so you see them too.

If the box is drawn in the wrong place, or `aecdo` warns that it "runs past the page", the file's coordinates may use different units. See [Data model and bbox](data-model.md#bbox-coordinates).

## Quick looks without exploring

These commands print and exit, which is handy in scripts or when you know what you want:

```bash
aecdo summary plans.jsonld          # counts of sheets, drawings, item types, tables, notes, images
aecdo sheets plans.jsonld           # one line per sheet: number, title, page
aecdo page plans.jsonld A101        # everything on one sheet (by sheet number or page index)
aecdo validate plans.jsonld         # check the file against the schema
```

Add `--format json` to any of them for machine-readable output (`--pretty` to indent it), and `-o file` to write it to a file:

```bash
aecdo page plans.jsonld A601 --format json --pretty -o a601.json
```

`explore` itself notices when it isn't running in a terminal (in a script, or with `--format json`) and just prints the sheet list instead of waiting for input.
