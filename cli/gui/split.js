// Dividers between the panes: drag one to resize the pane beside it, double-click it for the default width.
// A dragged width is saved, and the server writes it into the page so the next launch opens the same way.

/** @typedef {"sheets" | "main" | "chat"} SizedPane */

/** @type {SizedPane[]} */
const PANES = ["sheets", "main", "chat"];
/** @type {Record<SizedPane, number>} */
const MIN = { sheets: 140, main: 220, chat: 260 };
const MIN_PDF = 240;

export class Splitter {
  /**
   * @param {HTMLElement} grid the element whose columns hold the panes
   * @param {(widths: Partial<Record<SizedPane, number>>) => void} save called after a drag or a reset
   */
  constructor(grid, save) {
    this.grid = grid;
    this.save = save;
    /** @type {Partial<Record<SizedPane, number>>} widths the person chose, before fitting them to the window */
    this.chosen = {};
    for (const pane of PANES) {
      const w = parseFloat(grid.style.getPropertyValue(`--w-${pane}`));
      if (w > 0) this.chosen[pane] = w;
    }
    for (const pane of PANES) this.addDivider(pane);
    let frame = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.fit());
    });
    this.fit();
  }

  /** @param {SizedPane} pane */
  el(pane) {
    return /** @type {HTMLElement} */ (this.grid.querySelector(`[data-focus="${pane}"]`));
  }

  /** @param {SizedPane} pane */
  shown(pane) {
    return !this.el(pane).hidden;
  }

  /** @param {SizedPane} pane @param {number | undefined} width */
  set(pane, width) {
    if (width === undefined) this.grid.style.removeProperty(`--w-${pane}`);
    else this.grid.style.setProperty(`--w-${pane}`, `${Math.round(width)}px`);
  }

  /** The room left for one pane once the PDF keeps its minimum and the other panes keep their widths. @param {SizedPane} pane */
  room(pane) {
    const others = PANES.filter((p) => p !== pane && this.shown(p)).reduce((sum, p) => sum + this.el(p).getBoundingClientRect().width, 0);
    return this.grid.clientWidth - MIN_PDF - others;
  }

  /** Puts the chosen widths back, narrower where the window can't fit them. Call after showing or hiding a pane. */
  fit() {
    for (const pane of PANES) this.set(pane, this.chosen[pane]);
    const sized = PANES.filter((p) => this.chosen[p] && this.shown(p));
    if (!sized.length) return;
    const used = PANES.filter((p) => this.shown(p)).reduce((sum, p) => sum + this.el(p).getBoundingClientRect().width, 0);
    const over = used + MIN_PDF - this.grid.clientWidth;
    if (over <= 0) return;
    const give = sized.reduce((sum, p) => sum + Math.max(0, (this.chosen[p] ?? 0) - MIN[p]), 0);
    if (give <= 0) return;
    for (const p of sized) {
      const w = this.chosen[p] ?? 0;
      this.set(p, Math.max(MIN[p], w - (over * Math.max(0, w - MIN[p])) / give));
    }
  }

  /** @param {SizedPane} pane */
  addDivider(pane) {
    const div = document.createElement("div");
    div.className = `divider${pane === "chat" ? " left" : ""}`;
    div.setAttribute("role", "separator");
    div.setAttribute("aria-orientation", "vertical");
    div.title = "Drag to resize, double-click for the default width";
    this.el(pane).append(div);

    div.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      div.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const start = this.el(pane).getBoundingClientRect().width;
      const max = Math.max(MIN[pane], this.room(pane));
      const sign = pane === "chat" ? -1 : 1;
      document.body.classList.add("resizing");
      div.classList.add("active");
      /** @param {PointerEvent} m */
      const move = (m) => {
        const w = Math.min(max, Math.max(MIN[pane], start + sign * (m.clientX - startX)));
        this.chosen[pane] = w;
        this.set(pane, w);
      };
      const end = () => {
        div.removeEventListener("pointermove", move);
        div.removeEventListener("pointerup", end);
        div.removeEventListener("pointercancel", end);
        document.body.classList.remove("resizing");
        div.classList.remove("active");
        if (this.chosen[pane] !== undefined && Math.round(this.chosen[pane]) !== Math.round(start)) this.changed();
      };
      div.addEventListener("pointermove", move);
      div.addEventListener("pointerup", end);
      div.addEventListener("pointercancel", end);
    });

    div.addEventListener("dblclick", () => {
      delete this.chosen[pane];
      this.fit();
      this.changed();
    });
  }

  changed() {
    /** @type {Partial<Record<SizedPane, number>>} */
    const widths = {};
    for (const p of PANES) if (this.chosen[p]) widths[p] = Math.round(/** @type {number} */ (this.chosen[p]));
    this.chosen = widths;
    this.save(widths);
  }
}
