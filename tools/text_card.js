// Renders real command output as a clean terminal card (no local paths) for gallery tiles.
// node tools/text_card.js <input.txt> <out.png> "<command shown>" [light|dark] [width]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const [input, out, command, theme = "light", width = "900"] = process.argv.slice(2);
const FONTS = path.resolve(__dirname, "../extension/fonts");
const font = (f) => "data:font/woff2;base64," + fs.readFileSync(path.join(FONTS, f)).toString("base64");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const lines = fs.readFileSync(input, "utf8").split("\n")
  .filter((l) => l.trim() && !/^>\s/.test(l))
  .map((l) => l.replace(/\/Users\/[^\s)]+/g, "").replace(/\s+$/, ""));

const T = theme === "dark"
  ? { bg: "#15171B", card: "#1E2126", line: "#2F333A", ink: "#F3EFE7", muted: "#A7A39B", ok: "#7CBA8C", bad: "#E8806E", acc: "#F2994A" }
  : { bg: "#F6F3EE", card: "#FFFFFF", line: "#E4DED4", ink: "#1B1A17", muted: "#6E6A62", ok: "#3F8A55", bad: "#C2543F", acc: "#D9782A" };

const body = lines.map((l) => {
  let h = esc(l);
  h = h.replace(/^PASS/, `<b style="color:${T.ok}">PASS</b>`).replace(/^FAIL/, `<b style="color:${T.bad}">FAIL</b>`);
  h = h.replace(/(\([^)]*\))$/, `<span style="color:${T.muted}">$1</span>`);
  if (/all checks passed|passed in|tests? passed/i.test(l)) h = `<b style="color:${T.ok}">${h}</b>`;
  return `<div>${h || "&nbsp;"}</div>`;
}).join("");

const html = `<!doctype html><html><head><style>
@font-face { font-family: Mono; src: url(${font("mono-500.woff2")}); }
@font-face { font-family: Plex; src: url(${font("plex-500.woff2")}); }
body { margin: 0; background: ${T.bg}; padding: 32px; }
.card { width: ${width}px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 10px; overflow: hidden;
        box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08); }
.bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid ${T.line}; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: ${T.line}; }
.bar span { font-family: Plex; font-size: 13px; color: ${T.muted}; margin-left: 8px; }
pre { margin: 0; padding: 20px 24px 24px; font-family: Mono; font-size: 15px; line-height: 1.75; color: ${T.ink}; white-space: pre-wrap; }
.cmd { color: ${T.acc}; margin-bottom: 8px; }
</style></head><body><div class="card"><div class="bar"><i></i><i></i><i></i><span>Terminal</span></div>
<pre><div class="cmd">$ ${esc(command)}</div>${body}</pre></div></body></html>`;

(async () => {
  const b = await chromium.launch({ channel: "chromium" });
  const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: Number(width) + 64, height: 400 } });
  await p.setContent(html);
  await p.locator(".card").screenshot({ path: out });
  await b.close();
  console.log("wrote", out);
})();
