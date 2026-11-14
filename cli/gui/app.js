// The aecdo app: sheet list, contents, the PDF, and AI chats, all driven from the keyboard.
// The server keeps the navigation state; every move is one small request to it.

import { VirtualList } from "./list.js";
import { PdfView, loadPdfjs } from "./pdf-view.js";
import { ChatPanel } from "./chat.js";
import { SHORTCUTS, HINTS, typing } from "./keys.js";

void loadPdfjs();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {string} path
 * @param {unknown} [body]
 */
async function api(path, body) {
  const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// ── State ────────────────────────────────────────────────

/** @type {any} */ let set = null;
/** @type {any} */ let state = null;
/** @type {any} */ let shown = null;
/** @type {"sheets" | "main" | "pdf" | "chat"} */ let focus = "sheets";
let finding = false;
let quitting = false;
/** @type {any} */ let pdfInfo = null;
/** Selected row for each place, so "back" lands where you were. */
const cursors = new Map();
let previewTimer = 0;
let previewSeq = 0;
let messageTimer = 0;

const app = $("app");
const pdf = new PdfView($("pdf-stage"), {
  onBoxClick: (box) => {
    if (box.command) void openRow({ command: box.command, box });
  },
  onRect: (bbox, pageIndex) => {
    const sheet = set?.sheets.find((/** @type {any} */ s) => s.p === pageIndex);
    if (sheet) markupDialog({ bbox, sheet: sheet.n, label: `the area you drew on ${sheet.n}` });
  },
  onZoom: (s) => {
    $("pdf-zoom").textContent = `${Math.round((s * 100 * 72) / 96)}%`;
  },
  onStatus: (text) => message(text),
});

const sheetList = new VirtualList($("sheet-list"), {
  rowHeight: 30,
  render: (row, _i, el) => {
    if (row.heading) {
      el.innerHTML = `<span class="group-prefix">${esc(row.prefix || "–")}</span><span class="group-name">${esc(row.label)}</span><span class="note">${row.count}</span>`;
      return;
    }
    const current = state?.sheet?.sheetNumber === row.n ? " current" : "";
    el.innerHTML = `<span class="num${current}">${esc(row.n)}</span><span class="label">${esc(row.t)}</span>`;
  },
  onSelect: (row) => {
    if (focus === "sheets") schedulePreview(row.n);
  },
  onOpen: (row) => {
    if (!row.heading) void openSheet(row.n);
  },
});

const mainList = new VirtualList($("main-list"), {
  rowHeight: 30,
  render: (row, _i, el) => {
    if (row.heading) {
      el.innerHTML = `<span class="label">${esc(row.label)}</span>${row.note ? `<span class="note">${esc(row.note)}</span>` : ""}`;
      return;
    }
    const tag = /^r\d+$/.test(row.command) ? "→" : /^\d+$/.test(row.command) ? row.command : "";
    const where = row.box && shown?.sheet && row.box.pageIndex !== shown.sheet.pageIndex ? sheetAt(row.box.pageIndex) : "";
    el.innerHTML = `<span class="n">${esc(tag)}</span><span class="label">${esc(row.label)}</span>${row.note || where ? `<span class="note">${esc([row.note, where && `on ${where}`].filter(Boolean).join(" · "))}</span>` : ""}`;
  },
  onSelect: (row) => {
    pdf.setHover(row.box ? { ...row.box, label: row.label } : undefined);
    if (shown) cursors.set(placeKey(shown), mainList.selected);
  },
  onOpen: (row) => {
    if (!row.heading) void openRow(row);
  },
});

const chat = new ChatPanel($("chat-pane"), {
  api,
  onSheetLink: (sheet) => void openSheet(sheet),
  onLeave: () => setFocus(state?.sheet ? "main" : "sheets"),
  openSettings: () => void settingsModal(),
  openFile: (url) =>
    void api("api/open-file", { url }).then(
      (r) => toast(`Opening ${String(r.path).split(/[\\/]/).pop()}…`),
      (err) => toast(/** @type {Error} */ (err).message, "warn")
    ),
});

/** @param {number} pageIndex */
function sheetAt(pageIndex) {
  return set?.sheets.find((/** @type {any} */ s) => s.p === pageIndex)?.n ?? `page ${pageIndex + 1}`;
}

/** @param {any} s */
function placeKey(s) {
  return s.kind === "preview" ? `preview ${s.location}` : `${s.location}#${s.seq}`;
}

// ── Opening a set ────────────────────────────────────────

async function boot() {
  const r = await api("api/boot");
  if (r.set) await start(r.set);
  else showHome(r.home);
  if (location.hash === "#settings") await settingsModal();
}

/** @param {any} boot */
async function start(boot) {
  set = boot;
  state = boot.state;
  pdfInfo = boot.pdf;
  app.classList.remove("no-set");
  closeModal();
  $("set-title").textContent = set.title;
  $("set-title").title = set.path;
  cursors.clear();
  buildSheetRows();
  void loadPdf();
  void refreshMarkups();
  await chat.reset(set);
  render(state);
  if (state.sheet) setFocus("main");
  else {
    setFocus("sheets");
    const row = sheetList.selectedRow;
    if (row) schedulePreview(row.n, 0);
  }
}

/** @param {any} [query] matching sheet numbers, best first */
function buildSheetRows(query) {
  /** @type {any[]} */
  const rows = [];
  if (query) {
    const by = new Map(set.sheets.map((/** @type {any} */ s) => [s.n, s]));
    for (const n of query) {
      const s = by.get(n);
      if (s) rows.push(s);
    }
  } else if (set.groups) {
    set.groups.forEach((/** @type {any} */ g, /** @type {number} */ gi) => {
      rows.push({ heading: true, prefix: g.prefix, label: g.name, count: g.count });
      for (const s of set.sheets) if (s.g === gi) rows.push(s);
    });
  } else {
    rows.push(...set.sheets);
  }
  const current = state?.sheet?.sheetNumber;
  let sel = current ? rows.findIndex((r) => r.n === current) : -1;
  if (sel < 0) sel = rows.findIndex((r) => !r.heading);
  sheetList.setRows(rows, sel);
  $("sheet-list").classList.toggle("empty", rows.length === 0);
  if (!rows.length) $("sheet-list").dataset.empty = query ? "No sheets match." : "This set has no sheets.";
}

async function loadPdf() {
  const info = pdfInfo;
  $("pdf-missing").hidden = info.available;
  $("pdf-stage").hidden = !info.available;
  $("pdf-bar").hidden = !info.available;
  $("pdf-note").textContent = info.savedCopy ? "" : "original PDF";
  $("pdf-note").title = info.name ?? "";
  if (!info.available) {
    showMissingPdf(info);
    return;
  }
  try {
    await pdf.open(`pdf?v=${info.version}`, `${set.path}#${info.version}`);
    showPdfFor(shown, "keep-or-fit");
  } catch (err) {
    showMissingPdf({ missing: [`Couldn't open ${info.name}: ${/** @type {Error} */ (err).message}`], choices: [] });
  }
}

/** @param {any} info */
function showMissingPdf(info) {
  const box = $("pdf-missing");
  box.hidden = false;
  $("pdf-stage").hidden = true;
  $("pdf-bar").hidden = true;
  const choices = (info.choices ?? []).map((/** @type {string} */ c) => `<button class="choice" data-pdf="${esc(c)}">${esc(c)}</button>`).join("");
  box.innerHTML = `<h2>No PDF to show</h2>
<div class="lines">${(info.missing ?? []).map((/** @type {string} */ l) => `<div>${esc(l)}</div>`).join("")}</div>
${choices ? `<p>Use one of these:</p><div class="choices">${choices}</div>` : ""}
<form id="pdf-form"><input id="pdf-path" placeholder="Path to the PDF (p)" autocomplete="off" spellcheck="false"><button>Open</button></form>`;
  box.querySelectorAll("[data-pdf]").forEach((b) => b.addEventListener("click", () => void choosePdf(/** @type {HTMLElement} */ (b).dataset.pdf ?? "")));
  $("pdf-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void choosePdf(/** @type {HTMLInputElement} */ ($("pdf-path")).value);
  });
}

