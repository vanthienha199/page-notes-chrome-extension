(async () => {
  const s = await PN.getSettings();
  document.documentElement.dataset.theme = PN.resolveTheme(s.theme);
  const $ = (id) => document.getElementById(id);
  const forced = new URLSearchParams(location.search).get("tabId");
  const [tab] = forced ? [await chrome.tabs.get(Number(forced))] : await chrome.tabs.query({ active: true, currentWindow: true });
  let info = null;
  try { info = await chrome.tabs.sendMessage(tab.id, { type: "info" }); } catch (e) { info = null; }
  const pages = await PN.allPages();
  $("sAll").textContent = pages.reduce((a, p) => a + p.notes.length, 0);
  $("sSites").textContent = pages.length;
  $("lSites").textContent = pages.length === 1 ? "page" : "pages";
  $("lAll").textContent = pages.reduce((a, p) => a + p.notes.length, 0) === 1 ? "note" : "all notes";
  $("opts").onclick = () => chrome.runtime.openOptionsPage();
  const items = $("items");
  if (!info || !info.ok) {
    $("title").textContent = "Notes work on regular web pages";
    $("sub").textContent = "Open an article or doc to start";
    $("side").disabled = true; $("copy").disabled = true;
    return;
  }
  $("title").textContent = info.title || info.url;
  $("sub").textContent = new URL(info.url).hostname;
  const notes = await PN.getNotes(PN.pageKey(info.url));
  $("sPage").textContent = notes.length;
  if (!notes.length) {
    $("copy").disabled = true;
    items.innerHTML = `<div class="empty"><div class="ring">+</div><div><b>No notes on this page yet</b></div>
      <div class="muted">Select any text, then choose Highlight or Add note.</div></div>`;
  }
  for (const n of notes.slice().reverse()) {
    const d = document.createElement("div");
    d.className = "item";
    const q = document.createElement("div");
    q.className = "quote";
    q.style.borderColor = PN.SWATCH[n.color] || PN.SWATCH.yellow;
    const shown = n.display || n.quote;
    q.textContent = shown.length > 120 ? shown.slice(0, 120).trim() + "..." : shown;
    d.appendChild(q);
    if (n.note) { const t = document.createElement("div"); t.className = "note"; t.textContent = n.note; d.appendChild(t); }
    d.onclick = () => { chrome.tabs.sendMessage(tab.id, { type: "scroll-to", id: n.id }); window.close(); };
    items.appendChild(d);
  }
  $("side").onclick = () => { chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" }); window.close(); };
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText(PN.toMarkdown(info.title, info.url, notes));
    $("toast").style.opacity = 1;
    setTimeout(() => ($("toast").style.opacity = 0), 1200);
  };
})();
