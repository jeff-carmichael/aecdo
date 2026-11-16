---
title: AI assistant
---

# AI assistant

Ask Claude, ChatGPT, or another model about the drawing set. Press <kbd>a</kbd>, type, and press <kbd>Enter</kbd>:

```
which rooms on this floor don't have a door tag?
show me door 105A
add every door on A101 to doors.xlsx
```

It knows what you have open, so "this floor" or "these doors" work.

## Set it up

Press <kbd>,</kbd> for **Settings**, then under **AI models**:

- **Sign in with ChatGPT** uses your ChatGPT Plus or Pro plan.
- **API key** for [Anthropic](https://console.anthropic.com/) (Claude), [OpenAI](https://platform.openai.com/api-keys), or [OpenRouter](https://openrouter.ai/settings/keys) (all models). Billed per use.
- **Amazon Bedrock** or a **custom endpoint** (a company gateway, Azure, Ollama, …) for teams.

There's no "Sign in with Claude": Anthropic doesn't allow Claude plans in other apps. Use an API key, or [Claude Code](agents.md).

## Chats

- Type `@claude`, `@chatgpt`, `@gemini`, `@grok`, `@deepseek`, or `@kimi` to switch models.
- <kbd>t</kbd> starts another chat. Each has its own model and history.
- <kbd>↑</kbd> leaves the question box to scroll the answers; <kbd>↓</kbd> goes back to it. <kbd>Alt</kbd>+<kbd>↑</kbd> brings back a question you sent.
- <kbd>Esc</kbd> stops an answer or leaves the chat.
- Chats end when you close the app.

## What it can do

- **Move around** the set. The app follows.
- **Show you** something on the PDF.
- **[Mark up the PDF](markups.md)** with clouds, callouts, and notes.
- **Write notes and spreadsheets** to your folder.

It reads the extracted data, not the PDF image.

## Files it writes

Files go in the app's current folder. The chat links to each one, so you can open it.

- **Notes:** "note the missing doors" adds to `notes.md`. Name another `.md` file to use that instead. It only adds; it never changes earlier notes.
- **Spreadsheets:** "make doors.xlsx with every door" creates a new `.xlsx`, `.csv`, or `.tsv`. It can also fill in one you have, like an RFI log. It asks before changing your file, and keeps its formatting and formulas.

It can't delete files, touch other file types, or reach other folders.

## AGENTS.md

Put an `AGENTS.md` in your folder to give the assistant standing instructions:

```markdown
- Log every issue as a row in rfi-log.xlsx (Sheet, Item, Issue).
- Keep answers short, sheet number first.
```

Restart the app after editing it.

## Privacy

Your questions and the parts of the set it reads go to the model you chose. The PDF isn't sent. Nothing is sent until you ask.
