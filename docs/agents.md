---
title: Claude Code and agents
---

# Use aecdo with Claude Code and other AI agents

Besides the [assistant inside `explore`](assistant.md), you can let a coding agent such as [Claude Code](https://claude.com/claude-code) run `aecdo` for you. That's useful for bigger jobs: checking a whole set, comparing two revisions, or building reports from several files. It's also a way to use a Claude Pro or Max subscription with your drawing data, since Claude Code signs in with those plans.

## Install the Claude Code skill

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

## Commands agents should use

Agents should stick to the commands that print and exit, with `--format json`:

| Command | Returns |
|---------|---------|
| `aecdo validate <file> --format json` | `{"valid": …, "file": …, "errors": […]}`; exit code 1 if invalid |
| `aecdo summary <file> --format json` | Counts of sheets, drawings, item types, tables, notes, images |
| `aecdo sheets <file> --format json` | Every sheet's number, title, and page index |
| `aecdo page <file> <sheet> --format json` | The full data for one sheet |
| `aecdo process <pdf>` | Saves `<pdf>.jsonld` next to the PDF; progress goes to stderr (DrawingBot API, [coming soon](process.md)) |
| `aecdo upload <pdf>` | The job ID, on stdout (DrawingBot API, coming soon) |

Things to know:

- **Always pass a file name.** Without a terminal there's no PDF picker; a missing file is an error.
- **`explore` is for people.** Without a terminal, or with `--format json`, it just prints the sheet list instead of waiting for input.
- **`configure` and `configure ai` are interactive**, so a person needs to run them once.
- **Update notices** only go to stderr in a terminal, so they never get mixed into JSON on stdout.

## AGENTS.md

`AGENTS.md` is a common convention for giving AI tools standing instructions for a folder. The same file works for both:

- the `@claude`/`@chatgpt` [assistant in `explore`](assistant.md#project-instructions-agentsmd), which reads `AGENTS.md` from the folder you run `explore` in;
- Claude Code and other coding agents, when you start them in that folder. (Claude Code reads `CLAUDE.md`; a one-line `CLAUDE.md` containing `@AGENTS.md` makes it read `AGENTS.md` too.)

So you can write your project's checking rules once, in one place.
