// The PDF pane: PDF.js renders the page once to fit, CSS transforms make zoom and pan instant,
// and a second canvas re-renders just the visible part sharply once the view settles.

const SVG = "http://www.w3.org/2000/svg";
const BASE_PIXELS = 12_000_000;
const PAGE_CACHE = 8;
const MAX_ZOOM = 40;

/** @type {Promise<any> | undefined} */
let pdfjsLoading;

/** Loads PDF.js on first use; the import starts as soon as the app does. */
export function loadPdfjs() {
  // A variable, so type-checking doesn't try to resolve the server path.
  const url = "../pdfjs/pdf.min.mjs";
  pdfjsLoading ??= import(url).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL("../pdfjs/pdf.worker.min.mjs", import.meta.url).href;
    return lib;
  });
  return pdfjsLoading;
}

/**
 * @typedef {[number, number, number, number]} BBox
 * @typedef {{ bbox: BBox, pageIndex: number, id?: string, kind?: string, label?: string, command?: string }} Box
 * @typedef {{ s: number, tx: number, ty: number }} View
 */

export class PdfView {
  /**
   * @param {HTMLElement} stage
   * @param {{ onBoxClick?: (box: Box) => void, onRect?: (bbox: BBox, pageIndex: number) => void, onStatus?: (text: string) => void, onZoom?: (scale: number) => void }} hooks
   */
  constructor(stage, hooks = {}) {
    this.stage = stage;
    this.hooks = hooks;
    /** @type {any} */
    this.doc = undefined;
    this.docKey = "";
    this.pageIndex = -1;
    this.size = { w: 0, h: 0 };
    /** @type {View} */
    this.view = { s: 1, tx: 0, ty: 0 };
    /** @type {Map<number, { page: any, canvas: HTMLCanvasElement, scale: number }>} */
    this.cache = new Map();
    /** @type {Box[]} */
    this.boxes = [];
    /** @type {Box | undefined} */
    this.target = undefined;
    /** @type {Box | undefined} */
    this.hover = undefined;
    /** @type {any[]} */
    this.markups = [];
    this.renderToken = 0;
    /** @type {any} */
    this.baseTask = undefined;
    /** @type {any} */
    this.detailTask = undefined;
    this.detailTimer = 0;
    this.anim = 0;

    this.page = el("div", "pdf-page");
    this.page.hidden = true;
    this.base = /** @type {HTMLCanvasElement} */ (el("canvas", "pdf-base"));
    this.svg = document.createElementNS(SVG, "svg");
    this.svg.classList.add("pdf-overlay");
    this.page.append(this.base);
    // The boxes sit above the sharp re-render, in their own layer that moves with the page.
    this.over = el("div", "pdf-over");
    this.over.append(this.svg);
    this.detail = /** @type {HTMLCanvasElement} */ (el("canvas", "pdf-detail"));
    this.detailView = /** @type {View | undefined} */ (undefined);
    this.band = el("div", "pdf-band");
    this.band.hidden = true;
    this.spinner = el("div", "pdf-spinner");
    this.spinner.hidden = true;
    stage.append(this.page, this.detail, this.over, this.band, this.spinner);
    this.listen();
    new ResizeObserver(() => this.resized()).observe(stage);
  }

  get dpr() {
    return window.devicePixelRatio || 1;
  }

  get stageSize() {
    return { w: this.stage.clientWidth || 1, h: this.stage.clientHeight || 1 };
  }

  /**
   * Opens a PDF. PDF.js fetches only the byte ranges it needs, so a 1000-page set opens fast.
   * @param {string} url
   * @param {string} key changes when the file changes
   */
  async open(url, key) {
    if (this.docKey === key && this.doc) return;
    const pdfjs = await loadPdfjs();
    const old = this.doc;
    this.docKey = key;
    this.cache.clear();
    const root = new URL("../pdfjs/", import.meta.url).href;
    const task = pdfjs.getDocument({
      url,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 262144,
      standardFontDataUrl: `${root}standard_fonts/`,
      wasmUrl: `${root}wasm/`,
      cMapUrl: `${root}cmaps/`,
      cMapPacked: true,
      isEvalSupported: false,
      enableXfa: false,
    });
    this.doc = await task.promise;
    old?.destroy();
    // Same page in the new file (e.g. after saving markups): stay where the view was.
    const index = this.pageIndex;
    const view = this.view;
    this.pageIndex = -1;
    if (index >= 0) {
      await this.show(index, "fit");
      this.applyView(view, false);
    }
  }

