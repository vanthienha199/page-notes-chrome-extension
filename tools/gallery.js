// Builds the gallery inputs that need more than one capture. Run after npm test.
//   node tools/gallery.js
// raw/hero_scene.png  the highlighted page with the real popup open over it
// raw/store_zip.png   chrome://extensions with the extension loaded from dist/*.zip
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "raw");
const img = (f) => "data:image/png;base64," + fs.readFileSync(path.join(RAW, f)).toString("base64");

(async () => {
  const b = await chromium.launch({ channel: "chromium" });
  const p = await b.newPage({ viewport: { width: 1280, height: 769 }, deviceScaleFactor: 2 });
  await p.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:769px;overflow:hidden;background:#FFFFFF;position:relative">
    <img src="${img("page_notes.png")}" style="position:absolute;left:180px;top:0;width:1280px">
    <img src="${img("popup_light.png")}" style="position:absolute;right:28px;top:28px;width:360px;border:1px solid #E9E3D6;border-radius:10px;
      box-shadow:0 1px 2px rgba(0,0,0,.10),0 18px 44px rgba(28,27,24,.20)">
  </body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(RAW, "hero_scene.png") });
  await p.close();
  await b.close();

  const zip = fs.readdirSync(path.join(ROOT, "dist")).filter((f) => f.endsWith(".zip")).sort().pop();
  const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), "pn-zip-"));
  execFileSync("unzip", ["-q", path.join(ROOT, "dist", zip), "-d", unpacked]);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pn-ext-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, colorScheme: "light",
    viewport: { width: 1000, height: 560 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`]
  });
  const e = await ctx.newPage();
  await e.goto("chrome://extensions/");
  await e.waitForTimeout(1500);
  await e.screenshot({ path: path.join(RAW, "store_zip.png"), clip: { x: 0, y: 0, width: 1000, height: 340 } });
  await ctx.close();
  console.log("hero_scene.png and store_zip.png from", zip);
})();
