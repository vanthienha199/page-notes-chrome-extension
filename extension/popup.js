(async () => {
  const s = await PN.getSettings();
  document.documentElement.dataset.theme = PN.resolveTheme(s.theme);
  const $ = (id) => document.getElementById(id);
  const forced = new URLSearchParams(location.search).get("tabId");
  const [tab] = forced ? [await chrome.tabs.get(Number(forced))] : await chrome.tabs.query({ active: true, currentWindow: true });
  let info = null;
  try { info = await chrome.tabs.sendMessage(tab.id, { type: "info" }); } catch (e) { info = null; }
  const pages = await PN.allPages();
  const total = pages.reduce((a, p) => a + p.notes.length, 0);
  const across = `${total} ${total === 1 ? "note" : "notes"} across ${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
  $("opts").onclick = () => chrome.runtime.openOptionsPage();
  const items = $("items");
  const empty = (title, text) => {
    items.innerHTML = `<div class="empty"><div class="when"></div><div class="body"><h2></h2><div class="muted"></div></div></div>`;
    items.querySelector("h2").textContent = title;
    items.querySelector(".muted").textContent = text;
  };
  if (!info || !info.ok) {
    $("title").textContent = "This tab is not a web page";
    $("sub").textContent = "Chrome pages and the Web Store do not allow notes.";
    empty("Notes work on regular web pages", "Open an article or a doc, select some text, and the Highlight button appears.");
    $("sum").textContent = total ? `You have ${across}.` : "";
    $("side").disabled = true; $("copy").disabled = true;
    return;
  }
  $("title").textContent = info.title || info.url;
  $("sub").textContent = new URL(info.url).hostname;
  const notes = await PN.getNotes(PN.pageKey(info.url));
  $("sum").textContent = notes.length
    ? `${notes.length} ${notes.length === 1 ? "note" : "notes"} here, ${across}.`
    : total ? `None here yet, ${across}.` : "";
  if (!notes.length) {
    $("copy").disabled = true;
    empty("No notes on this page yet", "Select any text, then choose Highlight or Add note.");
  }
  let lastDay = "";
  for (const n of notes.slice().reverse()) {
    const d = document.createElement("div");
    d.className = "item";
    d.tabIndex = 0;
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
    hl.className = "hl";
    hl.style.background = PN.COLORS[n.color] || PN.COLORS.pink;
    const shown = n.display || n.quote;
    hl.textContent = shown.length > 120 ? shown.slice(0, 120).trim() + "..." : shown;
    q.appendChild(hl);
    body.appendChild(q);
    if (n.note) { const t = document.createElement("div"); t.className = "note"; t.textContent = n.note; body.appendChild(t); }
    d.append(when, body);
    const go = () => { chrome.tabs.sendMessage(tab.id, { type: "scroll-to", id: n.id }); window.close(); };
    d.onclick = go;
    d.onkeydown = (e) => { if (e.key === "Enter") go(); };
    items.appendChild(d);
  }
  $("side").onclick = () => { chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" }); window.close(); };
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText(PN.toMarkdown(info.title, info.url, notes));
    $("toast").style.opacity = 1;
    setTimeout(() => ($("toast").style.opacity = 0), 1200);
  };
})();