  get pageCount() {
    return this.doc?.numPages ?? 0;
  }

  /**
   * Shows a page (0-based). `fit` decides the view: "fit" the whole page, "target" zoom to the
   * red box, "keep" stay where the view is (same page only).
   * @param {number} pageIndex
   * @param {"fit" | "target" | "keep"} fit
   */
  async show(pageIndex, fit = "fit") {
    if (!this.doc) return;
    const token = ++this.renderToken;
    if (pageIndex === this.pageIndex) {
      if (fit === "target") this.zoomToTarget(true);
      else if (fit === "fit") this.fit(true);
      return;
    }
    if (pageIndex < 0 || pageIndex >= this.doc.numPages) {
      this.hooks.onStatus?.(`The PDF has no page ${pageIndex + 1}.`);
      return;
    }
    this.cancelDetail();
    this.baseTask?.cancel();
    let entry = this.cache.get(pageIndex);
    if (!entry) {
      this.spinner.hidden = false;
      const page = await this.doc.getPage(pageIndex + 1);
      if (token !== this.renderToken) return;
      const vp = page.getViewport({ scale: 1 });
      const canvas = /** @type {HTMLCanvasElement} */ (el("canvas", "pdf-base"));
      entry = { page, canvas, scale: 0 };
      this.size = { w: vp.width, h: vp.height };
      this.swapBase(entry.canvas, pageIndex);
      this.applyView(fit === "target" && this.target ? this.targetView() : this.fitView(), false);
      const ok = await this.renderBase(entry, token);
      this.spinner.hidden = true;
      if (!ok) return;
      this.remember(pageIndex, entry);
    } else {
      const vp = entry.page.getViewport({ scale: 1 });
      this.size = { w: vp.width, h: vp.height };
      this.cache.delete(pageIndex);
      this.cache.set(pageIndex, entry);
      this.swapBase(entry.canvas, pageIndex);
      this.applyView(fit === "target" && this.target ? this.targetView() : this.fitView(), false);
      if (entry.scale < this.baseScale() * 0.8) void this.renderBase(entry, token);
    }
    this.scheduleDetail();
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} pageIndex
   */
  swapBase(canvas, pageIndex) {
    this.base.replaceWith(canvas);
    this.base = canvas;
    this.page.hidden = false;
    this.pageIndex = pageIndex;
    this.page.style.width = this.over.style.width = `${this.size.w}px`;
    this.page.style.height = this.over.style.height = `${this.size.h}px`;
    canvas.style.width = `${this.size.w}px`;
    canvas.style.height = `${this.size.h}px`;
    this.svg.setAttribute("viewBox", `0 0 ${this.size.w} ${this.size.h}`);
    this.svg.setAttribute("width", String(this.size.w));
    this.svg.setAttribute("height", String(this.size.h));
    this.drawOverlay();
  }

