// AI chat threads: each tab is its own conversation with whichever @model it was last given.

/**
 * @typedef {{ role: "user" | "assistant" | "status" | "tool", text: string }} Entry
 * @typedef {{ id: string, title: string, model: string, modelLabel: string, busy: boolean, entries: Entry[] }} Thread
 * @typedef {{ name: string, label: string, words: string[] }} Mention
 * @typedef {{ id: string, title: string, model: string, modelLabel: string, created: string, updated: string, questions: number, open: boolean }} PastChat
 */

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * Turns file:// links in escaped HTML into links the app opens: Markdown [name](file:///…), a
 * Markdown link inside backticks, or a bare file:///… URL (shown by its file name).
 * @param {string} html
 */
export function linkFiles(html) {
  const link = (/** @type {string} */ url, /** @type {string} */ label) => `<a href="#" class="file-link" data-url="${url}" title="Open ${url}">${label}</a>`;
  return html
    .replace(/`?\[([^\]\n]+)\]\((file:\/\/[^)\s]+)\)`?/g, (_m, label, url) => link(url, label))
    .replace(/(<a [^>]*>.*?<\/a>)|`?(file:\/\/[^\s<>`)]+)`?/g, (m, a, url) => {
      if (a || !url) return m;
      const clean = url.replace(/[.,;:]+$/, "");
      let name = clean.split("/").pop() || clean;
      try {
        name = decodeURIComponent(name);
      } catch {
        // keep it encoded
      }
      return link(clean, escapeHtml(name)) + url.slice(clean.length);
    });
}

/**
 * Turns Markdown links to an @id in escaped HTML, [door 209B](urn:uuid:…), into links that open
 * that item, table, note, drawing, or layer and zoom the PDF to it.
 * @param {string} html
 */
export function linkSources(html) {
  return html.replace(
    /`?\[([^\]\n]+)\]\(#?(urn:[^)\s]+)\)`?/g,
    (_m, label, id) => `<a href="#" class="source-link" data-id="${id}" title="Show on the drawing">${label}</a>`
  );
}

/**
 * Light Markdown (paragraphs, "- " lists, **bold**, `code`) with sheet numbers, @id sources, and file:// links turned into links.
 * @param {string} text
 * @param {Set<string>} sheets upper-cased sheet numbers
 */
