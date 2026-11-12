---
title: AI assistant
---

# AI assistant

In the [app](app.md), you can ask an AI model such as Claude or ChatGPT about the drawing set. It sees what you have open, can move around the set for you, zoom the PDF to things, take notes, fill in spreadsheets, and cloud problems on the PDF.

Press <kbd>a</kbd> in the app, type a question, and press <kbd>Enter</kbd>:

```
which rooms on this floor don't have a door tag?
compare the door schedule to the door tags on A101 and A102
show me door 105A
```

First you need to connect `aecdo` to a model, once.

## Set it up

Each model has a name you can use in the chat: `@claude`, `@chatgpt`, `@gemini`, `@grok`, `@deepseek`, and `@kimi`. You choose how `aecdo` reaches it: straight from the company that makes it, through Amazon Bedrock, through your own endpoint, or through OpenRouter. Set up any one of these and the models it offers work right away:

| Way to connect | Models | How | Cost |
|----------------|--------|-----|------|
| **ChatGPT plan** | `@chatgpt` | *Sign in with ChatGPT* (Plus or Pro plan) | Counts against your plan's usage |
| **OpenAI API** | `@chatgpt` | An [OpenAI API key](https://platform.openai.com/api-keys) | Billed per use by OpenAI |
| **Anthropic API** | `@claude` | An [Anthropic API key](https://console.anthropic.com/) | Billed per use by Anthropic |
| **Amazon Bedrock** | `@claude`, `@chatgpt`, `@grok`, `@deepseek`, `@kimi` | A Bedrock API key, an AWS profile, or the AWS credentials already on your computer | Billed by AWS |
| **Custom endpoint** | the ones you list | A base URL and token for an OpenAI- or Anthropic-compatible API, such as a company gateway, LiteLLM, Azure, vLLM, or Ollama | Up to whoever runs it |
| **OpenRouter** | all six | *Sign in with OpenRouter*, or an [OpenRouter API key](https://openrouter.ai/settings/keys) | Billed per use from your OpenRouter credits |

In the app, press <kbd>,</kbd> (or click **Settings** at the top) to open **Settings**. Running `aecdo configure` in a terminal opens the app straight to it. Under **AI models**, each way to connect has its buttons. Most people want one of the first two: **Sign in with ChatGPT** if you pay for ChatGPT Plus or Pro, or an **API key** for Anthropic to use Claude. All the choices:

- **Sign in with ChatGPT** (uses your ChatGPT plan) opens your browser to sign in. You can cap how much `aecdo` may use in ChatGPT's settings.
- **API key** (OpenAI, Anthropic, or OpenRouter) asks you to paste the key. It isn't shown as you type.
- **Amazon Bedrock → Set up** asks for the AWS region, then how to sign in to AWS: a Bedrock API key, an AWS profile name, or the credentials you already use with the AWS CLI (including SSO). Your AWS account needs access to the models you use; turn them on in the Bedrock console.
- **Custom endpoint → Set up** asks for a name (like `Company gateway`), the base URL, whether it speaks the OpenAI (Chat Completions) or Anthropic (Messages) API, a token (sent as `Authorization: Bearer <token>`), and the model id it uses for each `@name` it serves, e.g. `@claude` → the model name your endpoint uses for Claude. Leave the others blank.
- **Sign in with OpenRouter** opens your browser; OpenRouter then creates an API key for `aecdo`, which you can see and revoke in your OpenRouter account.
- **Remove** forgets a sign-in, key, Bedrock setup, or custom endpoint.

When a sign-in needs to ask something (which AWS sign-in to use, or a code to paste), the app asks in a small dialog, and links to finish signing in show at the top of Settings.

**Which model each @name uses** lists every `@name`. Once one is set up, pick which way it goes (when more than one is set up) and which model it uses there. The defaults are Claude Sonnet 5.5 and GPT-5.5, and the latest Gemini Pro, Grok, DeepSeek, and Kimi models. Bedrock and OpenRouter list only that family's models. The assistant needs a model that supports tool calls to navigate and read sheets. Changes apply to the open chats right away.

Settings shows which way each `@name` will use. When more than one is set up and you haven't picked, it goes straight to the maker first (Anthropic or OpenAI), then Amazon Bedrock, then your custom endpoint, then OpenRouter. The first answer in a session also says which way it went, e.g. `Claude via Amazon Bedrock (global.anthropic.claude-sonnet-5-5)`.

> **Why no "Sign in with Claude"?** Anthropic doesn't allow third-party tools to use Claude Pro or Max subscriptions, so `@claude` needs an API key, Bedrock, OpenRouter, or your own endpoint. If you have a Claude subscription, you can use [Claude Code](agents.md) with `aecdo` instead.

Sign-ins, keys, and model choices are saved in `~/.aecdo/llm.json`, readable only by you. You can also set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY` in your environment instead. To send more headers to a custom endpoint, add them under `custom.headers` in that file, e.g. `"headers": { "x-team": "drawings" }`.

The assistant works with the installed `aecdo` program. If you [built from source](install.md#build-from-source), it needs Node.js 22.19 or newer.

## Asking questions

In the app, press <kbd>a</kbd>. The chat opens on the right: type your question in plain words and press <kbd>Enter</kbd>. The answer appears as it's written, and the drawings and the PDF stay on screen beside it.

- **Which model answers** is shown in the chat. It's the first one you set up. To switch the chat you're in, type just the name, like `@gemini`, or pick from the list under the input. Starting a question with a name, like `@chatgpt which rooms have carpet?`, switches too. <kbd>Tab</kbd> completes a name.
- **Ask about what's on screen.** The assistant knows what you have open (a sheet, a drawing, a layer, an item, a table), so "this floor", "these doors", or "this layer" mean what you're looking at. It also knows the last few places you visited and the link you followed to get here, so after jumping from a door tag to the door schedule you can ask "is the door I came from in this schedule?".
- **Several chats.** <kbd>t</kbd> (or <kbd>Ctrl</kbd>+<kbd>T</kbd>) starts another chat, and the tabs switch between them: click one, or press <kbd>[</kbd> <kbd>]</kbd> before you start typing. The × on a tab closes it, and **Hide** puts the chat away. Each chat is its own conversation with its own model, and they can work at the same time. Chats last until you close the app.
- **When it moves around** (for example, "show me door 105A"), the app follows, and the chat says where it went. When it writes a note or a spreadsheet, the chat links to the file: click the link to open it in Excel, your text editor, or whatever opens that kind of file on your computer.
- **When it asks first** (for example, before changing a spreadsheet), the app shows the question with Yes and No buttons.
- Sheet numbers in answers are links. <kbd>Esc</kbd> stops an answer partway through, or leaves the chat so the arrow keys move around the set again.

**"Claude isn't set up yet"?** That model isn't connected. Press <kbd>,</kbd> to open Settings and set it up, then ask again.

## What it can do

| It can | For example |
|--------|-------------|
| **Move around** the set for you, so your view changes as it works | "go to the second floor plan door tags" |
| **Read** any sheet without moving your view | "what does the general structural notes sheet say about concrete strength?" |
| **Show you the page** zoomed to something outlined in red | "show me door 105A", "where's the book drop detail?" |
| **Mark up the PDF** with clouds, callouts, and sticky notes that Bluebeam and Acrobat open as normal markups (you review and save them) | "cloud every door that's missing from the door schedule" |
| **Take notes** by adding Markdown to `notes.md` (or another `.md` file you name) in the current folder | "note the doors that are missing from the schedule" |
| **Fill in a spreadsheet** (`.xlsx`, `.csv`, or `.tsv`) in the current folder | "add every door on A101 to doors.xlsx" |

The assistant zooms the PDF **for you**; it doesn't see the page itself. It works from the extracted data.

### Spreadsheets

The assistant looks for spreadsheets in the folder you started the app from. If one already fits the task, it works in that file's layout (for example, your office's RFI log template), filling the columns you already have. Otherwise it creates a new one.

- **It asks first.** Before its first change to a spreadsheet that already existed, the app asks whether to allow the assistant to edit it.
- **Excel files are edited in place.** Formatting, formulas, column widths, and other tabs stay as they were.
- **Formula cells are never overwritten.**

## Marking up the PDF

Ask the assistant to cloud, call out, or note something, and it adds real PDF markups to the drawing set: the same annotations you'd draw in Bluebeam Revu or Acrobat, so they show in the Markups list (author "aecdo assistant") and people can move, edit, reply to, or delete them.

| Markup | Looks like | Good for |
|--------|-----------|----------|
| `cloud` | a red revision cloud around the item | flagging a problem area |
| `callout` | a text box with an arrow pointing at the item | a short comment on the sheet |
| `note` | a sticky-note icon that opens to show the text | longer explanations that shouldn't cover the drawing |

You can also add markups yourself: press <kbd>M</kbd> to mark up whatever's selected, or hold <kbd>Shift</kbd> and drag a box on the PDF.

**Markups are saved as they're added, to a copy** next to your PDF: `plans-markups.pdf` for `plans.pdf`. The PDF pane switches to the copy, so each markup shows right away, and your original stays as it was. There's nothing else to save. Open the copy in Bluebeam or Acrobat when you're done. If the copy is open there on Windows, close it first; the app tells you if the file is locked.

Press <kbd>m</kbd> for the Markups panel, which lists the markups `aecdo` added:

- <kbd>Enter</kbd> goes to the highlighted one's sheet;
- <kbd>x</kbd> deletes it, and **Delete all** deletes every one;
- <kbd>u</kbd> undoes the last add or delete in this session.

The assistant can list and delete its markups too, if you ask it to. Deleting takes out only markups `aecdo` added (plus replies people attached to them), and leaves everyone else's alone.

**Each change only adds to the end of the copy**, so undo is exact. If the copy was made from a digitally signed or sealed set, the original's bytes stay the same inside it. Undoing the first markup deletes the copy. Undo refuses if the file has changed since, for example after someone edited it in Bluebeam.

Markups go where the drawing data says the item is, so they're only as accurate as its [bounding boxes](data-model.md#bbox-coordinates). Check them on the PDF pane, and delete any that landed in the wrong place. Encrypted or password-protected PDFs can't be marked up.

## Project instructions: AGENTS.md

To give the assistant standing instructions for a project, put a file named `AGENTS.md` in the folder you start the app from. Write it in plain language, as you'd brief a new team member:

```markdown
# Maple Grove Library CDs

- Log every coordination issue as a row in rfi-log.xlsx (columns: Sheet, Item, Issue, Suggested fix).
- Check door hardware sets against the Hardware Sets table on A601.
- Room numbers on the floor plans must match the Room Finish Schedule on A701.
- Use our office terms: "RCP" for reflected ceiling plan, "GWB" for gypsum board.
- Keep answers short; list issues as bullets with the sheet number first.
```

How it works:

- It's read the first time you ask an assistant something in a session, and the assistant prints **`Using AGENTS.md from this folder`**. If you edit it, restart the app to pick up the changes.
- Any capitalization works (`AGENTS.md`, `agents.md`).
- Up to 20,000 characters are read.
- It adds to what the assistant does; it can't give it access to more than its usual tools and folder.

`AGENTS.md` is a common convention, so the same file also guides other AI coding tools, like [Claude Code](agents.md), when they work in that folder.

## Privacy and safety

- **What's sent:** your questions, plus the parts of the drawing set the assistant needs (the current view and any sheets it reads), go to whichever way that `@name` uses: OpenAI, Anthropic, Amazon Bedrock in your AWS account, your custom endpoint, or OpenRouter and on to the company that runs the model (OpenRouter's privacy settings control which providers may receive them). Your PDF itself isn't sent.
- **File access** is limited to the folder you started the app from. There it can only read and write spreadsheets and add to Markdown notes. It can't run commands or reach other folders.
- **Nothing is sent** unless you ask a question in the chat.

The assistant is built on the open-source [pi](https://github.com/earendil-works/pi) libraries (`pi-ai` and `pi-agent-core`).
