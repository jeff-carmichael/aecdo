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

**`view` says it can't find the source PDF**
: It looks for `<name>.pdf` next to `<name>.jsonld`, then for the file name stored in the drawing set. Type `view path/to/plans.pdf`, or start with `aecdo explore plans.jsonld --pdf path/to/plans.pdf`. The [demo set](demo.md) has no PDF, so `view` doesn't work there.

**The red box is in the wrong place, or `view` says the box "runs past the page"**
: The file's bbox values may not be in PDF points from the top-left. See [bbox coordinates](data-model.md#bbox-coordinates).

**`view` opens a PDF instead of an image**
: Install Poppler (`brew install poppler` or `sudo apt install poppler-utils`) for PNG output. The PDF shows the same thing.

**`No input file specified, and no .jsonld files found in the current folder`**
: With no file name, `explore` lists `.jsonld` files in the current folder only. `cd` to the folder with your drawing sets, or pass a path: `aecdo explore ~/Downloads/plans.jsonld`.

**`explore` just prints the sheet list and exits**
: It isn't running in an interactive terminal (for example, its input is piped), or you passed `--format json`. Run it directly in a terminal.

## AI assistant

**`Claude isn't set up yet` (or ChatGPT)**
: Run `aecdo configure ai`. If you set up an API key with an environment variable, make sure it's exported in the terminal you're using.

**`the AI assistant needs Node.js 22.19 or newer`**
: You're running a source build on an older Node.js. Upgrade Node.js, or [install the standalone program](install.md).

**The assistant didn't follow my AGENTS.md**
: It's read once, the first time you ask something in a session. Restart `explore` after editing it, and check for the `Using AGENTS.md from this folder` line. Make sure the file is in the folder you ran `explore` from.

**The assistant can't find my spreadsheet**
: It only sees files in the folder you ran `explore` from. Move the spreadsheet there, or start `explore` from the spreadsheet's folder.

## Still stuck?

[Open an issue](https://github.com/jeff-carmichael/aecdo/issues) with the command you ran, what it printed, and the output of `aecdo --version`.
