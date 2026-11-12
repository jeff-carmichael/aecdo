# Changelog

All notable changes to the AECDO schema and CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### CLI
- The app opens like a desktop app: `aecdo shortcut` adds it to the Start menu (Windows), `~/Applications` (macOS), or the Linux app menu, with its own icon, and `install.sh`/`install.ps1` run it (`AECDO_SHORTCUT=0` skips it). Opened from its icon, the app starts in the folder you used last (your home folder the first time), with no terminal or console window.
- App home screen: **Open folder…** (`o`) shows the system folder picker (zenity or kdialog on Linux) and switches the folder the app and its AI chats work in; **Recent folders** lists the folders you used before, and the path box takes a folder as well as a `.jsonld` file.
- The app can turn PDFs into drawing sets without the terminal (hidden until the DrawingBot API launches; `AECDO_PROCESSING=1` turns it on to try it). The home screen lists **PDFs to process**, the PDFs in the folder with no `.jsonld` next to them; picking one asks first, since the PDF is uploaded, shows progress next to it, saves `<name>.jsonld` next to the PDF like `aecdo process`, and opens it. Until then, Settings says processing is coming soon instead of asking for API credentials, and typing a `.pdf` in the home screen's path box says so instead of failing to read it as JSON.
- The AI assistant no longer tells the model that every set came from DrawingBot, since `aecdo` opens AECDO files from any source.
- The Windows release is built on Windows, so `aecdo.exe` has the app icon (taskbar, Explorer) and its version and name in Properties, and is smoke-tested like the macOS and Linux builds. The release workflow can also be run by hand to build every binary without publishing.

## [0.6.1] - 2026-11-11

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- App chat: a **Hide** button on the chat (and the top **Ask AI** button turns into **Hide AI**), and every chat tab has a × to close it. Going to the chat (`a`, Tab, or a click) no longer jumps into the text box, so `[` `]` switch chats, the arrows scroll, and Delete closes the chat; any other key starts typing. Esc stops typing, and Esc again leaves the chat.

### Examples
- `examples/` now holds only sets that come with their PDF: the City of Vancouver sample house. `aecdo examples` and the installers download just that set and its PDF (about 2.5 MB), and the demo walkthrough in the guide now uses it. The data-only `sample-drawing-set.jsonld` and Maple Grove Library demo moved to `test/fixtures/` for the tests, and `examples/README.md` is gone (the Vancouver source and copyright note is now on the demo walkthrough page).