/** @param {string} path */
async function choosePdf(path) {
  if (!path.trim()) return;
  try {
    pdfInfo = await api("api/pdf", { path: path.trim() });
    await loadPdf();
  } catch (err) {
    toast(/** @type {Error} */ (err).message, "warn");
  }
}

// ── Showing a place ──────────────────────────────────────

/**
 * Fills the contents pane and points the PDF at it.
 * @param {any} s a place from the server, or a sheet preview
 */
function render(s) {
  shown = s;
  const preview = s.kind === "preview";
  app.classList.toggle("previewing", preview);
  $("main-kicker").textContent = preview ? "Preview · Enter opens it" : s.kind === "sheets" || s.kind === "group" ? "" : kindName(s.kind);
  $("main-title").textContent = s.title;
  $("main-subtitle").textContent = s.subtitle;
  renderBody(s);
  /** @type {any[]} */
  const rows = [];
  for (const sec of s.sections) {
    if (sec.heading) rows.push({ heading: true, label: sec.heading, note: sec.note });
    for (const r of sec.rows) rows.push(r);
  }
  const remembered = cursors.get(placeKey(s));
  const first = rows.findIndex((r) => !r.heading);
  mainList.setRows(rows, typeof remembered === "number" && rows[remembered] && !rows[remembered].heading ? remembered : first);
  $("main-pane").classList.toggle("no-rows", rows.length === 0);
  if (!preview) renderCrumbs(s);
  showPdfFor(s, preview ? "fit" : "target");
  if (s.message) message(s.message);
  setWindowTitle();
  if (!preview && s.sheet && sheetList.selectedRow?.n !== s.sheet.sheetNumber) {
    const i = sheetList.rows.findIndex((r) => r.n === s.sheet.sheetNumber);
    if (i >= 0) sheetList.select(i, false);
  }
  sheetList.refresh();
}

/** @param {string} kind */
function kindName(kind) {
  return { sheet: "Sheet", drawing: "Drawing", layer: "Layer", item: "Item", entry: "", preview: "" }[kind] ?? "";
}

