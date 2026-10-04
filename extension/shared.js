const PN = {
  pageKey(href) {
    const u = new URL(href);
    return "notes:" + u.origin + u.pathname;
  },
  COLORS: {
    yellow: "#fde68a",
    green: "#bbf7d0",
    blue: "#bfdbfe",
    pink: "#fbcfe8"
  },
  DEFAULTS: { color: "yellow", showTooltip: true },
  async getSettings() {
    const s = await chrome.storage.sync.get("settings");
    return Object.assign({}, PN.DEFAULTS, s.settings || {});
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
  timeAgo(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(ts).toLocaleDateString();
  }
};
