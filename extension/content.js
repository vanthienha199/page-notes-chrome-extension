(() => {
  if (window.__pageNotesLoaded) return;
  window.__pageNotesLoaded = true;

  const KEY = PN.pageKey(location.href);
  const CONTEXT = 32;
  let notes = [];
  let settings = PN.DEFAULTS;

  // ---------- text index over the page ----------
  function textNodes(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("script,style,noscript,textarea,#pn-host")) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function buildIndex() {
    const nodes = textNodes(document.body);
    let text = "";
    const starts = [];
    for (const n of nodes) {
      starts.push(text.length);
      text += n.nodeValue;
    }
    return { nodes, starts, text };
  }

  function locate(idx, pos) {
    let lo = 0, hi = idx.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx.starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return { node: idx.nodes[lo], offset: pos - idx.starts[lo] };
  }

  function offsetOf(idx, node, offset) {
    const i = idx.nodes.indexOf(node);
    return i < 0 ? -1 : idx.starts[i] + offset;
  }

  // ---------- wrap a text span in <mark> elements ----------
  function wrapSpan(start, end, note) {
    const idx = buildIndex();
    const a = locate(idx, start);
    const b = locate(idx, end);
    const first = idx.nodes.indexOf(a.node);
    const last = idx.nodes.indexOf(b.node);
    const marks = [];
    for (let i = first; i <= last; i++) {
      let node = idx.nodes[i];
      let s = i === first ? a.offset : 0;
      let e = i === last ? b.offset : node.nodeValue.length;
      if (e <= s) continue;
      if (s > 0) { node = node.splitText(s); e -= s; }
      if (e < node.nodeValue.length) node.splitText(e);
      const mark = document.createElement("mark");
      mark.className = "pn-mark";
      mark.dataset.pnId = note.id;
      mark.style.background = PN.COLORS[note.color] || PN.COLORS.yellow;
      mark.style.color = "inherit";
      mark.style.borderRadius = "2px";
      mark.style.padding = "0 1px";
      mark.style.cursor = "pointer";
      if (note.note) mark.title = note.note;
      node.parentNode.insertBefore(mark, node);
      mark.appendChild(node);
      mark.addEventListener("click", () => openSidebar(note.id));
      marks.push(mark);
    }
    return marks.length > 0;
  }

  function findQuote(note) {
    const idx = buildIndex();
    const hay = idx.text;
    let from = 0, best = -1, bestScore = -1;
    while (true) {
      const i = hay.indexOf(note.quote, from);
      if (i < 0) break;
      let score = 0;
      if (note.prefix && hay.slice(Math.max(0, i - note.prefix.length), i) === note.prefix) score += 2;
      if (note.suffix && hay.slice(i + note.quote.length, i + note.quote.length + note.suffix.length) === note.suffix) score += 1;
      if (score > bestScore) { best = i; bestScore = score; }
      from = i + 1;
    }
    return best < 0 ? null : { start: best, end: best + note.quote.length };
  }

  function unwrap(id) {
    document.querySelectorAll(`mark.pn-mark[data-pn-id="${id}"]`).forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  function restoreAll() {
    let missing = 0;
    for (const n of notes) {
      if (document.querySelector(`mark.pn-mark[data-pn-id="${n.id}"]`)) continue;
      const span = findQuote(n);
      if (span) wrapSpan(span.start, span.end, n); else missing++;
    }
    return missing;
  }

  // ---------- create from the current selection ----------
  async function highlightSelection(withNote) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const quote = sel.toString();
    if (!quote.trim()) return;
    const idx = buildIndex();
    const start = offsetOf(idx, range.startContainer, range.startOffset);
    const end = offsetOf(idx, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) return;
    const note = {
      id: Math.random().toString(36).slice(2, 10),
      quote: idx.text.slice(start, end),
      prefix: idx.text.slice(Math.max(0, start - CONTEXT), start),
      suffix: idx.text.slice(end, end + CONTEXT),
      note: "",
      color: settings.color,
      title: document.title,
      created: Date.now()
    };
    sel.removeAllRanges();
    hideTooltip();
    wrapSpan(start, end, note);
    notes.push(note);
    await PN.setNotes(KEY, notes);
    if (withNote) openSidebar(note.id, true);
    else renderSidebar();
  }

  async function updateNote(id, patch) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    Object.assign(n, patch);
    await PN.setNotes(KEY, notes);
    document.querySelectorAll(`mark.pn-mark[data-pn-id="${id}"]`).forEach((m) => {
      m.title = n.note || "";
      m.style.background = PN.COLORS[n.color] || PN.COLORS.yellow;
    });
  }

  async function deleteNote(id) {
    unwrap(id);
    notes = notes.filter((x) => x.id !== id);
    await PN.setNotes(KEY, notes);
    renderSidebar();
  }

  // ---------- shadow-DOM UI (tooltip + sidebar) ----------
  const host = document.createElement("div");
  host.id = "pn-host";
  host.style.all = "initial";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .tip { position: fixed; z-index: 2147483647; display: none; background: #111827; color: #fff;
             border-radius: 8px; padding: 4px; box-shadow: 0 6px 20px rgba(0,0,0,.25); gap: 4px; }
      .tip button { all: unset; cursor: pointer; font-size: 13px; padding: 6px 10px; border-radius: 6px; }
      .tip button:hover { background: #374151; }
      .side { position: fixed; top: 0; right: 0; height: 100vh; width: 340px; z-index: 2147483646;
              background: #fff; border-left: 1px solid #e5e7eb; box-shadow: -8px 0 24px rgba(0,0,0,.08);
              transform: translateX(100%); transition: transform .2s ease-out; display: flex; flex-direction: column; }
      .side.open { transform: none; }
      header { padding: 16px 16px 12px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px; }
      header h2 { font-size: 15px; margin: 0; color: #111827; flex: 1; }
      header .count { font-size: 12px; color: #6b7280; background: #f3f4f6; border-radius: 999px; padding: 2px 8px; }
      header button { all: unset; cursor: pointer; color: #6b7280; font-size: 18px; padding: 0 4px; }
      .list { overflow: auto; flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background: #fff; }
      .card.focus { border-color: #6366f1; box-shadow: 0 0 0 3px #e0e7ff; }
      .quote { font-size: 13px; color: #111827; line-height: 1.45; border-left: 4px solid; padding-left: 8px; cursor: pointer; }
      textarea { width: 100%; margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px;
                 font-size: 13px; resize: vertical; min-height: 44px; color: #111827; }
      .row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
      .dot { width: 14px; height: 14px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
      .dot.on { border-color: #111827; }
      .meta { font-size: 11px; color: #9ca3af; flex: 1; text-align: right; }
      .del { all: unset; cursor: pointer; font-size: 12px; color: #ef4444; margin-left: 6px; }
      .empty { color: #6b7280; font-size: 13px; text-align: center; margin-top: 40px; line-height: 1.6; }
      footer { font-size: 11px; color: #9ca3af; padding: 10px 16px; border-top: 1px solid #f1f5f9; }
    </style>
    <div class="tip"><button data-act="hl">Highlight</button><button data-act="note">Add note</button></div>
    <aside class="side">
      <header><h2>Notes on this page</h2><span class="count">0</span><button data-act="close" title="Close">×</button></header>
      <div class="list"></div>
      <footer>Page Notes, sample build. Saved in your browser only.</footer>
    </aside>`;
  document.documentElement.appendChild(host);

  const tip = root.querySelector(".tip");
  const side = root.querySelector(".side");
  const list = root.querySelector(".list");

  tip.addEventListener("mousedown", (e) => e.preventDefault());
  tip.addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    if (act) highlightSelection(act === "note");
  });
  root.querySelector('[data-act="close"]').addEventListener("click", () => side.classList.remove("open"));

  function hideTooltip() { tip.style.display = "none"; }

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!settings.showTooltip || !sel || sel.isCollapsed || !sel.toString().trim()) return hideTooltip();
      const r = sel.getRangeAt(0).getBoundingClientRect();
      tip.style.display = "flex";
      tip.style.top = Math.max(8, r.top - 44) + "px";
      tip.style.left = Math.max(8, r.left + r.width / 2 - 80) + "px";
    }, 0);
  });
  document.addEventListener("scroll", hideTooltip, { passive: true });

  function renderSidebar(focusId, editFocus) {
    root.querySelector(".count").textContent = notes.length;
    list.innerHTML = "";
    if (!notes.length) {
      list.innerHTML = `<div class="empty">No notes yet.<br>Select text on the page and choose<br><b>Highlight</b> or <b>Add note</b>.</div>`;
      return;
    }
    for (const n of notes) {
      const card = document.createElement("div");
      card.className = "card" + (n.id === focusId ? " focus" : "");
      const q = document.createElement("div");
      q.className = "quote";
      q.style.borderColor = PN.COLORS[n.color] || PN.COLORS.yellow;
      q.textContent = n.quote.length > 220 ? n.quote.slice(0, 220) + "..." : n.quote;
      q.addEventListener("click", () => {
        const m = document.querySelector(`mark.pn-mark[data-pn-id="${n.id}"]`);
        if (m) m.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const ta = document.createElement("textarea");
      ta.placeholder = "Write a note...";
      ta.value = n.note;
      let t;
      ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updateNote(n.id, { note: ta.value }), 300); });
      const row = document.createElement("div");
      row.className = "row";
      for (const [name, hex] of Object.entries(PN.COLORS)) {
        const d = document.createElement("span");
        d.className = "dot" + (n.color === name ? " on" : "");
        d.style.background = hex;
        d.title = name;
        d.addEventListener("click", async () => { await updateNote(n.id, { color: name }); renderSidebar(n.id); });
        row.appendChild(d);
      }
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = PN.timeAgo(n.created);
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteNote(n.id));
      row.append(meta, del);
      card.append(q, ta, row);
      list.appendChild(card);
      if (n.id === focusId) {
        setTimeout(() => { card.scrollIntoView({ block: "nearest" }); if (editFocus) ta.focus(); }, 50);
      }
    }
  }

  function openSidebar(focusId, editFocus) {
    renderSidebar(focusId, editFocus);
    side.classList.add("open");
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "info" || msg.type === "ping") return reply({ ok: true, url: location.href, title: document.title, count: notes.length });
    if (msg.type === "highlight") highlightSelection(false);
    else if (msg.type === "highlight-note") highlightSelection(true);
    else if (msg.type === "toggle-sidebar") {
      if (side.classList.contains("open")) side.classList.remove("open"); else openSidebar();
    } else if (msg.type === "open-sidebar") openSidebar(msg.id);
    else if (msg.type === "scroll-to") {
      const m = document.querySelector(`mark.pn-mark[data-pn-id="${msg.id}"]`);
      if (m) m.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    reply && reply({ ok: true });
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "sync" && changes.settings) settings = await PN.getSettings();
    if (area === "local" && changes[KEY]) {
      const fresh = changes[KEY].newValue || [];
      const freshIds = new Set(fresh.map((n) => n.id));
      for (const n of notes) if (!freshIds.has(n.id)) unwrap(n.id);
      notes = fresh;
      restoreAll();
      renderSidebar();
    }
  });

  (async () => {
    settings = await PN.getSettings();
    notes = await PN.getNotes(KEY);
    restoreAll();
    renderSidebar();
  })();
})();
