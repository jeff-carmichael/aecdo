// AI chat threads: each tab is its own conversation with whichever @model it was last given.

/**
 * @typedef {{ role: "user" | "assistant" | "status" | "tool", text: string }} Entry
 * @typedef {{ id: string, title: string, model: string, modelLabel: string, busy: boolean, entries: Entry[] }} Thread
 * @typedef {{ name: string, label: string, words: string[] }} Mention
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
 * Light Markdown (paragraphs, "- " lists, **bold**, `code`) with sheet numbers and file:// links turned into links.
 * @param {string} text
 * @param {Set<string>} sheets upper-cased sheet numbers
 */
export function renderMarkdown(text, sheets) {
  const inline = (/** @type {string} */ line) => {
    let html = linkFiles(escapeHtml(line));
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

export class ChatPanel {
  /**
   * @param {HTMLElement} root
   * @param {{
   *   api: (path: string, body?: unknown) => Promise<any>,
   *   onSheetLink: (sheet: string) => void,
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

    this.tabs = /** @type {HTMLElement} */ (root.querySelector("#thread-tabs"));
    this.log = /** @type {HTMLElement} */ (root.querySelector("#chat-log"));
    this.input = /** @type {HTMLTextAreaElement} */ (root.querySelector("#chat-input"));
    this.modelLine = /** @type {HTMLElement} */ (root.querySelector("#chat-model"));
    this.stopButton = /** @type {HTMLButtonElement} */ (root.querySelector("#chat-stop"));

    this.input.addEventListener("keydown", (e) => this.onKey(e));
    this.input.addEventListener("input", () => this.autosize());
    this.stopButton.addEventListener("click", () => this.stop());
    this.tabs.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const close = t.closest("[data-close]");
      if (close) return void this.close(/** @type {HTMLElement} */ (close).dataset.close ?? "");
      if (t.closest("[data-new]")) return void this.newThread();
      const tab = /** @type {HTMLElement | null} */ (t.closest("[data-thread]"));
      if (tab) this.switchTo(tab.dataset.thread ?? "");
    });
    this.log.addEventListener("click", (e) => {
      const file = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("a.file-link"));
      if (file) {
        e.preventDefault();
        return this.deps.openFile(file.dataset.url ?? "");
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
    /** @type {Thread[]} */
    const list = await this.deps.api("api/chat");
    for (const t of list) this.threads.set(t.id, t);
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

  /** @param {string} id */
  switchTo(id) {
    if (!this.threads.has(id)) return;
    const typing = document.activeElement === this.input;
    this.current = id;
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

  /** Leaves the input but stays in the chat, so [ ] switch chats and Esc leaves. */
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
    if (e.key === "ArrowUp" && (!this.input.value || this.recall >= 0) && this.sent.length) {
      e.preventDefault();
      this.recall = this.recall < 0 ? this.sent.length - 1 : Math.max(0, this.recall - 1);
      this.input.value = this.sent[this.recall];
      return;
    }
    if (e.key === "ArrowDown" && this.recall >= 0) {
      e.preventDefault();
      this.recall++;
      this.input.value = this.sent[this.recall] ?? "";
      if (this.recall >= this.sent.length) this.recall = -1;
    }
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
      if (ev.thread === this.current) this.appendEntry(ev.entry);
      return;
    }
    if (ev.op === "delta") {
      const last = t.entries.at(-1);
      if (last?.role === "assistant") last.text += ev.text;
      else t.entries.push({ role: "assistant", text: ev.text });
      if (ev.thread === this.current) this.updateLastAssistant(t);
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
    const t = this.thread;
    if (!t || t.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.innerHTML = `<p>Ask about what you're looking at. The AI sees the open sheet, can move around the set, point things out on the PDF, propose markups, and take notes.</p>
<ul><li>What's on this sheet?</li><li>Check the door schedule against the plans</li><li>Cloud anything that looks wrong here</li></ul>
<p class="dim">Each chat is its own conversation. Ctrl+T opens another; [ and ] switch between them.</p>`;
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
