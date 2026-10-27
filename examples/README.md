# Examples

| File | What it is |
| --- | --- |
| `sample-drawing-set.jsonld` | Minimal complete example; used by the unit tests. |
| `maple-grove-library.jsonld` | 19-sheet demo set for a fictional library, with two planted coordination mistakes. Data only, no PDF. See the [demo walkthrough](https://jeff-carmichael.github.io/aecdo/demo.html). |
| `sample-drawing-package-1and2family.pdf` | 7-page sample permit set for a house with a secondary suite and a detached garage. |
| `sample-drawing-package-1and2family.jsonld` | AECDO data for that PDF, written by hand from the drawings (the PDF has no text layer). Keep both files in the same folder so `view` finds the PDF. |

## Source of the Vancouver sample

`sample-drawing-package-1and2family.pdf` is the City of Vancouver's "Sample drawing package for one and two family dwelling applications" (author: City of Vancouver, 2019), downloaded unchanged from <https://vancouver.ca/files/cov/sample-drawing-package-1and2family.pdf>. It is © City of Vancouver and is not covered by this repository's Apache 2.0 license. It's included here only as sample input for trying the tools, and isn't part of the npm package.

The JSON-LD was built by reading each sheet: bboxes are in PDF points from the top-left of the page, measured from renders of the pages, so they are close but not exact. Text is transcribed as it appears on the drawings, including the sample's blanks ("LOT , BLOCK , DL , PLAN") and its few numbers that don't agree between sheets.
