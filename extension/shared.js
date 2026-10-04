const PN = {
  pageKey(href) {
    const u = new URL(href);
    return "notes:" + u.origin + u.pathname;
  },
  // highlight fills are translucent so they read on light and dark sites
  COLORS: {
    yellow: "rgba(242, 153, 74, 0.42)",
    green: "rgba(124, 186, 140, 0.42)",
    blue: "rgba(116, 166, 226, 0.40)",
    pink: "rgba(228, 128, 150, 0.40)"
  },
  SWATCH: { yellow: "#F2994A", green: "#7CBA8C", blue: "#74A6E2", pink: "#E48096" },
  LABEL: { yellow: "Amber", green: "Sage", blue: "Sky", pink: "Rose" },
  DEFAULTS: { color: "yellow", showTooltip: true, theme: "dark", side: "right" },
  async getSettings() {
    const s = await chrome.storage.sync.get("settings");
    return Object.assign({}, PN.DEFAULTS, s.settings || {});
  },
  resolveTheme(t) {
    if (t === "system") return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    return t === "light" ? "light" : "dark";
  },
  async getNotes(key) {
    const r = await chrome.storage.local.get(key);
    return r[key] || [];
  },
  async setNotes(key, notes) {
    if (notes.length) await chrome.storage.local.set({ [key]: notes });
    else await chrome.storage.local.remove(key);
  },
  async allPages() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith("notes:"))
      .map(([k, v]) => ({ key: k, url: k.slice(6), notes: v }));
  },
  toMarkdown(title, url, notes) {
    const lines = [`## ${title}`, url, ""];
    for (const n of notes) {
      lines.push(`> ${(n.display || n.quote).replace(/\s+/g, " ").trim()}`);
      if (n.note) lines.push("", n.note);
      lines.push("");
    }
    return lines.join("\n");
  },
  timeAgo(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 7 * 86400) return Math.round(s / 86400) + " d ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
};
