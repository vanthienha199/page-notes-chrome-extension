chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "pn-highlight", title: "Highlight selection", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "pn-note", title: "Highlight and add a note", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: info.menuItemId === "pn-note" ? "highlight-note" : "highlight" });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-sidebar") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" });
});

// toolbar badge: the content script reports how many notes its page has
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== "count" || !sender.tab) return;
  chrome.action.setBadgeBackgroundColor({ color: "#F2994A", tabId: sender.tab.id });
  chrome.action.setBadgeTextColor && chrome.action.setBadgeTextColor({ color: "#1A1206", tabId: sender.tab.id });
  chrome.action.setBadgeText({ text: msg.count ? String(msg.count) : "", tabId: sender.tab.id });
});
