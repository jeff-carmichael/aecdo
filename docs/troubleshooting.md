---
title: Troubleshooting
---

# Troubleshooting

## Installing and opening

**The app doesn't open from its icon**
: Each launch writes what it did, and any error, to `app.log` in the `.aecdo` folder in your home folder (`%USERPROFILE%\.aecdo\app.log` on Windows). [Open an issue](https://github.com/jeff-carmichael/aecdo/issues) with it if the cause isn't clear.

**There's no aecdo icon**
: Open a terminal and run `aecdo shortcut` once to add it.

**"Windows protected your PC"**
: aecdo isn't code-signed yet. Install with the [PowerShell line](install.md#windows) to avoid the warning, or click **More info → Run anyway**.

**It opened in my browser instead of a window**
: On Linux, install WebKitGTK 6 (see [Install and update](install.md#macos-and-linux)). On Windows 10, install the [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

**`aecdo update` says permission denied**
: On macOS and Linux, run `sudo aecdo update`.

## The app

**The PDF pane says it can't find the PDF**
: Pick one from the list in the pane, or put the PDF beside the drawing set with the same name (`plans.pdf` next to `plans.jsonld`). See [The PDF](app.md#the-pdf).

**Boxes land in the wrong place on the PDF**
: The set's coordinates may not be in PDF points from the top-left of the page. See [bbox coordinates](data-model.md#bbox-coordinates).

**Some text on the PDF is missing or looks wrong**
: Pages with Chinese, Japanese, or Korean fonts that aren't embedded in the PDF may not draw their text. Open the page in your PDF reader to check.

**Keys type into the chat instead of moving around**
: The chat has focus. Press <kbd>Esc</kbd> (or <kbd>Tab</kbd>) to move back to the lists.

**A markup won't save on Windows**
: The markup copy is open in Bluebeam or Acrobat. Close it there and try again.

## AI assistant

**`Claude isn't set up yet` (or ChatGPT, Gemini, …)**
: That model isn't connected. Press <kbd>,</kbd> to open Settings and set it up.

**The assistant didn't follow my AGENTS.md**
: It's read the first time you ask something after the app opens. Restart the app after editing it, check for the `Using AGENTS.md from this folder` line, and make sure the file is in the app's current folder.

**The assistant can't find my spreadsheet**
: It only sees files in the app's current folder. Move the spreadsheet there, or open that folder with **Open another folder…**.

## Still stuck?

[Open an issue](https://github.com/jeff-carmichael/aecdo/issues) with what you did, what happened, and the output of `aecdo --version` in a terminal.
