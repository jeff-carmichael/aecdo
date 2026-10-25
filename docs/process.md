---
title: Process PDFs
---

# Process PDFs

`aecdo process` sends a PDF drawing set to the DrawingBot API, waits while it's processed, and saves the extracted data as a `.jsonld` file next to the PDF.

## Connect your DrawingBot account

You need a DrawingBot API account. Get your **Client ID** and **Client Secret** from [aecdrawingbot.com/api](https://aecdrawingbot.com/api), then run:

```bash
aecdo configure
```

It asks for the Client ID, the Client Secret, and a region (press Enter for the default, `us-west-2`). They're saved to `~/.aecdo/config.json`, readable only by you. Run `aecdo configure` again any time to change them; it shows the current Client ID (masked) and region first.

You only need this for `process`, `upload`, `status`, and `download`. Everything else in `aecdo` works on files you already have, with no account.

## Process a PDF

The easiest way is to go to the folder with your drawings and run `process` with no file name:

```bash
cd ~/Projects/my-building
aecdo process
```

`aecdo` lists the PDFs in the folder:

- **↑ / ↓** to move
- **type** to filter the list by name
- **Enter** to choose
- **Esc** to cancel

Or name the file directly:

```bash
aecdo process plans.pdf
```

`process` then:

1. uploads the PDF and prints the job ID;
2. shows live progress while DrawingBot works through the sheets;
3. downloads the result and saves it as **`plans.jsonld` next to `plans.pdf`**, printing the path it saved to.

Keeping the `.jsonld` next to the PDF matters: that's where [`view`](explore.md#see-it-on-the-page-view) looks for the PDF later.

> `process` overwrites an existing file at the save path without asking. Use `-o` to keep an older result.

## Options

```bash
aecdo process plans.pdf -o result.jsonld          # save somewhere else
aecdo process plans.pdf --then summary            # save, then print a summary
aecdo process plans.pdf --then explore            # save, then start exploring
aecdo process plans.pdf --stdout                  # print the JSON-LD instead of saving it
aecdo process plans.pdf --stdout | jq '.sheets | length'
aecdo process plans.pdf --poll 10                 # check progress every 10 seconds (default 5)
```

| Option | What it does |
|--------|--------------|
| `-o`, `--output <file>` | Save the result to this path instead of next to the PDF |
| `--then validate\|summary\|explore` | After saving, run that command on the result. `--then explore` already knows where the PDF is, so `view` works right away |
| `--stdout` | Print the JSON-LD to standard output and don't save a file. Status messages go to stderr, so piping stays clean |
| `--poll <seconds>` | How often to check progress |

## One step at a time

For scripts, or when you want to start a job now and collect it later, the three steps are separate commands:

```bash
JOB=$(aecdo upload plans.pdf)           # prints only the job ID on stdout
aecdo status "$JOB"                      # one progress check
aecdo status "$JOB" --wait               # wait until it's done
aecdo download "$JOB" -o plans.jsonld    # save the result
aecdo download "$JOB" --then explore     # or open it straight away
```

`upload` with no file in a terminal opens the same PDF picker as `process`. Add `--format json` to `upload` or `status` for machine-readable output.

Results stay available to download for **7 days**. After that, process the PDF again.

> In scripts and pipes there is no picker: a missing file name is an error, so a script can never hang waiting for input.

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

## Check the result

```bash
aecdo validate plans.jsonld    # does it match the AECDO schema?
aecdo summary plans.jsonld     # how many sheets, drawings, items, tables
```

Then [explore it](explore.md).
