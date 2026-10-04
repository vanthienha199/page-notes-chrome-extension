// End-to-end test: loads the real unpacked extension in Chromium, uses it on a public
// page, checks behavior, and saves raw captures for the gallery images.
// Run: npm test   (raw captures go to ./raw)
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const RAW = path.join(ROOT, "raw");
const PAGE = "https://standardebooks.org/ebooks/marcus-aurelius/meditations/george-long/text/book-1";
const PAGE2 = "https://standardebooks.org/ebooks/marcus-aurelius/meditations/george-long/text/book-2";
const EMPTY = "https://standardebooks.org/ebooks/marcus-aurelius/meditations/george-long/text/book-3";
fs.mkdirSync(RAW, { recursive: true });

const NOTES = [
  { p: 0, note: "Open the Monday newsletter with this line.", color: "yellow" },
  { p: 2, note: "Pairs well with the simplicity chapter in our guide.", color: "green" },
  { p: 5, note: "Pull quote for the landing page.", color: "blue" }
];

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures++;
}

async function selectInParagraph(page, i) {
  await page.evaluate((idx) => {
    const paras = [...document.querySelectorAll("main p, section p, article p")].filter((p) => p.innerText.trim().length > 60);
    paras[idx].scrollIntoView({ block: "center" });
  }, i);
  await page.waitForTimeout(350);
  return page.evaluate((idx) => {
    const paras = [...document.querySelectorAll("main p, section p, article p")].filter((p) => p.innerText.trim().length > 60);
    const p = paras[idx];
    const nodes = [];
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (!n.parentElement.closest("a")) nodes.push(n);
    const full = nodes.map((x) => x.nodeValue).join("");
    const m = /[;.](\s|$)/g; m.lastIndex = 30;
    const hit = m.exec(full);
    let end = hit ? hit.index + 1 : Math.min(full.length, 150);
    if (end > 170) end = full.lastIndexOf(" ", 150);
    let acc = 0, eNode = null, eOff = 0;
    for (const x of nodes) { if (acc + x.nodeValue.length >= end) { eNode = x; eOff = end - acc; break; } acc += x.nodeValue.length; }
    const r = document.createRange();
    r.setStart(nodes[0], 0);
    r.setEnd(eNode, eOff);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return getSelection().toString();
  }, i);
}

async function addNote(page, sw, n) {
  await sw.evaluate((c) => chrome.storage.sync.get("settings").then((s) =>
    chrome.storage.sync.set({ settings: Object.assign({ theme: "dark", showTooltip: true }, s.settings, { color: c }) })), n.color);
  await page.waitForTimeout(200);
  await selectInParagraph(page, n.p);
  await page.waitForTimeout(150);
  await page.locator(`#pn-host .tip button[data-act="${n.note ? "note" : "hl"}"]`).click();
  await page.waitForTimeout(250);
  if (n.note) await page.keyboard.type(n.note, { delay: 4 });
  await page.waitForTimeout(450);
}

