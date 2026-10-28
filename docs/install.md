---
title: Install and update
---

# Install and update

`aecdo` is a single program with nothing else to install. Pick your operating system below, then open a new terminal and run `aecdo --version` to check it worked.

## macOS and Linux

Open Terminal and run:

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
```

The script downloads the latest release for your computer (Apple Silicon or Intel Mac, x64 or ARM Linux), checks it against the release's published SHA-256 checksum, and puts `aecdo` in `/usr/local/bin`. If that folder needs administrator rights, it asks for your password.

To change what it installs, set these before `sh`:

| Variable | What it does | Example |
|----------|--------------|---------|
| `AECDO_VERSION` | Install a specific release instead of the latest | `v0.4.6` |
| `AECDO_INSTALL_DIR` | Install somewhere else, such as a folder you own | `$HOME/.local/bin` |

```bash
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | AECDO_INSTALL_DIR="$HOME/.local/bin" sh
```

If the script prints `note: … is not on your PATH`, add that folder to your PATH in `~/.zshrc` or `~/.bashrc`.

Alpine and other musl-based Linux distributions aren't supported by the binary yet; [build from source](#build-from-source) instead.

## Windows

Open **PowerShell** or **Windows Terminal** (not Command Prompt) and run:

```powershell
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

This downloads the latest `aecdo-windows-x64.zip`, checks its checksum, puts `aecdo.exe` in `%LOCALAPPDATA%\Programs\aecdo`, and adds that folder to your user PATH. You don't need administrator rights. **Open a new terminal afterwards** so it picks up the new PATH, then run `aecdo --version`.

The same `AECDO_VERSION` and `AECDO_INSTALL_DIR` settings work here:

```powershell
$env:AECDO_VERSION = "v0.4.6"
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
```

### "Windows protected your PC"

`aecdo.exe` isn't code-signed yet, so Windows SmartScreen may warn you the first time you run a copy you downloaded **in a web browser**. The PowerShell installer above doesn't trigger the warning, because files downloaded by PowerShell aren't marked as coming from the internet. That's the easiest route.

If you'd rather download `aecdo-windows-x64.zip` from [Releases](https://github.com/jeff-carmichael/aecdo/releases) yourself, either:

- When the warning appears, click **More info**, then **Run anyway**. Windows remembers this for that file.
- Or, **before** extracting, right-click the zip, choose **Properties**, tick **Unblock**, and click **OK**. You can also run `Unblock-File .\aecdo.exe` in PowerShell after extracting.

> `aecdo` is a command-line tool, so double-clicking `aecdo.exe` only flashes a window. Open PowerShell in the folder and run `.\aecdo.exe --help`, or move it to a folder on your PATH.

## Build from source

You need [Node.js](https://nodejs.org/) 18 or newer (22.19 or newer for the AI assistant) and Git.

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
npm install
npm run build
npm link          # makes the aecdo command available everywhere
```

`npm install` also copies the [Claude Code skill](agents.md) into `~/.claude/skills/aecdo/`.

## Tab completion

Set up tab completion once and `aecdo process <Tab>` offers only PDFs (and folders), while `summary`, `explore`, and the other file commands offer only `.jsonld` and `.json` files. Commands, options, and values like `--format json` and `--then summary` complete too.

**bash** (add to `~/.bashrc`):

```bash
echo 'eval "$(aecdo completion bash)"' >> ~/.bashrc
```

**zsh**, the default on macOS (add to `~/.zshrc`):

```bash
echo 'eval "$(aecdo completion zsh)"' >> ~/.zshrc
```

**fish**:

```bash
aecdo completion fish > ~/.config/fish/completions/aecdo.fish
```

Open a new terminal afterwards. `aecdo completion` with no shell name prints the script for the shell in your `$SHELL`. PowerShell completion isn't available yet.

## Updating

```bash
aecdo update
```

`aecdo update` downloads the newest release for your computer, checks it against the release's `checksums.txt`, and replaces the program in place. It prints "already the latest version" if there's nothing new.

- On macOS and Linux, if `aecdo` lives in a folder you can't write to (like `/usr/local/bin`), run `sudo aecdo update`.
- On Windows, the PowerShell installer puts `aecdo` in your user folder, so a normal terminal is fine.
- If you built from source, `git pull && npm install && npm run build` instead.

> Installed version 0.3.1? It predates `aecdo update`, so reinstall once with the command for your system above. After that, `aecdo update` works.

### Update notices

Once a day, `aecdo` checks [GitHub Releases](https://github.com/jeff-carmichael/aecdo/releases) in the background. When there's a newer version, the next command you run ends with a short notice suggesting `aecdo update`. The check never slows a command down, the notice goes to stderr so it never ends up in piped output, and it's skipped in CI and when output isn't a terminal.

To turn it off, set `NO_UPDATE_CHECK=1` in your environment, or add `--no-update-check` to a command.

## Uninstalling

1. Delete the program:
   - macOS/Linux: `sudo rm /usr/local/bin/aecdo` (or wherever you installed it; `which aecdo` tells you).
   - Windows: delete the folder `%LOCALAPPDATA%\Programs\aecdo`, then remove it from your PATH in **Settings → System → About → Advanced system settings → Environment Variables**.
2. Delete your settings and saved credentials: the `.aecdo` folder in your home folder (`~/.aecdo`, or `%USERPROFILE%\.aecdo` on Windows).
3. If you installed the Claude Code skill, delete `~/.claude/skills/aecdo`.

## What's stored on your computer

| File | What's in it |
|------|--------------|
| `~/.aecdo/config.json` | DrawingBot API credentials, if you use [`process`](process.md) (readable only by you) |
| `~/.aecdo/token.json` | A cached DrawingBot API sign-in token, valid for 4 hours |
| `~/.aecdo/llm.json` | AI assistant sign-ins, API keys, and model choices (readable only by you) |
| `~/.aecdo/update-check.json` | When `aecdo` last checked for updates, and what it found |