/** @param {any} s */
function renderBody(s) {
  const body = $("main-body");
  body.textContent = "";
  body.hidden = false;
  if (s.fields) {
    const dl = document.createElement("dl");
    dl.className = "fields";
    for (const [k, v] of s.fields) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    body.append(dl);
  }
  if (s.table) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const [head, ...rest] = s.table;
    wrap.innerHTML = `<table><thead><tr>${(head ?? []).map((/** @type {string} */ c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rest
      .map((/** @type {string[]} */ r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
    body.append(wrap);
  }
  if (s.body?.length) {
    const text = document.createElement("div");
    text.className = s.fields || s.table ? "text dim" : "text";
    text.textContent = s.body.join("\n");
    body.append(text);
  }
  body.hidden = !body.childElementCount;
}

/** @param {any} s */
function renderCrumbs(s) {
  const nav = $("crumbs");
  nav.innerHTML = s.crumbs
    .map((/** @type {any} */ c, /** @type {number} */ i) => {
      const last = i === s.crumbs.length - 1;
      return `<button class="crumb${last ? " last" : ""}" data-i="${i}"${last ? " disabled" : ""}>${esc(c.label)}</button>`;
    })
    .join('<span class="sep">›</span>');
  nav.querySelectorAll("button[data-i]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = s.crumbs[Number(/** @type {HTMLElement} */ (b).dataset.i)];
      if (c.commands.length) void run(c.commands);
    })
  );
}

/**
 * @param {any} s
 * @param {"fit" | "target" | "keep-or-fit"} how
 */
function showPdfFor(s, how) {
  if (!s || !pdfInfo?.available) return;
  const page = s.target?.pageIndex ?? s.sheet?.pageIndex;
  const boxes = [];
  for (const sec of s.sections) for (const r of sec.rows) if (r.box) boxes.push({ ...r.box, label: r.label, command: r.command });
  const target = s.target && s.kind !== "preview" ? s.target : undefined;
  pdf.setOverlay({ boxes, target });
  const row = mainList.selectedRow;
  pdf.setHover(row?.box && !row.heading ? { ...row.box, label: row.label } : undefined);
  if (page === undefined) return;
  const fit = how === "keep-or-fit" ? (page === pdf.pageIndex ? "keep" : "fit") : how === "target" && target?.bbox ? "target" : "fit";
  $("pdf-where").textContent = `${s.sheet?.sheetNumber ?? ""}  ·  page ${page + 1}${pdf.pageCount ? ` of ${pdf.pageCount}` : ""}`;
  void pdf.show(page, fit);
}

function setWindowTitle() {
  const where = shown && shown.kind !== "preview" && state?.location ? ` — ${state.location}` : "";
  const title = set ? `${set.title}${where}` : "aecdo";
  document.title = title;
  const bound = /** @type {any} */ (window).aecdoSetTitle;
  if (typeof bound === "function") void bound(title);
}

// ── Moving ───────────────────────────────────────────────

/** @param {string[]} commands */
async function run(commands) {
  const s = await api("api/cmd", { commands });
  applyState(s);
}

/** @param {any} s */
function applyState(s) {
  state = s;
  render(s);
  if (s.kind === "sheets" || s.kind === "group") {
    setFocus("sheets");
    const row = sheetList.selectedRow;
    if (row) schedulePreview(row.n, 0);
  } else if (focus === "sheets") {
    setFocus("main");
  }
}

/** @param {string} sheet */
async function openSheet(sheet) {
  if (finding) stopFinding(false);
  applyState(await api("api/sheet", { sheet }));
  setFocus("main");
}

/** @param {any} row */
async function openRow(row) {
  if (shown?.kind === "preview") return openSheet(shown.location);
  if (row.box?.id && !/^(\d+|r\d+)$/.test(row.command)) return applyState(await api("api/id", { id: row.box.id }));
  await run([row.command]);
}

async function back() {
  if (!state) return;
  if (state.canGoBack) await run(["back"]);
  else if (state.kind !== "sheets") await run(["up"]);
}

/**
 * @param {string} sheet
 * @param {number} [delay]
 */
function schedulePreview(sheet, delay = 50) {
  clearTimeout(previewTimer);
  const seq = ++previewSeq;
  previewTimer = window.setTimeout(async () => {
    const p = await api(`api/preview?sheet=${encodeURIComponent(sheet)}`);
    if (seq !== previewSeq || focus !== "sheets" || !p) return;
    render(p);
  }, delay);
}

/** @param {"sheets" | "main" | "pdf" | "chat"} f */
function setFocus(f) {
  if (f === "main" && !state?.sheet) f = "sheets";
  if (f === "chat") openChat();
  const leavingPreview = focus === "sheets" && f !== "sheets";
  focus = f;
  for (const p of document.querySelectorAll(".pane")) p.classList.toggle("focused", /** @type {HTMLElement} */ (p).dataset.focus === f);
  if (leavingPreview && shown?.kind === "preview" && state) {
    previewSeq++;
    render(state);
  }
  if (f === "sheets") {
    if (!finding) $("sheet-list").focus({ preventScroll: true });
    const row = sheetList.selectedRow;
    if (row && state && !state.sheet) schedulePreview(row.n, 0);
  } else if (f === "main") $("main-list").focus({ preventScroll: true });
  else if (f === "pdf") $("pdf-stage").focus({ preventScroll: true });
  else if (f === "chat") {
    // The chat pane takes focus without jumping into the input, so [ ] switch chats; Enter or a starts typing.
    void chat.ensureThread().then(() => {
      if (!chat.typing) chat.blur();
    });
  }
  renderHints();
}

function cycleFocus(/** @type {number} */ dir) {
  /** @type {("sheets" | "main" | "pdf" | "chat")[]} */
  const order = ["sheets", "main", "pdf"];
  if (!$("chat-pane").hidden) order.push("chat");
  const i = order.indexOf(focus);
  setFocus(order[(i + dir + order.length) % order.length]);
}

function renderHints() {
  const hints = (focus === "chat" && chat.typing ? HINTS.chatInput : HINTS[focus]) ?? [];
  $("hints").innerHTML = hints.map(([k, v]) => `<span><kbd>${esc(k)}</kbd> ${esc(v)}</span>`).join("");
}

// ── Finding a sheet ──────────────────────────────────────

const find = /** @type {HTMLInputElement} */ ($("find"));
let findSeq = 0;

function startFinding() {
  finding = true;
  setFocus("sheets");
  find.focus();
  find.select();
}

/** @param {boolean} keep keep the matches listed */
function stopFinding(keep) {
  finding = false;
  if (!keep) {
    find.value = "";
    buildSheetRows();
  }
}

find.addEventListener("focus", () => {
  finding = true;
  if (focus !== "sheets") setFocus("sheets");
});
find.addEventListener("input", async () => {
  const q = find.value;
  const seq = ++findSeq;
  if (!q.trim()) return buildSheetRows();
  const matches = await api(`api/find?q=${encodeURIComponent(q)}`);
  if (seq !== findSeq) return;
  buildSheetRows(matches);
  const row = sheetList.selectedRow;
  if (row) schedulePreview(row.n, 0);
});
find.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    sheetList.move(e.key === "ArrowDown" ? 1 : -1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const row = sheetList.selectedRow;
    if (row && !row.heading) void openSheet(row.n);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    stopFinding(false);
    find.blur();
    setFocus(state?.sheet ? "main" : "sheets");
  }
});

// ── Chat ─────────────────────────────────────────────────

function openChat() {
  if (!$("chat-pane").hidden) return;
  $("chat-pane").hidden = false;
  app.classList.add("chat-open");
  $("chat-btn").textContent = "Hide AI";
}

function toggleChat() {
  const pane = $("chat-pane");
  if (pane.hidden) setFocus("chat");
  else {
    pane.hidden = true;
    app.classList.remove("chat-open");
    $("chat-btn").textContent = "Ask AI";
    if (focus === "chat") setFocus(state?.sheet ? "main" : "sheets");
  }
}

// ── Markups ──────────────────────────────────────────────

/**
 * @typedef {{ slug: string, name: string, file: string, exists: boolean, current: boolean }} MarkupSet
 * @typedef {{ step: number, text: string, time?: string, current: boolean }} HistoryEntry
 * @typedef {{ file?: string, set?: string, sets: MarkupSet[], suggested: string[], markups: { describe: string, sheetNumber: string }[], history: HistoryEntry[], historyNote?: string, error?: string }} MarkupsInfo
 */

/** @type {MarkupsInfo} */
let markupsInfo = { sets: [], suggested: [], markups: [], history: [] };
/** The "New set…" option's value; set names are never empty. */
const NEW_SET = "";

async function refreshMarkups() {
  if (!set) return;
  /** @type {MarkupsInfo} */
  const info = await api("api/markups");
  markupsInfo = info;
  const badge = $("markups-count");
  badge.hidden = info.markups.length === 0;
  badge.textContent = String(info.markups.length);
  const picker = /** @type {HTMLSelectElement} */ ($("markup-set"));
  fillSetSelect(picker, info, true);
  picker.title = info.file ? `Markup set: new markups go here, saved to ${info.file}` : "Markup set";
  if (modal?.kind === "markups") modal.update?.(info);
}

/**
 * The markup sets as options, the current one selected; suggested sets that don't exist yet are offered too.
 * @param {HTMLSelectElement} select
 * @param {MarkupsInfo} info
 * @param {boolean} withNew  adds "New set…"
 */
function fillSetSelect(select, info, withNew) {
  const names = new Set(info.sets.map((s) => s.name.toLowerCase()));
  const extra = info.suggested.filter((n) => !names.has(n.toLowerCase()));
  select.innerHTML = [
    ...info.sets.map((s) => `<option value="${esc(s.name)}"${s.current ? " selected" : ""}>${esc(s.name)}${s.exists ? "" : " (new)"}</option>`),
    ...extra.map((n) => `<option value="${esc(n)}">${esc(n)} (new)</option>`),
    ...(withNew ? [`<option value="${NEW_SET}">New set…</option>`] : []),
  ].join("");
  select.hidden = info.sets.length === 0 && !!info.error;
}

/** @param {string} name */
async function useSet(name) {
  try {
    toast((await api("api/markups", { action: "set", name })).message);
  } catch (err) {
    toast(/** @type {Error} */ (err).message, "warn");
  }
}

/**
 * Asks for a set name, with quick picks.
 * @param {{ title: string, value?: string, picks?: string[], submit: (name: string) => Promise<unknown> }} o
 */
function setNameDialog(o) {
  const body = document.createElement("form");
  body.className = "markup-form set-name";
  const picks = (o.picks ?? []).map((n) => `<button type="button" class="chip" data-pick="${esc(n)}">${esc(n)}</button>`).join("");
  body.innerHTML = `<p class="dim">Each set is its own copy of the PDF, so markups for different purposes stay apart.</p>
${picks ? `<div class="picks">${picks}</div>` : ""}
<input name="name" type="text" maxlength="60" placeholder="Set name, e.g. Code review" value="${esc(o.value ?? "")}">
<div class="actions"><button type="button" data-cancel>Cancel <kbd>Esc</kbd></button><button class="primary">OK <kbd>Enter</kbd></button></div>`;
  const input = /** @type {HTMLInputElement} */ (body.querySelector("input"));
  const submit = async (/** @type {string} */ name) => {
    if (!name.trim()) return input.focus();
    try {
      await o.submit(name.trim());
      closeModal();
    } catch (err) {
      toast(/** @type {Error} */ (err).message, "warn");
    }
  };
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit(input.value);
  });
  body.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => void submit(/** @type {HTMLElement} */ (b).dataset.pick ?? "")));
  body.querySelector("[data-cancel]")?.addEventListener("click", () => closeModal());
  openModal({ kind: "set-name", title: o.title, body });
  input.focus();
  input.select();
}

function newSetDialog() {
  const names = new Set(markupsInfo.sets.map((s) => s.name.toLowerCase()));
  setNameDialog({
    title: "New markup set",
    picks: markupsInfo.suggested.filter((n) => !names.has(n.toLowerCase())),
    submit: async (name) => toast((await api("api/markups", { action: "set", name })).message),
  });
}

/** @param {{ bbox?: number[], sheet?: string, label?: string }} [at] */
function markupDialog(at) {
  if (!set) return;
  if (!pdfInfo?.available) return toast("Markups go on the PDF, and there isn't one open.", "warn");
  const target = at ?? (state?.target?.bbox ? { label: state.target.label } : undefined);
  if (!target) return toast("Open a drawing, item, table, or note to mark it up, or Shift+drag on the PDF.", "warn");
  const kinds = set.markupKinds;
  const body = document.createElement("form");
  body.className = "markup-form";
  body.innerHTML = `<p>On <strong>${esc(target.label ?? "")}</strong></p>
<div class="kinds">${kinds.map((/** @type {string} */ k, /** @type {number} */ i) => `<label><input type="radio" name="kind" value="${k}"${i === 0 ? " checked" : ""}> <kbd>${i + 1}</kbd> ${k}</label>`).join("")}</div>
<textarea name="text" rows="3" placeholder="What's the comment? e.g. Door 209B is not in the door schedule (A601)."></textarea>
<label class="to-set">Adding to <select name="set"></select></label>
<div class="actions"><button type="button" data-cancel>Cancel <kbd>Esc</kbd></button><button class="primary">Add markup <kbd>Enter</kbd></button></div>`;
  const text = /** @type {HTMLTextAreaElement} */ (body.querySelector("textarea"));
  const setSelect = /** @type {HTMLSelectElement} */ (body.querySelector("select[name=set]"));
  fillSetSelect(setSelect, markupsInfo, false);
  if (!setSelect.options.length) setSelect.innerHTML = `<option value="">Markups</option>`;
  const submit = async () => {
    const kind = /** @type {HTMLInputElement} */ (body.querySelector("input[name=kind]:checked")).value;
    if (!text.value.trim()) return text.focus();
    try {
      const r = await api("api/markups/add", { kind, text: text.value, ...(setSelect.value ? { set: setSelect.value } : {}), ...(at?.bbox ? { bbox: at.bbox, sheet: at.sheet } : {}) });
      closeModal();
      toast(`${r.message}. Press m to see your markups or undo.`);
    } catch (err) {
      toast(/** @type {Error} */ (err).message, "warn");
    }
  };
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });
  body.querySelector("[data-cancel]")?.addEventListener("click", () => closeModal());
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (/^[1-9]$/.test(e.key) && e.altKey) {
      const r = /** @type {HTMLInputElement | null} */ (body.querySelectorAll("input[name=kind]")[Number(e.key) - 1]);
      if (r) r.checked = true;
    }
  });
  openModal({
    kind: "markup",
    title: "Add a markup",
    body,
    keys: (e) => {
      if (/^[1-9]$/.test(e.key) && document.activeElement !== text && document.activeElement !== setSelect) {
        const r = /** @type {HTMLInputElement | null} */ (body.querySelectorAll("input[name=kind]")[Number(e.key) - 1]);
        if (r) r.checked = true;
        text.focus();
        return true;
      }
      return false;
    },
  });
  text.focus();
}

/** @param {string} iso */
function shortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function markupsPanel() {
  if (!set) return;
  const body = document.createElement("div");
  body.className = "markups-panel";
  let selected = 0;
  let showHistory = false;
  /** @type {MarkupsInfo} */
  let info = markupsInfo;
  const count = () => (showHistory ? info.history.length : info.markups.length);
  const draw = () => {
    const n = info.markups.length;
    const others = info.sets.filter((s) => !s.current).length;
    const where = info.file
      ? `<strong>${esc(info.set ?? "")}</strong> markups are saved as they're added, to <strong>${esc(info.file)}</strong> next to your PDF. The original PDF isn't changed.`
      : esc(info.error ?? "");
    const head = `<p class="dim">${where}</p>`;
    let list;
    if (showHistory) {
      const rows = info.history
        .map(
          (h, i) =>
            `<li class="${i === selected ? "selected" : ""}${h.current ? " current" : ""}" data-i="${i}"><span class="n">${h.step}</span> ${h.time ? `<span class="time">${esc(shortTime(h.time))}</span> ` : ""}${esc(h.text)}${h.current ? ` <span class="dim">(now)</span>` : ""}</li>`
        )
        .join("");
      list = `${info.historyNote ? `<p>${esc(info.historyNote)}</p>` : ""}${rows ? `<ol>${rows}</ol>` : info.historyNote ? "" : `<p>No changes to this set yet.</p>`}`;
    } else {
      const rows = info.markups.map((m, i) => `<li class="${i === selected ? "selected" : ""}" data-i="${i}"><span class="n">${i + 1}</span> ${esc(m.describe)}</li>`).join("");
      list = rows ? `<ol>${rows}</ol>` : `<p>No markups in this set yet. Ask the AI to cloud or call out something, press <kbd>M</kbd> on a selection, or <kbd>Shift</kbd>+drag on the PDF.</p>`;
    }
    const actions = showHistory
      ? `<button data-a="list"><kbd>h</kbd> Markups</button>
<button data-a="undo"><kbd>u</kbd> Undo</button>
<button data-a="restore" class="primary"${count() ? "" : " disabled"}>Go back to here <kbd>Enter</kbd></button>`
      : `<button data-a="history"><kbd>h</kbd> History</button>
<button data-a="rename"${info.file ? "" : " disabled"}>Rename set</button>
<button data-a="new">New set</button>
<button data-a="undo"><kbd>u</kbd> Undo</button>
<button data-a="delete"${n ? "" : " disabled"}><kbd>x</kbd> Delete</button>
<button data-a="delete-all"${n ? "" : " disabled"}>Delete all</button>
<button data-a="go" class="primary"${n ? "" : " disabled"}>Go to it <kbd>Enter</kbd></button>`;
    body.innerHTML = `${head}${others ? `<p class="dim">Switch sets with the menu under the PDF.</p>` : ""}${list}<div class="actions">${actions}</div>`;
    body.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => void act(/** @type {HTMLElement} */ (b).dataset.a ?? "")));
    body.querySelectorAll("li[data-i]").forEach((li) =>
      li.addEventListener("click", () => {
        selected = Number(/** @type {HTMLElement} */ (li).dataset.i);
        draw();
      })
    );
  };
  const act = async (/** @type {string} */ a) => {
    if (a === "history" || a === "list") {
      showHistory = a === "history";
      selected = 0;
      return draw();
    }
    if (a === "new") return newSetDialog();
    if (a === "rename") {
      return setNameDialog({
        title: `Rename ${info.set ?? "set"}`,
        value: info.set,
        submit: async (name) => toast((await api("api/markups", { action: "rename", name })).message),
      });
    }
    const m = info.markups[selected];
    if (a === "go") {
      if (!m) return;
      closeModal();
      return openSheet(m.sheetNumber);
    }
    /** @type {Record<string, unknown> | undefined} */
    let req;
    if (a === "undo") req = { action: "undo" };
    else if (a === "restore") {
      const h = info.history[selected];
      if (!h || h.current) return;
      req = { action: "restore", step: h.step };
    } else if (m) req = { action: "delete", ...(a === "delete" ? { index: selected + 1 } : {}) };
    if (!req) return;
    try {
      toast((await api("api/markups", req)).message);
    } catch (err) {
      toast(/** @type {Error} */ (err).message, "warn");
    }
  };
  openModal({
    kind: "markups",
    title: "Markups",
    body,
    update: (/** @type {MarkupsInfo} */ next) => {
      info = next;
      selected = Math.min(selected, Math.max(0, count() - 1));
      draw();
    },
    keys: (e) => {
      const k = e.key;
      if (k === "ArrowDown" || k === "j") selected = Math.min(count() - 1, selected + 1);
      else if (k === "ArrowUp" || k === "k") selected = Math.max(0, selected - 1);
      else if (k === "Enter") void act(showHistory ? "restore" : "go");
      else if (k === "h") void act(showHistory ? "list" : "history");
      else if (!showHistory && (k === "x" || k === "Delete" || k === "Backspace")) void act("delete");
      else if (k === "u") void act("undo");
      else return false;
      draw();
      return true;
    },
  });
  draw();
  void refreshMarkups();
}

// ── Modals ───────────────────────────────────────────────

/** @type {{ kind: string, close: () => void, dismiss: () => void, keys?: (e: KeyboardEvent) => boolean, update?: (info: any) => void } | undefined} */
let modal;

/**
 * @param {{ kind: string, title: string, body: HTMLElement, keys?: (e: KeyboardEvent) => boolean, update?: (info: any) => void, onClose?: () => void, dismiss?: () => void, wide?: boolean }} o
 *   `dismiss` is what Esc and a click outside do (default: close).
 */
function openModal(o) {
  closeModal();
  const root = $("modal-root");
  const back = document.createElement("div");
  back.className = "modal-back";
  const box = document.createElement("div");
  box.className = `modal${o.wide ? " wide" : ""}`;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", o.title);
  const h = document.createElement("h2");
  h.textContent = o.title;
  box.append(h, o.body);
  back.append(box);
  root.append(back);
  back.addEventListener("pointerdown", (e) => {
    if (e.target === back) modal?.dismiss();
  });
  modal = {
    kind: o.kind,
    dismiss: o.dismiss ?? closeModal,
    keys: o.keys,
    update: o.update,
    close: () => {
      back.remove();
      o.onClose?.();
    },
  };
}

function closeModal() {
  const m = modal;
  modal = undefined;
  m?.close();
}

/** @type {{ question: string, resolve: (ok: boolean) => void, thread?: string }[]} */
const questions = [];

/**
 * Asks yes or no; questions from the server wait their turn.
 * @param {string} question
 * @param {string} [thread]
 */
function ask(question, thread) {
  return new Promise((resolve) => {
    questions.push({ question, resolve, thread });
    if (questions.length === 1) showQuestion();
  });
}

function showQuestion() {
  const q = questions[0];
  if (!q) return;
  const body = document.createElement("div");
  const from = q.thread ? chat.threads.get(q.thread) : undefined;
  body.innerHTML = `${from ? `<p class="dim">From the chat “${esc(from.title)}”</p>` : ""}<p class="question">${esc(q.question)}</p>
<div class="actions"><button data-no>No <kbd>n</kbd></button><button data-yes class="primary">Yes <kbd>y</kbd></button></div>`;
  const answer = (/** @type {boolean} */ ok) => {
    questions.shift();
    closeModal();
    q.resolve(ok);
    showQuestion();
  };
  body.querySelector("[data-yes]")?.addEventListener("click", () => answer(true));
  body.querySelector("[data-no]")?.addEventListener("click", () => answer(false));
  openModal({
    kind: "confirm",
    title: "Allow this?",
    body,
    onClose: () => {
      if (questions[0] === q) {
        questions.shift();
        q.resolve(false);
        showQuestion();
      }
    },
    keys: (e) => {
      if (e.key === "y" || e.key === "Enter") answer(true);
      else if (e.key === "n") answer(false);
      else return false;
      return true;
    },
  });
  /** @type {HTMLElement | null} */ (body.querySelector("[data-yes]"))?.focus();
}

function helpModal() {
  const body = document.createElement("div");
  body.className = "help";
  body.innerHTML = SHORTCUTS.map(
    ([title, rows]) => `<section><h3>${esc(title)}</h3><table>${rows.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join("")}</table></section>`
  ).join("");
  openModal({ kind: "help", title: "Keyboard shortcuts", body, wide: true, keys: (e) => (e.key === "?" ? (closeModal(), true) : false) });
}

// ── Settings ─────────────────────────────────────────────

const ROUTE_ACTIONS = {
  openai: { signIn: "Sign in with ChatGPT", key: "API key" },
  anthropic: { key: "API key" },
  openrouter: { signIn: "Sign in with OpenRouter", key: "API key" },
  "amazon-bedrock": { form: "bedrock" },
  custom: { form: "custom" },
};

/** @type {{ text: string, url?: string, code?: string } | undefined} */
let authNote;

/**
 * The app's Settings: ways to reach the AI models, which model each @name uses, and the
 * DrawingBot API credentials.
 * @param {any} [info]
 */
async function settingsModal(info) {
  if (!info) {
    try {
      info = await api("api/settings");
    } catch (err) {
      return toast(`Couldn't load Settings: ${/** @type {Error} */ (err).message}`, "warn");
    }
  }
  const body = document.createElement("div");
  body.className = "settings";
  /** @type {string | undefined} which route's form is open */
  let editing;
  let busy = false;

  const routeRow = (/** @type {any} */ r) => {
    const a = /** @type {any} */ (ROUTE_ACTIONS)[r.id] ?? {};
    const buttons = [
      a.signIn ? `<button data-sign-in="${r.id}">${esc(a.signIn)}</button>` : "",
      a.key ? `<button data-edit="${r.id}">${r.configured ? "New " : ""}${esc(a.key)}</button>` : "",
      a.form ? `<button data-edit="${r.id}">${r.configured ? "Change" : "Set up"}</button>` : "",
      r.configured ? `<button data-sign-out="${r.id}" title="Remove the saved sign-in">Remove</button>` : "",
    ].join("");
    return `<li><span class="route-name">${esc(r.label)}</span><span class="${r.configured ? "ok" : "dim"}">${r.configured ? "✓ set up" : "not set up"}</span><span class="row-actions">${buttons}</span>${editing === r.id ? routeForm(r.id) : ""}</li>`;
  };

  const routeForm = (/** @type {string} */ id) => {
    if (id === "amazon-bedrock") {
      return `<form class="settings-form" data-form="bedrock"><p class="dim">Uses your AWS sign-in: a profile, access keys, or a Bedrock API key. The next questions ask which.</p>
<label>AWS region <input name="region" placeholder="us-east-1" autocomplete="off"></label>
<div class="actions"><button type="button" data-cancel>Cancel</button><button class="primary">Continue</button></div></form>`;
    }
    if (id === "custom") {
      const c = info.ai.custom ?? { api: "openai-completions", models: {} };
      const models = info.ai.assistants
        .map((/** @type {any} */ m) => `<label>@${esc(m.name)} model id <input name="model-${m.name}" value="${esc(c.models?.[m.name] ?? "")}" placeholder="leave blank if it has none" autocomplete="off" spellcheck="false"></label>`)
        .join("");
      return `<form class="settings-form" data-form="custom"><p class="dim">An OpenAI- or Anthropic-compatible endpoint, such as a company gateway.</p>
<label>Name <input name="name" value="${esc(c.name ?? "")}" placeholder="Custom endpoint" autocomplete="off"></label>
<label>Base URL <input name="baseUrl" value="${esc(c.baseUrl ?? "")}" placeholder="https://…/v1" autocomplete="off" spellcheck="false" required></label>
<label>API <select name="api"><option value="openai-completions"${c.api === "openai-completions" ? " selected" : ""}>OpenAI chat completions</option><option value="anthropic-messages"${c.api === "anthropic-messages" ? " selected" : ""}>Anthropic messages</option></select></label>
<label>Token <input name="token" type="password" placeholder="${info.ai.custom ? "leave blank to keep the saved one" : "bearer token or API key"}" autocomplete="off"></label>
${models}
<div class="actions"><button type="button" data-cancel>Cancel</button><button class="primary">Save</button></div></form>`;
    }
    return `<form class="settings-form" data-form="key" data-route="${id}"><label>API key <input name="key" type="password" autocomplete="off" required></label>
<div class="actions"><button type="button" data-cancel>Cancel</button><button class="primary">Save</button></div></form>`;
  };

  const assistantRow = (/** @type {any} */ m) => {
    if (!m.available.length) {
      const how = m.possible.map((/** @type {string} */ r) => info.ai.routes.find((/** @type {any} */ x) => x.id === r)?.label ?? r).join(", ");
      return `<tr><td>@${esc(m.name)}</td><td colspan="2" class="dim">needs one of: ${esc(how)}</td></tr>`;
    }
    const routes = m.available.map((/** @type {string} */ r) => `<option value="${r}"${r === m.route ? " selected" : ""}>${esc(info.ai.routes.find((/** @type {any} */ x) => x.id === r)?.label ?? r)}</option>`).join("");
    return `<tr data-name="${m.name}"><td>@${esc(m.name)}</td><td><select data-route aria-label="How @${esc(m.name)} is reached">${routes}</select></td><td><select data-model aria-label="@${esc(m.name)} model"><option>${esc(m.model ?? "")}</option></select></td></tr>`;
  };

  const draw = () => {
    const ai = info.ai;
    const auth = authNote
      ? `<div class="auth-note">${esc(authNote.text)}${authNote.code ? ` <code>${esc(authNote.code)}</code>` : ""}${authNote.url ? `<br><a href="${esc(authNote.url)}" target="_blank" rel="noreferrer">${esc(authNote.url)}</a>` : ""}</div>`
      : "";
    const aiPart = ai.supported
      ? `<p class="dim">Sign in or add a key for at least one of these. Saved in <code>${esc(ai.path)}</code>.</p>
<ul class="routes">${ai.routes.map(routeRow).join("")}</ul>
<h3>Which model each @name uses</h3>
<table class="assistants">${ai.assistants.map(assistantRow).join("")}</table>`
      : `<p class="warn">The AI chat needs Node.js 22.19 or newer. Use the standalone aecdo, or update Node.js.</p>`;
    body.innerHTML = `${auth}<h3>AI models</h3>${aiPart}
<h3>DrawingBot API</h3>
${info.api.available ? `<p class="dim">Turns PDFs into drawing sets: pick one on the home screen. ${info.api.configured ? "Set up." : "Not set up."} Saved in <code>${esc(info.api.path)}</code>.</p>
<form class="settings-form" data-form="api">
<label>Client ID <input name="clientId" placeholder="${esc(info.api.clientId ?? "")}" autocomplete="off" spellcheck="false"${info.api.configured ? "" : " required"}></label>
<label>Client Secret <input name="clientSecret" type="password" placeholder="${info.api.configured ? "leave blank to keep the saved one" : ""}" autocomplete="off"${info.api.configured ? "" : " required"}></label>
<label>Region <select name="region">${info.api.regions.map((/** @type {string} */ r) => `<option${r === info.api.region ? " selected" : ""}>${esc(r)}</option>`).join("")}</select></label>
<div class="actions"><button class="primary">Save</button></div></form>` : `<p class="dim">Turning PDFs into drawing sets is coming soon.</p>`}
<div class="actions"><button data-close>Done <kbd>Esc</kbd></button></div>`;
    body.querySelectorAll("button").forEach((b) => (b.disabled = busy && !b.hasAttribute("data-close")));
    void loadModelChoices();
  };

  const loadModelChoices = async () => {
    for (const row of body.querySelectorAll("tr[data-name]")) {
      const name = /** @type {HTMLElement} */ (row).dataset.name;
      const route = /** @type {HTMLSelectElement} */ (row.querySelector("[data-route]")).value;
      const select = /** @type {HTMLSelectElement} */ (row.querySelector("[data-model]"));
      const current = select.value;
      try {
        /** @type {string[]} */
        const choices = await api(`api/settings/models?name=${encodeURIComponent(name ?? "")}&route=${encodeURIComponent(route)}`);
        if (!select.isConnected) return;
        const list = choices.includes(current) || !current ? choices : [current, ...choices];
        select.innerHTML = list.map((c) => `<option${c === current ? " selected" : ""}>${esc(c)}</option>`).join("");
      } catch {
        // keep the current model
      }
    }
  };

  /** @param {Record<string, unknown>} change */
  const save = async (change) => {
    busy = true;
    draw();
    try {
      const r = await api("api/settings", change);
      info = r.settings;
      editing = undefined;
      authNote = undefined;
      toast(r.message);
    } catch (err) {
      const text = /** @type {Error} */ (err).message;
      if (!/^(Cancelled|aborted)$/i.test(text)) toast(text, "warn");
    }
    busy = false;
    if (body.isConnected) draw();
    else if (!modal) void settingsModal(info);
  };

  body.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.close !== undefined) return closeSettings();
    if (t.dataset.cancel !== undefined) {
      editing = undefined;
      return draw();
    }
    if (t.dataset.edit) {
      editing = editing === t.dataset.edit ? undefined : t.dataset.edit;
      draw();
      return /** @type {HTMLElement | null} */ (body.querySelector(".routes .settings-form input"))?.focus();
    }
    if (t.dataset.signIn) return void save({ action: "sign-in", route: t.dataset.signIn });
    if (t.dataset.signOut) return void save({ action: "sign-out", route: t.dataset.signOut });
  });
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const v = Object.fromEntries(new FormData(form).entries());
    switch (form.dataset.form) {
      case "api":
        return void save({ action: "api", clientId: v.clientId, clientSecret: v.clientSecret, region: v.region });
      case "key":
        return void save({ action: "key", route: form.dataset.route, key: v.key });
      case "bedrock":
        return void save({ action: "bedrock", region: v.region });
      case "custom": {
        /** @type {Record<string, unknown>} */
        const models = {};
        for (const [k, value] of Object.entries(v)) if (k.startsWith("model-")) models[k.slice(6)] = value;
        return void save({ action: "custom", name: v.name, baseUrl: v.baseUrl, api: v.api, token: v.token, models });
      }
    }
  });
  body.addEventListener("change", (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    const row = t.closest("tr[data-name]");
    if (!row) return;
    const name = /** @type {HTMLElement} */ (row).dataset.name;
    const route = /** @type {HTMLSelectElement} */ (row.querySelector("[data-route]")).value;
    void save({ action: "choose", name, route, ...(t.dataset.model !== undefined ? { model: t.value } : {}) });
  });

  draw();
  openModal({
    kind: "settings",
    title: "Settings",
    body,
    wide: true,
    dismiss: closeSettings,
    update: async (/** @type {any} */ next) => {
      if (busy) return;
      if (next) info = next;
      else {
        try {
          info = await api("api/settings");
        } catch {
          return;
        }
      }
      if (body.isConnected) draw();
    },
    keys: () => false,
  });
  if (location.hash === "#settings") history.replaceState(null, "", location.pathname + location.search);
}

