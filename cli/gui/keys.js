// The keyboard shortcuts, as the help overlay lists them. app.js handles them.

/** @type {[string, [string, string][]][]} */
export const SHORTCUTS = [
  [
    "Move around",
    [
      ["↑ ↓  or  j k", "move in the list"],
      ["Enter  or  →", "open"],
      ["←  or  Backspace", "go back to where you just were"],
      ["u", "go up a level"],
      ["1 2 3 …", "pick a row by its number"],
      ["/", "find a sheet by number or title"],
      ["Tab", "switch between the sheet list, the contents, and the PDF"],
      ["Home  End  PgUp  PgDn", "jump in the list"],
    ],
  ],
  [
    "PDF",
    [
      ["z", "zoom to what's selected"],
      ["f  or  0", "fit the page"],
      ["+  −", "zoom in or out"],
      ["Shift + arrows", "pan (plain arrows when the PDF has focus)"],
      ["wheel, drag, double-click", "zoom, pan, zoom in"],
      ["click a box", "open it"],
      ["Shift + drag", "mark up an area"],
    ],
  ],
  [
    "AI and markups",
    [
      ["a  or  @", "ask the AI about what you're looking at"],
      ["t  or  Ctrl+T", "start another chat"],
      ["[  ]", "switch chats"],
      ["c", "show or hide the chat"],
      ["Esc", "stop an answer, or leave the chat"],
      ["M", "mark up what's selected"],
      ["m", "review and save markups"],
    ],
  ],
  [
    "Other",
    [
      ["d", "show ids and coordinates"],
      ["o", "open another drawing set"],
      [",", "Settings: AI models and API credentials"],
      ["?", "this list"],
      ["q", "quit"],
    ],
  ],
];

/** The short hints along the bottom, for where the focus is. */
export const HINTS = {
  sheets: [["↑↓", "move"], ["Enter", "open"], ["/", "find"], ["a", "ask AI"], ["?", "keys"]],
  main: [["↑↓", "move"], ["Enter", "open"], ["←", "back"], ["u", "up"], ["z", "zoom to it"], ["a", "ask AI"], ["?", "keys"]],
  pdf: [["arrows", "pan"], ["+ −", "zoom"], ["f", "fit"], ["z", "zoom to selection"], ["Tab", "back to lists"], ["?", "keys"]],
  chat: [["Enter", "send"], ["Shift+Enter", "new line"], ["Tab", "complete @model"], ["Ctrl+T", "new chat"], ["Esc", "stop / leave"]],
};

/** True when a key press is typing into a field rather than a shortcut. */
export function typing(/** @type {KeyboardEvent} */ e) {
  const t = /** @type {HTMLElement | null} */ (e.target);
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}
