---
title: Use the app
---

# Use the app

The sheet list is on the left, what you've opened is in the middle, and the PDF page is on the right, with whatever you've picked outlined. Everything works with the keyboard or the mouse.

## Open a drawing set

Open **aecdo** from the Start menu (Windows), Applications, Launchpad, or Spotlight (macOS), or your app menu (Linux). It opens in the folder you used last.

The first screen, **Open a drawing set**, shows the folder you're working in:

- The drawing sets (`.jsonld` files) in that folder come first, with the one you opened last already selected.
- **Recent** lists sets and folders you've used elsewhere.
- **Open another folder…** (or <kbd>o</kbd>) shows your computer's folder picker, like *Open Folder* in an editor. <kbd>/</kbd> lets you type a path instead.
- **Settings** (or <kbd>,</kbd>) sets up the AI models.
- The moon at the top right switches to dark mode (the sun switches back). See [Light and dark](#light-and-dark).

Pick a set with <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd>, or click it. Press <kbd>o</kbd> any time to come back here and open another set.

The folder matters: it's where the [AI assistant](assistant.md) keeps its notes and spreadsheets, and where it looks for an `AGENTS.md`. Opening a set from another folder switches to that folder.

## Moving around

Pick a sheet, open a drawing, open a layer, open an item: it works the way you'd flip through the set. Press <kbd>?</kbd> in the app for every key.

| Key | What it does |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move in the list. The row you're on is outlined on the PDF as you go. |
| <kbd>Enter</kbd> or <kbd>→</kbd> | Open it |
| <kbd>←</kbd> | Go back to where you just were, even after following a link |
| <kbd>u</kbd> | Go up a level |
| <kbd>/</kbd> | Find a sheet |
| <kbd>Tab</kbd> | Switch between the sheet list, the contents, and the PDF |
| <kbd>z</kbd> / <kbd>f</kbd> | Zoom to what's selected / fit the page |
| <kbd>a</kbd> | Ask the AI |
| <kbd>M</kbd> / <kbd>m</kbd> | Mark up what's selected / list markups |
| <kbd>o</kbd> | Open another drawing set |
| <kbd>,</kbd> | Settings |
| <kbd>q</kbd> | Quit |

The mouse works too: click rows, click a box on the PDF to open it, scroll or pinch to zoom, drag to pan, double-click to zoom in.

What you see in the middle:

- **A sheet** lists its drawings, tables (schedules), notes, and images.
- **A drawing** lists its layers (Walls, Doors, Door Tags, …), then **Links to other drawings**: the sections, elevations, and details it calls out.
- **A layer** lists its items.
- **An item** shows what was read from the drawing, like `Mark 105A`. It's an **Element** (a physical thing, like a wall or door), a **Tag** (an annotation, like a door tag), or an **Area** (a room or zone). **Related** lists things it links to, such as the door schedule.
- **A table** shows the schedule as a grid.

Rows under **Links to other drawings** and **Related** jump there when you open them. <kbd>←</kbd> brings you back.

To find a sheet, press <kbd>/</kbd> and type the start of its number (`a1` lists the A1xx sheets) or of words in its title (`fl pl` finds the floor plans). Sets with more than 25 sheets are grouped by discipline (General, Architectural, Structural, …).

Press <kbd>d</kbd> to also show ids and coordinates. See [Data model and bbox](data-model.md).

## The PDF

The page draws inside the app, and only the parts it needs load, so a 1,000-page set opens as fast as a small one. Boxes from the data are drawn on top: dashed for everything in the list you're in, blue for the row you're on, red for what's open. Click a box to open it.

The app looks for the PDF beside the drawing set with the same name (`plans.pdf` next to `plans.jsonld`), and for the file name stored in the set. If it can't find it, the PDF pane says where it looked and lists the PDFs in that folder to pick from.

If boxes land in the wrong place, the set's coordinates may not be in the expected units. See [bbox coordinates](data-model.md#bbox-coordinates).

## AI chats

Press <kbd>a</kbd> to ask about what you're looking at. The assistant can move around the set (the app follows), zoom the PDF to things, mark it up, write notes, and fill in a spreadsheet. <kbd>t</kbd> starts another chat, each with its own conversation and model; the tabs at the top switch between them. <kbd>Esc</kbd> leaves the chat. See [AI assistant](assistant.md).

## Markups

Press <kbd>M</kbd> on whatever's selected, hold <kbd>Shift</kbd> and drag a box on the PDF, or ask the AI to cloud something. Markups are saved as you add them, to a copy of the PDF, and your original isn't changed. See [Mark up the PDF](markups.md).

## Light and dark

The app starts out matching your computer's light or dark setting. Click the moon at the top right for dark mode, or the sun for light; the app remembers your choice next time. To follow the computer again, open Settings (<kbd>,</kbd>) and pick **Match the computer** under **Look**.

## Turning PDFs into drawing sets

Coming soon: the home screen will list PDFs in your folder that don't have a drawing set yet, and picking one will turn it into one through the [DrawingBot](https://aecdrawingbot.com) service. Until then, aecdo opens sets made by any tool.
