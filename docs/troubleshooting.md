---
title: Troubleshooting
---

# Troubleshooting

## Installing

**`aecdo: command not found` (or "not recognized" on Windows)**
: Open a new terminal; the one you installed from doesn't know about the new PATH yet. On macOS and Linux, if the installer printed `note: … is not on your PATH`, add that folder to your PATH in `~/.zshrc` or `~/.bashrc`.

**"Windows protected your PC"**
: `aecdo.exe` isn't code-signed yet. Install with the [PowerShell one-liner](install.md#windows) to avoid the warning, or click **More info → Run anyway**. See [Install and update](install.md#windows-protected-your-pc).

**How do I start the app on Windows?**
: Open PowerShell or Windows Terminal, `cd` to the folder with your drawings, and type `aecdo`.

**`musl-based Linux (e.g. Alpine) is not supported yet`**
: [Build from source](install.md#build-from-source) with Node.js.

**`aecdo update` says permission denied**
: On macOS and Linux, run `sudo aecdo update`. On Windows, if you installed into a protected folder yourself, run it from an administrator terminal.

## Processing PDFs (DrawingBot API)

The DrawingBot API isn't available yet; these apply once it is.

**`No input file specified`**
: `process` and `upload` need the PDF's name: `aecdo process plans.pdf`, or a path like `aecdo process ~/Downloads/plans.pdf`.

**`No configuration found`, or sign-in errors from the API**
: Run `aecdo configure` (or press <kbd>,</kbd> in the app) and re-enter your Client ID and Client Secret from [DrawingBot API](https://aecdrawingbot.com/api).

**`Result expired (7-day retention)`**
: Finished results can be downloaded for 7 days. Process the PDF again.

## The app

**It opened in my browser instead of a window**
: The window needs the standalone program ([Install and update](install.md)); an npm install always uses the browser. On Linux, it also needs WebKitGTK 6: `sudo apt install libwebkitgtk-6.0-4` (Debian, Ubuntu), `sudo dnf install webkitgtk6.0` (Fedora), or `sudo pacman -S webkitgtk-6.0` (Arch). On Windows 10, install the [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/). `aecdo` prints why the window didn't open.

**The PDF pane says it can't find the PDF**
: Pick one from the list in the pane, or start with `aecdo gui plans.jsonld --pdf path/to/plans.pdf`. See [Finding the PDF](app.md#finding-the-pdf).

**Some text on the PDF is missing or looks wrong**
: Pages that use Chinese, Japanese, or Korean fonts that aren't embedded in the PDF may not draw their text in the standalone program. Open the page in your PDF reader to check.

**Keys type into the chat instead of moving around**
: The chat has focus. Press <kbd>Esc</kbd> (or <kbd>Tab</kbd>) to move back to the lists.

## AI assistant

**`Claude isn't set up yet` (or ChatGPT, Gemini, …)**
: That model isn't connected. Press <kbd>,</kbd> in the app to open Settings and set it up. If you set up an API key with an environment variable, make sure it's set in the terminal you're using.

**`the AI assistant needs Node.js 22.19 or newer`**
: You're running a source build on an older Node.js. Upgrade Node.js, or [install the standalone program](install.md).

**The assistant didn't follow my AGENTS.md**
: It's read once, the first time you ask something in a session. Restart the app after editing it, and check for the `Using AGENTS.md from this folder` line. Make sure the file is in the folder you started the app from.

**The assistant can't find my spreadsheet**
: It only sees files in the folder you started the app from. Move the spreadsheet there, or start the app from the spreadsheet's folder.

## Still stuck?

[Open an issue](https://github.com/jeff-carmichael/aecdo/issues) with the command you ran, what it printed, and the output of `aecdo --version`.