const marks = (page) => page.evaluate(() => new Set([...document.querySelectorAll("mark.pn-mark")].map((m) => m.dataset.pnId)).size);
const stored = (sw, url) => sw.evaluate((u) => { const x = new URL(u); const k = "notes:" + x.origin + x.pathname; return chrome.storage.local.get(k).then((r) => (r[k] || []).length); }, url);
const anchor = (page) => page.evaluate(() => { const h = document.querySelector("h2, h3"); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -40); });

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pn-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, colorScheme: "dark",
    viewport: { width: 1280, height: 769 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { theme: "dark", showTooltip: true, color: "yellow" } }));

  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.waitForSelector("#pn-host", { state: "attached" });
  check("content script injected", true);
  await page.waitForTimeout(600);
  await anchor(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(RAW, "before.png") });

  for (const n of NOTES) await addNote(page, sw, n);
  await page.locator('#pn-host [data-act="close"]').click();
  check("three highlights on the page", (await marks(page)) === 3);
  check("three notes in storage", (await stored(sw, PAGE)) === 3);

  const tabId = await sw.evaluate(async () => {
    for (const t of await chrome.tabs.query({})) { try { await chrome.tabs.sendMessage(t.id, { type: "ping" }); return t.id; } catch (e) {} }
    return null;
  });
  const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  check("toolbar badge shows the count", badge === "3", `badge "${badge}"`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("mark.pn-mark", { timeout: 15000 });
  check("highlights restored after reload", (await marks(page)) === 3);
  const noteText = await page.locator("mark.pn-mark").first().getAttribute("title");
  check("note text kept on the highlight", noteText === NOTES[0].note, noteText || "");

  // delete one, then add it back
  await page.locator("mark.pn-mark").nth(0).click();
  await page.waitForTimeout(400);
  await page.locator("#pn-host .card .del").last().click();
  await page.waitForTimeout(400);
  check("delete removes the highlight", (await marks(page)) === 2);
  check("delete removes it from storage", (await stored(sw, PAGE)) === 2);
  await page.locator('#pn-host [data-act="close"]').click();
  await addNote(page, sw, NOTES[2]);
  await page.locator('#pn-host [data-act="close"]').click();
  check("re-adding works", (await marks(page)) === 3);

  // captures on the main page, dark theme
  await anchor(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(RAW, "after.png") });
  await page.locator("mark.pn-mark").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(RAW, "sidebar_dark.png") });
  // hero capture: sidebar docked left so it sits in the readable part of the gallery frame
  await sw.evaluate(() => chrome.storage.sync.get("settings").then((s) => chrome.storage.sync.set({ settings: Object.assign({}, s.settings, { side: "left" }) })));
  await page.setViewportSize({ width: 1120, height: 790 });
  await page.waitForTimeout(600);
  check("sidebar can dock left", await page.evaluate(() => document.getElementById("pn-host").shadowRoot.querySelector(".side").classList.contains("left")));
  await page.evaluate(() => { const m = document.querySelector("mark.pn-mark"); m.scrollIntoView({ block: "start" }); window.scrollBy(0, -150); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(RAW, "hero_dark.png") });
  await sw.evaluate(() => chrome.storage.sync.get("settings").then((s) => chrome.storage.sync.set({ settings: Object.assign({}, s.settings, { side: "right" }) })));
  await page.setViewportSize({ width: 1280, height: 769 });
  await page.waitForTimeout(400);
  await page.locator('#pn-host [data-act="close"]').click();

  // popup, rendered for this tab
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 368, height: 640 });
  await pop.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await pop.waitForTimeout(700);
  check("popup lists the page notes", (await pop.locator(".item").count()) === 3);
  await pop.locator("body").screenshot({ path: path.join(RAW, "popup_dark.png") });

  // a second page with notes, and an empty page for the empty state
  const p2 = await ctx.newPage();
  await p2.goto(PAGE2, { waitUntil: "networkidle" });
  await p2.waitForSelector("#pn-host", { state: "attached" });
  await addNote(p2, sw, { p: 1, note: "Use for the focus section.", color: "pink" });
  await addNote(p2, sw, { p: 3, note: "", color: "yellow" });
  await p2.close();
  const p3 = await ctx.newPage();
  await p3.goto(EMPTY, { waitUntil: "networkidle" });
  await p3.waitForSelector("#pn-host", { state: "attached" });
  await p3.evaluate(() => { const h = document.querySelector("h2, h3"); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -40); });
  await sw.evaluate(async () => { for (const t of await chrome.tabs.query({})) { try { await chrome.tabs.sendMessage(t.id, { type: "ping" }); } catch (e) {} } });
  const p3Id = await sw.evaluate(async () => {
    const ids = [];
    for (const t of await chrome.tabs.query({})) { try { const r = await chrome.tabs.sendMessage(t.id, { type: "info" }); if (r.count === 0) ids.push(t.id); } catch (e) {} }
    return ids[0];
  });
  await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: "toggle-sidebar" }), p3Id);
  await p3.waitForTimeout(700);
  await p3.screenshot({ path: path.join(RAW, "sidebar_empty.png") });
  await p3.close();

  // options page, dark and light
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(1500);
  const totals = await opt.locator("#tNotes").textContent();
  check("options page counts all notes", totals === "5", `shows ${totals}`);
  await opt.screenshot({ path: path.join(RAW, "options_dark.png") });
  await opt.locator('#theme button[data-v="light"]').click();
  await opt.waitForTimeout(1500);
  await opt.screenshot({ path: path.join(RAW, "options_light.png") });

  // light theme versions of the popup and page
  await pop.reload();
  await pop.waitForTimeout(600);
  await pop.locator("body").screenshot({ path: path.join(RAW, "popup_light.png") });
  await page.bringToFront();
  await page.waitForTimeout(400);
  await page.locator("mark.pn-mark").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(RAW, "sidebar_light.png") });

  await ctx.close();
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
