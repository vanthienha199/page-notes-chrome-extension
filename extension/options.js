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
  document.documentElement.dataset.theme = PN.resolveTheme(s.theme);
  $("tooltip").checked = s.showTooltip;
  for (const b of $("theme").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.v === s.theme);
    b.onclick = () => saveSettings({ theme: b.dataset.v });
  }
  for (const b of $("side").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.v === s.side);
    b.onclick = () => saveSettings({ side: b.dataset.v });
  }
  const box = $("swatches");
  box.innerHTML = "";
  for (const name of Object.keys(PN.COLORS)) {
    const d = document.createElement("button");
    d.className = "sw" + (s.color === name ? " on" : "");
    d.innerHTML = `<i style="background:${PN.SWATCH[name]}"></i>${PN.LABEL[name]}`;
    d.onclick = () => saveSettings({ color: name });
    box.appendChild(d);
  }
}

async function renderNotes() {
  const q = $("q").value.trim().toLowerCase();
  const pages = (await PN.allPages()).sort((a, b) =>
    Math.max(...b.notes.map((n) => n.created)) - Math.max(...a.notes.map((n) => n.created)));
  $("tNotes").textContent = pages.reduce((a, p) => a + p.notes.length, 0);
  $("tPages").textContent = pages.length;
  $("lNotes").textContent = $("tNotes").textContent === "1" ? "note" : "notes";
  $("lPages").textContent = pages.length === 1 ? "page" : "pages";
  const sites = $("sites");
  sites.innerHTML = "";
  let shown = 0;
  for (const p of pages) {
    const hits = p.notes.filter((n) => !q || (n.display || n.quote).toLowerCase().includes(q) || (n.note || "").toLowerCase().includes(q));
    if (!hits.length) continue;
    shown++;
    const div = document.createElement("div");
    div.className = "site";
    const a = document.createElement("a");
    a.href = p.url; a.target = "_blank";
    a.textContent = hits[0].title || p.url;
    const u = document.createElement("div");
    u.className = "url"; u.textContent = `${p.url.replace(/^https?:\/\//, "")}, ${hits.length} ${hits.length === 1 ? "note" : "notes"}`;
    div.append(a, u);
    let lastDay = "";
    for (const n of hits) {
      const w = document.createElement("div");
      w.className = "n";
      const when = document.createElement("div");
      when.className = "when";
      const day = PN.day(n.created);
      if (day !== lastDay) { const b = document.createElement("b"); b.textContent = day; when.appendChild(b); lastDay = day; }
      when.append(PN.clock(n.created));
      const body = document.createElement("div");
      body.className = "body";
      const qq = document.createElement("div");
      qq.className = "quote";
      const hl = document.createElement("span");
      hl.className = "hl";
      hl.style.background = PN.COLORS[n.color] || PN.COLORS.pink;
      const shown = n.display || n.quote;
      hl.textContent = shown.length > 170 ? shown.slice(0, 170).trim() + "..." : shown;
      qq.appendChild(hl);
      body.appendChild(qq);
      if (n.note) { const t = document.createElement("div"); t.className = "note"; t.textContent = n.note; body.appendChild(t); }
      w.append(when, body);
      div.appendChild(w);
    }
    sites.appendChild(div);
  }
  if (!shown) sites.innerHTML = q
    ? `<div class="empty"><h3>Nothing matches that search</h3>Try one word from the highlight or the note.</div>`
    : `<div class="empty"><h3>No notes yet</h3>Select text on any web page and choose Highlight or Add note. Everything you save shows up here.</div>`;
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
  await chrome.storage.local.remove((await PN.allPages()).map((p) => p.key));
  renderNotes();
};
chrome.storage.onChanged.addListener((ch, area) => { if (area === "sync") renderSettings(); else renderNotes(); });
renderSettings();
renderNotes();
