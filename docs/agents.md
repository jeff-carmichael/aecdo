---
title: Command line and agents
---

# Command line and agents

People use [the app](app.md). The `aecdo` command line is for scripts and AI coding agents such as [Claude Code](https://claude.com/claude-code): each command prints plain text (or JSON) and exits, with no colors, prompts, or screens.

## Claude Code skill

A [Claude Code skill](https://github.com/jeff-carmichael/aecdo/blob/main/.claude/skills/aecdo/SKILL.md) teaches Claude how to use `aecdo` and how the data is structured. Install it once:

```bash
mkdir -p ~/.claude/skills/aecdo
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -o ~/.claude/skills/aecdo/SKILL.md
```

```powershell
mkdir -Force "$HOME\.claude\skills\aecdo" | Out-Null
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -OutFile "$HOME\.claude\skills\aecdo\SKILL.md"
```

Then start Claude Code in a folder with `.jsonld` files and ask, for example, "check every door tag in plans.jsonld against the door schedule and write the mismatches to door-issues.csv". This is also a way to use a Claude Pro or Max subscription with your drawing data.

An `AGENTS.md` in the folder guides both the [assistant in the app](assistant.md#project-instructions-agentsmd) and coding agents. (Claude Code reads `CLAUDE.md`; a one-line `CLAUDE.md` containing `@AGENTS.md` makes it read `AGENTS.md` too.)

## Commands

| Command | Prints |
|---------|--------|
| `aecdo validate <file>` | Whether the file matches the AECDO schema, and what's wrong if not; exit code 1 if invalid |
| `aecdo summary <file>` | Counts of sheets, drawings, item types, tables, notes, and images |
| `aecdo sheets <file>` | One line per sheet: number, title, and page index |
| `aecdo page <file> <sheet>` | Everything on one sheet, by sheet number (`A101`) or page index (`0`) |

These take `--format json`, `--pretty` (indented JSON), `-o <file>` (save instead of print), and, for `validate`, `--schema <path>`.

```bash
aecdo validate plans.jsonld --format json
aecdo page plans.jsonld A601 --format json --pretty -o a601.json
```

| Command | What it does |
|---------|--------------|
| `aecdo`, `aecdo gui [file]` | Opens the app (in a terminal; otherwise `aecdo` prints the help). `--pdf <file>` names the source PDF, `--browser` uses a browser tab. `explore` is the same, but prints the sheet list without a terminal or with `--format json` |
| `aecdo configure` | Opens the app at Settings |
| `aecdo examples [folder]` | Downloads the example drawing set (default `./aecdo-examples`); `--force` replaces files |
| `aecdo shortcut` | Adds the app icon to the Start menu, `~/Applications`, or the app menu |
| `aecdo update` | Updates to the latest release |
| `aecdo completion bash\|zsh\|fish` | Prints a tab-completion script, e.g. `eval "$(aecdo completion zsh)"` in `~/.zshrc` |
| `aecdo process <pdf>` | Turns a PDF into `<pdf>.jsonld` beside it through the DrawingBot API (coming soon). `-o`, `--stdout`, `--then summary`, `--poll <s>`; `upload`, `status [--wait]`, and `download` do the steps one at a time |

`aecdo --help` lists every command and option.

### Notes for agents and scripts

- **Always pass a file name.** A missing file is an error.
- **Don't run `gui`, `explore`, or `configure`.** They open a window and wait for a person.
- **Output is plain text.** Progress for `process` and `status --wait` goes to stderr, as do update notices, so stdout stays clean for JSON.
- **AI models and API credentials** are set up by a person in the app's Settings. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENROUTER_API_KEY` in the environment work too.
- `NO_UPDATE_CHECK=1` or `--no-update-check` turns off the daily check for a newer release.

## Install options

Set these before running the installer (`… | AECDO_EXAMPLES=0 sh`, or `$env:AECDO_EXAMPLES = "0"` in PowerShell first):

| Variable | What it does |
|----------|--------------|
| `AECDO_VERSION` | Install a specific release, e.g. `v0.6.3` |
| `AECDO_INSTALL_DIR` | Install somewhere else, e.g. `$HOME/.local/bin` |
| `AECDO_EXAMPLES` | `1` downloads the example set without asking, `0` skips it |
| `AECDO_EXAMPLES_DIR` | Where to put the example set |
| `AECDO_SHORTCUT` | `0` skips adding the app icon |

### Build from source

With [Node.js](https://nodejs.org/) 22.19 or newer (18 works without the AI assistant) and Git:

```bash
git clone https://github.com/jeff-carmichael/aecdo.git
cd aecdo
npm install && npm run build && npm link
```

`npm install` also copies the Claude Code skill to `~/.claude/skills/aecdo/`. A source build opens the app in your browser instead of its own window. To update, `git pull && npm install && npm run build`.
