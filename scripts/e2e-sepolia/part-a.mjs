// Part A of the Sepolia run (D-16): no Cartridge account. Headless Chromium only, never a window.
//   bun scripts/e2e-sepolia/part-a.mjs --out <dir> [--connect] [--chromium <path>]
// Loads the public client, records console errors and RPC/indexer requests, dumps the visible text, and with --connect
// presses Connect and photographs the keychain iframe. It never types into or clicks inside the keychain.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]);
};
const out = arg("out", "/tmp/paved-e2e-out");
const url = arg("url", "https://paved.bal7hazar.com");
const executablePath = arg(
  "chromium",
  join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"),
);
mkdirSync(out, { recursive: true });

const log = { console: [], requests: [], failures: [], frames: [] };
const browser = await chromium.launch({ headless: true, executablePath });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on("console", (m) => ["error", "warning"].includes(m.type()) && log.console.push({ type: m.type(), text: m.text().slice(0, 500) }));
page.on("pageerror", (e) => log.console.push({ type: "pageerror", text: String(e.message).slice(0, 500) }));
page.on("request", (r) => {
  const u = new URL(r.url());
  if (!/paved\.bal7hazar\.com$/.test(u.host) || u.pathname.startsWith("/v1") || r.url().includes("rpc"))
    log.requests.push({ method: r.method(), host: u.host, path: u.pathname + (u.search ? "?…" : "") });
  else log.requests.push({ method: r.method(), host: u.host, path: u.pathname });
});
page.on("requestfailed", (r) => log.failures.push({ url: r.url().slice(0, 200), error: r.failure()?.errorText }));
// Frame URLs are written without their query (the keychain's connect id is a channel id, kept out of the evidence).
const redact = (u) => u.replace(/\?.*$/, "");
page.on("framenavigated", (f) => log.frames.push(redact(f.url()).slice(0, 200)));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => log.console.push({ type: "goto", text: String(e) }));
await page.waitForTimeout(3000);
await page.screenshot({ path: join(out, "01-loaded.jpg"), type: "jpeg", quality: 70 });
const text = await page.evaluate(() => document.body.innerText);
const buttons = await page.evaluate(() => [...document.querySelectorAll("button,a,[role=button]")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean));
writeFileSync(join(out, "page-text.txt"), text);
writeFileSync(join(out, "buttons.json"), JSON.stringify(buttons, null, 2));

const board = page.getByText(/open leaderboard/i).first();
if (await board.count()) {
  await board.click({ timeout: 10000 }).catch((e) => log.console.push({ type: "leaderboard-click", text: String(e).slice(0, 300) }));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(out, "02-leaderboard.jpg"), type: "jpeg", quality: 70 });
  writeFileSync(join(out, "leaderboard-text.txt"), await page.evaluate(() => document.body.innerText));
}
if (arg("connect", false)) {
  const connect = page.getByRole("button", { name: /connect/i }).first();
  await connect.click({ timeout: 15000 }).catch((e) => log.console.push({ type: "connect-click", text: String(e).slice(0, 300) }));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(out, "03-after-connect.jpg"), type: "jpeg", quality: 70 });
  const frames = page.frames().map((f) => redact(f.url()));
  writeFileSync(join(out, "frames.json"), JSON.stringify(frames, null, 2));
  for (const f of page.frames()) {
    if (!/cartridge\.gg/.test(f.url())) continue;
    const t = await f.evaluate(() => document.body.innerText).catch((e) => `unreadable: ${e}`);
    writeFileSync(join(out, "keychain-text.txt"), t);
  }
}
writeFileSync(join(out, "run.json"), JSON.stringify(log, null, 2));
await browser.close();
console.log(JSON.stringify({ out, console: log.console.length, requests: log.requests.length, failures: log.failures.length, buttons }, null, 1));
