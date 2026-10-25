---
title: AI assistant
---

# AI assistant in explore

Inside `aecdo explore`, start a line with **`@claude`** or **`@chatgpt`** to ask an AI assistant about the drawing set. It sees what's on your screen, can move around the set for you, open pages with things outlined, take notes, and fill in spreadsheets.

```
A101> @claude which rooms on this floor don't have a door tag?
A601> @chatgpt compare the door schedule to the door tags on A101 and A102
sheet> @claude show me door 105A
```

## Set it up

You need one of these:

| Assistant | How to connect | Cost |
|-----------|----------------|------|
| **ChatGPT** | *Sign in with ChatGPT* using a ChatGPT Plus or Pro plan | Counts against your plan's usage |
| **ChatGPT** | An [OpenAI API key](https://platform.openai.com/api-keys) | Billed per use by OpenAI |
| **Claude** | An [Anthropic API key](https://console.anthropic.com/) | Billed per use by Anthropic |

Run:

```bash
aecdo configure ai
```

and pick from the menu with the arrow keys:

- **Sign in with ChatGPT (uses your ChatGPT plan)** opens your browser to sign in. You can cap how much `aecdo` may use in ChatGPT's settings.
- **Enter an OpenAI API key** or **Enter an Anthropic API key** asks you to paste the key (it isn't shown as you type).
- **Choose a model** picks which model each assistant uses. The defaults are Claude Sonnet 5.5 for `@claude` and GPT-5.5 for `@chatgpt`.
- **Sign out / remove a key** forgets a sign-in or key.

> **Why no "Sign in with Claude"?** Anthropic doesn't allow third-party tools to use Claude Pro or Max subscriptions, so `@claude` needs an API key. If you have a Claude subscription, you can use [Claude Code](agents.md) with `aecdo` instead.

Sign-ins, keys, and model choices are saved in `~/.aecdo/llm.json`, readable only by you. You can also set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment instead.

The assistant works with the installed `aecdo` program. If you [built from source](install.md#build-from-source), it needs Node.js 22.19 or newer.

## Asking questions

Type `@claude` or `@chatgpt` (or `@gpt`) at the start of a line, then your question. The name turns cyan as you type it when it matches an assistant, so you know the line will go to the assistant and not be read as a command.

The assistant gets the current view as context: the sheet list, the sheet, the drawing, or the layer you're on. So "this floor", "these doors", or "this layer" mean what's on your screen.

- **It remembers the conversation** until you quit `explore`. `@claude` and `@chatgpt` each keep their own conversation.
- **Press Ctrl+C** to stop an answer partway through.
- Answers appear as they're written. When the assistant navigates, you see your view change; when it writes a note or a spreadsheet, it prints a line saying which file.

## What it can do

| It can | For example |
|--------|-------------|
| **Navigate** the set with the same commands you type, so your view moves as it works | "go to the second floor plan door tags" |
| **Read** any sheet without moving your view | "what does the general structural notes sheet say about concrete strength?" |
| **Show you the page** with something outlined in red, like typing `view` | "show me door 105A", "where's the book drop detail?" |
| **Take notes** by adding Markdown to `notes.md` (or another `.md` file you name) in the current folder | "note the doors that are missing from the schedule" |
| **Fill in a spreadsheet** (`.xlsx`, `.csv`, or `.tsv`) in the current folder | "add every door on A101 to doors.xlsx" |

The assistant opens the page view **for you**; it doesn't see the image itself. It works from the extracted data.

### Spreadsheets

The assistant looks for spreadsheets in the folder you ran `explore` from. If one already fits the task, it works in that file's layout (for example, your office's RFI log template), filling the columns you already have. Otherwise it creates a new one.

- **It asks first.** Before its first change to a spreadsheet that already existed, it asks `Allow the assistant to edit doors.xlsx? [y/N]`.
- **Excel files are edited in place.** Formatting, formulas, column widths, and other tabs stay as they were.
- **Formula cells are never overwritten.**

## Project instructions: AGENTS.md

To give the assistant standing instructions for a project, put a file named `AGENTS.md` in the folder you run `explore` from. Write it in plain language, as you'd brief a new team member:

```markdown
# Maple Grove Library CDs

- Log every coordination issue as a row in rfi-log.xlsx (columns: Sheet, Item, Issue, Suggested fix).
- Check door hardware sets against the Hardware Sets table on A601.
- Room numbers on the floor plans must match the Room Finish Schedule on A701.
- Use our office terms: "RCP" for reflected ceiling plan, "GWB" for gypsum board.
- Keep answers short; list issues as bullets with the sheet number first.
```

How it works:

- It's read the first time you ask an assistant something in a session, and the assistant prints **`Using AGENTS.md from this folder`**. If you edit it, restart `explore` to pick up the changes.
- Any capitalization works (`AGENTS.md`, `agents.md`).
- Up to 20,000 characters are read.
- It adds to what the assistant does; it can't give it access to more than its usual tools and folder.

`AGENTS.md` is a common convention, so the same file also guides other AI coding tools, like [Claude Code](agents.md), when they work in that folder.

## Privacy and safety

- **What's sent:** your questions, plus the parts of the drawing set the assistant needs (the current view and any sheets it reads), go to OpenAI or Anthropic, depending on which assistant you ask. Your PDF itself isn't sent.
- **File access** is limited to the folder you ran `explore` from. There it can only read and write spreadsheets and add to Markdown notes. It can't run commands or reach other folders.
- **Nothing is sent** unless you start a line with `@claude` or `@chatgpt`.

The assistant is built on the open-source [pi](https://github.com/earendil-works/pi) libraries (`pi-ai` and `pi-agent-core`).
