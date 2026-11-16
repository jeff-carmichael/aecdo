---
title: Install and update
---

# Install and update

## Windows

Open PowerShell, paste this, and press <kbd>Enter</kbd>:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

aecdo appears in the Start menu. No admin rights needed. Windows 10 may also need [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

If you downloaded the zip yourself and Windows says "Windows protected your PC", click **More info → Run anyway**.

## Mac and Linux

Open Terminal, paste this, and press <kbd>Enter</kbd>:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

aecdo appears in Applications (Mac) or your app menu (Linux).

Linux also needs WebKitGTK 6, e.g. `sudo apt install libwebkitgtk-6.0-4`. Without it, the app opens in your browser.

## Update

When a new version is out, a dot shows on **Settings**. Open Settings and click **Install**, then quit and open aecdo again. On a Mac or Linux it may ask for your password.

Or, in a terminal:

```bash
aecdo update
```

Use `sudo aecdo update` if it says permission denied.

## Uninstall

1. Delete the program (`%LOCALAPPDATA%\Programs\aecdo` on Windows, `/usr/local/bin/aecdo` on Mac and Linux).
2. Delete the app icon from the Start menu, Applications, or `~/.local/share/applications`.
3. Delete the `.aecdo` folder in your home folder. It holds your settings and sign-ins.

More install options are on [Command line and agents](agents.md#install-options).