function closeSettings() {
  closeModal();
  authNote = undefined;
  if (set) void chat.loadModels();
  else void api("api/home").then(showHome);
}

/**
 * A question from a sign-in: text, a secret, or a choice. Settings comes back once it's answered.
 * @param {{ id: string, kind: "text" | "secret" | "select", message: string, placeholder?: string, options?: { id: string, label: string, description?: string }[] }} p
 */
function promptModal(p) {
  const back = modal?.kind === "settings" || modal?.kind === "prompt" ? "settings" : undefined;
  const body = document.createElement("div");
  body.className = "prompt";
  body.dataset.id = p.id;
  let selected = 0;
  let answered = false;
  const answer = (/** @type {string | null} */ value) => {
    if (answered) return;
    answered = true;
    void api("api/prompt", { id: p.id, value }).catch(() => undefined);
    closeModal();
    if (back) void settingsModal();
  };
  const draw = () => {
    body.innerHTML =
      p.kind === "select"
        ? `<ul class="choices">${(p.options ?? []).map((o, i) => `<li class="${i === selected ? "selected" : ""}" data-i="${i}">${esc(o.label)}${o.description ? `<div class="dim">${esc(o.description)}</div>` : ""}</li>`).join("")}</ul>
<div class="actions"><button data-cancel>Cancel <kbd>Esc</kbd></button></div>`
        : `<form><input type="${p.kind === "secret" ? "password" : "text"}" placeholder="${esc(p.placeholder ?? "")}" autocomplete="off" spellcheck="false">
<div class="actions"><button type="button" data-cancel>Cancel <kbd>Esc</kbd></button><button class="primary">OK <kbd>Enter</kbd></button></div></form>`;
  };
  draw();
  body.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest("[data-cancel]")) return answer(null);
    const li = /** @type {HTMLElement | null} */ (t.closest("li[data-i]"));
    if (li) answer(p.options?.[Number(li.dataset.i)]?.id ?? null);
  });
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    answer(/** @type {HTMLInputElement} */ (body.querySelector("input")).value);
  });
  openModal({
    kind: "prompt",
    title: p.message,
    body,
    dismiss: () => answer(null),
    keys: (e) => {
      if (p.kind !== "select") return false;
      const n = p.options?.length ?? 0;
      if (e.key === "ArrowDown" || e.key === "j") selected = Math.min(n - 1, selected + 1);
      else if (e.key === "ArrowUp" || e.key === "k") selected = Math.max(0, selected - 1);
      else if (e.key === "Enter") {
        answer(p.options?.[selected]?.id ?? null);
        return true;
      } else return false;
      draw();
      return true;
    },
  });
  /** @type {HTMLElement | null} */ (body.querySelector("input"))?.focus();
}

