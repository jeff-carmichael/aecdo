---
title: Mark up the PDF
---

# Mark up the PDF

Ask the [assistant](assistant.md) to cloud, call out, or note something, or add markups yourself, and aecdo adds real PDF markups to the drawing set: the same annotations you'd draw in Bluebeam Revu or Acrobat, so they show in the Markups list (author "aecdo assistant") and people can move, edit, reply to, or delete them.

| Markup | Looks like | Good for |
|--------|-----------|----------|
| `cloud` | a red revision cloud around the item | flagging a problem area |
| `callout` | a text box with an arrow pointing at the item | a short comment on the sheet |
| `note` | a sticky-note icon that opens to show the text | longer explanations that shouldn't cover the drawing |

To add one yourself, press <kbd>M</kbd> to mark up whatever's selected, or hold <kbd>Shift</kbd> and drag a box on the PDF.

**Markups are saved as they're added, to a copy** next to your PDF: `plans-markups.pdf` for `plans.pdf`. The PDF pane switches to the copy, so each markup shows right away, and your original stays as it was. There's nothing else to save. Open the copy in Bluebeam or Acrobat when you're done. If the copy is open there on Windows, close it first; the app tells you if the file is locked.

## Markup sets

Keep markups for different purposes apart in **sets**, such as code review, coordination, and QA. Each set is its own copy of the PDF: `plans-markups-code-review.pdf`, `plans-markups-qa.pdf`, and so on, with `plans-markups.pdf` as the first set, called "Markups". Pick the set from the menu under the PDF; the pane shows that copy, and new markups go to it. **New set…** offers Code review, Coordination, and QA, or type any name. The add-markup box (<kbd>M</kbd>) also says which set it's adding to, and lets you pick another.

The set's name goes on each of its markups as their subject ("Code review: Cloud"), so the Markups list in Bluebeam or Acrobat can sort and filter by it. The app opens the set you changed last. To have the assistant use a set, name it: "start a QA set and cloud the missing doors".

Press <kbd>m</kbd> for the Markups panel, which lists the markups `aecdo` added to the set showing:

- <kbd>Enter</kbd> goes to the highlighted one's sheet;
- <kbd>x</kbd> deletes it, and **Delete all** deletes every one;
- <kbd>u</kbd> undoes the set's last change in this session;
- **Rename set** renames it, file and all, and **New set** starts another.

## History

Press <kbd>h</kbd> in the Markups panel for the set's history: each add, delete, and rename with its time, newest first, down to the PDF before any markups. Pick a step and press <kbd>Enter</kbd> (**Go back to here**) to bring back the markups as they were then. Going back is itself a new step, so the later ones stay in the history and <kbd>u</kbd> takes it back.

The history is kept in the copy itself, so it's there next time you open the set. If someone saves the copy in Bluebeam or Acrobat, their save shows as "Edited in another program", and going back never removes their markups. If a program re-saves the whole file instead, the history up to then is gone, and it starts again with the next change.

The assistant can list and delete its markups too, if you ask it to. Deleting takes out only markups `aecdo` added (plus replies people attached to them), and leaves everyone else's alone.

**Each change only adds to the end of the copy**, so undo is exact. If the copy was made from a digitally signed or sealed set, the original's bytes stay the same inside it. Undoing a set's first markup deletes its copy. Undo refuses if the file has changed since, for example after someone edited it in Bluebeam.

Markups go where the drawing data says the item is, so they're only as accurate as its [bounding boxes](data-model.md#bbox-coordinates). Check them on the PDF pane, and delete any that landed in the wrong place. Encrypted or password-protected PDFs can't be marked up.
