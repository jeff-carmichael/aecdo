---
title: Command line and agents
---

# Command line and agents

For scripts and AI coding agents such as [Claude Code](https://claude.com/claude-code). Commands print plain text or JSON and exit.

## Claude Code skill

The [skill](https://github.com/jeff-carmichael/aecdo/blob/main/.claude/skills/aecdo/SKILL.md) teaches Claude the commands and the data. Install it once:

```bash
mkdir -p ~/.claude/skills/aecdo
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -o ~/.claude/skills/aecdo/SKILL.md
```

```powershell
mkdir -Force "$HOME\.claude\skills\aecdo" | Out-Null
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -OutFile "$HOME\.claude\skills\aecdo\SKILL.md"
```

Then run Claude Code in a folder with `.jsonld` files and ask. This works with a Claude Pro or Max plan.

An `AGENTS.md` in the folder guides both the [app's assistant](assistant.md#agentsmd) and coding agents. For Claude Code, add a `CLAUDE.md` containing `@AGENTS.md`.

## Commands

| Command | Prints |
|---------|--------|
| `aecdo validate <file>` | Schema errors; exits 1 if invalid. With `--pdf <file>`, also whether that PDF is the one the set was made from |
| `aecdo summary <file>` | Counts of sheets, drawings, items, tables |
| `aecdo sheets <file>` | One line per sheet |
| `aecdo page <file> <sheet>` | Everything on one sheet (`A101` or page index) |

Options: `--format json`, `--pretty`, `-o <file>`, and `--schema <path>` for `validate`.

```bash
aecdo validate plans.jsonld --format json
aecdo page plans.jsonld A601 --format json --pretty -o a601.json
```

| Command | What it does |
|---------|--------------|
| `aecdo gui [file]` | Opens the app (`--pdf <file>`, `--browser`) |
| `aecdo configure` | Opens the app at Settings |
| `aecdo examples [folder]` | Downloads the example set |
| `aecdo shortcut` | Adds the app icon |
| `aecdo update` | Updates to the latest release |
| `aecdo completion bash\|zsh\|fish` | Prints a tab-completion script |
| `aecdo process <pdf>` | PDF to `.jsonld` via DrawingBot (coming soon); also `upload`, `status`, `download` |

`aecdo --help` lists every command and option.

### Notes for agents

- Always pass a file name.
- Don't run `gui` or `configure`; they wait for a person.
- Progress and update notices go to stderr, so stdout stays clean.
- `NO_UPDATE_CHECK=1` turns off the update check.

## Install options

Set before running the installer, e.g. `… | AECDO_EXAMPLES=0 sh`:

| Variable | What it does |
|----------|--------------|
| `AECDO_VERSION` | Install a specific release, e.g. `v0.6.4` |
| `AECDO_INSTALL_DIR` | Install somewhere else, e.g. `$HOME/.local/bin` |
| `AECDO_EXAMPLES` | `1` gets the examples without asking, `0` skips them |
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
