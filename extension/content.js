(() => {
  if (window.__pageNotesLoaded) return;
  window.__pageNotesLoaded = true;

  const KEY = PN.pageKey(location.href);
  const CONTEXT = 32;
  let notes = [];
  let settings = PN.DEFAULTS;
  let fresh = null;

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

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  function paint(mark, color) {
    const c = PN.COLORS[color] || PN.COLORS.pink;
    mark.style.backgroundColor = "transparent";
    mark.style.backgroundImage = `linear-gradient(${c}, ${c})`;
    mark.style.backgroundRepeat = "no-repeat";
    mark.style.backgroundSize = "100% 100%";
  }
  // saving sweeps the fill left to right, 180 ms
  function sweep(id) {
    if (still.matches) return;
    document.querySelectorAll(`mark.pn-mark[data-pn-id="${id}"]`).forEach((m) =>
      m.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }));
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
      paint(mark, note.color);
      mark.style.color = "inherit";
      mark.style.borderRadius = "2px";
      mark.style.padding = "0 1px";
      mark.style.cursor = "pointer";
      mark.style.boxDecorationBreak = "clone";
      mark.style.webkitBoxDecorationBreak = "clone";
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
    sweep(note.id);
    notes.push(note);
    fresh = note.id;
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
      paint(m, n.color);
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
      .t { --canvas:#FFFDF7; --surface:#FFFFFF; --raised:#F6F2E8; --line:#E9E3D6; --ink:#1C1B18; --muted:#5F5B53; --faint:#8C877D; --danger:#A8322A; --marker:#F7A8C8; }
      .t.dark { --canvas:#1A1917; --surface:#23221F; --raised:#2C2A26; --line:#393630; --ink:#F2EFE8; --muted:#B3AEA4; --faint:#868178; --danger:#F08C80; --marker:#B75F86; }
      * { box-sizing: border-box; font-family: "PN Figtree", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      .tip { position: fixed; z-index: 2147483647; display: none; background: var(--surface); color: var(--ink);
             border: 1px solid var(--line); border-radius: 8px; padding: 4px; gap: 2px;
             box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 10px 28px rgba(0,0,0,.16); }
      .tip button { all: unset; cursor: pointer; font-size: 14px; font-weight: 500; padding: 7px 12px; border-radius: 6px; display: flex; align-items: center; gap: 8px; }
      .tip button:hover, .tip button:focus-visible { background: var(--raised); }
      .tip button i { width: 12px; height: 12px; border-radius: 3px; }
      .side { position: fixed; top: 0; right: 0; height: 100vh; width: 360px; z-index: 2147483646;
              background: var(--canvas); color: var(--ink); border-left: 1px solid var(--line);
              box-shadow: -18px 0 40px rgba(0,0,0,.10);
              transform: translateX(100%); transition: transform .25s cubic-bezier(.2,.8,.2,1); display: flex; flex-direction: column; }
      .side.left { right: auto; left: 0; border-left: 0; border-right: 1px solid var(--line); transform: translateX(-100%); box-shadow: 18px 0 40px rgba(0,0,0,.10); }
      .side.open { transform: none; }
      .side:not(.open) { box-shadow: none; }
      header { padding: 20px 20px 14px; display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--line); }
      header h2 { font-family: "PN Young Serif", Georgia, serif; font-weight: 400; font-size: 21px; margin: 0; flex: 1; }
      header .count { font-size: 13px; color: var(--muted); }
      header button { all: unset; cursor: pointer; color: var(--muted); font-size: 22px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
      header button:hover, header button:focus-visible { color: var(--ink); background: var(--raised); }
      .list { overflow: auto; flex: 1; padding: 0 0 16px; }
      .card { display: grid; grid-template-columns: 76px 1fr; }
      .when { padding: 16px 8px 16px 18px; white-space: nowrap; border-right: 1px solid var(--line); font-size: 12px; line-height: 1.35; color: var(--faint); }
      .when b { display: block; font-weight: 600; color: var(--muted); font-size: 13px; }
      .body { padding: 16px 20px 16px 14px; border-bottom: 1px solid var(--line); min-width: 0; }
      .card.focus .body { background: var(--surface); }
      .card.drop { animation: drop .2s cubic-bezier(.2,.8,.2,1) .18s both; }
      @keyframes drop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
      .quote { font-family: "PN Young Serif", Georgia, serif; font-size: 15px; line-height: 1.55; cursor: pointer; color: var(--ink); }
      .quote span { font-family: "PN Young Serif", Georgia, serif; padding: 1px 2px; border-radius: 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
      .quote:hover span { text-decoration: underline; text-decoration-color: var(--faint); text-underline-offset: 3px; }
      textarea { width: 100%; margin-top: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px;
                 font-size: 14px; line-height: 1.45; resize: vertical; min-height: 44px; color: var(--ink); }
      textarea::placeholder { color: var(--faint); }
      textarea:focus { outline: 2px solid var(--ink); outline-offset: 0; border-color: transparent; }
      .row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
      .dot { all: unset; width: 16px; height: 16px; border-radius: 4px; cursor: pointer; box-shadow: inset 0 0 0 2px var(--canvas); border: 2px solid transparent; }
      .dot.on { border-color: var(--ink); }
      .dot:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      .meta { font-size: 12px; color: var(--faint); flex: 1; text-align: right; }
      .del { all: unset; cursor: pointer; font-size: 13px; color: var(--danger); margin-left: 4px; }
      .del:hover, .del:focus-visible { text-decoration: underline; }
      .empty { display: grid; grid-template-columns: 76px 1fr; }
      .empty .gut { border-right: 1px solid var(--line); min-height: 160px; }
      .empty .body { border-bottom: 0; padding-top: 24px; color: var(--muted); font-size: 14px; line-height: 1.6; }
      .empty h3 { font-family: "PN Young Serif", Georgia, serif; font-weight: 400; font-size: 18px; color: var(--ink); margin: 0 0 6px; }
      footer { font-size: 13px; color: var(--faint); padding: 12px 20px; border-top: 1px solid var(--line); }
      @media (prefers-reduced-motion: reduce) { .side { transition: none; } .card.drop { animation: none; } }
    </style>
    <div class="t" id="theme"><div class="tip"><button data-act="hl"><i></i>Highlight</button><button data-act="note">Add note</button></div>
    <aside class="side">
      <header><h2>Notes on this page</h2><span class="count">0 notes</span><button data-act="close" title="Close" aria-label="Close">×</button></header>
      <div class="list"></div>
      <footer>Alt+N opens and closes this sidebar.</footer>
    </aside></div>`;
  document.documentElement.appendChild(host);
  const themeBox = root.getElementById("theme");
  function applyTheme() {
    themeBox.classList.toggle("dark", PN.resolveTheme(settings.theme) === "dark");
    root.querySelector(".tip i").style.background = PN.SWATCH[settings.color] || PN.SWATCH.pink;
    root.querySelector(".side").classList.toggle("left", settings.side === "left");
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
  for (const [fam, file, weight] of [["PN Figtree", "figtree-400", 400], ["PN Figtree", "figtree-500", 500], ["PN Figtree", "figtree-600", 600],
                                     ["PN Young Serif", "youngserif-400", 400]]) {
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
      list.innerHTML = `<div class="empty"><div class="gut"></div><div class="body"><h3>No notes on this page yet</h3>Select any text, then choose Highlight or Add note. Your notes come back every time you return to this page.</div></div>`;
      return;
    }
    let lastDay = "";
    for (const n of notes) {
      const card = document.createElement("div");
      card.className = "card" + (n.id === focusId ? " focus" : "") + (n.id === fresh ? " drop" : "");
      const when = document.createElement("div");
      when.className = "when";
      const day = PN.day(n.created);
      if (day !== lastDay) { const b = document.createElement("b"); b.textContent = day; when.appendChild(b); lastDay = day; }
      when.append(PN.clock(n.created));
      const body = document.createElement("div");
      body.className = "body";
      const q = document.createElement("div");
      q.className = "quote";
      const hl = document.createElement("span");
      hl.style.background = PN.COLORS[n.color] || PN.COLORS.pink;
      const shown = n.display || n.quote;
      hl.textContent = shown.length > 220 ? shown.slice(0, 220).trim() + "..." : shown;
      q.appendChild(hl);
      q.addEventListener("click", () => {
        const m = document.querySelector(`mark.pn-mark[data-pn-id="${n.id}"]`);
        if (m) m.scrollIntoView({ behavior: still.matches ? "auto" : "smooth", block: "center" });
      });
      const ta = document.createElement("textarea");
      ta.placeholder = "Write a note...";
      ta.setAttribute("aria-label", "Note");
      ta.value = n.note;
      let t;
      ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updateNote(n.id, { note: ta.value }), 300); });
      const row = document.createElement("div");
      row.className = "row";
      for (const [name, hex] of Object.entries(PN.SWATCH)) {
        const d = document.createElement("button");
        d.className = "dot" + (n.color === name ? " on" : "");
        d.style.background = hex;
        d.title = PN.LABEL[name];
        d.setAttribute("aria-label", PN.LABEL[name]);
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
      body.append(q, ta, row);
      card.append(when, body);
      list.appendChild(card);
      if (n.id === focusId) {
        setTimeout(() => { card.scrollIntoView({ block: "nearest" }); if (editFocus) ta.focus(); }, 50);
      }
    }
    fresh = null;
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
      if (m) m.scrollIntoView({ behavior: still.matches ? "auto" : "smooth", block: "center" });
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
