---
title: Demo walkthrough
---

# Demo walkthrough: Maple Grove Library

`aecdo` comes with a detailed demo drawing set you can explore right away, with no account: the 100% construction documents for **Maple Grove Branch Library**, a made-up two-story, 36,000 SF public library. It has 19 sheets across general, civil, architectural, structural, mechanical, plumbing, and electrical, with about 1,000 extracted items and 28 schedules and tables.

The set has **two coordination mistakes hidden in it** on purpose. This walkthrough shows you how to find them by hand, then with the AI assistant. It takes about 15 minutes.

## Get the demo

If you said yes when the installer offered the examples, the demo is already in the `aecdo-examples` folder in your home folder. Go there in your terminal:

```bash
cd ~/aecdo-examples
```

If that says the folder doesn't exist, download the examples first, then go there:

```bash
aecdo examples ~/aecdo-examples
cd ~/aecdo-examples
```

> The demo is data only; it has no PDF, so pressing <kbd>v</kbd> says it can't find the PDF. To see things outlined on a real PDF, try the [Vancouver sample house](#real-drawings-vancouver-sample-house) at the end, which comes with its PDF.

## 1. Open the set

```bash
aecdo explore maple-grove-library.jsonld
```

`explore` fills the window. The sheets are listed on the left, and the right side previews the highlighted one. [The screen](explore.md#the-screen) explains each part. The keys you'll use:

- <kbd>↑</kbd> <kbd>↓</kbd> move the highlight
- <kbd>Enter</kbd> opens what's highlighted
- <kbd>←</kbd> goes back
- <kbd>q</kbd> quits

## 2. Walk the first floor plan

1. Press <kbd>↓</kbd> three times to highlight **A101 First Floor Plan**, then press <kbd>Enter</kbd>. The right side lists what's on the sheet: two drawings (the plan and a key plan), a Wall Types table, general notes and keynotes, and two images. Press <kbd>↓</kbd> a few times and watch the small map in the bottom-right corner: the highlighted box moves to show where each one sits on the sheet.
2. Go back up to **First Floor Plan** and press <kbd>Enter</kbd> to open the drawing. You'll see its 10 layers, from Grids & Dimensions to Keynotes. Below them, **Links to other drawings** lists its callouts: building sections on A301, elevations on A201, and details on A501.
3. Highlight **Door Tags** (26 tags, 101A through 123A) and press <kbd>Enter</kbd>.
4. Highlight **Door tag 105A** and press <kbd>Enter</kbd>. Under **Related** it links to two things: the door schedule and the door itself.
5. Highlight **Door 105A** and press <kbd>Enter</kbd> to follow that link. You'll see what was read from the plan: room 105 Story Time Room, 3'-0" × 7'-0", type D, wood. Press <kbd>←</kbd> to come back to the tag.

## 3. Check the door schedule

1. On door tag 105A, highlight **Table Door Schedule** and press <kbd>Enter</kbd>. The Door Schedule from sheet A601 fills the window (43 rows). Press <kbd>↓</kbd> to scroll down to the row for 105A:

   ```
   105A | 105 Story Time Room | 3'-0" | 7'-0" | D | Wood | HM | — | 9
   ```

   The last column is the hardware set: **9**.
2. Press <kbd>u</kbd> to go up to sheet A601, highlight **Hardware Sets**, and press <kbd>Enter</kbd>. The sets run from 1 to 8.

**Issue 1: door 105A calls for hardware set 9, which doesn't exist.**

## 4. Compare the second floor

1. Press <kbd>/</kbd> to find a sheet, type `a102`, and press <kbd>Enter</kbd>. Open the **Second Floor Plan** drawing, then its **Door Tags** layer. Note the marks, including **209A** and **209B** for the Computer Lab.
2. Press <kbd>/</kbd>, type `a601`, press <kbd>Enter</kbd>, and open the **Door Schedule** again. Scroll down looking for 209A and 209B. 209A is there; 209B isn't.

**Issue 2: door 209B is on the second floor plan but missing from the door schedule.**

Checking every door this way takes a while on a real project, which is where the assistant comes in.

## 5. Let the assistant do the checking

Set up an assistant first: press <kbd>q</kbd> to quit `explore`, run `aecdo configure ai` (see [AI assistant](assistant.md#set-it-up)), then open the demo again. Press <kbd>a</kbd>, type this, and press <kbd>Enter</kbd>:

```
check every door tag on A101 and A102 against the door schedule and hardware sets on A601. List anything that doesn't match.
```

It reads the plans and schedules, and should come back with both issues. Then try:

```
show me door 209B
```

```
put every door from the schedule in doors.xlsx with columns Mark, Room, Size, Type, Hardware Set
```

```
note the two door issues in notes.md as draft RFIs
```

"show me door 209B" moves your view to the door tag on the second floor plan; the drawings above the chat change as it goes. The assistant works in the folder you started `explore` from, so `doors.xlsx` and `notes.md` appear in your `aecdo-examples` folder.

## 6. Add project instructions

You can give the assistant standing instructions for a project. Create a file named `AGENTS.md` in the same folder (with Notepad, TextEdit, or any text editor) containing:

```markdown
- Log every coordination issue as a row in rfi-log.csv with columns: Sheet, Item, Issue, Suggested fix.
- When checking doors, always compare the plan tags, the Door Schedule, and the Hardware Sets on A601.
- Room numbers on the plans must match the Room Finish Schedule on A701.
```

Quit `explore` (<kbd>q</kbd>) and start it again, then press <kbd>a</kbd> and ask:

```
review the first floor doors
```

The chat says `Using AGENTS.md from this folder`, and the assistant logs what it finds to `rfi-log.csv` as your instructions say.

## More to try

- **A701** Room Finish Schedule: compare room names and numbers to the Room Tags layers on A101 and A102.
- **G002** Code Analysis & Life Safety Plan: occupancy and egress information.
- **S001** General Structural Notes: press <kbd>a</kbd> and ask `what concrete strength is specified for footings?`
- **E601** Electrical Panel Schedules: open a panel table to see it fill the window.
- Quick summaries without opening `explore`: quit it, then run these to get counts and the sheet list:

  ```bash
  aecdo summary maple-grove-library.jsonld
  aecdo sheets maple-grove-library.jsonld
  ```

## Real drawings: Vancouver sample house

To see things outlined on the PDF and try markups, you need the PDF the data came from. The second example comes with one: the City of Vancouver's [sample drawing package for one and two family dwelling applications](https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf), a 7-page permit set for a house with a secondary suite and a detached garage. The PDF has no text layer, so its data was written by hand from the drawings: 7 sheets, 33 drawings (site plan, floor plans, FSR overlay, elevations, sections, details, and the garage), about 300 items, the building analysis and R-value tables, and the general notes, each with its position on the page.

Both files are in the `aecdo-examples` folder:

```bash
cd ~/aecdo-examples
aecdo explore sample-drawing-package-1and2family.jsonld
```

The sheets are numbered `1` to `6` as in the title blocks ("ONE OF SIX" and so on), plus `FSR` for the unnumbered FSR overlay.

1. Open sheet **1**, then the **Site Plan** drawing.
2. Open the **Buildings** layer, then **House**.
3. Press <kbd>v</kbd>. The page opens in your image or PDF viewer with the house outlined in red.

<details markdown="1">
<summary>Downloading the two files by hand</summary>

Download both into the same folder, keeping their names, so `explore` finds the PDF next to the data. macOS and Linux:

```bash
mkdir vancouver && cd vancouver
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld
curl -sSLO https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf
```

Windows PowerShell:

```powershell
mkdir vancouver; cd vancouver
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld -OutFile sample-drawing-package-1and2family.jsonld
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf -OutFile sample-drawing-package-1and2family.pdf
```

</details>

This is a real sample package, not a demo with planted mistakes, but a few of its numbers don't agree, which makes it a good test for the assistant:

- The Building Analysis table on sheet `1` gives side yards of 4.52 ft (east) and 4.0 ft (west) and a rear yard of 56.22 ft, while the site plan dimensions the house at 4.27 ft and 4.28 ft from the side property lines and 57.55 ft to the rear.
- The roof ridge is 332.17 ft on the site plan and the north elevation, but 332.25 ft on the south elevation and the schematic section.

Press <kbd>a</kbd> and try:

```
compare the yards in the Building Analysis table with the site plan dimensions, and cloud any that differ
```

The assistant proposes clouds on the page. Press <kbd>Esc</kbd> to close the chat, then <kbd>v</kbd> to see them. To keep them, press <kbd>m</kbd>, type `save`, and press <kbd>Enter</kbd> (then <kbd>Enter</kbd> again to go back to `explore`). That writes `sample-drawing-package-1and2family-markups.pdf` next to the original. See [Marking up the PDF](assistant.md#marking-up-the-pdf).