/** @typedef {{ kind: "set" | "pdf" | "recent" | "folder", path: string, name: string, where?: string }} HomeItem */

/** Shows the drawing sets in the current folder, then sets and folders used recently elsewhere. */
/** @param {any} home */
function showHome(home) {
  const body = document.createElement("div");
  body.className = "home";
  const sep = /[\\/]/;
  const name = (/** @type {string} */ p) => p.split(sep).filter(Boolean).pop() ?? p;
  const parent = (/** @type {string} */ p) => p.replace(/[\\/][^\\/]*[\\/]?$/, "") || p;
  const tilde = (/** @type {string} */ p) => (home.homeDir && p.startsWith(home.homeDir) && /^([\\/]|$)/.test(p.slice(home.homeDir.length)) ? "~" + p.slice(home.homeDir.length) : p);
  const recent = /** @type {string[]} */ (home.recent);
  const elsewhere = recent.filter((f) => parent(f) !== home.cwd).slice(0, 5);
  /** @type {{ name: string, status?: string }[]} */
  const pdfs = home.pdfs;
  /** @type {HomeItem[]} */
  const here = [
    ...(/** @type {string[]} */ (home.files)).map((f) => ({ kind: /** @type {const} */ ("set"), path: f, name: f })),
    ...pdfs.map((p) => ({ kind: /** @type {const} */ ("pdf"), path: p.name, name: p.name })),
  ];
  /** @type {HomeItem[]} */
  const others = [
    ...elsewhere.map((f) => ({ kind: /** @type {const} */ ("recent"), path: f, name: name(f), where: tilde(parent(f)) })),
    ...(/** @type {string[]} */ (home.folders))
      .filter((d) => !elsewhere.some((f) => parent(f) === d))
      .slice(0, Math.max(0, 6 - elsewhere.length))
      .map((d) => ({ kind: /** @type {const} */ ("folder"), path: d, name: name(d), where: tilde(parent(d)) })),
  ];
  const items = [...here, ...others];
  const last = here.findIndex((item) => item.kind === "set" && recent[0] && parent(recent[0]) === home.cwd && name(recent[0]) === item.path);
  let selected = Math.max(0, last);
  let typingPath = false;
  const choose = (/** @type {number} */ i) => {
    const item = items[i];
    if (item?.kind === "pdf") void processPdf(item.path);
    else if (item) void openSet(item.path);
  };
  const processPdf = async (/** @type {string} */ name) => {
    if (pdfs.find((p) => p.name === name)?.status) return toast(`${name} is already being processed.`);
    if (!home.canProcess) {
      toast("To process PDFs, add your DrawingBot API credentials in Settings.", "warn");
      return void settingsModal();
    }
    const json = name.replace(/\.pdf$/i, ".jsonld");
    if (!(await ask(`Process ${name}? It's uploaded to the DrawingBot API, and the drawing set is saved next to it as ${json}.`))) return void showHome(home);
    try {
      await api("api/process", { name });
      showHome(await api("api/home"));
    } catch (err) {
      toast(/** @type {Error} */ (err).message, "warn");
      showHome(home);
    }
  };
  const row = (/** @type {HomeItem} */ item, /** @type {number} */ i) => {
    const status = item.kind === "pdf" ? (pdfs.find((p) => p.name === item.path)?.status ?? "Process into a drawing set") : item.where;
    return `<li class="${item.kind}${i === selected ? " selected" : ""}" data-i="${i}"><span class="name">${esc(item.name)}</span>${status ? `<span class="where">${esc(status)}</span>` : ""}</li>`;
  };
  const draw = () => {
    const none = pdfs.length
      ? `<p class="dim">No drawing sets here yet. Process a PDF to make one.</p>`
      : `<p class="dim">No drawing sets here. A drawing set is a <code>.jsonld</code> file: open the folder that has yours.</p>`;
    body.innerHTML = `<div class="folder-bar"><span class="folder" title="${esc(home.cwd)}">In ${esc(tilde(home.cwd))}</span><button data-folder>Open another folder… <kbd>o</kbd></button></div>
${home.files.length ? "" : none}<ul class="files">${here.map((item, i) => row(item, i)).join("")}</ul>
${others.length ? `<h3>Recent</h3><ul class="files">${others.map((item, i) => row(item, here.length + i)).join("")}</ul>` : ""}
<form class="open-path"${typingPath ? "" : " hidden"}><input placeholder="Path to a .jsonld file or a folder" autocomplete="off" spellcheck="false"><button class="primary">Open</button></form>
<div class="actions"><button data-settings>Settings <kbd>,</kbd></button></div>`;
    body.querySelector("[data-settings]")?.addEventListener("click", () => void settingsModal());
    body.querySelector("[data-folder]")?.addEventListener("click", () => void pickFolder());
    body.querySelectorAll("li[data-i]").forEach((li) => li.addEventListener("click", () => choose(Number(/** @type {HTMLElement} */ (li).dataset.i))));
    body.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void openSet(/** @type {HTMLInputElement} */ (body.querySelector("input")).value);
    });
  };
  const focusPath = () => {
    if (!typingPath) {
      typingPath = true;
      draw();
    }
    /** @type {HTMLInputElement} */ (body.querySelector("input")).focus();
  };
  const pickFolder = async () => {
    try {
      const r = await api("api/folder/pick", {});
      if (r.home) showHome(r.home);
      else if (r.unavailable) {
        toast("There's no folder dialog on this computer (install zenity or kdialog). Type the folder's path instead.", "warn");
        focusPath();
      }
    } catch (err) {
      toast(/** @type {Error} */ (err).message, "warn");
    }
  };
  draw();
  openModal({
    kind: "home",
    title: "Open a drawing set",
    body,
    wide: true,
    update: (/** @type {{ file: string, status?: string }} */ ev) => {
      const pdf = pdfs.find((p) => p.name === ev.file);
      if (!pdf) return;
      pdf.status = ev.status;
      draw();
    },
    dismiss: () => set && closeModal(),
    keys: (e) => {
      if (typing(e)) return false;
      if (e.key === ",") return void settingsModal(), true;
      if (e.key === "o") return void pickFolder(), true;
      if (e.key === "ArrowDown" || e.key === "j") selected = Math.min(items.length - 1, selected + 1);
      else if (e.key === "ArrowUp" || e.key === "k") selected = Math.max(0, selected - 1);
      else if (e.key === "Enter" && items[selected]) choose(selected);
      else if (e.key === "/" || e.key === "p") {
        e.preventDefault();
        focusPath();
        return true;
      } else return false;
      draw();
      return true;
    },
  });
}

