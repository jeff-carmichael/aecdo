---
title: Use the app
---

# Use the app

The `aecdo` app is how you look through a drawing set. The sheet list is on the left, what you've opened is in the middle, and the PDF page is always on the right, with whatever you've picked outlined in red. Everything works from the keyboard, and you can keep several AI chats going at once.

## Open a drawing set

Go to the folder with your drawing set and type `aecdo`:

```bash
cd ~/aecdo-examples
aecdo
```

The app opens on **Open a drawing set**:

- **Recent** lists the sets you opened before, from any folder.
- **In** followed by the folder name lists the `.jsonld` files in the folder you started from.
- The box at the bottom takes the path to any `.jsonld` file. Press <kbd>/</kbd> to jump to it.
- **Settings** (or <kbd>,</kbd>) sets up the AI models.

Pick a set with <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd>, or click it. Press <kbd>o</kbd> later to come back here and open another set without closing the app.

To skip this screen, name the file when you start:

```bash
aecdo gui maple-grove-library.jsonld
```

(`aecdo explore` does the same.) While the app is open, the terminal waits; closing the window or pressing <kbd>q</kbd> gives it back. The folder you start from matters: it's where the [AI assistant](assistant.md) keeps its notes and spreadsheets and looks for an `AGENTS.md`.

## What you need

The window comes with the standalone `aecdo` program ([Install and update](install.md)):

- **macOS**: nothing else.
- **Windows 11**: nothing else. Windows 10 needs the [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/), which most machines already have.
- **Linux**: GTK 4 and WebKitGTK 6. On Debian or Ubuntu: `sudo apt install libwebkitgtk-6.0-4`. Fedora: `sudo dnf install webkitgtk6.0`. Arch: `sudo pacman -S webkitgtk-6.0`.

If the window can't open, `aecdo` says why and opens the app in your default browser instead. With an npm install it always opens in the browser, and `--browser` asks for the browser on purpose. The page is served only to your own computer, at an address with a random secret in it. Closing the tab (or pressing <kbd>Ctrl</kbd> <kbd>C</kbd> in the terminal) quits.

## Moving around

Pick a sheet, open a drawing, open a layer, open an item: the app works the way you'd flip through the set. Press <kbd>?</kbd> in the app for every key.

| Key | What it does |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> (or <kbd>j</kbd> <kbd>k</kbd>) | Move in the list. The row you're on is outlined on the PDF as you go. |
| <kbd>Enter</kbd> or <kbd>→</kbd> | Open it |
| <kbd>←</kbd> or <kbd>Backspace</kbd> | Go back to where you just were, even after following a link |
| <kbd>u</kbd> | Go up a level |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> … | Pick a row by its number |
| <kbd>/</kbd> | Find a sheet |
| <kbd>Tab</kbd> | Switch between the sheet list, the contents, and the PDF |
| <kbd>z</kbd> / <kbd>f</kbd> | Zoom to what's selected / fit the page |
| <kbd>+</kbd> <kbd>−</kbd>, <kbd>Shift</kbd> + arrows | Zoom, pan |
| <kbd>a</kbd> | Ask the AI about what you're looking at |
| <kbd>t</kbd> | Start another chat; <kbd>[</kbd> <kbd>]</kbd> switch chats |
| <kbd>M</kbd> | Mark up what's selected |
| <kbd>m</kbd> | Review and save markups |
| <kbd>d</kbd> | Show ids and coordinates |
| <kbd>o</kbd> | Open another drawing set |
| <kbd>,</kbd> | Settings: AI models and DrawingBot API credentials |
| <kbd>q</kbd> | Quit |

The mouse works too: click rows, click a box on the PDF to open it, scroll or pinch to zoom, drag to pan, double-click to zoom in.

While the sheet list has focus, moving through it previews each sheet: its contents in the middle and its page on the right. <kbd>Enter</kbd> opens it.

What you see in the middle:

