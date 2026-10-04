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
    const frag = range.cloneContents();
    frag.querySelectorAll("sup, .reference, .mw-ref").forEach((x) => x.remove());
    frag.querySelectorAll("a").forEach((x) => { if (/^\s*\[?\d{1,3}\]?\s*$/.test(x.textContent)) x.remove(); });
    const display = frag.textContent.replace(/\s+/g, " ").trim();
    const idx = buildIndex();
    const start = offsetOf(idx, range.startContainer, range.startOffset);
    const end = offsetOf(idx, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) return;
    const note = {
      id: Math.random().toString(36).slice(2, 10),
      quote: idx.text.slice(start, end),
      display,
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
      .t { --canvas:#15171B; --surface:#1E2126; --raised:#262A30; --line:#2F333A; --ink:#F3EFE7; --muted:#A7A39B; --faint:#77736C; --accent:#F2994A; --accent-ink:#1A1206; --danger:#E8806E; }
      .t.light { --canvas:#F6F3EE; --surface:#FFFFFF; --raised:#F1EDE6; --line:#E4DED4; --ink:#1B1A17; --muted:#6E6A62; --faint:#9A958C; --accent:#D9782A; --accent-ink:#FFFFFF; --danger:#C2543F; }
      * { box-sizing: border-box; font-family: "PN Plex", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      .tip { position: fixed; z-index: 2147483647; display: none; background: var(--canvas); color: var(--ink);
             border: 1px solid var(--line); border-radius: 10px; padding: 4px; gap: 2px;
             box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 28px rgba(0,0,0,.28); }
      .tip button { all: unset; cursor: pointer; font-size: 13px; font-weight: 500; padding: 7px 12px; border-radius: 7px; display: flex; align-items: center; gap: 8px; }
      .tip button:hover { background: var(--raised); }
      .tip button i { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
      .side { position: fixed; top: 0; right: 0; height: 100vh; width: 360px; z-index: 2147483646;
              background: var(--canvas); color: var(--ink); border-left: 1px solid var(--line);
              box-shadow: -1px 0 0 rgba(0,0,0,.2), -24px 0 48px rgba(0,0,0,.22);
              transform: translateX(100%); transition: transform .25s cubic-bezier(.2,.8,.2,1); display: flex; flex-direction: column; }
      .side.left { right: auto; left: 0; border-left: 0; border-right: 1px solid var(--line); transform: translateX(-100%);
                   box-shadow: 1px 0 0 rgba(0,0,0,.2), 24px 0 48px rgba(0,0,0,.22); }
      .side.open { transform: none; }
      header { padding: 20px 20px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line); }
      header .logo { width: 28px; height: 28px; border-radius: 8px; }
      header h2 { font-family: "PN Bricolage", "PN Plex", sans-serif; font-weight: 700; letter-spacing: -0.02em; font-size: 19px; margin: 0; flex: 1; }
      header .count { font-family: "PN Mono", monospace; font-size: 11px; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 999px; padding: 2px 9px; }
      header button { all: unset; cursor: pointer; color: var(--muted); font-size: 20px; line-height: 1; padding: 2px 4px; border-radius: 6px; }
      header button:hover { color: var(--ink); background: var(--raised); }
      .list { overflow: auto; flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .card { border: 1px solid var(--line); border-radius: 10px; padding: 16px; background: var(--surface); transition: border-color .15s; }
      .card.focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
      .quote { font-size: 13.5px; line-height: 1.5; border-left: 3px solid; padding-left: 12px; cursor: pointer; color: var(--ink); }
      .quote:hover { color: var(--accent); }
      textarea { width: 100%; margin-top: 12px; background: var(--canvas); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
                 font-size: 13px; line-height: 1.45; resize: vertical; min-height: 46px; color: var(--ink); }
      textarea::placeholder { color: var(--faint); }
      textarea:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; }
      .row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
      .dot { width: 16px; height: 16px; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 2px var(--surface); border: 2px solid transparent; }
      .dot.on { border-color: var(--ink); }
      .meta { font-family: "PN Mono", monospace; font-size: 11px; color: var(--faint); flex: 1; text-align: right; }
      .del { all: unset; cursor: pointer; font-size: 12px; color: var(--danger); margin-left: 4px; }
      .del:hover { text-decoration: underline; }
      .empty { color: var(--muted); font-size: 13px; text-align: center; margin-top: 56px; line-height: 1.7; padding: 0 24px; }
      .empty .ring { width: 48px; height: 48px; border-radius: 50%; border: 1px dashed var(--faint); margin: 0 auto 16px; display: grid; place-items: center; color: var(--accent); font-size: 22px; }
      .empty b { color: var(--ink); }
      footer { font-family: "PN Mono", monospace; font-size: 11px; color: var(--faint); padding: 12px 20px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; }
    </style>
    <div class="t" id="theme"><div class="tip"><button data-act="hl"><i></i>Highlight</button><button data-act="note">Add note</button></div>
    <aside class="side">
      <header><img class="logo" alt="" /><h2>Notes on this page</h2><span class="count">0</span><button data-act="close" title="Close">×</button></header>
      <div class="list"></div>
      <footer><span>Page Notes, sample build</span><span>Alt+N</span></footer>
    </aside></div>`;
  document.documentElement.appendChild(host);
  root.querySelector(".logo").src = chrome.runtime.getURL("icons/48.png");
  const themeBox = root.getElementById("theme");
  function applyTheme() {
    themeBox.classList.toggle("light", PN.resolveTheme(settings.theme) === "light");
    root.querySelector(".side").classList.toggle("left", settings.side === "left");
  }
  for (const [fam, file, weight] of [["PN Plex", "plex-400", 400], ["PN Plex", "plex-500", 500], ["PN Plex", "plex-600", 600],
                                     ["PN Bricolage", "bricolage-700", 700], ["PN Mono", "mono-500", 500]]) {
    const ff = new FontFace(fam, `url(${chrome.runtime.getURL("fonts/" + file + ".woff2")})`, { weight: String(weight) });
    ff.load().then((f) => document.fonts.add(f)).catch(() => {});
  }
  function reportCount() { chrome.runtime.sendMessage({ type: "count", count: notes.length }).catch(() => {}); }

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
    reportCount();
    root.querySelector(".count").textContent = notes.length + (notes.length === 1 ? " note" : " notes");
    list.innerHTML = "";
    if (!notes.length) {
      list.innerHTML = `<div class="empty"><div class="ring">+</div><b>No notes on this page yet</b><br/>Select any text, then choose<br/>Highlight or Add note.</div>`;
      return;
    }
    for (const n of notes) {
      const card = document.createElement("div");
      card.className = "card" + (n.id === focusId ? " focus" : "");
      const q = document.createElement("div");
      q.className = "quote";
      q.style.borderColor = PN.SWATCH[n.color] || PN.SWATCH.yellow;
      const shown = n.display || n.quote;
      q.textContent = shown.length > 220 ? shown.slice(0, 220).trim() + "..." : shown;
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
      for (const [name, hex] of Object.entries(PN.SWATCH)) {
        const d = document.createElement("span");
        d.className = "dot" + (n.color === name ? " on" : "");
        d.style.background = hex;
        d.title = PN.LABEL[name];
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
    if (area === "sync" && changes.settings) { settings = await PN.getSettings(); applyTheme(); }
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
    applyTheme();
    notes = await PN.getNotes(KEY);
    restoreAll();
    renderSidebar();
  })();
})();