/** @param {string} path */
async function openSet(path) {
  if (!path?.trim()) return;
  try {
    const r = await api("api/open", { path: path.trim() });
    if (r.home) showHome(r.home);
    else await start(r.set);
  } catch (err) {
    toast(/** @type {Error} */ (err).message, "warn");
  }
}

async function quit() {
  quitting = true;
  try {
    await api("api/quit", {});
  } catch {
    // already gone
  }
  const close = /** @type {any} */ (window).aecdoClose;
  if (typeof close === "function") void close();
  document.body.innerHTML = '<div class="closed">aecdo has quit. You can close this window.</div>';
}

// ── Messages ─────────────────────────────────────────────

/** @param {string} text */
function message(text) {
  const m = $("message");
  m.textContent = text;
  m.classList.add("show");
  clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => m.classList.remove("show"), 6000);
}

/**
 * @param {string} text
 * @param {"info" | "warn"} [level]
 */
function toast(text, level = "info") {
  const t = document.createElement("div");
  t.className = `toast ${level}`;
  t.textContent = text;
  $("toasts").append(t);
  setTimeout(() => t.classList.add("gone"), level === "warn" ? 8000 : 4500);
  setTimeout(() => t.remove(), level === "warn" ? 8600 : 5100);
}

// ── Events from the server ───────────────────────────────

