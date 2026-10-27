---
title: Demo walkthrough
---

# Demo walkthrough: Maple Grove Library

The repo includes a detailed demo drawing set you can explore right away, with no account: the 100% construction documents for **Maple Grove Branch Library**, a fictional two-story, 36,000 SF public library. It has 19 sheets across general, civil, architectural, structural, mechanical, plumbing, and electrical, with about 1,000 extracted items and 28 schedules and tables.

The set has **two coordination mistakes hidden in it** on purpose. This walkthrough shows you how to find them by hand, then with the AI assistant.

## Get the demo

Make a folder for it and download the file.

macOS and Linux:

```bash
mkdir maple-grove && cd maple-grove
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/maple-grove-library.jsonld
```

Windows PowerShell:

```powershell
mkdir maple-grove; cd maple-grove
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/maple-grove-library.jsonld -OutFile maple-grove-library.jsonld
```

If you cloned the repo, it's already at `examples/maple-grove-library.jsonld`.

> The demo is data only; there's no PDF to go with it, so `view` will say it can't find the source PDF. To try `view` and markups, use the [Vancouver sample house](#real-drawings-vancouver-sample-house) below, which comes with its PDF.

## 1. Get the big picture

```bash
aecdo summary maple-grove-library.jsonld
```

```
Source: Maple_Grove_Branch_Library_100CD.pdf
19 sheet(s), 27 drawing(s), 1042 item(s)

Drawing types:
  plan: 12
  elevation: 6
  section: 3
  detail: 6

Item types:
  tag: 308
  thing: 655
  area: 79

Tables: 28
Notes: 16
Images: 27
```

And the sheet index:

```bash
aecdo sheets maple-grove-library.jsonld
```

```
  G001 - Cover Sheet (page 0)
  G002 - Code Analysis & Life Safety Plan (page 1)
  C101 - Site Plan (page 2)
  A101 - First Floor Plan (page 3)
  A102 - Second Floor Plan (page 4)
  A103 - Roof Plan (page 5)
  A201 - Exterior Elevations (page 6)
  A301 - Building & Wall Sections (page 7)
  A501 - Architectural Details (page 8)
  A601 - Door & Window Schedules (page 9)
  A701 - Room Finish Schedule (page 10)
  S001 - General Structural Notes (page 11)
  S101 - Foundation Plan (page 12)
  S201 - Second Floor & Roof Framing Plans (page 13)
  M101 - HVAC Plan - First Floor (page 14)
  M601 - Mechanical Schedules (page 15)
  P101 - Plumbing Plan - First Floor (page 16)
  E101 - Lighting Plan - First Floor (page 17)
  E601 - Electrical Panel Schedules (page 18)
```

## 2. Walk the first floor plan

```bash
aecdo explore maple-grove-library.jsonld
```

1. Type **`A101`** to open the First Floor Plan sheet. You'll see two drawings (the plan and a key plan), a Wall Types table, general notes and keynotes, and two images.
2. Type **`1`** to open the First Floor Plan drawing. The `→` lines are its callouts: building sections on A301, elevations on A201, and details on A501. Below them are 10 layers, from Grids & Dimensions to Keynotes.
3. Type **`4`** to open **Door Tags**: 26 door tags, 101A through 123A.
4. Type **`5`** to open **Door tag 105A**. It references two things: the door itself and the door schedule entry.
5. Type **`back`** and then **`3`** to open the **Doors** layer. Open door 105A there and you'll see what was read from the plan: room 105 Story Time Room, 3'-0" × 7'-0", type D, wood.

## 3. Check the door schedule

1. Type **`top`**, then **`A601`** for Door & Window Schedules.
2. Type **`3`** to open the **Door Schedule** (43 rows). Find the row for 105A:

   ```
   105A | 105 Story Time Room | 3'-0" | 7'-0" | D | Wood | HM | — | 9
   ```

   The last column is the hardware set: **9**.
3. Type **`back`**, then **`4`** to open **Hardware Sets**. The sets run from 1 to 8.

**Issue 1: door 105A calls for hardware set 9, which doesn't exist.**

## 4. Compare the second floor

1. Type **`top`**, **`A102`**, **`1`**, then open the **Door Tags** layer. Note the marks, including **209A** and **209B** for the Computer Lab.
2. Go back to the Door Schedule on A601 and look for them. 209A is there; 209B isn't.

**Issue 2: door 209B is on the second floor plan but missing from the door schedule.**

Checking every door this way takes a while on a real project, which is where the assistant comes in.

## 5. Let the assistant do the checking

Set up an assistant first with `aecdo configure ai` (see [AI assistant](assistant.md)). Then, in the same `explore` session:

```
sheet> @claude check every door tag on A101 and A102 against the door schedule and hardware sets on A601. List anything that doesn't match.
```

It reads the plans and schedules, and should come back with both issues. Then try:

```
sheet> @claude show me door 209B
sheet> @claude put every door from the schedule in doors.xlsx with columns Mark, Room, Size, Type, Hardware Set
sheet> @claude note the two door issues in notes.md as draft RFIs
```

Because the assistant works in the folder you ran `explore` from, `doors.xlsx` and `notes.md` appear in your `maple-grove` folder.

## 6. Add project instructions

Create `AGENTS.md` in the `maple-grove` folder:

```markdown
- Log every coordination issue as a row in rfi-log.csv with columns: Sheet, Item, Issue, Suggested fix.
- When checking doors, always compare the plan tags, the Door Schedule, and the Hardware Sets on A601.
- Room numbers on the plans must match the Room Finish Schedule on A701.
```

Quit `explore` and start it again, then ask:

```
sheet> @chatgpt review the first floor doors
```

The assistant prints `Using AGENTS.md from this folder` and logs what it finds to `rfi-log.csv` as your instructions say.

## More to try

- **`A701`** Room Finish Schedule: compare room names and numbers to the Room Tags layers on A101 and A102.
- **`G002`** Code Analysis & Life Safety Plan: occupancy and egress information.
- **`S001`** General Structural Notes: ask `@claude what concrete strength is specified for footings?`
- **`E601`** Electrical Panel Schedules: open a panel table and type `all` to print the whole sheet.
- **`aecdo page maple-grove-library.jsonld A601 --format json --pretty`** to see the raw data behind a sheet.

## Real drawings: Vancouver sample house

For `view` and markups you need the PDF the data came from. The repo has a second example that comes with one: the City of Vancouver's [sample drawing package for one and two family dwelling applications](https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf), a 7-page permit set for a house with a secondary suite and a detached garage. The PDF has no text layer, so its JSON-LD was written by hand from the drawings: 7 sheets, 33 drawings (site plan, floor plans, FSR overlay, elevations, sections, details, and the garage), about 300 items, the building analysis and R-value tables, and the general notes, each with a bbox on its page.

Download both files into the same folder, keeping their names, so `view` finds the PDF next to the JSON-LD. macOS and Linux:

```bash
mkdir vancouver && cd vancouver
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf
aecdo explore sample-drawing-package-1and2family.jsonld
```

Windows PowerShell:

```powershell
mkdir vancouver; cd vancouver
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld -OutFile sample-drawing-package-1and2family.jsonld
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf -OutFile sample-drawing-package-1and2family.pdf
aecdo explore sample-drawing-package-1and2family.jsonld
```

The sheets are numbered `1` to `6` as in the title blocks ("ONE OF SIX" and so on), plus `FSR` for the unnumbered FSR overlay. Open sheet `1`, pick the Site Plan, open the Buildings layer, choose the House, and type `view`: the page opens with the house outlined in red.

This is a real sample package, not a demo with planted mistakes, but a few of its numbers don't agree, which makes it a good test for the assistant:

- The Building Analysis table on sheet `1` gives side yards of 4.52 ft (east) and 4.0 ft (west) and a rear yard of 56.22 ft, while the site plan dimensions the house at 4.27 ft and 4.28 ft from the side property lines and 57.55 ft to the rear.
- The roof ridge is 332.17 ft on the site plan and the north elevation, but 332.25 ft on the south elevation and the schematic section.

Try:

```
sheet> @claude compare the yards in the Building Analysis table with the site plan dimensions, and cloud any that differ
```

The assistant proposes clouds on the page; type `view` to check them, then `markups save` to write `sample-drawing-package-1and2family-markups.pdf` next to the original. See [Marking up the PDF](assistant.md#marking-up-the-pdf).