- **A sheet** lists its drawings, tables (schedules), notes, and images.
- **A drawing** lists its layers (Walls, Doors, Door Tags, …), then **Links to other drawings**: the sections, elevations, and details it calls out.
- **A layer** lists its items.
- **An item** shows what was read from the drawing as a list of fields, like `Mark 105A`. Which fields appear depends on the tool that made the file. The line under the name says what kind of item it is: an **Element** (a physical thing, like a wall or door), a **Tag** (an annotation, like a door tag), or an **Area** (a room or zone). Below the fields, **Related** lists things it links to, such as the door schedule.
- **A table** shows the schedule as a grid.

### Following links

Rows under **Links to other drawings** and **Related** are links: open one to jump there. A door tag might link to the door schedule on A601 and to the door itself. <kbd>←</kbd> brings you back to where the link was, so you can follow its other links. <kbd>u</kbd> goes up a level where you landed instead (from the schedule to its sheet, for example).

### Find a sheet

Press <kbd>/</kbd> and start typing: the start of a sheet number (`a` lists the A sheets, `a1` the A1xx ones) or the start of words in a title (`fl pl` finds the Floor Plan sheets). <kbd>Enter</kbd> opens the sheet; <kbd>Esc</kbd> stops searching.

### Large sets

When a set has more than 25 sheets, the sheet list is grouped by discipline letter (G General, A Architectural, S Structural, and so on). <kbd>/</kbd> searches every sheet.

### Ids and coordinates

Press <kbd>d</kbd> to also show ids, item types, and each thing's `bbox` (where it sits on the page, in PDF points). See [Data model and bbox](data-model.md).

## The PDF

PDF.js draws the page inside the app. It loads only the parts of the PDF it needs, so a 1,000-page set opens as fast as a small one, and the last few pages you looked at come back instantly. Zooming and panning move the page you already have; a sharper copy of what's on screen follows a moment later.

Boxes from the data are drawn on top: dashed for everything in the list you're in, blue for the row you're on, red for what's open. Click any box to open it.

### Finding the PDF

The app needs the original PDF. The easiest setup is to keep it in the same folder as the `.jsonld`, with the same name: `plans.pdf` next to `plans.jsonld`. That's also where [`aecdo process`](process.md) saves its results. It also looks for the PDF file name stored inside the drawing set.

If it can't find the PDF, the PDF pane says where it looked and lists the PDFs in that folder to pick from. You can also name it when you start:

```bash
aecdo gui plans.jsonld --pdf "Issued for Permit.pdf"
```

If the box lands in the wrong place, the file's coordinates may not be in PDF points from the top-left. See [bbox coordinates](data-model.md#bbox-coordinates).

## AI chats

<kbd>a</kbd> opens the chat on the right. Ask about what you're looking at in plain words; the assistant sees the place you have open, can move around the set (the app follows), zoom the PDF to things, propose markups, write notes, and fill in a spreadsheet in the current folder. Set it up once in Settings (<kbd>,</kbd>). When it writes a note or a spreadsheet, the chat links to the file so you can open it. See [AI assistant](assistant.md).

Each chat is its own conversation, so you can check doors in one and ask about the structure in another. <kbd>t</kbd> (or <kbd>Ctrl</kbd>+<kbd>T</kbd>) starts a chat, the tabs at the top switch between them, and each one can use a different model. Chats last until you close the app.

## Markups

Ask the AI to cloud something, press <kbd>M</kbd> on whatever's selected, or hold <kbd>Shift</kbd> and drag a box on the PDF. Pending markups show on the page in pink. Press <kbd>m</kbd> to review them: <kbd>s</kbd> saves them to `<name>-markups.pdf`, <kbd>S</kbd> into the original PDF, <kbd>x</kbd> drops one, <kbd>u</kbd> takes back the last save. Once saved, the PDF pane shows the copy with your markups. See [Marking up the PDF](assistant.md#marking-up-the-pdf).

If you quit with markups still pending, the app asks whether to save them.

## From the terminal

The same data is available as plain commands that print and exit, for a quick count or for scripts and AI agents:

```bash
aecdo summary plans.jsonld          # counts of sheets, drawings, items, tables, notes, images
aecdo page plans.jsonld A101        # everything on one sheet
```

See [Command line and agents](agents.md) for every command.
