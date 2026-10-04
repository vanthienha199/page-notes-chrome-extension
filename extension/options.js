const $ = (id) => document.getElementById(id);

async function saveSettings(patch) {
  const s = Object.assign(await PN.getSettings(), patch);
  await chrome.storage.sync.set({ settings: s });
  $("saved").style.opacity = 1;
  setTimeout(() => ($("saved").style.opacity = 0), 900);
  renderSettings();
}

async function renderSettings() {
  const s = await PN.getSettings();
  $("tooltip").checked = s.showTooltip;
  const box = $("swatches");
  box.innerHTML = "";
  for (const [name, hex] of Object.entries(PN.COLORS)) {
    const d = document.createElement("div");
    d.className = "sw" + (s.color === name ? " on" : "");
    d.style.background = hex;
    d.title = name;
    d.onclick = () => saveSettings({ color: name });
    box.appendChild(d);
  }
}

async function renderNotes() {
  const q = $("q").value.trim().toLowerCase();
  const pages = (await PN.allPages()).sort((a, b) =>
    Math.max(...b.notes.map((n) => n.created)) - Math.max(...a.notes.map((n) => n.created)));
  const total = pages.reduce((a, p) => a + p.notes.length, 0);
  $("totals").textContent = `${total} ${total === 1 ? "note" : "notes"} on ${pages.length} ${pages.length === 1 ? "page" : "pages"}, stored locally in this browser.`;
  const sites = $("sites");
  sites.innerHTML = "";
  let shown = 0;
  for (const p of pages) {
    const hits = p.notes.filter((n) => !q || n.quote.toLowerCase().includes(q) || (n.note || "").toLowerCase().includes(q));
    if (!hits.length) continue;
    shown++;
    const div = document.createElement("div");
    div.className = "site";
    const a = document.createElement("a");
    a.href = p.url; a.target = "_blank";
    a.textContent = (hits[0].title || p.url) + `  (${hits.length})`;
    const u = document.createElement("div");
    u.className = "url"; u.textContent = p.url;
    div.append(a, u);
    for (const n of hits) {
      const w = document.createElement("div");
      w.className = "n";
      const qq = document.createElement("div");
      qq.className = "quote";
      qq.style.borderColor = PN.COLORS[n.color] || PN.COLORS.yellow;
      qq.textContent = n.quote.length > 160 ? n.quote.slice(0, 160) + "..." : n.quote;
      w.appendChild(qq);
      if (n.note) { const t = document.createElement("div"); t.className = "note"; t.textContent = n.note; w.appendChild(t); }
      div.appendChild(w);
    }
    sites.appendChild(div);
  }
  if (!shown) sites.innerHTML = `<p class="muted">${q ? "No notes match that search." : "No notes yet."}</p>`;
}

$("tooltip").onchange = (e) => saveSettings({ showTooltip: e.target.checked });
$("q").oninput = renderNotes;
$("export").onclick = async () => {
  const pages = await PN.allPages();
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), pages }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "page-notes-export.json";
  a.click();
};
$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const data = JSON.parse(await f.text());
  for (const p of data.pages || []) {
    const existing = await PN.getNotes(p.key);
    const ids = new Set(existing.map((n) => n.id));
    await PN.setNotes(p.key, existing.concat(p.notes.filter((n) => !ids.has(n.id))));
  }
  renderNotes();
};
$("clear").onclick = async () => {
  if (!confirm("Delete every saved note?")) return;
  const keys = (await PN.allPages()).map((p) => p.key);
  await chrome.storage.local.remove(keys);
  renderNotes();
};
chrome.storage.onChanged.addListener(() => { renderNotes(); });
renderSettings();
renderNotes();
