---
title: Demo walkthrough
---

# Demo: Vancouver sample house

A real 7-page permit set from the City of Vancouver, with its PDF. No account needed.

## Open it

The installer puts it in `aecdo-examples` in your home folder. In the app, choose **Open another folder…**, pick that folder, then **sample-drawing-package-1and2family**.

Missing it? Download the [.jsonld](https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld) and the [.pdf](https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf) into one folder.

## Look around

1. Open sheet **1**, then **Site Plan**.
2. Open **Buildings**, then **House**. It's outlined on the PDF.
3. Press <kbd>z</kbd> to zoom to it.

## Let the AI check it

A few numbers in the set don't agree. The yards in the Building Analysis table differ from the site plan dimensions. [Set up the AI](assistant.md#set-it-up), press <kbd>a</kbd>, and try:

```
compare the yards in the Building Analysis table with the site plan, and cloud any that differ
```

The clouds appear on the PDF right away. Press <kbd>m</kbd> to list or undo them.

## Source

The PDF is © City of Vancouver ([original](https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf), 2019), included unchanged as sample input. It isn't covered by the aecdo license. The data was written by hand from the drawings, so boxes are close but not exact.
