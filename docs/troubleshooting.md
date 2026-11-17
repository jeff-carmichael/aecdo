---
title: Troubleshooting
---

# Troubleshooting

**The app doesn't open from its icon**
: Check `.aecdo/app.log` in your home folder for the error.

**No aecdo icon**
: Run `aecdo shortcut` in a terminal.

**It opened in my browser**
: Linux needs WebKitGTK 6. Windows 10 needs [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). See [Install](install.md).

**The PDF is missing**
: Pick it from the list in the PDF pane, or put it beside the set with the same name.

**Boxes are in the wrong place**
: If a strip above the PDF says it doesn't match the drawing data, the PDF isn't the one the set was made from (perhaps a later revision): open the right PDF, or process this one again. Otherwise the set's coordinates are off. See [bbox coordinates](data-model.md#bbox-coordinates).

**Keys type into the chat**
: Press <kbd>Esc</kbd>.

**A markup won't save (Windows)**
: Close the markup copy in Bluebeam or Acrobat.

**"Claude isn't set up yet"**
: Press <kbd>,</kbd> and set it up in Settings.

**The AI can't find my spreadsheet**
: Put it in the app's current folder.

**Still stuck?** [Open an issue](https://github.com/jeff-carmichael/aecdo/issues) and include `aecdo --version`.