function listen() {
  const events = new EventSource("api/events");
  events.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    switch (ev.type) {
      case "state":
        void api("api/state").then((s) => {
          applyState(s);
          if (focus === "sheets" && s.sheet) setFocus("main");
        });
        break;
      case "focus":
        pdf.zoomToTarget(true);
        setTimeout(() => pdf.flash(), 200);
        break;
      case "markups":
        void refreshMarkups();
        break;
      case "pdf":
        void api("api/pdf-info").then((info) => {
          pdfInfo = info;
          return loadPdf();
        });
        break;
      case "toast":
        toast(ev.text, ev.level);
        break;
      case "chat":
        chat.onEvent(ev);
        break;
      case "prompt":
        promptModal(ev);
        break;
      case "prompt-cancel":
        if (modal?.kind === "prompt" && /** @type {HTMLElement | null} */ (document.querySelector(".prompt"))?.dataset.id === ev.id) {
          closeModal();
          void settingsModal();
        }
        break;
      case "auth":
        authNote = { text: ev.text, url: ev.url, code: ev.code };
        if (modal?.kind === "settings") void modal.update?.(undefined);
        else toast(ev.code ? `${ev.text} ${ev.url ?? ""}` : ev.text);
        break;
      case "settings":
        if (modal?.kind === "settings") void modal.update?.(undefined);
        if (set) void chat.loadModels();
        break;
      case "process":
        onProcess(ev);
        break;
      case "confirm":
        void ask(ev.question, ev.thread).then((ok) => api("api/confirm", { id: ev.id, ok }));
        break;
    }
  };
  events.onerror = () => {
    if (quitting) events.close();
  };
}