export function renderMarkdown(text, sheets) {
  const inline = (/** @type {string} */ line) => {
    let html = linkFiles(linkSources(escapeHtml(line)));
    html = html.replace(/(<a [^>]*>.*?<\/a>)|`([^`]+)`/g, (m, a, code) => (a ? m : `<code>${code}</code>`));
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Sheet numbers like A101 or S-201 become links; skip text inside tags, links and code.
    html = html.replace(/(<code>.*?<\/code>|<a [^>]*>.*?<\/a>)|(<[^>]+>)|([A-Za-z]{0,3}[-.]?\d[\w.-]*)/g, (m, code, tag, word) => {
      if (code || tag || !word) return m;
      const clean = word.replace(/[.,;:]+$/, "");
      if (!sheets.has(clean.toUpperCase())) return m;
      return `<a href="#" class="sheet-link" data-sheet="${escapeHtml(clean)}">${escapeHtml(clean)}</a>${escapeHtml(word.slice(clean.length))}`;
    });
    return html;
  };
  const out = [];
  /** @type {string | null} */
  let list = null;
  /** @type {string[]} */
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)?.[1] ?? "")}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    closeList();
    para.push(line.replace(/^#+\s+/, ""));
  }
  flushPara();
  closeList();
  return out.join("");
}

/** "4:12 PM" today, "Nov 16" this year, else "Nov 16, 2025". */
export function when(/** @type {string} */ iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export class ChatPanel {
  /**
   * @param {HTMLElement} root
   * @param {{
   *   api: (path: string, body?: unknown) => Promise<any>,
   *   onSheetLink: (sheet: string) => void,
   *   onSourceLink: (id: string) => void,
   *   onLeave: () => void,
   *   openSettings: () => void,
   *   openFile: (url: string) => void,
   * }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    /** @type {Map<string, Thread>} */
    this.threads = new Map();
    /** @type {string | undefined} */
    this.current = undefined;
    /** @type {Set<string>} */
    this.sheets = new Set();
    /** @type {Mention[]} */
    this.mentions = [];
    /** @type {{ name: string, label: string, detail: string }[]} */
    this.models = [];
    /** @type {string[]} */
    this.sent = [];
    this.recall = -1;
    /** This set's saved chats, newest first. @type {PastChat[]} */
    this.past = [];
    this.pastOpen = false;
    this.pastPick = 0;

    this.tabs = /** @type {HTMLElement} */ (root.querySelector("#thread-tabs"));
    this.log = /** @type {HTMLElement} */ (root.querySelector("#chat-log"));
    this.input = /** @type {HTMLTextAreaElement} */ (root.querySelector("#chat-input"));
    this.modelLine = /** @type {HTMLElement} */ (root.querySelector("#chat-model"));
    this.stopButton = /** @type {HTMLButtonElement} */ (root.querySelector("#chat-stop"));
    this.pastButton = /** @type {HTMLButtonElement} */ (root.querySelector("#chat-past"));

    this.input.addEventListener("keydown", (e) => this.onKey(e));
    this.input.addEventListener("input", () => this.autosize());
    this.stopButton.addEventListener("click", () => this.stop());
    this.pastButton.addEventListener("click", () => void (this.pastOpen ? this.hidePast() : this.showPast()));
    this.tabs.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const close = t.closest("[data-close]");
      if (close) return void this.close(/** @type {HTMLElement} */ (close).dataset.close ?? "");
      if (t.closest("[data-new]")) return void this.newThread();
      const tab = /** @type {HTMLElement | null} */ (t.closest("[data-thread]"));
      if (tab) this.switchTo(tab.dataset.thread ?? "");
    });
    this.log.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const resume = /** @type {HTMLElement | null} */ (target.closest("[data-resume]"));
      if (resume) return void this.resume(resume.dataset.resume ?? "");
      if (target.closest("[data-past]")) return void this.showPast();
      if (target.closest("[data-past-close]")) return this.hidePast();
      const file = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("a.file-link"));
      if (file) {
        e.preventDefault();
        return this.deps.openFile(file.dataset.url ?? "");
      }
      const source = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("a.source-link"));
      if (source) {
        e.preventDefault();
        return this.deps.onSourceLink(source.dataset.id ?? "");
      }
      const a = /** @type {HTMLElement} */ (e.target).closest("a.sheet-link");
      if (!a) return;
      e.preventDefault();
      this.deps.onSheetLink(/** @type {HTMLElement} */ (a).dataset.sheet ?? "");
    });
    this.modelLine.addEventListener("click", (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest("[data-settings]")) this.deps.openSettings();
    });
    this.modelLine.addEventListener("change", (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      if (sel.value) void this.send(`@${sel.value}`);
      this.input.focus();
    });
  }

  /**
   * @param {{ sheets: { n: string }[], mentions: Mention[] }} set
   */
  async reset(set) {
    this.sheets = new Set(set.sheets.map((s) => s.n.toUpperCase()));
    this.mentions = set.mentions;
    this.threads.clear();
    this.current = undefined;
    this.pastOpen = false;
    /** @type {[Thread[], PastChat[]]} */
    const [list, past] = await Promise.all([this.deps.api("api/chat"), this.deps.api("api/chat/past").catch(() => [])]);
    for (const t of list) this.threads.set(t.id, t);
    this.past = past;
    this.current = list[0]?.id;
    this.renderTabs();
    this.renderLog();
    void this.loadModels();
  }

  async loadModels() {
    try {
      this.models = await this.deps.api("api/assistants");
    } catch {
      this.models = [];
    }
    this.renderModel();
  }

  get thread() {
    return this.current ? this.threads.get(this.current) : undefined;
  }

  get busy() {
    return Boolean(this.thread?.busy);
  }

  /** Makes sure there is a thread to type in. */
  async ensureThread() {
    if (!this.thread) await this.newThread(false);
  }

  async newThread(focus = true) {
    /** @type {Thread} */
    const t = await this.deps.api("api/chat/new", { model: this.thread?.model });
    this.threads.set(t.id, t);
    this.current = t.id;
    this.pastOpen = false;
    this.renderTabs();
    this.renderLog();
    this.renderModel();
    if (focus) this.focus();
  }

  /** @param {string} id */
  async close(id) {
    await this.deps.api("api/chat/close", { thread: id });
    const ids = [...this.threads.keys()];
    const at = ids.indexOf(id);
    this.threads.delete(id);
    if (this.current === id) this.current = ids[at + 1] ?? ids[at - 1];
    this.renderTabs();
    this.renderLog();
    this.renderModel();
  }

  /** Lists this set's saved chats in place of the chat. */
  async showPast() {
    try {
      this.past = await this.deps.api("api/chat/past");
    } catch {
      // Keeps the list from before.
    }
    this.pastOpen = true;
    this.pastPick = 0;
    this.renderLog();
    this.log.focus({ preventScroll: true });
  }

  hidePast() {
    if (!this.pastOpen) return;
    this.pastOpen = false;
    this.renderLog();
  }

  /** Opens a saved chat in a tab (or goes to its tab), to carry on where it stopped. */
  async resume(/** @type {string} */ id) {
    /** @type {Thread} */
    const t = await this.deps.api("api/chat/resume", { thread: id });
    if (!this.threads.has(t.id)) this.threads.set(t.id, t);
    // An empty chat nobody typed in gives its place to the one picked.
    const blank = this.thread;
    if (blank && blank.id !== t.id && !blank.entries.length && !blank.busy) {
      void this.deps.api("api/chat/close", { thread: blank.id });
      this.threads.delete(blank.id);
    }
    this.pastOpen = false;
    this.current = t.id;
    this.renderTabs();
    this.renderLog();
    this.renderModel();
    this.focus();
  }

  /**
   * Keys in the list of past chats: ↑ ↓ pick, Enter opens, Esc goes back to the chat.
   * @param {string} k
   * @returns {boolean} whether the key was used
   */
  pastKey(k) {
    if (!this.pastOpen) return false;
    const n = this.past.length;
    switch (k) {
      case "ArrowDown":
      case "j":
      case "ArrowUp":
      case "k":
        if (n) this.pastPick = Math.min(n - 1, Math.max(0, this.pastPick + (k === "ArrowDown" || k === "j" ? 1 : -1)));
        this.renderLog();
        return true;
      case "Enter": {
        const pick = this.past[this.pastPick];
        if (pick) void this.resume(pick.id);
        return true;
      }
      case "Escape":
      case "ArrowLeft":
      case "Backspace":
        this.hidePast();
        return true;
    }
    return false;
  }

  /**
   * @param {PastChat} c
   * @param {boolean} picked
   */
  pastRow(c, picked) {
    const asked = `${c.questions} question${c.questions === 1 ? "" : "s"}`;
    const open = c.open ? ' <span class="past-open">open</span>' : "";
    return `<button class="past-row${picked ? " picked" : ""}" data-resume="${escapeHtml(c.id)}" title="Carry on with this chat"><span class="past-title">${escapeHtml(c.title)}${open}</span><span class="dim">${escapeHtml(c.modelLabel)} · ${asked} · ${escapeHtml(when(c.updated))}</span></button>`;
  }

  renderPast() {
    const wrap = document.createElement("div");
    wrap.className = "past";
    const rows = this.past.map((c, i) => this.pastRow(c, i === this.pastPick)).join("");
    wrap.innerHTML = `<div class="past-head"><strong>Past chats</strong><span class="dim">in this drawing set</span><button class="chip" data-past-close title="Back to the chat (Esc)">Back</button></div>${
      rows || '<p class="dim">No saved chats for this set yet. Each chat is saved as you ask, so you can come back to it here.</p>'
    }`;
    this.log.append(wrap);
    wrap.querySelector(".picked")?.scrollIntoView({ block: "nearest" });
  }

  /** @param {string} id */
  switchTo(id) {
    if (!this.threads.has(id)) return;
    const typing = document.activeElement === this.input;
    this.current = id;
    this.pastOpen = false;
    this.renderTabs();
    this.renderLog();
    this.renderModel();
    if (typing) this.focus();
  }

  /** @param {number} dir */
  cycle(dir) {
    const ids = [...this.threads.keys()];
    if (ids.length < 2 || !this.current) return;
    const i = (ids.indexOf(this.current) + dir + ids.length) % ids.length;
    this.switchTo(ids[i]);
  }

  /** @param {string} [text] */
  focus(text) {
    if (text !== undefined) {
      this.input.value = text;
      this.autosize();
    }
    this.input.focus();
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
  }

  /** Leaves the input but stays in the chat, so [ ] switch chats, ↑ scrolls, and Esc leaves. */
  blur() {
    this.log.focus({ preventScroll: true });
  }

  get typing() {
    return document.activeElement === this.input;
  }

  /** @param {number} dir */
  scroll(dir, page = false) {
    this.log.scrollBy({ top: dir * (page ? this.log.clientHeight * 0.9 : 60) });
  }

  stop() {
    if (this.current) void this.deps.api("api/chat/stop", { thread: this.current });
  }

  /** @param {string} text */
  async send(text) {
    this.hidePast();
    await this.ensureThread();
    const id = this.current;
    if (!id) return;
    await this.deps.api("api/chat/send", { thread: id, text });
  }

  /** @param {KeyboardEvent} e */
  onKey(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      if (this.busy && !text.startsWith("@")) {
        this.flashModel("Still answering. Press Esc to stop it, or open another chat with Ctrl+T.");
        return;
      }
      this.sent.push(text);
      this.recall = -1;
      this.input.value = "";
      this.autosize();
      void this.send(text);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (this.busy) this.stop();
      else this.blur();
      return;
    }
    if (e.key === "Tab" && /^@\w*$/.test(this.input.value.split(/\s/)[0] ?? "") && !this.input.value.includes(" ")) {
      e.preventDefault();
      this.completeMention();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "PageDown" || e.key === "PageUp")) {
      e.preventDefault();
      this.cycle(e.key === "PageDown" ? 1 : -1);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      this.recallSent(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const caret = this.input.selectionStart;
    if (e.key === "ArrowUp" && !e.shiftKey && caret === this.input.selectionEnd && !this.input.value.slice(0, caret).includes("\n")) {
      e.preventDefault();
      this.blur();
    }
  }

  /** @param {number} dir -1 for the message before, 1 for the one after */
  recallSent(dir) {
    if (!this.sent.length || (dir > 0 && this.recall < 0)) return;
    this.recall = this.recall < 0 ? this.sent.length - 1 : Math.max(0, this.recall + dir);
    this.input.value = this.sent[this.recall] ?? "";
    if (this.recall >= this.sent.length) this.recall = -1;
    this.autosize();
  }

  /** ↓ in the chat scrolls the answers until the end, then steps into the input. */
  down() {
    if (this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 2) this.focus();
    else this.scroll(1);
  }

  completeMention() {
    const typed = this.input.value.slice(1).toLowerCase();
    const set = new Set(this.models.filter((m) => m.detail !== "not set up").map((m) => m.name));
    const names = this.mentions.flatMap((m) => m.words.map((w) => ({ w, ok: set.has(m.name) })));
    const match = names.filter((n) => n.w.startsWith(typed)).sort((a, b) => Number(b.ok) - Number(a.ok))[0];
    if (match) this.input.value = `@${match.w} `;
  }

  autosize() {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(160, this.input.scrollHeight)}px`;
  }

  /** @param {any} ev a "chat" event from the server */
  onEvent(ev) {
    const t = this.threads.get(ev.thread);
    if (!t) return;
    if (ev.op === "thread") {
      Object.assign(t, ev.info);
      this.renderTabs();
      if (ev.thread === this.current) this.renderModel();
      this.updateWorking();
      return;
    }
    if (ev.op === "entry") {
      t.entries.push(ev.entry);
      if (ev.thread === this.current && !this.pastOpen) this.appendEntry(ev.entry);
      return;
    }
    if (ev.op === "delta") {
      const last = t.entries.at(-1);
      if (last?.role === "assistant") last.text += ev.text;
      else t.entries.push({ role: "assistant", text: ev.text });
      if (ev.thread === this.current && !this.pastOpen) this.updateLastAssistant(t);
    }
  }

  renderTabs() {
    const parts = [...this.threads.values()].map((t, i) => {
      const cls = t.id === this.current ? "tab active" : "tab";
      const busy = t.busy ? '<span class="dot busy" aria-label="answering"></span>' : "";
      return `<div class="${cls}" role="tab" aria-selected="${t.id === this.current}" data-thread="${t.id}" title="${escapeHtml(t.title)} (${t.modelLabel})">${busy}<span class="tab-n">${i + 1}</span><span class="tab-title">${escapeHtml(t.title)}</span><button class="x" data-close="${t.id}" title="Close this chat (x)" aria-label="Close chat ${i + 1}">×</button></div>`;
    });
    parts.push('<button class="tab new" data-new title="New chat (Ctrl+T, or t)">+</button>');
    this.tabs.innerHTML = parts.join("");
  }

  renderModel() {
    const t = this.thread;
    const setUp = this.models.filter((m) => m.detail && m.detail !== "not set up");
    const current = this.models.find((m) => m.name === t?.model);
    const opts = setUp.map((m) => `<option value="${m.name}"${m.name === t?.model ? " selected" : ""}>${escapeHtml(m.label)}</option>`).join("");
    if (!this.models.length) {
      this.modelLine.innerHTML = '<span class="dim">Checking which AI models are set up…</span>';
    } else if (!setUp.length) {
      this.modelLine.innerHTML = '<span class="warn">No AI model is set up yet.</span> <button class="chip" data-settings>Set one up in Settings <kbd>,</kbd></button>';
    } else {
      const detail = current && current.detail !== "not set up" ? `<span class="dim">${escapeHtml(current.detail)}</span>` : '<span class="warn">not set up</span>';
      this.modelLine.innerHTML = `<select aria-label="Model">${opts}${current && !setUp.includes(current) ? `<option selected value="">${escapeHtml(current.label)}</option>` : ""}</select> ${detail} <span class="dim">· type @name to switch</span>`;
    }
    this.updateWorking();
  }

  /** @param {string} text */
  flashModel(text) {
    const note = document.createElement("div");
    note.className = "chat-note";
    note.textContent = text;
    this.log.append(note);
    this.scrollDown();
    setTimeout(() => note.remove(), 4000);
  }

  updateWorking() {
    this.stopButton.hidden = !this.busy;
    this.root.classList.toggle("busy", this.busy);
  }

  renderLog() {
    this.log.textContent = "";
    this.pastButton.classList.toggle("on", this.pastOpen);
    this.pastButton.setAttribute("aria-pressed", String(this.pastOpen));
    if (this.pastOpen) {
      this.renderPast();
      this.updateWorking();
      return;
    }
    const t = this.thread;
    if (!t || t.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      const recent = this.past.filter((c) => !c.open).slice(0, 3);
      const more = this.past.length > recent.length ? `<button class="chip" data-past>All ${this.past.length} past chats</button>` : "";
      const pickUp = recent.length ? `<div class="past"><p class="past-label">Or carry on with a past chat:</p>${recent.map((c) => this.pastRow(c, false)).join("")}${more}</div>` : "";
      empty.innerHTML = `<p>Ask about what you're looking at. The AI sees the open sheet, can move around the set, point things out on the PDF, propose markups, and take notes.</p>
<ul><li>What's on this sheet?</li><li>Check the door schedule against the plans</li><li>Cloud anything that looks wrong here</li></ul>
${pickUp}<p class="dim">Each chat is its own conversation, saved with this drawing set. Ctrl+T opens another; [ and ] switch between them; r shows past chats.</p>`;
      this.log.append(empty);
      this.updateWorking();
      return;
    }
    for (const e of t.entries) this.appendEntry(e, false);
    this.scrollDown();
    this.updateWorking();
  }

  /**
   * @param {Entry} e
   * @param {boolean} [scroll]
   */
  appendEntry(e, scroll = true) {
    this.log.querySelector(".chat-empty")?.remove();
    const div = document.createElement("div");
    div.className = `msg ${e.role}`;
    if (e.role === "assistant") div.innerHTML = renderMarkdown(e.text, this.sheets);
    else if (e.role === "status") div.innerHTML = linkFiles(escapeHtml(e.text));
    else div.textContent = e.role === "tool" ? `${e.text}…` : e.text;
    this.log.append(div);
    if (scroll) this.scrollDown();
  }

  /** @param {Thread} t */
  updateLastAssistant(t) {
    const last = this.log.lastElementChild;
    const entry = t.entries.at(-1);
    if (!entry) return;
    if (last?.classList.contains("assistant")) {
      const stick = this.nearBottom();
      last.innerHTML = renderMarkdown(entry.text, this.sheets);
      if (stick) this.scrollDown();
    } else {
      this.appendEntry(entry);
    }
  }

  nearBottom() {
    return this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
  }

  scrollDown() {
    this.log.scrollTop = this.log.scrollHeight;
  }
}
