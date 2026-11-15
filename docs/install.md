---
title: Install and update
---

# Install and update

aecdo is one program with nothing else to install. You paste one line into a terminal once; after that, you open the app from its icon.

## Windows

Open **PowerShell** (press the Windows key, type `PowerShell`, press Enter), paste this, and press Enter:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

It installs aecdo into your user folder (no administrator rights needed) and adds **aecdo** to the Start menu, where you can open it and pin it to the taskbar. Windows 10 also needs the [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/), which most machines already have.

### "Windows protected your PC"

aecdo isn't code-signed yet, so Windows may warn you about a copy you downloaded **in a web browser**. The PowerShell line above doesn't trigger the warning. If you downloaded `aecdo-windows-x64.zip` from [Releases](https://github.com/jeff-carmichael/aecdo/releases) yourself, click **More info**, then **Run anyway**, or right-click the zip before extracting, choose **Properties**, tick **Unblock**, and click **OK**.

## macOS and Linux

Open Terminal (on a Mac, <kbd>⌘</kbd> <kbd>Space</kbd>, type `Terminal`, press Enter), paste this, and press Enter:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

It checks the download, installs aecdo (asking for your password if it needs to), and adds the app to `~/Applications` on macOS (find it with Spotlight or Launchpad, or drag it to the Dock) or to your app menu on Linux.

On Linux, the app's window needs GTK 4 and WebKitGTK 6:

| Distribution | Command |
|--------------|---------|
| Debian, Ubuntu | `sudo apt install libwebkitgtk-6.0-4` |
| Fedora | `sudo dnf install webkitgtk6.0` |
| Arch | `sudo pacman -S webkitgtk-6.0` |

Without it, the app opens in your web browser instead. Alpine and other musl-based distributions aren't supported yet.

## The example drawing set

At the end, the installer asks whether to download the example set (about 2.5 MB) and where to put it. Press Enter twice for `aecdo-examples` in your home folder. It's the City of Vancouver's [sample house permit set](demo.md), with its PDF. Then open the folder from the app with **Open another folder…**.

## Updating

To get the newest version, open a terminal and run:

```bash
aecdo update
```

It downloads the newest release, checks it, and replaces the program. On macOS and Linux, if it says permission denied, run `sudo aecdo update`. You can also run the install line again.

## Uninstalling

1. Delete the program: on Windows, the folder `%LOCALAPPDATA%\Programs\aecdo`; on macOS and Linux, `/usr/local/bin/aecdo` (`which aecdo` tells you where it is).
2. Delete the app icon: `aecdo.lnk` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs` (Windows), `~/Applications/aecdo.app` (macOS), or `~/.local/share/applications/aecdo.desktop` (Linux).
3. Delete your settings and sign-ins: the `.aecdo` folder in your home folder.

## What's stored on your computer

Everything aecdo keeps is in the `.aecdo` folder in your home folder (`%USERPROFILE%\.aecdo` on Windows):

| File | What's in it |
|------|--------------|
| `llm.json` | AI sign-ins, API keys, and model choices (readable only by you) |
| `gui.json` | The sets and folders you opened recently |
| `app.log` | What each launch of the app did, for [troubleshooting](troubleshooting.md) |
| `update-check.json` | When aecdo last checked for a newer version |
| `config.json`, `token.json` | DrawingBot API credentials, once PDF processing is available |

Install options (a specific version, another folder, skipping the examples) and building from source are on [Command line and agents](agents.md#install-options).