  /** @param {number} pageIndex @param {{ page: any, canvas: HTMLCanvasElement, scale: number }} entry */
  remember(pageIndex, entry) {
    this.cache.set(pageIndex, entry);
    while (this.cache.size > PAGE_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined || oldest === this.pageIndex) break;
      const gone = this.cache.get(oldest);
      gone?.page.cleanup();
      this.cache.delete(oldest);
    }
  }

  /** Sharp at "fit" on this screen, without building a huge bitmap. */
  baseScale() {
    const { w, h } = this.stageSize;
    const fit = Math.min(w / this.size.w, h / this.size.h);
    const want = fit * this.dpr * 1.25;
    const cap = Math.sqrt(BASE_PIXELS / (this.size.w * this.size.h));
    return Math.max(0.1, Math.min(want, cap));
  }

  /**
   * @param {{ page: any, canvas: HTMLCanvasElement, scale: number }} entry
   * @param {number} token
   */
  async renderBase(entry, token) {
    const scale = this.baseScale();
    const vp = entry.page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const task = entry.page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: vp, background: "#fff" });
    this.baseTask = task;
    try {
      await task.promise;
    } catch {
      return false;
    }
    if (this.baseTask === task) this.baseTask = undefined;
    // Draw the finished bitmap into the canvas on screen, so it never flashes blank.
    entry.canvas.width = canvas.width;
    entry.canvas.height = canvas.height;
    entry.canvas.getContext("2d")?.drawImage(canvas, 0, 0);
    entry.scale = scale;
    return token === this.renderToken || this.base === entry.canvas;
  }

  // ── View ───────────────────────────────────────────────

  fitView() {
    const { w, h } = this.stageSize;
    const s = Math.min(w / this.size.w, h / this.size.h) * 0.97;
    return { s, tx: (w - this.size.w * s) / 2, ty: (h - this.size.h * s) / 2 };
  }

  /** @param {BBox} [bbox] */
  targetView(bbox = this.target?.bbox) {
    if (!bbox) return this.fitView();
    const { w, h } = this.stageSize;
    const bw = Math.max(bbox[2] - bbox[0], 12);
    const bh = Math.max(bbox[3] - bbox[1], 12);
    const fit = this.fitView().s;
    const s = Math.min(MAX_ZOOM, Math.max(fit, Math.min(w / (bw * 1.8), h / (bh * 1.8))));
    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    return { s, tx: w / 2 - cx * s, ty: h / 2 - cy * s };
  }

  /**
   * @param {View} v
   * @param {boolean} animate
   */
  applyView(v, animate) {
    cancelAnimationFrame(this.anim);
    if (!animate) {
      this.view = v;
      this.paint();
      return;
    }
    const from = this.view;
    const start = performance.now();
    const ms = 180;
    const stepper = (/** @type {number} */ now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const s = Math.exp(Math.log(from.s) + (Math.log(v.s) - Math.log(from.s)) * e);
      // Interpolate the page point at the stage center, so the motion reads as one zoom.
      const { w, h } = this.stageSize;
      const c0 = { x: (w / 2 - from.tx) / from.s, y: (h / 2 - from.ty) / from.s };
      const c1 = { x: (w / 2 - v.tx) / v.s, y: (h / 2 - v.ty) / v.s };
      const cx = c0.x + (c1.x - c0.x) * e;
      const cy = c0.y + (c1.y - c0.y) * e;
      this.view = { s, tx: w / 2 - cx * s, ty: h / 2 - cy * s };
      this.paint();
      if (t < 1) this.anim = requestAnimationFrame(stepper);
      else {
        this.view = v;
        this.paint();
      }
    };
    this.anim = requestAnimationFrame(stepper);
  }

  paint() {
    const { s, tx, ty } = this.view;
    this.page.style.transform = this.over.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    const d = this.detailView;
    if (d && !this.detail.hidden) {
      const k = s / d.s;
      this.detail.style.transform = `translate(${tx - d.tx * k}px, ${ty - d.ty * k}px) scale(${k})`;
    }
    this.hooks.onZoom?.(s);
    this.scheduleDetail();
  }

  fit(animate = true) {
    this.applyView(this.fitView(), animate);
  }

  zoomToTarget(animate = true) {
    if (this.target?.bbox && this.target.pageIndex === this.pageIndex) this.applyView(this.targetView(), animate);
    else this.fit(animate);
  }

  /**
   * @param {number} factor
   * @param {number} [cx] stage x to zoom around
   * @param {number} [cy]
   */
  zoomBy(factor, cx, cy) {
    const { w, h } = this.stageSize;
    const x = cx ?? w / 2;
    const y = cy ?? h / 2;
    const v = this.view;
    const min = this.fitView().s * 0.5;
    const s = Math.min(MAX_ZOOM, Math.max(min, v.s * factor));
    const k = s / v.s;
    this.applyView({ s, tx: x - (x - v.tx) * k, ty: y - (y - v.ty) * k }, false);
  }

  /** @param {number} dx @param {number} dy */
  pan(dx, dy) {
    const v = this.view;
    this.applyView({ s: v.s, tx: v.tx + dx, ty: v.ty + dy }, false);
  }

  resized() {
    if (this.pageIndex < 0) return;
    const prev = this.lastStage;
    const now = this.stageSize;
    this.lastStage = now;
    if (prev) {
      // Keep the same page point in the middle of the pane.
      const v = this.view;
      this.view = { s: v.s, tx: v.tx + (now.w - prev.w) / 2, ty: v.ty + (now.h - prev.h) / 2 };
      this.paint();
    }
    const entry = this.cache.get(this.pageIndex);
    if (entry && entry.scale < this.baseScale() * 0.8) void this.renderBase(entry, this.renderToken);
  }

  // ── Sharp re-render of what's on screen ────────────────

  cancelDetail() {
    clearTimeout(this.detailTimer);
    this.detailTask?.cancel();
    this.detailTask = undefined;
    this.detail.hidden = true;
    this.detailView = undefined;
  }

  scheduleDetail() {
    clearTimeout(this.detailTimer);
    this.detailTask?.cancel();
    this.detailTask = undefined;
    const entry = this.cache.get(this.pageIndex);
    if (!entry) return;
    if (this.view.s * this.dpr <= entry.scale * 1.1) {
      this.detail.hidden = true;
      this.detailView = undefined;
      return;
    }
    this.detailTimer = window.setTimeout(() => void this.renderDetail(entry), 110);
  }

  /** @param {{ page: any }} entry */
  async renderDetail(entry) {
    const { w, h } = this.stageSize;
    const dpr = this.dpr;
    const v = { ...this.view };
    const vp = entry.page.getViewport({ scale: v.s * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const task = entry.page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      viewport: vp,
      transform: [1, 0, 0, 1, v.tx * dpr, v.ty * dpr],
      background: "#fff",
    });
    this.detailTask = task;
    try {
      await task.promise;
    } catch {
      return;
    }
    if (this.detailTask !== task || this.cache.get(this.pageIndex) !== entry) return;
    this.detailTask = undefined;
    this.detail.width = canvas.width;
    this.detail.height = canvas.height;
    this.detail.style.width = `${w}px`;
    this.detail.style.height = `${h}px`;
    this.detail.getContext("2d")?.drawImage(canvas, 0, 0);
    this.detailView = v;
    this.detail.hidden = false;
    // Clip to the page so the white background doesn't spill past its edges.
    const x0 = Math.max(0, v.tx);
    const y0 = Math.max(0, v.ty);
    const x1 = Math.min(w, v.tx + this.size.w * v.s);
    const y1 = Math.min(h, v.ty + this.size.h * v.s);
    this.detail.style.clipPath = `inset(${y0}px ${w - x1}px ${h - y1}px ${x0}px)`;
    this.paint();
  }

  // ── Boxes ──────────────────────────────────────────────

  /**
   * @param {{ boxes?: Box[], target?: Box, markups?: any[] }} o
   */
  setOverlay(o) {
    if (o.boxes) this.boxes = o.boxes;
    if ("target" in o) this.target = o.target;
    if (o.markups) this.markups = o.markups;
    this.drawOverlay();
  }

  /** @param {Box | undefined} box the row selected in a list, outlined in the accent color */
  setHover(box) {
    this.hover = box;
    this.drawOverlay();
  }

  drawOverlay() {
    const svg = this.svg;
    svg.textContent = "";
    const page = this.pageIndex;
    const rect = (/** @type {BBox} */ b, /** @type {string} */ cls) => {
      const r = document.createElementNS(SVG, "rect");
      r.setAttribute("x", String(b[0]));
      r.setAttribute("y", String(b[1]));
      r.setAttribute("width", String(Math.max(1, b[2] - b[0])));
      r.setAttribute("height", String(Math.max(1, b[3] - b[1])));
      r.setAttribute("class", cls);
      r.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(r);
      return r;
    };
    for (const b of this.boxes) {
      if (b.pageIndex !== page) continue;
      if (this.target?.id && b.id === this.target.id) continue;
      const r = rect(b.bbox, `box kind-${b.kind ?? "other"}`);
      r.dataset.index = String(this.boxes.indexOf(b));
      if (b.label) {
        const t = document.createElementNS(SVG, "title");
        t.textContent = b.label;
        r.append(t);
      }
    }
    for (const m of this.markups) {
      if (m.pageIndex !== page) continue;
      const r = rect(m.bbox, `markup markup-${m.kind}`);
      const t = document.createElementNS(SVG, "title");
      t.textContent = `Pending ${m.kind}: ${m.text}`;
      r.append(t);
    }
    if (this.target?.bbox && this.target.pageIndex === page) rect(this.target.bbox, "target");
    if (this.hover?.bbox && this.hover.pageIndex === page && this.hover.id !== this.target?.id) rect(this.hover.bbox, "hover");
  }

  /** Briefly pulses the red box, e.g. when the assistant points at something. */
  flash() {
    const t = this.svg.querySelector(".target");
    if (!t) return;
    t.classList.remove("flash");
    void (/** @type {SVGElement} */ (t).getBoundingClientRect());
    t.classList.add("flash");
  }

  // ── Mouse ──────────────────────────────────────────────

  /** @param {number} x @param {number} y stage coordinates → page points */
  toPage(x, y) {
    const v = this.view;
    return { x: (x - v.tx) / v.s, y: (y - v.ty) / v.s };
  }

  listen() {
    const stage = this.stage;
    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const dy = e.deltaY * lines;
        const dx = e.deltaX * lines;
        // A pinch or Ctrl+wheel zooms; so does a mouse wheel click. Two-finger scrolling pans.
        const notch = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
        if (e.ctrlKey || e.metaKey || notch) this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), x, y);
        else this.pan(-dx, -dy);
      },
      { passive: false }
    );

    /** @type {{ x: number, y: number, tx: number, ty: number, moved: boolean, band: boolean } | undefined} */
    let drag;
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false, band: e.shiftKey };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (drag.band) {
        const r = stage.getBoundingClientRect();
        const x0 = Math.min(drag.x, e.clientX) - r.left;
        const y0 = Math.min(drag.y, e.clientY) - r.top;
        Object.assign(this.band.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px` });
        this.band.hidden = false;
        return;
      }
      stage.classList.add("panning");
      this.applyView({ s: this.view.s, tx: drag.tx + dx, ty: drag.ty + dy }, false);
    });
    const end = (/** @type {PointerEvent} */ e) => {
      const d = drag;
      drag = undefined;
      stage.classList.remove("panning");
      if (!d) return;
      const r = stage.getBoundingClientRect();
      if (d.band && d.moved) {
        this.band.hidden = true;
        const a = this.toPage(d.x - r.left, d.y - r.top);
        const b = this.toPage(e.clientX - r.left, e.clientY - r.top);
        const bbox = /** @type {BBox} */ ([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)].map((n) => Math.round(n * 10) / 10));
        this.hooks.onRect?.(bbox, this.pageIndex);
        return;
      }
      if (d.moved) return;
      const p = this.toPage(e.clientX - r.left, e.clientY - r.top);
      const hit = this.boxAt(p.x, p.y);
      if (hit) this.hooks.onBoxClick?.(hit);
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", () => {
      drag = undefined;
      this.band.hidden = true;
    });
    stage.addEventListener("dblclick", (e) => {
      const r = stage.getBoundingClientRect();
      this.zoomBy(e.shiftKey ? 0.5 : 2, e.clientX - r.left, e.clientY - r.top);
    });
  }

  /** The smallest box under a page point, so a tag inside a drawing wins over the drawing. */
  boxAt(/** @type {number} */ x, /** @type {number} */ y) {
    let best;
    let bestArea = Infinity;
    for (const b of this.boxes) {
      if (b.pageIndex !== this.pageIndex) continue;
      const [x0, y0, x1, y1] = b.bbox;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const area = (x1 - x0) * (y1 - y0);
      if (area < bestArea) {
        best = b;
        bestArea = area;
      }
    }
    return best;
  }
}

/**
 * @param {string} tag
 * @param {string} cls
 */
function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