/**
 * Progress on a PDF being processed: the home screen shows it next to the PDF, and the finished
 * set opens unless one is already open.
 * @param {{ file: string, status?: string, done?: string, error?: string }} ev
 */
function onProcess(ev) {
  if (ev.error) toast(ev.error, "warn");
  if (ev.done) {
    if (!set || modal?.kind === "home") void openSet(ev.done);
    else toast(`${ev.file} is ready: ${ev.done}. Open it from the home screen.`);
    return;
  }
  if (modal?.kind === "home") void modal.update?.(ev);
}

// ── Keys ─────────────────────────────────────────────────

let digits = "";
let digitTimer = 0;

/** @param {KeyboardEvent} e */
function onKey(e) {
  if (modal) {
    if (e.key === "Escape") {
      e.preventDefault();
      return modal.dismiss();
    }
    if (modal.keys?.(e)) e.preventDefault();
    return;
  }
  if (!set) return;
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    return void settingsModal();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q")) {
    e.preventDefault();
    return void quit();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "t" || e.key === "T")) {
    e.preventDefault();
    setFocus("chat");
    return void chat.newThread();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    return startFinding();
  }
  if (typing(e)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const k = e.key;
  const list = focus === "sheets" ? sheetList : mainList;
  const handled = () => e.preventDefault();

  if (focus === "chat") {
    // In the chat, [ ] switch chats and Esc leaves; any other character starts typing the question.
    switch (k) {
      case "Enter":
        handled();
        return chat.focus();
      case "Delete":
        handled();
        if (chat.current) void chat.close(chat.current).then(() => chat.ensureThread());
        return;
      case "ArrowDown":
      case "ArrowUp":
        handled();
        return chat.scroll(k === "ArrowDown" ? 1 : -1);
      case "PageDown":
      case "PageUp":
        handled();
        return chat.scroll(k === "PageUp" ? -1 : 1, true);
      case "[":
      case "]":
      case "Tab":
        break;
      default:
        if (k.length === 1) {
          handled();
          return chat.focus(chat.input.value + k);
        }
    }
  }

  if (e.shiftKey && k.startsWith("Arrow")) {
    handled();
    const step = 120;
    return pdf.pan(k === "ArrowLeft" ? step : k === "ArrowRight" ? -step : 0, k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0);
  }

  if (focus === "pdf" && k.startsWith("Arrow")) {
    handled();
    const step = 80;
    return pdf.pan(k === "ArrowLeft" ? step : k === "ArrowRight" ? -step : 0, k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0);
  }

  switch (k) {
    case "ArrowDown":
    case "j":
      handled();
      return list.move(1);
    case "ArrowUp":
    case "k":
      handled();
      return list.move(-1);
    case "PageDown":
      handled();
      return list.page(1);
    case "PageUp":
      handled();
      return list.page(-1);
    case "Home":
      handled();
      return list.home();
    case "End":
      handled();
      return list.end();
    case "Enter":
    case "ArrowRight":
    case "l":
      handled();
      if (focus === "pdf") return;
      return list.open();
    case "ArrowLeft":
    case "h":
    case "Backspace":
      handled();
      return void back();
    case "Escape":
      handled();
      if (focus === "pdf" || focus === "chat") return setFocus(state?.sheet ? "main" : "sheets");
      return void back();
    case "u":
      handled();
      return void run(["up"]);
    case "Tab":
      handled();
      return cycleFocus(e.shiftKey ? -1 : 1);
    case "/":
      handled();
      return startFinding();
    case "a":
      handled();
      return setFocus("chat");
    case "@":
      handled();
      setFocus("chat");
      return chat.focus("@");
    case "t":
      handled();
      setFocus("chat");
      return void chat.newThread();
    case "[":
    case "]":
      handled();
      openChat();
      return chat.cycle(k === "]" ? 1 : -1);
    case "c":
      handled();
      return toggleChat();
    case "m":
      handled();
      return markupsPanel();
    case "M":
      handled();
      return markupDialog();
    case "z":
      handled();
      return pdf.zoomToTarget(true);
    case "f":
    case "0":
      if (k === "0" && digits) break;
      handled();
      return pdf.fit(true);
    case "+":
    case "=":
      handled();
      return pdf.zoomBy(1.25);
    case "-":
    case "_":
      handled();
      return pdf.zoomBy(0.8);
    case "d":
      handled();
      return void run(["details"]);
    case "o":
      handled();
      return void api("api/home").then(showHome);
    case "p":
      if (!pdfInfo?.available) {
        handled();
        return $("pdf-path")?.focus();
      }
      return;
    case "?":
      handled();
      return helpModal();
    case ",":
      handled();
      return void settingsModal();
    case "q":
      handled();
      return void quit();
  }
  if (/^[0-9]$/.test(k) && focus !== "sheets") {
    handled();
    digits += k;
    clearTimeout(digitTimer);
    digitTimer = window.setTimeout(() => (digits = ""), 900);
    const i = mainList.rows.findIndex((r) => r.command === digits);
    if (i >= 0) {
      mainList.select(i);
      message(`Row ${digits}. Enter opens it.`);
    }
  }
}

document.addEventListener("keydown", onKey);

// ── Buttons ──────────────────────────────────────────────

$("help-btn").addEventListener("click", helpModal);
$("settings-btn").addEventListener("click", () => void settingsModal());
$("chat-btn").addEventListener("click", toggleChat);
$("chat-hide").addEventListener("click", toggleChat);
$("chat-input").addEventListener("focus", renderHints);
$("chat-input").addEventListener("blur", renderHints);
$("markups-btn").addEventListener("click", markupsPanel);
$("markup-set").addEventListener("change", (e) => {
  const select = /** @type {HTMLSelectElement} */ (e.target);
  if (select.value === NEW_SET) {
    fillSetSelect(select, markupsInfo, true);
    newSetDialog();
  } else {
    void useSet(select.value);
  }
  select.blur();
});
$("zoom-in").addEventListener("click", () => pdf.zoomBy(1.25));
$("zoom-out").addEventListener("click", () => pdf.zoomBy(0.8));
$("zoom-fit").addEventListener("click", () => pdf.fit(true));
$("zoom-target").addEventListener("click", () => pdf.zoomToTarget(true));
for (const pane of document.querySelectorAll(".pane")) {
  pane.addEventListener("pointerdown", () => {
    const f = /** @type {any} */ (/** @type {HTMLElement} */ (pane).dataset.focus);
    if (f && f !== focus) setFocus(f);
  });
}

renderHints();
listen();
boot().catch((err) => toast(`Couldn't start: ${/** @type {Error} */ (err).message}`, "warn"));
