---
title: Demo walkthrough
---

# Demo walkthrough: Vancouver sample house

aecdo comes with an example drawing set you can explore right away, with no account: the City of Vancouver's [sample drawing package for one and two family dwelling applications](https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf), a 7-page permit set for a house with a secondary suite and a detached garage, together with its AECDO data. Because the PDF comes with it, the app outlines what you pick on the page, and you can try markups. The PDF has no text layer, so its data was written by hand from the drawings: 7 sheets, 33 drawings (site plan, floor plans, FSR overlay, elevations, sections, details, and the garage), about 300 items, the building analysis and R-value tables, and the general notes, each with its position on the page.

## Get the example

If you said yes when the installer offered the examples, they're in the `aecdo-examples` folder in your home folder. In the app, click **Open another folder…** (or press <kbd>o</kbd>), choose that folder, and pick **sample-drawing-package-1and2family**.

<details markdown="1">
<summary>Don't have the folder?</summary>

Download both files into one folder, keeping their names, so the app finds the PDF next to the data:

- [sample-drawing-package-1and2family.jsonld](https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.jsonld) (right-click, **Save link as…**)
- [sample-drawing-package-1and2family.pdf](https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/examples/sample-drawing-package-1and2family.pdf)

</details>

## Walk the site plan

The sheets are numbered `1` to `6` as in the title blocks ("ONE OF SIX" and so on), plus `FSR` for the unnumbered FSR overlay.

1. Open sheet **1**, then the **Site Plan** drawing.
2. Open the **Buildings** layer, then **House**.
3. The PDF pane shows the site plan with the house outlined in red. Press <kbd>z</kbd> to zoom to it.

## Let the assistant check it

Set up an assistant first: press <kbd>,</kbd> in the app to open Settings (see [AI assistant](assistant.md#set-it-up)).

This is a real sample package, not a demo with planted mistakes, but a few of its numbers don't agree, which makes it a good test for the assistant:

- The Building Analysis table on sheet `1` gives side yards of 4.52 ft (east) and 4.0 ft (west) and a rear yard of 56.22 ft, while the site plan dimensions the house at 4.27 ft and 4.28 ft from the side property lines and 57.55 ft to the rear.
- The roof ridge is 332.17 ft on the site plan and the north elevation, but 332.25 ft on the south elevation and the schematic section.

Press <kbd>a</kbd> and try:

```
compare the yards in the Building Analysis table with the site plan dimensions, and cloud any that differ
```

The clouds show on the PDF pane as soon as the assistant adds them. They're already saved, in `sample-drawing-package-1and2family-markups.pdf` next to the original; press <kbd>m</kbd> to list them, undo, or delete one. See [Mark up the PDF](markups.md).

## Where the example comes from

`sample-drawing-package-1and2family.pdf` is the City of Vancouver's "Sample drawing package for one and two family dwelling applications" (City of Vancouver, 2019), downloaded unchanged from <https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf>. It is © City of Vancouver and isn't covered by the `aecdo` license. It's included only as sample input for trying the tools, and isn't part of the npm package.

The JSON-LD was built by reading each sheet: bboxes are in PDF points from the top-left of the page, measured from renders of the pages, so they are close but not exact. Text is transcribed as it appears on the drawings, including the sample's blanks ("LOT , BLOCK , DL , PLAN") and its few numbers that don't agree between sheets.
