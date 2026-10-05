const PN = {
  pageKey(href) {
    const u = new URL(href);
    return "notes:" + u.origin + u.pathname;
  },
  // highlight fills are translucent so they read on light and dark sites
  COLORS: {
    pink: "rgba(247, 168, 200, 0.62)",
    yellow: "rgba(246, 213, 92, 0.55)",
    green: "rgba(150, 214, 160, 0.55)",
    blue: "rgba(150, 192, 240, 0.55)"
  },
  SWATCH: { pink: "#F7A8C8", yellow: "#F6D55C", green: "#96D6A0", blue: "#96C0F0" },
  LABEL: { pink: "Pink", yellow: "Yellow", green: "Green", blue: "Blue" },
  DEFAULTS: { color: "pink", showTooltip: true, theme: "system", side: "right" },
  async getSettings() {
    const s = await chrome.storage.sync.get("settings");
    return Object.assign({}, PN.DEFAULTS, s.settings || {});
  },
  resolveTheme(t) {
    if (t === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return t === "dark" ? "dark" : "light";
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
  day(ts) {
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  },
  clock(ts) {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");
  },
  timeAgo(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 7 * 86400) return Math.round(s / 86400) + " d ago";
    return PN.day(ts);
  }
};