## [0.6.0] - 2026-11-10

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- New app for people: `aecdo gui` opens the drawing set in a desktop window, with the sheet list, what you've opened, and the PDF page side by side. The PDF is always open and the selection is outlined in red as you move; zoom and pan are instant, and big PDFs load only the pages you look at. It's keyboard-driven (press `?` for the keys), keeps several AI chats going at once (`a` asks, `t` starts another chat, each with its own model), and adds markups from the selection (`M`) or a Shift-drag on the page, reviewed and saved with `m`. With no file it lists the sets in the folder and recent ones. The window comes with the standalone binary (Linux needs WebKitGTK 6; Windows 10 needs WebView2); an npm install, `--browser`, or a missing library opens it in the default browser instead.
- The app replaces the terminal screens. Bare `aecdo` in a terminal opens the app (instead of a menu), and `aecdo explore` is now another name for `aecdo gui`; without a terminal, or with `--format json`, `explore` still prints the sheet list.
- The rest of the CLI is plain, for scripts and agents:
  - Removed: the full-screen and typed-prompt `explore` (with `--classic`), its sheet map, `view`, `markups` commands, and `@claude` chat (all of these are in the app now), the `aecdo` menu, the arrow-key file pickers (`process` and `upload` need the PDF's name), spinners, progress bars, colors, and boxed tables.
  - `process` and `status --wait` print a line on stderr each time the progress changes.
  - `page` prints tables as pipe-separated rows, as they are stored.
  - `--then explore` is gone from `process` and `download`; open the saved file with `aecdo gui`.
- Settings moved into the app (press `,`, or the Settings button). It sets up the AI models (Sign in with ChatGPT or OpenRouter, API keys, Amazon Bedrock, a custom endpoint, and which way and model each `@name` uses) and the DrawingBot API credentials. Sign-in questions show as dialogs in the app, and changes apply to the open chats right away. `aecdo configure` now opens the app at Settings, and `aecdo configure ai` is gone. When no model is set up, the chat links to Settings.
- When the AI creates or changes a spreadsheet or Markdown notes file, the chat shows a `file://` link to it. Clicking it opens the file in its default app (Excel, a text editor, …). Only spreadsheets and notes in the app's folder open this way.

## [0.5.2] - 2026-11-10

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Full-screen `explore` draws the sheet map as a small inset in the bottom-right corner of the right column instead of filling its bottom half, so the list of drawings, tables, notes, and images gets most of the column back. Rows beside the map are shortened to make room; rows above it keep the full width.

## [0.5.1] - 2026-11-08

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Full-screen `explore` draws a layout map of the sheet in the bottom half of the right column (when the window is tall enough): boxes for each drawing, table, note, and image from their bounding boxes, sized to the window. The one under the cursor is highlighted, and the drawing stays highlighted while you look through its layers and items.
- When `explore` (or its AI) suggests another command such as `aecdo configure ai`, it now says to press `q` to leave explore first (Esc, then `q`, while the chat is open; type `q` at the classic prompt).
- Full-screen `explore` navigation fixes:
  - ← (and Esc) now retrace your steps: after following a link, ← returns to the drawing or item the link was on, instead of walking up the linked sheet. The new `u` key goes up one level when you do want the linked sheet's parent.
  - `/` finds a sheet without leaving where you are: Esc keeps your place, and ← after opening the sheet comes back.
  - `/` matches the start of the sheet number or of title words instead of any part of the title: `/a` lists the architectural sheets, `/a1` the A1xx ones, and `/fl pl` finds Floor Plan sheets. When the typed text starts a sheet number, only sheet numbers are matched.
  - When the AI moves around, the screen redraws at once, the chat says where it went ("Now showing A601 › Door Schedule above"), and the opened place starts at its title so you can follow along.
- The full-screen AI chat shows which model answers (e.g. "Claude (claude-sonnet-5-5 via Anthropic)") and says "type @name to change models", replacing "@chatgpt pick another AI". Typing just `@gemini` switches models, and questions start with the first model that's set up instead of always `@claude`.

## [0.5.0] - 2026-11-02

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- `explore` opens full screen in a terminal, with no new dependencies:
  - **Layout:** the sheet list sits on the left, what you've opened on the right, and the keys that work along the bottom.
  - **Keys:** arrow keys move, Enter opens (including links), ← goes back up, `b` returns after a link, `/` finds a sheet, `v` views the PDF, `a` asks the AI, `m` reviews markups, `d` shows ids and coordinates, and `?` lists the keys.
  - **Sheet previews and tables:** the highlighted sheet is previewed before you open it, and tables take the whole width.
  - **Chat bar:** a line at the bottom for asking the AI is always visible. Press `a` to type into it. The answer appears in a panel above the bar while the drawings stay on screen, and sheets the AI opens show up as it opens them. ↑/↓ scroll long answers, Esc stops an answer or closes the chat, and the AI's yes/no questions are answered in the same bar. A question without `@name` goes to the assistant asked last.
  - **Markups** briefly return to the normal terminal and then come back.
  - **The typed prompt** is still there with `--classic` or `AECDO_EXPLORE=classic`, and is used automatically for windows under 50 × 12 and outside a terminal.

## [0.4.8] - 2026-11-01

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Typing `aecdo` with no command in a terminal opens a menu of things to do: explore a drawing set, download the examples, validate or summarize a file, process a PDF, check or download a job, set up the AI assistant or the API, update, or show all commands. Arrow keys or typing filter the list. Choices that need a file show the `.jsonld` or PDF picker for the current folder, and job choices ask for the job ID. `aecdo` then prints the equivalent command (`next time: aecdo validate plans.jsonld`) and runs it. Outside a terminal (scripts, pipes, agents), bare `aecdo` still prints the help. All subcommands work as before.
- A cleaner look in a terminal, still with no new dependencies:
  - **`process` and `status --wait`:** show a spinner, a progress bar, the elapsed time and a ✓/✗ line per page. Long jobs fold earlier finished pages into one line so the view fits the window. Lines are cut to the terminal width, which fixes leftover text when a long page title wrapped.
  - **Uploads and downloads:** show a spinner.
  - **Pickers and the menu:** highlight the selected row, bold the filter match, show "N of M" while filtering, and dim the menu hints.
  - **`explore`:** opens with a box naming the file and its sheet, drawing and item counts, and `help` is now a two-column list of commands.
  - **Plain-text fallbacks:** terminals without Unicode glyphs (the classic Windows console) get ASCII symbols. Outside a terminal, `process` prints one status line each time the counts change instead of repeating the whole block.
- `explore` is simpler for people new to the terminal:
  - **Sheet list:** titled with the set's PDF name, numbered from 1, with a blank line between disciplines. Typing `1` now opens the first sheet, where before it took a 0-based page index and opened the second; an exact sheet number still wins.
  - **Opening screen:** no box, no command table and no "is valid against AECDO schema" line. A one-line tip appears the first time each kind of list is shown, and the schema check only speaks up when something doesn't match.
  - **Sheet header:** the ═══ rules are gone; it reads "A101  First Floor Plan" with "PDF page 4" under it.
  - **Page numbers:** references and `view` messages count pages from 1, like a PDF viewer.
  - **Help:** `help` uses plain wording.
  - **Sheet, drawing, layer and item screens:** each opens with a bold name and a dim line saying where it is ("26 items on First Floor Plan, A101"). Lists share one numbered layout with counts and scales dimmed in a column.
  - **Links:** a drawing's links, and an item's under "Related", say how to follow them with the real range ("type r1 to r10 to open one"). The tip no longer mentions links when a drawing has none.
  - **Items:** shown like a form, with plain field names ("Room name   Story Time") instead of `data:` and `roomName:`. Items without a label get a readable name instead of their id.
  - **Ids and coordinates:** ids, bbox coordinates and `[THING]`/`[TAG]` labels are hidden. The new `details` command shows or hides them, and `aecdo page` always prints them.
  - **Color:** the prompt is cyan, the same accent as the pickers.
  - **Symbols:** Windows 11 gets the Unicode symbols instead of the ASCII fallback.
- `aecdo completion` with no shell named now recognizes a Windows path in `$SHELL`, such as `C:\Program Files\Git\bin\bash.exe`, as bash.
- `aecdo update` picks which `tar` to run by the operating system it's running on, not by the release it downloads. Windows always uses its own `tar.exe`.
- The test suite passes on Windows: path assertions use the platform's separators, the shell-syntax check passes scripts on stdin, and the file-permission check is skipped where Windows has no execute bit.

## [0.4.7] - 2026-10-28

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- New `aecdo examples [folder]` downloads the example drawing sets (the Maple Grove demo, the Vancouver house permit set with its PDF, and the small sample set) into a folder, `./aecdo-examples` by default. Files come from the release tag matching your version, existing files are kept unless you add `--force`, and tab completion knows the command. When `explore` finds no `.jsonld` in the folder, it now suggests `aecdo examples`.
- `install.sh` and `install.ps1` ask at the end whether to download the examples and where (default `~/aecdo-examples`). The question is skipped in CI and when there's no terminal to answer it; `AECDO_EXAMPLES=1|0` and `AECDO_EXAMPLES_DIR` answer it ahead of time. Releases without the `examples` command are installed without the question.

## [0.4.6] - 2026-10-28

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- The assistant's `add_markup` tool describes `bbox` and `at` as fixed-length number arrays instead of tuples. The tuple form is old JSON Schema (draft-07), and Claude behind some gateways rejected the request with `tools.N.custom.input_schema: JSON schema is invalid. It must match JSON Schema draft 2020-12`. A test now checks every tool schema against draft 2020-12.

## [0.4.5] - 2026-10-28

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Custom endpoints in `aecdo configure ai` now get a plain request: no prompt-caching fields (`cache_control`), no `eager_input_streaming` on tools, and no `store`. Gateways that check the request strictly rejected them with `400 ... unrecognizedProperty=cache_control`.

## [0.4.4] - 2026-10-28

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### Examples
- `examples/sample-drawing-package-1and2family.pdf` and `.jsonld`: the City of Vancouver's sample drawing package for one and two family dwellings (7 pages: site and impermeable plans, floor plans, FSR overlay, elevations, sections, details, garage), with a JSON-LD built by hand from the drawings. It's the first example with its source PDF, so `view` and markups can be tried on it. The PDF isn't included in the npm package.

### CLI
- Faster on large drawing sets. `view` cuts the one page it needs out of the PDF with Poppler (`pdfseparate`) or MuPDF (`mutool merge`) when installed, instead of loading the whole PDF with pdf-lib: on a 1000-page, 200 MB test PDF a `view` took about 3 seconds instead of 18, and memory stayed under 100 MB instead of 900 MB. Without those tools, the loaded PDF is kept for the rest of the session, so only the first `view` is slow.
- `explore` builds its reference lookups the first time a reference is shown instead of at startup, and `all` reuses them instead of rebuilding them for every sheet.
- The assistant's `list_sheets` tool returns 200 sheets at a time, with `filter` (sheet number or title text) and `offset` to page, so it can see every sheet of a big set; before, the list was cut off after about 260 sheets.
- `explore` navigation is more predictable. An open item, table, note, or image is now its own step (the prompt shows it, e.g. `A101 › First Floor Plan › Door Tags › Door tag 105A`), so `back` from a schedule returns to its sheet instead of skipping to the sheet list, and `back` after a jump reopens the item you jumped from, with its `r1`/`r2` tags still working. `back` (or `b`) now always returns to the previous place, and `up` (or `..`) goes up one level of the tree; they only differ after a jump, where `up` climbs from the place you jumped to. Picking another number while an item or table is open swaps it in place.
- When you ask the assistant in `explore`, it now gets the last few places you visited, the reference you followed to get here (if any), and where `back` goes, along with the current view.
- `view` explains a missing PDF better: it names the open `.jsonld`, lists each path it tried and why (same name as the `.jsonld`, or the set's `filename`), and lists the other PDFs in that folder. `view <file>` also looks next to the `.jsonld`, not only in the current folder. The sheet list shows the file name at the top.
- `npm run bench -- <sheets>` times parsing, validation, and `explore` on a synthetic set of that many sheets built from the Maple Grove demo.
- `@mentions` in `explore` now name a model, not a company: `@claude`, `@chatgpt` (or `@gpt`), `@gemini`, `@grok`, `@deepseek`, and `@kimi` each go through whichever way you've set up in `aecdo configure ai`: the model's maker (Anthropic or OpenAI), Amazon Bedrock, a custom endpoint, or OpenRouter. When more than one is set up, `configure ai` lets you pick the route and model per `@name`; otherwise the maker comes first, then Bedrock, your endpoint, and OpenRouter. The first answer in a session says which way it went. `@openrouter` and `@or` are gone; with only OpenRouter set up, `@claude` and the rest go through it. A model chosen earlier for `@openrouter` isn't carried over.
- `aecdo configure ai` can set up Amazon Bedrock (a Bedrock API key, an AWS profile, or your existing AWS credentials, plus the region) for Claude, GPT, Grok, DeepSeek, and Kimi models on Bedrock.
- `aecdo configure ai` can set up a custom endpoint: a base URL that speaks the OpenAI (Chat Completions) or Anthropic (Messages) API, a token sent as `Authorization: Bearer`, and the model id for each `@name` it serves. It works with gateways like LiteLLM, Azure, vLLM, and Ollama. Extra headers can go in `custom.headers` in `~/.aecdo/llm.json`.

## [0.4.3] - 2026-10-26

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- `explore`, `page`, and `validate` print with color in a terminal: cyan section labels (`Drawing:`, `Tables`), magenta `Layer:`, yellow item types (`[THING]`, `[TAG]`), bold sheet headers, a green ✓ (red ✗), and dimmed bbox values, ids, drawing type and scale, and `→` arrows. Colors use the terminal's 16-color theme, and stay off with `NO_COLOR`, `TERM=dumb`, or when output is piped. The text the AI assistant reads stays plain.

## [0.4.2] - 2026-10-26

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- `explore` groups the sheet list by sheet-number prefix (`G - General (3 sheets)`, `A - Architectural (18 sheets)`, …) when a set has more than 25 sheets. Pick a group by number, prefix, or discipline name to see its sheets; `back` returns to the groups. Typing a sheet number still opens it directly. Sets with 25 sheets or fewer list every sheet as before.
- `explore` tags each reference with a short label (`→ [r1] Door Schedule (A601, page 9)`). Type `r1`, `r2`, … to jump to that drawing, schedule, or item, or just `r` when there is only one; `back` returns to where you were. The assistant can follow references the same way.
- References to items, layers, tables, notes, and images now print as names (in `explore` and `page`) instead of raw `urn:uuid:` ids.

## [0.4.1] - 2026-10-26

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- `aecdo explore` with no file in an interactive terminal opens the same arrow-key picker as `process`, listing the `.jsonld` files in the current folder. In scripts, or with `--format json`, a missing file is still an error.
- Tables in `explore` and `page` now print with aligned, padded columns and a header divider. Long cells wrap to fit the terminal width instead of running past the box.
- The `explore` prompt (`sheet>`, `E601>`) is shown in green so your navigation lines stand out from the output. Color is off for `NO_COLOR`, `TERM=dumb`, and non-terminal output.

## [0.4.0] - 2026-10-26

No schema validation changes; the CLI still validates against `ontology/v0.3.0`. `aecdo process` now saves to a file by default instead of printing to stdout (use `--stdout` for the old behavior).

### Docs
- New getting-started guide at https://jeff-carmichael.github.io/aecdo/, built by GitHub Pages from `docs/`: install and update on each platform (including the Windows SmartScreen warning), processing PDFs, tab completion, exploring and `view`, the `@claude`/`@chatgpt` assistant and `AGENTS.md`, a walkthrough of the Maple Grove demo set, the data model and bbox units, using `aecdo` with Claude Code, and troubleshooting. The README is now a short overview that links to it.
- README and guide now present `aecdo` as an open-source CLI for any AECDO JSON-LD file, with the DrawingBot API as an optional wrapper, and say prominently that the DrawingBot API isn't available yet (a site-wide notice, switched off with `api_notice: false` in `docs/_config.yml`). Tab completion moved to the Install page, and the guide's data model page gains a "Producing your own files" section.

### Schema
- `BBox` description in `ontology/v0.3.0` now states the coordinate system DrawingBot already uses: PDF points (1/72 in), unscaled, from the top-left corner of the page as displayed (crop box, after /Rotate), with y increasing downward, as `[xmin, ymin, xmax, ymax]` corners. Documentation only; no validation change.

### Examples
- New `examples/maple-grove-library.jsonld`: a detailed demo set for a fictional two-story, 36,000 SF branch library (19 sheets across general, civil, architectural, structural, mechanical, plumbing, and electrical; about 1,000 items, 28 tables). Door tags, room tags, and callouts reference the matching schedules and drawings, so `explore` and the `@claude`/`@chatgpt` assistant can follow them. It includes two deliberate coordination issues to find in a demo: door 209B is on the second floor plan but missing from the door schedule, and door 105A calls for hardware set 9, which doesn't exist.
- New test checks that every file in `examples/` validates against the schema and that its `@id`s are unique and its `references` resolve.

### CLI
- The `explore` assistant can mark up the drawing set's PDF: ask it to cloud, call out, or note something and it proposes real PDF annotations (a revision cloud, a callout with a leader arrow, or a sticky note) placed from the item's bbox, with author "aecdo assistant" and the item's AECDO `@id` stored with each one, so Bluebeam Revu and Acrobat list them as normal markups. New assistant tools `add_markup`, `list_markups`, and `remove_markup`. Nothing is written until you review and save with the new `markups` command in `explore`: `markups` lists pending and saved markups, `view` draws pending ones on the page, `markups save` writes them to `<name>-markups.pdf` next to the PDF (`--in-place` for the original), `markups undo` takes back the last save, `markups remove` deletes every aecdo markup (and replies to them) while keeping other people's, and `markups drop <n>` / `markups clear` discard pending ones. Quitting with pending markups asks whether to save them. Saves are appended as a PDF incremental update, so the original bytes, and any digital signature, stay intact. Works on rotated sheets. Uses `pdf-lib`, which `view` already depends on; encrypted PDFs aren't supported.
- OpenRouter in the `explore` assistant: `@openrouter` (or `@or`) uses the OpenRouter model chosen in `aecdo configure ai` (default `~anthropic/claude-sonnet-latest`), and `@gemini`, `@grok`, `@deepseek`, and `@kimi` are shortcuts to OpenRouter's latest model in each family. `aecdo configure ai` adds *Sign in with OpenRouter* and *Enter an OpenRouter API key* (`OPENROUTER_API_KEY` also works), and its model picker lists five recommended OpenRouter models first and hides batch-only variants. `@claude` and `@chatgpt` stay direct; when they aren't set up but OpenRouter is, the message suggests `@or`. Uses the OpenRouter provider already in `pi-ai`, so no new dependency.
- Tab completes an `@` assistant name at the start of a line in `explore`.
- New Windows installer: `irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex` in PowerShell downloads the latest release, checks its SHA-256 checksum, installs `aecdo.exe` to `%LOCALAPPDATA%\Programs\aecdo` (no admin rights), and adds that folder to the user PATH. Set `AECDO_VERSION` or `AECDO_INSTALL_DIR` to override. Installing this way avoids the "Windows protected your PC" SmartScreen prompt, which the unsigned exe triggers when the zip is downloaded in a browser. The README explains that prompt and how to get past it for the zip.
- README and the Claude Code skill now explain bbox units, and the skill gains a short data-model section for agents.
- The `@claude`/`@chatgpt` assistant now reads an `AGENTS.md` (any capitalization) from the folder you run `explore` in and follows it as your standing instructions for that project, e.g. which checks to run or which spreadsheet to log issues in. It prints "Using AGENTS.md from this folder" when it does. Read once per assistant session, up to 20,000 characters; it can't widen what the assistant's tools may do.
- The `@claude`/`@chatgpt` assistant is told the bbox units (PDF points from the top-left), so it can reason about where things sit on a sheet and how big they are.
- New `view` command in `explore` (also `/view`): opens the current sheet's page from the source PDF with the current selection outlined in red. On a drawing it outlines the drawing, on a layer the layer (or its items when the layer has no bbox), and after you open an item, table, note, or image, that entry. bbox values are read as PDF points from the top-left of the page as displayed; a box that runs past the page prints a warning. The PDF is found next to the `.jsonld` (`plans.pdf` for `plans.jsonld`) or by the set's `filename`; otherwise pass `--pdf <file>` or type `view <path>`. `process --then explore` uses the uploaded PDF. The page is saved as a PNG when `pdftoppm` (Poppler) or `mutool` (MuPDF) is installed, or as a one-page PDF otherwise, in the system temp folder (`aecdo-view/`), and opened in the default viewer. Uses the MIT-licensed `pdf-lib` (new dependency, pure JavaScript, loaded only by `view`; about 450 KB in the standalone binary).
- The `@claude`/`@chatgpt` assistant has a new `show_page` tool that does the same as `view`, so "show me door 105A" navigates to the door and opens the page with it outlined. The assistant only opens the image for you; it does not see it.
- `explore` now colors `@claude`, `@chatgpt`, or `@gpt` as you type it at the start of a line, so you can see the mention will reach an assistant. Unknown names stay plain. Respects `NO_COLOR` and non-color terminals.
- AI assistant in `aecdo explore`: start a line with `@claude` or `@chatgpt` (also `@gpt`) to ask about the current view. The assistant gets the sheet, drawing, or layer on screen as context, can navigate with the same commands a user types, read other sheets, append Markdown notes to `notes.md`, and read, fill in, or create spreadsheets (`.xlsx`, `.csv`, `.tsv`) in the current folder. It asks before its first edit to an existing spreadsheet, keeps `.xlsx` formatting, formulas, and other tabs, and never overwrites formula cells. Ctrl+C stops an answer. Built on the MIT-licensed `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` (new dependencies, loaded only when the assistant is used); needs Node.js 22.19+ for npm installs.
- New `aecdo configure ai`: Sign in with ChatGPT (uses the ChatGPT plan), or save an OpenAI or Anthropic API key, choose each assistant's model, or sign out. Settings go to `~/.aecdo/llm.json` (0600). `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` also work. Claude Pro/Max sign-in is not offered because Anthropic doesn't allow it in third-party tools.
- `aecdo process` now saves the result by default as `<pdf name>.jsonld` next to the PDF (e.g. `plans.pdf` → `plans.jsonld`) and prints the path to stderr. `-o` still picks a different path, and `--then` runs after the file is saved. Pass the new `--stdout` flag to print the JSON-LD to stdout without saving, which was the old default.
- `aecdo process` and `aecdo upload` with no file now open an arrow-key picker of the PDFs in the current folder (type to filter, Enter to select, Esc to cancel). It only appears when stdin and stderr are terminals, so scripts still get the "No input file specified" error.
- New `aecdo completion [bash|zsh|fish]` command prints a tab-completion script (shell detected from `$SHELL` if omitted). `process`/`upload` complete only PDFs, and `validate`/`summary`/`sheets`/`page`/`explore` only `.jsonld`/`.json` files; commands, flags, `--format`, and `--then` values complete too.

## [0.3.2] - 2026-10-24

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Background update notifications: once every 24 hours a detached process checks GitHub Releases for a newer version and caches the result in `~/.aecdo/update-check.json`. When the cache shows a newer release, a notice prints to stderr after the command finishes, so commands are never delayed and piped stdout stays clean. Skipped when stderr is not a TTY or `CI` is set; opt out with `NO_UPDATE_CHECK=1`, `AECDO_NO_UPDATE_CHECK=1`, or `--no-update-check`.
- New `aecdo update` command: downloads the latest release for the current platform, verifies it against the release's `checksums.txt`, and replaces the running standalone binary (on Windows the old `.exe` is moved aside and removed on the next run). npm installs are told to run `npm install -g aecdo@latest`. The update notice now suggests `aecdo update` for standalone installs.

## [0.3.1] - 2026-10-24

No schema changes; the CLI still validates against `ontology/v0.3.0`.

### CLI
- Standalone binaries via `bun build --compile`: `build:bin` (current platform) and `build:bin:<target>` / `build:bin:all` for macOS x64/arm64, Linux x64/arm64, and Windows x64. The Bun entry (`cli/bin/standalone.ts`) embeds the default schema and version so the binary needs no files beside it.
- Release workflow (`.github/workflows/release.yml`) builds, packages, checksums, and publishes binaries on `v*` tags; `install.sh` installs the right binary via `curl -sSL … | sh`.
- Unhandled errors from the CLI entry point now print a message and exit with code 1 instead of an unhandled promise rejection.
- `explore` is now a step-by-step drill-down: opening a sheet lists its drawings, tables, notes, and images as a numbered menu; drawings open into layers, layers into items, and leaf entries print their details. Navigate with `back`/`..`, `top`, `all`, `ls`, and `quit`.
- Added `eslint.config.js` (ESLint 9 flat config with `typescript-eslint` type-checked recommended rules); `npm run lint` now covers `cli/` and runs in CI. Parsed JSON and API responses are now explicitly typed.
- Item labels and `data` values that are objects or arrays now print as JSON in `page`/`explore` instead of `[object Object]`.

### Security
- Updated `fast-uri` (via `ajv`) to 3.1.9 and `brace-expansion` (dev-only, via `eslint`) to 1.1.21 to resolve high-severity advisories

### Fixed
- `package.json` `exports` (`aecdo/schema`, `aecdo/context`) now point at `ontology/v0.3.0` instead of `v0.1.0`; package version bumped to `0.3.0` to match the latest release
- `scripts/generate-diagram.mjs` and the pre-commit hook target `ontology/v0.3.0`, and the generator now includes the `Image` class
- README schema version, Mermaid diagram, example JSON (`label` on Drawing), and explore walkthrough brought up to date

## [0.3.0] - 2026-06-02

### Schema
- New ontology version `v0.3.0` (`ontology/v0.3.0/`)
- BREAKING: renamed `title` → `label` on `Drawing` and `Table` to describe what the region is, distinct from the sheet's `title`. `Drawing.label` is required (replacing the previously required `title`); `Table.label` remains optional.
- The sheet-level `title` field is unchanged.
- Updated `context.jsonld` (added `label` term, kept `title` for the sheet) and `diagram.mmd`
- CLI now validates against v0.3.0 by default. Drawing/Table display reads `label` with a `title` fallback for pre-v0.3.0 documents.

## [0.2.0] - 2026-05-12

### Schema
- New ontology version `v0.2.0` (`ontology/v0.2.0/`)
- Added `Image` type at the sheet level (sibling of `Note` and `Table`) to record raster images embedded on a sheet. Fields: `@id`, `@type`, `role` (`logo` | `photo` | `detail-raster` | `diagram` | `other`), `caption`, `bbox`. Image bytes are not stored in the document.
- Added `images` array to `Sheet`
- Updated `context.jsonld` and `diagram.mmd` for the new type
- CLI now validates against v0.2.0 by default

### CLI
- DrawingBot API integration: `configure`, `process`, `upload`, `status`, `download` commands
- OAuth 2.0 authentication with token caching (`~/.aecdo/token.json`)
- Secure credential storage at `~/.aecdo/config.json` with 0o600 permissions and permission warnings
- Region selection (future-proofed for European endpoints)
- Live progress display during PDF processing (TTY-aware, writes to stderr)
- `--then` flag to pipe API results directly into validate/summary/explore
- `--poll` and `--wait` flags for status polling control
- API types: `ApiConfig`, `JobStatus`, `JobResult`, `UploadResponse`, `ProcessOptions`
- New `sheets <file>` command: list sheets non-interactively, with `--format json` for agent-friendly output
- New `page <file> <sheetNumber|pageIndex>` command: print one sheet by number or index. Supports `--format json`. Replaces the interactive REPL's sheet lookup for scripts and agents.
- `explore` now falls back to listing sheets (text or JSON) when stdin is not a TTY or `--format json` is passed, so agents and pipelines no longer hang on the interactive prompt

## [0.1.0] - 2026-04-30

### Schema
- Initial AECDO JSON Schema (`ontology/v0.1.0/aecdo.schema.json`)
- JSON-LD context file (`ontology/v0.1.0/context.jsonld`)
- Schema types: DrawingSet, Sheet, Drawing, Layer, Item, Table, Note
- Item types: `tag`, `thing`, `area`
- Drawing types: `plan`, `section`, `elevation`, `detail`
- UUID URN identifiers for all entities
- Bounding box support as `[xmin, ymin, xmax, ymax]` arrays
- Cross-reference support via `references` arrays

### CLI
- TypeScript CLI with commands: `validate`, `summary`, `explore`
- Sample drawing set example (`examples/sample-drawing-set.jsonld`)
- Claude Code skill in skills directory format for AI agent integration

### Other
- CONTRIBUTING.md with schema versioning workflow
