---
title: Command line and agents
---

# Command line and agents

People use `aecdo` through [the app](app.md). Its commands are for scripts and AI agents: each one prints plain text (or JSON) and exits, with no colors, prompts, or screens.

## Use aecdo with Claude Code and other AI agents

Besides the [assistant in the app](assistant.md), you can let a coding agent such as [Claude Code](https://claude.com/claude-code) run `aecdo` for you. That's useful for bigger jobs: checking a whole set, comparing two revisions, or building reports from several files. It's also a way to use a Claude Pro or Max subscription with your drawing data, since Claude Code signs in with those plans.

### Install the Claude Code skill

The repo includes a [Claude Code skill](https://github.com/jeff-carmichael/aecdo/blob/main/.claude/skills/aecdo/SKILL.md) that teaches Claude how to use `aecdo` and how the data is structured. Install it once:

macOS and Linux:

```bash
mkdir -p ~/.claude/skills/aecdo
curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -o ~/.claude/skills/aecdo/SKILL.md
```

Windows PowerShell:

```powershell
mkdir -Force "$HOME\.claude\skills\aecdo" | Out-Null
irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/.claude/skills/aecdo/SKILL.md -OutFile "$HOME\.claude\skills\aecdo\SKILL.md"
```

If you [built `aecdo` from source](install.md#build-from-source), `npm install` already copied the skill to `~/.claude/skills/aecdo/` and `~/.agents/skills/aecdo/`. Run the same command again later to get an updated skill.

Then start Claude Code in a folder with your `.jsonld` files and ask in plain language:

```
> Summarize plans.jsonld and list every sheet with more than 50 items
> Check every door tag in plans.jsonld against the door schedule and write the mismatches to door-issues.csv
> Which sheets in plans.jsonld have tables but no drawings?
```

Claude uses the skill automatically when your request involves drawing data. It's allowed to run `aecdo` commands and read files; Claude Code still asks you before anything else.

## Commands

### Reading drawing data

| Command | Prints |
|---------|--------|
| `aecdo validate <file>` | Whether the file matches the AECDO schema, and what's wrong if not; exit code 1 if invalid |
| `aecdo summary <file>` | Counts of sheets, drawings, item types, tables, notes, and images |
| `aecdo sheets <file>` | One line per sheet: number, title, and page index |
| `aecdo page <file> <sheet>` | Everything on one sheet, by sheet number (`A101`) or page index (`0`) |

Options for these:

| Option | What it does |
|--------|--------------|
| `--format json` | JSON instead of text, e.g. `{"valid": …, "file": …, "errors": […]}` from `validate` |
| `--pretty` | Indent the JSON |
| `-o`, `--output <file>` | Save to a file instead of printing |
| `--schema <path>` | `validate` against another schema file |

```bash
aecdo validate plans.jsonld --format json
aecdo page plans.jsonld A601 --format json --pretty -o a601.json
```

### Everything else

| Command | What it does |
|---------|--------------|
| `aecdo` | Opens the app when run in a terminal; otherwise prints the help |
| `aecdo gui [file]` | Opens [the app](app.md), on that set if you name one. `--pdf <file>` names the source PDF; `--browser` uses your browser instead of a window. `explore` is the same command, except that without a terminal, or with `--format json`, it prints the sheet list |
| `aecdo configure` | Opens the app at Settings, for AI models and DrawingBot API credentials |
| `aecdo examples [folder]` | Downloads the [example drawing sets](install.md#example-drawing-sets) (default `./aecdo-examples`); `--force` replaces files already there |
| `aecdo shortcut` | Adds the app to the Start menu (Windows), `~/Applications` (macOS), or the app menu (Linux), so it opens from its icon. The installers run it; standalone binary only |
| `aecdo update` | Updates `aecdo` to the latest release ([Install and update](install.md#updating)) |
| `aecdo completion [bash\|zsh\|fish]` | Prints a tab-completion script (see below) |
| `aecdo process <pdf>` | Saves `<pdf>.jsonld` next to the PDF; progress goes to stderr (DrawingBot API, [coming soon](process.md)) |
| `aecdo upload`, `status`, `download` | The three steps of `process`, one at a time ([Process PDFs](process.md#one-step-at-a-time)) |

`aecdo --help` lists every command and option, and `aecdo --version` prints the version.

### Notes for agents and scripts

- **Always pass a file name.** A missing file is an error.
- **Output is plain text** with no colors, spinners, or boxes, so it reads the same in a log as in a terminal. Progress for `process` and `status --wait` goes to stderr, one line each time it changes.
- **Don't run `gui`, `explore`, or `configure`.** They open a window and wait until a person closes it. Without a terminal, `configure` exits with an error, and `explore` just prints the sheet list.
- **AI models and API credentials** are set up once by a person, in the app's Settings.
- **Update notices** only go to stderr in a terminal, so they never get mixed into JSON on stdout.

### Tab completion

With tab completion, `aecdo process <Tab>` offers only PDFs (and folders), while `summary`, `gui`, and the other file commands offer only `.jsonld` and `.json` files. Commands, options, and values like `--format json` complete too.

```bash
echo 'eval "$(aecdo completion bash)"' >> ~/.bashrc     # bash
echo 'eval "$(aecdo completion zsh)"' >> ~/.zshrc       # zsh, the default on macOS
aecdo completion fish > ~/.config/fish/completions/aecdo.fish
```

Open a new terminal afterwards. PowerShell completion isn't available yet.

## AGENTS.md

`AGENTS.md` is a common convention for giving AI tools standing instructions for a folder. The same file works for both:

- the [assistant in the app](assistant.md#project-instructions-agentsmd), which reads `AGENTS.md` from the folder you start the app from;
- Claude Code and other coding agents, when you start them in that folder. (Claude Code reads `CLAUDE.md`; a one-line `CLAUDE.md` containing `@AGENTS.md` makes it read `AGENTS.md` too.)

So you can write your project's checking rules once, in one place.
