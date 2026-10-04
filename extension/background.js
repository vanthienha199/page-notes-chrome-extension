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
