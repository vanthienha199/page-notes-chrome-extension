// Drives the real Page Notes extension in Chromium and captures the gallery images.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");

const DEMO = path.resolve(__dirname, "..");
const EXT = path.join(DEMO, "extension");
const RAW = path.join(DEMO, "raw");
const URL_ = "https://en.wikipedia.org/wiki/Coffee";
fs.mkdirSync(RAW, { recursive: true });

const NOTES = [
  { note: "Use this as the one line definition in the intro.", color: "yellow" },
  { note: "Check the origin story against a second source.", color: "green" },
  { note: "Nice context for the history section.", color: "blue" }
];

async function selectSentence(page, paraIndex) {
  // select the first sentence of the Nth long paragraph in the article body
  return page.evaluate((i) => {
    const paras = [...document.querySelectorAll("#mw-content-text p")]
      .filter((p) => p.innerText.trim().length > 250);
    const p = paras[i];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    const full = nodes.map((x) => x.nodeValue).join("");
    const m = /[.!?](\s|$)/g; m.lastIndex = 40;
    const hit = m.exec(full);
    let end = hit ? hit.index + 1 : full.length;
    if (end > 220) { end = full.lastIndexOf(" ", 200); }
    let acc = 0, sNode = null, eNode = null, eOff = 0;
    for (const x of nodes) {
      const len = x.nodeValue.length;
      if (!sNode && len > 0) sNode = x;
      if (acc + len >= end) { eNode = x; eOff = end - acc; break; }
      acc += len;
    }
    const r = document.createRange();
    r.setStart(sNode, 0);
    r.setEnd(eNode, eOff);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    p.scrollIntoView({ block: "center" });
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return sel.toString().slice(0, 80);
  }, paraIndex);
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pn-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 769 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  console.log("extension id", extId);

  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pn-host", { state: "attached" });
  await page.waitForTimeout(800);

  // BEFORE: the article with no highlights, anchored on the title
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const h = document.querySelector("#firstHeading"); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(RAW, "before.png") });

  // real usage: select, click the floating button, type the note
  for (let i = 0; i < NOTES.length; i++) {
    await sw.evaluate((c) => chrome.storage.sync.set({ settings: { color: c, showTooltip: true } }), NOTES[i].color);
    await page.waitForTimeout(200);
    const picked = await selectSentence(page, i);
    console.log("selected:", picked);
    await page.waitForTimeout(150);
    await page.locator('#pn-host .tip button[data-act="note"]').click();
    await page.waitForTimeout(250);
    await page.keyboard.type(NOTES[i].note, { delay: 5 });
    await page.waitForTimeout(500);
  }
  await page.locator('#pn-host [data-act="close"]').click();

  // persistence check: reload and count restored marks
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("mark.pn-mark", { timeout: 15000 });
  const restored = await page.evaluate(() => new Set([...document.querySelectorAll("mark.pn-mark")].map((m) => m.dataset.pnId)).size);
  console.log("restored highlights after reload:", restored);
  if (restored !== NOTES.length) throw new Error("highlights did not all restore");

  // AFTER: same anchor, highlights restored
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const h = document.querySelector("#firstHeading"); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(RAW, "after.png") });

  // page with the in-page sidebar open (click a highlight)
  await page.locator("mark.pn-mark").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(RAW, "sidebar.png") });
  await page.locator('#pn-host [data-act="close"]').click();
  await page.evaluate(() => { const h = document.querySelector("#firstHeading"); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(RAW, "page_highlights.png") });

  // the real popup, rendered for the Wikipedia tab
  const tabId = await sw.evaluate(async () => {
    for (const t of await chrome.tabs.query({})) {
      try { await chrome.tabs.sendMessage(t.id, { type: "ping" }); return t.id; } catch (e) {}
    }
    return null;
  });
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 600 });
  await pop.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await pop.waitForTimeout(600);
  await pop.locator("body").screenshot({ path: path.join(RAW, "popup.png") });
  await pop.close();

  // a second page, so the options page shows notes across sites
  const tea = await ctx.newPage();
  await tea.goto("https://en.wikipedia.org/wiki/Tea", { waitUntil: "domcontentloaded" });
  await tea.waitForSelector("#pn-host", { state: "attached" });
  await tea.waitForTimeout(600);
  const TEA = [{ note: "Compare caffeine with the coffee page.", color: "pink" }, { note: "", color: "yellow" }];
  for (let i = 0; i < TEA.length; i++) {
    await sw.evaluate((c) => chrome.storage.sync.set({ settings: { color: c, showTooltip: true } }), TEA[i].color);
    await tea.waitForTimeout(200);
    await selectSentence(tea, i);
    await tea.waitForTimeout(150);
    await tea.locator('#pn-host .tip button[data-act="' + (TEA[i].note ? "note" : "hl") + '"]').click();
    await tea.waitForTimeout(250);
    if (TEA[i].note) await tea.keyboard.type(TEA[i].note, { delay: 5 });
    await tea.waitForTimeout(500);
  }
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { color: "yellow", showTooltip: true } }));
  await tea.close();

  // options page
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(600);
  await opt.screenshot({ path: path.join(RAW, "options.png") });

  // exported data, as proof the storage is real
  const dump = await sw.evaluate(() => chrome.storage.local.get(null));
  fs.writeFileSync(path.join(RAW, "storage_dump.json"), JSON.stringify(dump, null, 2));

  await ctx.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
