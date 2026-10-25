---
title: Process PDFs
---

# Process PDFs with the DrawingBot API

> **Coming soon.** The DrawingBot API isn't available yet, so the commands on this page (`configure`, `process`, `upload`, `status`, `download`) can't be used today. Everything else in `aecdo` works now on any AECDO file.

`aecdo` doesn't extract data from PDFs itself. It works with AECDO JSON-LD files from any source. For convenience, it includes a small wrapper for the [DrawingBot](https://aecdrawingbot.com) API, one service that produces AECDO files: `aecdo process` uploads a PDF, waits while it's processed, and saves the result as a `.jsonld` file next to the PDF.

## Connect your account

You'll need a DrawingBot API account. Get your **Client ID** and **Client Secret** from [aecdrawingbot.com/api](https://aecdrawingbot.com/api), then run:

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
2. shows live progress while the sheets are processed;
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

## Check the result

```bash
aecdo validate plans.jsonld    # does it match the AECDO schema?
aecdo summary plans.jsonld     # how many sheets, drawings, items, tables
```

Then [explore it](explore.md).
