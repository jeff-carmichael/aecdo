---
title: Troubleshooting
---

# Troubleshooting

## Installing

**`aecdo: command not found` (or "not recognized" on Windows)**
: Open a new terminal; the one you installed from doesn't know about the new PATH yet. On macOS and Linux, if the installer printed `note: … is not on your PATH`, add that folder to your PATH in `~/.zshrc` or `~/.bashrc`.

**"Windows protected your PC"**
: `aecdo.exe` isn't code-signed yet. Install with the [PowerShell one-liner](install.md#windows) to avoid the warning, or click **More info → Run anyway**. See [Install and update](install.md#windows-protected-your-pc).

**Double-clicking `aecdo.exe` just flashes a window**
: It's a command-line tool. Run it from PowerShell or Windows Terminal.

**`musl-based Linux (e.g. Alpine) is not supported yet`**
: [Build from source](install.md#build-from-source) with Node.js.

**`aecdo update` says permission denied**
: On macOS and Linux, run `sudo aecdo update`. On Windows, if you installed into a protected folder yourself, run it from an administrator terminal.

## Processing PDFs (DrawingBot API)

The DrawingBot API isn't available yet; these apply once it is.

**`No input file specified`**
: You ran `process`, `upload`, or `explore` without a file name outside an interactive terminal (in a script, or with input piped in). Pass the file name.

**`No input file specified, and no PDF files found in the current folder`**
: The picker lists PDFs in the current folder only. `cd` to the folder with your drawings, or pass a path: `aecdo process ~/Downloads/plans.pdf`.

**`No configuration found`, or sign-in errors from the API**
: Run `aecdo configure` and re-enter your Client ID and Client Secret from [DrawingBot API](https://aecdrawingbot.com/api).

**`Result expired (7-day retention)`**
: Finished results can be downloaded for 7 days. Process the PDF again.

## Exploring

**How do I get out of `explore`?**
: Press <kbd>q</kbd>. If the AI chat is open, press <kbd>Esc</kbd> first, then <kbd>q</kbd>. <kbd>Ctrl</kbd> <kbd>C</kbd> also quits.

**I pressed a key and it typed a letter instead**
: The AI chat is open, so keys go into your question. Press <kbd>Esc</kbd> to close it, and the keys move around the set again.

**I typed `aecdo configure ai` (or another command) inside `explore` and nothing happened**
: Other `aecdo` commands run in the terminal, not inside `explore`. Press <kbd>q</kbd> to quit (<kbd>Esc</kbd> first if the chat is open), run the command, then start `explore` again.

**I can't see the sheet map**
: It needs some height. Make the window taller, or close the AI chat with <kbd>Esc</kbd>. It's also hidden while a table is open, since tables use the whole window.

**The lines and boxes look broken, or show as `?`**
: Your terminal's font is missing the line-drawing characters. On Windows, use **Windows Terminal** (free in the Microsoft Store) instead of the old console window. Elsewhere, try a different terminal font.

**Pressing <kbd>v</kbd> says it can't find the source PDF**
: Put the PDF in the same folder as the `.jsonld`, with the same name (`plans.pdf` next to `plans.jsonld`), or start with `aecdo explore plans.jsonld --pdf path/to/plans.pdf`. The [demo set](demo.md) has no PDF, so <kbd>v</kbd> doesn't work there.

**The red box is in the wrong place, or `explore` says the box "runs past the page"**
: The file's bbox values may not be in PDF points from the top-left. See [bbox coordinates](data-model.md#bbox-coordinates).

**The page opens as a PDF instead of an image**
: That's fine; it shows the same thing. Install Poppler (`brew install poppler` or `sudo apt install poppler-utils`) if you'd rather get an image.

**`No input file specified, and no .jsonld files found in the current folder`**
: With no file name, `explore` lists `.jsonld` files in the folder you're in only. `cd` to the folder with your drawing sets, or give the path: `aecdo explore ~/Downloads/plans.jsonld`.

**`explore` just prints the sheet list and exits**
: It isn't running in an interactive terminal (for example, its input is piped), or you passed `--format json`. Run it directly in a terminal.

## The app (`aecdo gui`)

**It opened in my browser instead of a window**
: The window needs the standalone program ([Install and update](install.md)); an npm install always uses the browser. On Linux, it also needs WebKitGTK 6: `sudo apt install libwebkitgtk-6.0-4` (Debian, Ubuntu), `sudo dnf install webkitgtk6.0` (Fedora), or `sudo pacman -S webkitgtk-6.0` (Arch). On Windows 10, install the [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/). `aecdo` prints why the window didn't open.

**The PDF pane says it can't find the PDF**
: Pick one from the list in the pane, or start with `aecdo gui plans.jsonld --pdf path/to/plans.pdf`. The same rules as `view` in `explore` apply.

**Some text on the PDF is missing or looks wrong**
: Pages that use Chinese, Japanese, or Korean fonts that aren't embedded in the PDF may not draw their text in the standalone program. Open the page in your PDF reader to check.

**Keys type into the chat instead of moving around**
: The chat has focus. Press <kbd>Esc</kbd> (or <kbd>Tab</kbd>) to move back to the lists.

## AI assistant

**`Claude isn't set up yet` (or ChatGPT, Gemini, …)**
: That model isn't connected. Quit `explore` (<kbd>Esc</kbd>, then <kbd>q</kbd>), run `aecdo configure ai`, and start `explore` again. If you set up an API key with an environment variable, make sure it's set in the terminal you're using.

**`the AI assistant needs Node.js 22.19 or newer`**
: You're running a source build on an older Node.js. Upgrade Node.js, or [install the standalone program](install.md).

**The assistant didn't follow my AGENTS.md**
: It's read once, the first time you ask something in a session. Restart `explore` after editing it, and check for the `Using AGENTS.md from this folder` line. Make sure the file is in the folder you ran `explore` from.

**The assistant can't find my spreadsheet**
: It only sees files in the folder you ran `explore` from. Move the spreadsheet there, or start `explore` from the spreadsheet's folder.

## Still stuck?

[Open an issue](https://github.com/jeff-carmichael/aecdo/issues) with the command you ran, what it printed, and the output of `aecdo --version`.
