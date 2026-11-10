// A keyboard-driven list that only builds the rows on screen, so thousands of sheets or items stay fast.

/**
 * @typedef {{ heading?: boolean }} Row
 * @typedef {{
 *   rowHeight?: number,
 *   render: (row: any, index: number, el: HTMLElement) => void,
 *   onSelect?: (row: any, index: number) => void,
 *   onOpen?: (row: any, index: number) => void,
 * }} ListOptions
 */
export class VirtualList {
  /**
   * @param {HTMLElement} el
   * @param {ListOptions} opts
   */
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.rowHeight = opts.rowHeight ?? 28;
    /** @type {any[]} */
    this.rows = [];
    this.selected = -1;
    this.el.classList.add("vlist");
    this.el.tabIndex = -1;
    this.spacer = document.createElement("div");
    this.spacer.className = "vlist-spacer";
    this.el.append(this.spacer);
    /** @type {Map<number, HTMLElement>} */
    this.shown = new Map();
    /** @type {HTMLElement[]} */
    this.pool = [];
    this.frame = 0;
    this.el.addEventListener("scroll", () => this.schedule(), { passive: true });
    new ResizeObserver(() => this.schedule()).observe(this.el);
    this.el.addEventListener("click", (e) => {
      const rowEl = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.(".row"));
      if (!rowEl || !this.el.contains(rowEl)) return;
      const i = Number(rowEl.dataset.index);
      const row = this.rows[i];
      if (!row || row.heading) {
        if (row) this.opts.onOpen?.(row, i);
        return;
      }
      this.select(i, false);
      this.opts.onOpen?.(row, i);
    });
  }

  /**
   * @param {any[]} rows
   * @param {number} [selected] index to select; -1 for none
   * @param {boolean} [keepScroll]
   */
  setRows(rows, selected = this.firstSelectable(rows), keepScroll = false) {
    this.rows = rows;
    this.spacer.style.height = `${rows.length * this.rowHeight}px`;
    for (const el of this.shown.values()) this.release(el);
    this.shown.clear();
    this.selected = selected;
    if (!keepScroll) this.el.scrollTop = 0;
    if (selected >= 0) this.reveal(selected, true);
    this.draw();
  }

  /** @param {any[]} rows */
  firstSelectable(rows = this.rows) {
    return rows.findIndex((r) => !r.heading);
  }

  get selectedRow() {
    return this.rows[this.selected];
  }

  /**
   * @param {number} i
   * @param {boolean} [notify]
   */
  select(i, notify = true) {
    if (i < 0 || i >= this.rows.length || this.rows[i].heading) return;
    const old = this.shown.get(this.selected);
    old?.classList.remove("selected");
    this.selected = i;
    this.shown.get(i)?.classList.add("selected");
    this.reveal(i);
    if (notify) this.opts.onSelect?.(this.rows[i], i);
  }

  /** @param {number} delta */
  move(delta) {
    if (!this.rows.length) return;
    let i = this.selected < 0 ? (delta > 0 ? -1 : this.rows.length) : this.selected;
    const step = Math.sign(delta);
    let left = Math.abs(delta);
    let target = this.selected;
    while (left > 0) {
      i += step;
      if (i < 0 || i >= this.rows.length) break;
      if (!this.rows[i].heading) {
        target = i;
        left--;
      }
    }
    if (target !== this.selected && target >= 0) this.select(target);
  }

  /** @param {number} dir 1 for down, -1 for up */
  page(dir) {
    this.move(dir * Math.max(1, Math.floor(this.el.clientHeight / this.rowHeight) - 1));
  }

  home() {
    this.select(this.firstSelectable());
  }

  end() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (!this.rows[i].heading) return this.select(i);
    }
  }

  open() {
    const row = this.selectedRow;
    if (row) this.opts.onOpen?.(row, this.selected);
  }

  /**
   * Scrolls so row i is on screen, keeping a little context around it.
   * @param {number} i
   * @param {boolean} [center]
   */
  reveal(i, center = false) {
    const h = this.rowHeight;
    const top = i * h;
    const view = this.el.clientHeight || 400;
    if (center) {
      this.el.scrollTop = Math.max(0, top - view / 3);
      return;
    }
    const margin = Math.min(2 * h, view / 4);
    if (top - margin < this.el.scrollTop) this.el.scrollTop = Math.max(0, top - margin);
    else if (top + h + margin > this.el.scrollTop + view) this.el.scrollTop = top + h + margin - view;
  }

  /** Redraws every visible row, e.g. after the rows' data changed in place. */
  refresh() {
    for (const [i, el] of this.shown) this.fill(el, i);
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  draw() {
    const h = this.rowHeight;
    const first = Math.max(0, Math.floor(this.el.scrollTop / h) - 8);
    const last = Math.min(this.rows.length - 1, Math.ceil((this.el.scrollTop + (this.el.clientHeight || 800)) / h) + 8);
    for (const [i, el] of this.shown) {
      if (i < first || i > last) {
        this.release(el);
        this.shown.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      if (this.shown.has(i)) continue;
      const el = this.pool.pop() ?? document.createElement("div");
      el.style.transform = `translateY(${i * h}px)`;
      el.style.height = `${h}px`;
      this.fill(el, i);
      this.el.append(el);
      this.shown.set(i, el);
    }
  }

  /**
   * @param {HTMLElement} el
   * @param {number} i
   */
  fill(el, i) {
    const row = this.rows[i];
    el.className = row.heading ? "row heading" : i === this.selected ? "row selected" : "row";
    el.dataset.index = String(i);
    el.textContent = "";
    this.opts.render(row, i, el);
  }

  /** @param {HTMLElement} el */
  release(el) {
    el.remove();
    this.pool.push(el);
  }
}
