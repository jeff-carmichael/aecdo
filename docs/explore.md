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

It first checks the file against the schema, then lists the sheets.

## Sheet groups in large sets

When a set has more than 25 sheets, the sheet list shows groups first, one per sheet-number prefix (the letters before the number), with the discipline name and how many sheets each holds:

```
  Sheet groups (42 sheets):
     1. G - General (3 sheets)
     2. C - Civil (4 sheets)
     3. A - Architectural (18 sheets)
     4. S - Structural (6 sheets)
     5. M - Mechanical (4 sheets)
     6. P - Plumbing (3 sheets)
     7. E - Electrical (4 sheets)

sheet> A
```

Type a group's number (`3`), its prefix (`A`), or its discipline name (`architectural`) to list its sheets, then a sheet number or page index to open one. `back` from a sheet returns to its group, and `back` again returns to the groups. You can also type a sheet number (`A101`) straight from the group list. Groups appear in the order their first sheet appears in the set. Two-letter prefixes such as `AD` or `FP` get their own group, and sheet numbers with no leading letters go under **Other**. Sets with 25 sheets or fewer list every sheet directly.

## Moving around

A drawing set is organized in levels:

**Sheet list → sheet → drawing → layer → item**

A sheet holds drawings (plans, sections, elevations, details) plus tables (schedules), notes, and images. Each drawing has layers, such as Walls, Doors, Door Tags, or Room Tags, and each layer holds the items found on it.

In a terminal, the output is colored to make it easier to scan: section labels like **Drawing:** and **Tables** in cyan, **Layer:** in magenta, item types like `[THING]` and `[TAG]` in yellow, and bbox values, ids, and scales dimmed. It uses your terminal's own color theme, so it reads on light and dark backgrounds. Set `NO_COLOR=1` to turn colors off; they are also off when the output is piped or redirected.

At every level, the prompt (in green) shows where you are, and you type one of these:

| Type | To |
|------|----|
| a sheet number or page index (`A101`, `3`) | open a sheet, from the sheet list |
| a group number or prefix (`3`, `A`) | list one group's sheets, in [sets with more than 25 sheets](#sheet-groups-in-large-sets) |
| a number from the list (`1`, `4`) | open that drawing, table, note, image, layer, or item |
| `r1`, `r2`, … (or `r` if there's only one) | jump to a [reference](#following-references) |
| `back`, `..`, or `b` | go up one level, or back from a jump |
| `top` | go back to the sheet list (or the groups) |
| `ls` | print the current list again |
| `all` | print everything on the current sheet at once |
| `view` | open the PDF page with the current selection outlined in red |
| `markups` | list markups the assistant proposed, and save, undo, or remove them ([details](assistant.md#marking-up-the-pdf)) |
| `help` or `?` | show these commands |
| `@claude …`, `@chatgpt …`, `@openrouter …` (and more) | ask the [AI assistant](assistant.md); Tab completes the name |
| `quit`, `q`, or Ctrl+D | exit |

Tables print as a box with aligned columns, the first row as the header. Cells too long for your terminal wrap onto extra lines, so widen the window to see more on one line.

Here's a short session with the demo set:

```
sheet> A101

════════════════════════════════════════════════════════════
  Sheet A101 — First Floor Plan (page 3)
════════════════════════════════════════════════════════════

  Drawings (2):
     1. First Floor Plan [plan, 1/8" = 1'-0"] — 10 layers, 214 items
     2. Key Plan [plan] — 1 layer, 1 item

  Tables (1):
     3. Wall Types — 6 rows

  Notes (2):
     4. GENERAL NOTES: 1. All dimensions are to face of stud or fac…
     5. KEYNOTES: 4.01 Brick veneer over CMU; 8.12 Aluminum storefr…

  Images (2):
     6. [logo] Hollis Reyes Architects logo in title block
     7. [diagram] North arrow and graphic scale

A101> 1

  Drawing: First Floor Plan [plan, 1/8" = 1'-0"] (sheet A101)
    bbox: [140, 110, 1760, 1450]
    → [r1] Building Section 1 (A301, page 7)
    → [r2] Building Section 2 (A301, page 7)
    …

  Layers (10):
     1. Grids & Dimensions — 16 items
     2. Walls — 27 items
     3. Doors — 26 items
     4. Door Tags — 26 items
     …

A101 › First Floor Plan> 4

  Layer: Door Tags
  Items (26):
     1. [TAG] Door tag 101A
     …
     5. [TAG] Door tag 105A
     …

A101 › First Floor Plan › Door Tags> 5

      [TAG] Door tag 105A
        id:   urn:uuid:7aeb9824-195b-5531-801e-4de1b6c983d0
        bbox: [408.5, 747.5, 428.5, 767.5]
        data:
          mark: 105A
        → [r1] Table Door Schedule (A601, page 9)
        → [r2] Door 105A (A101 › First Floor Plan › Doors)
```

### Following references

Lines starting with `→` are **references**: a drawing's callouts to other drawings (a section cut, an elevation marker), or an item's links to related things, such as a door tag pointing at the door schedule and at its door.

Each reference on screen has a tag, `[r1]`, `[r2]`, and so on. Type the tag to jump there: a drawing opens its layers, a schedule, note, or image prints on its sheet, and an item prints its details. Type `r` alone when there's only one reference. Type `back` to return to where you were.

```
A101 › First Floor Plan › Door Tags> r1

  Jumped to Table Door Schedule (A601, page 9). "back" returns.

    Door Schedule
      ┌──────┬───────────┬───────┬───
      │ Mark │ Room      │ Width │ …
      …

A601> back
```

After a jump, `view` outlines what you jumped to, so `r1` then `view` shows the schedule on its page. A reference to something that isn't in the file says so instead of jumping.

Each item has a type:

- **THING**: a physical element, such as a wall, door, window, or fixture.
- **TAG**: an annotation or symbol, such as a door tag, room tag, grid bubble, or keynote.
- **AREA**: a region, such as a room or zone.

What's under `data:` depends on what the tool that made the file extracted: a wall might have `material` and `thickness`, a room tag a `number` and `name`.

## See it on the page: view

Type `view` (or `/view`) to open the current sheet's page from the original PDF with a **red box** around what you're looking at:

| Where you are | What's outlined |
|---------------|-----------------|
| On a sheet, nothing opened yet | Nothing; you see the whole page |
| After opening a table, note, or image | That table, note, or image |
| Inside a drawing | The whole drawing |
| Inside a layer | The layer (or all of its items, if the layer has no box of its own) |
| After opening an item | That item |

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
