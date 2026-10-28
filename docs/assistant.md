---
title: AI assistant
---

# AI assistant in explore

Inside `aecdo explore`, start a line with the name of a model, like **`@claude`**, **`@chatgpt`**, or **`@grok`**, to ask an AI assistant about the drawing set. It sees what's on your screen, can move around the set for you, open pages with things outlined, take notes, and fill in spreadsheets.

```
A101> @claude which rooms on this floor don't have a door tag?
A601> @chatgpt compare the door schedule to the door tags on A101 and A102
sheet> @claude show me door 105A
sheet> @gemini list the rooms with no finish in the room finish schedule
```

## Set it up

Each `@name` is a model. You choose how `aecdo` reaches it: straight from the company that makes it, through Amazon Bedrock, through your own endpoint, or through OpenRouter. Set up any one of these and the models it offers work right away:

| Way to connect | Models | How | Cost |
|----------------|--------|-----|------|
| **ChatGPT plan** | `@chatgpt` | *Sign in with ChatGPT* (Plus or Pro plan) | Counts against your plan's usage |
| **OpenAI API** | `@chatgpt` | An [OpenAI API key](https://platform.openai.com/api-keys) | Billed per use by OpenAI |
| **Anthropic API** | `@claude` | An [Anthropic API key](https://console.anthropic.com/) | Billed per use by Anthropic |
| **Amazon Bedrock** | `@claude`, `@chatgpt`, `@grok`, `@deepseek`, `@kimi` | A Bedrock API key, an AWS profile, or the AWS credentials already on your computer | Billed by AWS |
| **Custom endpoint** | the ones you list | A base URL and token for an OpenAI- or Anthropic-compatible API, such as Palantir Foundry, LiteLLM, Azure, vLLM, or Ollama | Up to whoever runs it |
| **OpenRouter** | all six | *Sign in with OpenRouter*, or an [OpenRouter API key](https://openrouter.ai/settings/keys) | Billed per use from your OpenRouter credits |

Run:

```bash
aecdo configure ai
```

and pick from the menu with the arrow keys:

- **Sign in with ChatGPT (uses your ChatGPT plan)** opens your browser to sign in. You can cap how much `aecdo` may use in ChatGPT's settings.
- **Enter an OpenAI API key**, **Enter an Anthropic API key**, or **Enter an OpenRouter API key** asks you to paste the key (it isn't shown as you type).
- **Set up Amazon Bedrock** asks how to sign in to AWS (a Bedrock API key, an AWS profile name, or the credentials you already use with the AWS CLI, including SSO), then the AWS region. Your AWS account needs access to the models you use; turn them on in the Bedrock console.
- **Set up a custom endpoint** asks for a name (like `Foundry`), the base URL, whether it speaks the OpenAI (Chat Completions) or Anthropic (Messages) API, and a token, which is sent as `Authorization: Bearer <token>`. Then pick which `@names` it serves and the model id it uses for each, e.g. `@claude` → the model name your endpoint uses for Claude.
- **Sign in with OpenRouter** opens your browser; OpenRouter then creates an API key for `aecdo`, which you can see and revoke in your OpenRouter account.
- **Choose the model or route for an @mention** picks which way an `@name` goes when more than one is set up, and which model it uses there. The defaults are Claude Sonnet 5.5 and GPT-5.5, and the latest Gemini Pro, Grok, DeepSeek, and Kimi models. Bedrock and OpenRouter list only that family's models; type to filter. The assistant needs a model that supports tool calls to navigate and read sheets.
- **Sign out / remove a key** forgets a sign-in, key, Bedrock setup, or custom endpoint.

The menu shows which way each `@name` will use. When more than one is set up and you haven't picked, it goes straight to the maker first (Anthropic or OpenAI), then Amazon Bedrock, then your custom endpoint, then OpenRouter. The first answer in a session also says which way it went, e.g. `Claude via Amazon Bedrock (global.anthropic.claude-sonnet-5-5)`.

> **Why no "Sign in with Claude"?** Anthropic doesn't allow third-party tools to use Claude Pro or Max subscriptions, so `@claude` needs an API key, Bedrock, OpenRouter, or your own endpoint. If you have a Claude subscription, you can use [Claude Code](agents.md) with `aecdo` instead.

Sign-ins, keys, and model choices are saved in `~/.aecdo/llm.json`, readable only by you. You can also set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY` in your environment instead. To send more headers to a custom endpoint, add them under `custom.headers` in that file, e.g. `"headers": { "x-team": "drawings" }`.

The assistant works with the installed `aecdo` program. If you [built from source](install.md#build-from-source), it needs Node.js 22.19 or newer.

## Asking questions

Type `@claude`, `@chatgpt` (or `@gpt`), `@gemini`, `@grok`, `@deepseek`, or `@kimi` at the start of a line, then your question. Type `@` and a few letters, then press **Tab**, to complete the name. The name turns cyan as you type it when it matches an assistant, so you know the line will go to the assistant and not be read as a command.

The assistant gets the current view as context: the sheet list, the sheet, the drawing, the layer, or the item, table, note, or image you have open. So "this floor", "these doors", or "this layer" mean what's on your screen. It also gets the last few places you visited, and the reference you followed if you jumped here with `r1`, so after jumping from a door tag to the door schedule you can ask "@claude is the door I came from in this schedule?".

- **It remembers the conversation** until you quit `explore`. Each name (`@claude`, `@chatgpt`, `@gemini`, …) keeps its own conversation.
- **Press Ctrl+C** to stop an answer partway through.
- Answers appear as they're written. When the assistant navigates, you see your view change; when it writes a note or a spreadsheet, it prints a line saying which file.

## What it can do

| It can | For example |
|--------|-------------|
| **Navigate** the set with the same commands you type, so your view moves as it works | "go to the second floor plan door tags" |
| **Read** any sheet without moving your view | "what does the general structural notes sheet say about concrete strength?" |
| **Show you the page** with something outlined in red, like typing `view` | "show me door 105A", "where's the book drop detail?" |
| **Mark up the PDF** with clouds, callouts, and sticky notes that Bluebeam and Acrobat open as normal markups (you review and save them) | "cloud every door that's missing from the door schedule" |
| **Take notes** by adding Markdown to `notes.md` (or another `.md` file you name) in the current folder | "note the doors that are missing from the schedule" |
| **Fill in a spreadsheet** (`.xlsx`, `.csv`, or `.tsv`) in the current folder | "add every door on A101 to doors.xlsx" |

The assistant opens the page view **for you**; it doesn't see the image itself. It works from the extracted data.

### Spreadsheets

The assistant looks for spreadsheets in the folder you ran `explore` from. If one already fits the task, it works in that file's layout (for example, your office's RFI log template), filling the columns you already have. Otherwise it creates a new one.

- **It asks first.** Before its first change to a spreadsheet that already existed, it asks `Allow the assistant to edit doors.xlsx? [y/N]`.
- **Excel files are edited in place.** Formatting, formulas, column widths, and other tabs stay as they were.
- **Formula cells are never overwritten.**

## Marking up the PDF

Ask the assistant to cloud, call out, or note something, and it adds real PDF markups to the drawing set: the same annotations you'd draw in Bluebeam Revu or Acrobat, so they show in the Markups list (author "aecdo assistant") and people can move, edit, reply to, or delete them.

| Markup | Looks like | Good for |
|--------|-----------|----------|
| `cloud` | a red revision cloud around the item | flagging a problem area |
| `callout` | a text box with an arrow pointing at the item | a short comment on the sheet |
| `note` | a sticky-note icon that opens to show the text | longer explanations that shouldn't cover the drawing |

**Nothing changes until you save.** The assistant only proposes markups. Then:

1. Type `view` to see them drawn on the page.
2. Type `markups` to list them. `markups drop 2` discards one, `markups clear` discards them all.
3. Type `markups save` to write them.

```
A101> @claude cloud door 209B and say it's missing from the door schedule
  ✎ Markup 1 pending: cloud A102 on item Door tag 209B: Door 209B is not in the door schedule (A601).
A102 › Second Floor Plan › Door Tags> markups save
Saved 1 markup to /projects/library/plans-markups.pdf. "markups undo" takes them back.
```

**Saving goes to a copy** next to your PDF, `plans-markups.pdf` for `plans.pdf`. Your original stays as it was. Later saves add to the same copy. To mark up the original instead, type `markups save --in-place`. If the PDF is open in Bluebeam or Acrobat on Windows, close it first; the save tells you if the file is locked.

**Saves only add to the end of the file.** Every byte of the original stays the same, so a digitally signed or sealed set keeps a valid signature, and undo is exact:

- `markups undo` takes back the last save in this session (or the last `markups remove`). If the save created the copy, the copy is deleted. Undo refuses if the file has changed since, for example after someone edited it in Bluebeam.
- `markups remove` deletes every markup aecdo added, plus replies people attached to them, and leaves everyone else's markups alone. It asks first. Add `--in-place` to clean the original PDF.

If you quit with markups still pending, `explore` asks whether to save them.

Markups go where the drawing data says the item is, so they're only as accurate as its [bounding boxes](data-model.md#bbox-coordinates). Check with `view` before saving. Encrypted or password-protected PDFs can't be marked up.

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

- **What's sent:** your questions, plus the parts of the drawing set the assistant needs (the current view and any sheets it reads), go to whichever way that `@name` uses: OpenAI, Anthropic, Amazon Bedrock in your AWS account, your custom endpoint, or OpenRouter and on to the company that runs the model (OpenRouter's privacy settings control which providers may receive them). Your PDF itself isn't sent.
- **File access** is limited to the folder you ran `explore` from. There it can only read and write spreadsheets and add to Markdown notes. It can't run commands or reach other folders.
- **Nothing is sent** unless you start a line with an assistant's name, like `@claude`.

The assistant is built on the open-source [pi](https://github.com/earendil-works/pi) libraries (`pi-ai` and `pi-agent-core`).
