(async () => {
  const forced = new URLSearchParams(location.search).get("tabId");
  const [tab] = forced ? [await chrome.tabs.get(Number(forced))] : await chrome.tabs.query({ active: true, currentWindow: true });
  const items = document.getElementById("items");
  let info = null;
  try { info = await chrome.tabs.sendMessage(tab.id, { type: "info" }); } catch (e) { info = null; }
  const supported = !!(info && info.ok);
  const pages = await PN.allPages();
  document.getElementById("sAll").textContent = pages.reduce((a, p) => a + p.notes.length, 0);
  document.getElementById("sSites").textContent = pages.length;
  document.getElementById("opts").onclick = () => chrome.runtime.openOptionsPage();
  if (!supported) {
    document.getElementById("title").textContent = "Notes work on regular web pages";
    document.getElementById("side").disabled = true;
    return;
  }
  document.getElementById("title").textContent = info.title || info.url;
  document.getElementById("sub").textContent = new URL(info.url).hostname;
  const notes = await PN.getNotes(PN.pageKey(info.url));
  document.getElementById("sPage").textContent = notes.length;
  if (!notes.length) {
    items.innerHTML = '<p class="muted">No notes here yet. Select text on the page, then click Highlight or Add note.</p>';
  }
  for (const n of notes.slice().reverse()) {
    const d = document.createElement("div");
    d.className = "item";
    const q = document.createElement("div");
    q.className = "quote";
    q.style.borderColor = PN.COLORS[n.color] || PN.COLORS.yellow;
    q.textContent = n.quote.length > 120 ? n.quote.slice(0, 120) + "..." : n.quote;
    d.appendChild(q);
    if (n.note) { const t = document.createElement("div"); t.className = "note"; t.textContent = n.note; d.appendChild(t); }
    d.onclick = () => { chrome.tabs.sendMessage(tab.id, { type: "scroll-to", id: n.id }); window.close(); };
    items.appendChild(d);
  }
  document.getElementById("side").onclick = () => { chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" }); window.close(); };
})();
