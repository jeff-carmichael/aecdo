---
title: The app (preview)
---

# The app (preview)

`aecdo gui` opens a desktop window for a drawing set: the sheet list on the left, what you've opened in the middle, and the PDF page always on the right, with whatever you've selected outlined in red. It works like `explore`, so the same keys move you around, but you never have to ask to see the page, and you can keep several AI chats going at once.

This is a preview. `explore` stays as it is.

## Open it

```bash
aecdo gui plans.jsonld
```

Leave out the file name to choose one in the window from the sets in the current folder and the ones you opened recently. You can also type just `aecdo` and choose **Open the app**.

The PDF is found the same way as for `explore`'s `view`: `<name>.pdf` next to the `.jsonld`, or the file named in the set. If it isn't there, the PDF pane lists the PDFs in that folder to pick from, or start with `--pdf`:

```bash
aecdo gui plans.jsonld --pdf "Issued for Permit.pdf"
```

## What you need

The window comes with the standalone `aecdo` binary ([Install and update](install.md)):

- **macOS**: nothing else.
- **Windows 11**: nothing else. Windows 10 needs the [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/), which most machines already have.
- **Linux**: GTK 4 and WebKitGTK 6. On Debian or Ubuntu: `sudo apt install libwebkitgtk-6.0-4`. Fedora: `sudo dnf install webkitgtk6.0`. Arch: `sudo pacman -S webkitgtk-6.0`.

If the window can't open, `aecdo` says why and opens the app in your default browser instead. With an npm install it always opens in the browser. `--browser` asks for the browser on purpose. The page is served only to your own computer, at an address with a random secret in it, and closing the tab (or pressing Ctrl+C in the terminal) quits.

## The keys

Everything works from the keyboard. Press <kbd>?</kbd> in the app for the full list.

| Key | What it does |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> (or <kbd>j</kbd> <kbd>k</kbd>) | Move in the list. The row you're on is outlined on the PDF as you go. |
| <kbd>Enter</kbd> or <kbd>→</kbd> | Open it |
| <kbd>←</kbd> or <kbd>Backspace</kbd> | Go back to where you just were, even after following a link |
| <kbd>u</kbd> | Go up a level |
| <kbd>/</kbd> | Find a sheet by number or title words, like `/` in `explore` |
| <kbd>Tab</kbd> | Switch between the sheet list, the contents, and the PDF |
| <kbd>z</kbd> / <kbd>f</kbd> | Zoom to what's selected / fit the page |
| <kbd>+</kbd> <kbd>−</kbd>, <kbd>Shift</kbd> + arrows | Zoom, pan |
| <kbd>a</kbd> | Ask the AI about what you're looking at |
| <kbd>t</kbd> | Start another chat; <kbd>[</kbd> <kbd>]</kbd> switch chats |
| <kbd>M</kbd> | Mark up what's selected |
| <kbd>m</kbd> | Review and save markups |
| <kbd>d</kbd> | Show ids and coordinates |
| <kbd>o</kbd> | Open another drawing set |
| <kbd>q</kbd> | Quit |

The mouse works too: click rows, click a box on the PDF to open it, scroll or pinch to zoom, drag to pan, double-click to zoom in.

While the sheet list has focus, moving through it previews each sheet: its contents in the middle and its page on the right. <kbd>Enter</kbd> opens it.

## The PDF

PDF.js draws the page inside the app. It loads only the parts of the PDF it needs, so a 1,000-page set opens as fast as a small one, and the last few pages you looked at come back instantly. Zooming and panning move the page you already have; a sharper copy of what's on screen follows a moment later.

Boxes from the data are drawn on top: dashed for everything in the list you're in, blue for the row you're on, red for what's open. Click any box to open it.

## AI chats

<kbd>a</kbd> opens the chat on the right. It's the same assistant as `@claude` in `explore` (set it up with `aecdo configure ai`): it sees the place you have open, can move around the set (the app follows), point at things on the PDF, propose markups, write notes to `notes.md`, and fill in a spreadsheet in the current folder. When it wants to change a file, the app asks you first.

Each chat is its own conversation, so you can check doors in one and ask about the structure in another. <kbd>t</kbd> (or <kbd>Ctrl</kbd>+<kbd>T</kbd>) starts a chat, the tabs at the top switch between them, and each one can use a different model: type `@gemini` to switch the chat you're in, or pick from the list under the input. Sheet numbers in answers are links. <kbd>Esc</kbd> stops an answer.

Chats last until you close the app.

## Markups

Markups are the same as in `explore`, written into the PDF so Bluebeam and Acrobat can read them. Ask the AI to cloud something, press <kbd>M</kbd> on whatever's selected, or hold <kbd>Shift</kbd> and drag a box on the PDF. Pending markups show on the page in pink. Press <kbd>m</kbd> to review them: <kbd>s</kbd> saves them to `<name>-markups.pdf`, <kbd>S</kbd> into the original PDF, <kbd>x</kbd> drops one, <kbd>u</kbd> takes back the last save. Once saved, the PDF pane shows the copy with your markups.

If you quit with markups still pending, the app asks whether to save them.
