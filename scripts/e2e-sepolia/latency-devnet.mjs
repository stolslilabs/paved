// Dry run of the latency instrumentation (S1, D-28) on a local devnet: the same code as part-b.mjs (latency.mjs: the page's marks, the
// node's answers, the samples, the tables), driven against the client's dev server with the burner signer. part-b.mjs itself needs
// the Cartridge keychain and Sepolia, so it cannot target a devnet; this script proves the timing code records numbers.
//   bun scripts/e2e-sepolia/latency-devnet.mjs --out <dir> [--url http://127.0.0.1:5173] [--moves 3] [--chromium <path>]
// Needs: a fresh `starknet-devnet --seed 42`, `scripts/deploy.sh devnet` (or `--unmerged`), and the client running with
//   VITE_RPC_URL, VITE_CHALLENGE_ADDRESS (if the deployment file is not the committed one), VITE_PLAYER_ADDRESS, VITE_PLAYER_PRIVATE_KEY.
// Headless shell only. A devnet seals a block per transaction at once, so the figures are the client's own cost (its receipt polling
// every 250 ms, its reconcile read, its render), not the network's: they are a proof of the instrumentation, not release figures.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROBE_SOURCE, boardPoints, createTracker, faucetSample, findAndPlace, moveSample, probeEvents, promptedBetween, purchaseSample, renderMarkdown, toJson, trackPage, txSince } from "./latency.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const out = arg("out", "/tmp/paved-latency-devnet");
const url = arg("url", "http://127.0.0.1:5173");
const wantMoves = Number(arg("moves", 3));
const executablePath = arg("chromium", join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"));
mkdirSync(out, { recursive: true });

const samples = [];
const tracker = createTracker();
const notes = [];
const presses = [];
const note = (s) => (notes.push(s), console.error(s));
const startedAt = new Date().toISOString();

const browser = await chromium.launch({ headless: true, executablePath });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.addInitScript(PROBE_SOURCE);
trackPage(page, tracker, (host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && host !== new URL(url).host);
page.on("pageerror", (e) => note(`pageerror: ${e.message.slice(0, 200)}`));

const sample = async (make, n, t0) => {
  await page.waitForTimeout(1500); // let the page settle (the marks after the last one)
  const events = await probeEvents(page);
  const s = make(n, t0, txSince(tracker, t0), events);
  s.prompted = promptedBetween(events, t0, s.t3 ?? s.t2 ?? Date.now());
  samples.push(s);
  note(`${s.kind} ${n}: ${JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k, v]) => /^t\d-t\d$/.test(k) && v !== null)))}`);
  return s;
};

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByTestId("mode-card-challenge").waitFor({ timeout: 30000 });

  // faucet
  let t0 = Date.now();
  await page.getByText(/^mint test tokens$/i).first().click({ timeout: 15000 });
  await page.waitForFunction(() => document.body.textContent.includes("Minting..."), null, { timeout: 15000 }).catch(() => note("Minting... not seen"));
  await page.waitForFunction(() => !document.body.textContent.includes("Minting..."), null, { timeout: 60000 });
  await sample(faucetSample, 1, t0);

  // purchase
  await page.getByTestId("mode-card-challenge").click({ timeout: 20000 });
  await page.getByRole("radio", { name: "1", exact: true }).click({ timeout: 15000 });
  await page.getByRole("button", { name: /^buy for/i }).click({ timeout: 15000 });
  t0 = Date.now();
  await page.getByRole("button", { name: /^confirm purchase$/i }).click({ timeout: 15000 });
  await page.waitForURL(/\/game\?.*id=\d+/, { timeout: 120000 });
  await page.waitForFunction(() => /\d+\s*\/\s*38/.test(document.body.innerText), null, { timeout: 60000 });
  await sample(purchaseSample, 1, t0);

  // moves
  const box = await page.locator("canvas").first().boundingBox();
  const points = boardPoints(box);
  for (let k = 1; k <= wantMoves; k++) {
    await page.waitForTimeout(3000); // as part-b: the next tile and the hover settle before the scan
    const placed = await findAndPlace(page, points);
    if (!placed.placed) {
      note(`move ${k}: no valid slot found by the scan`);
      note(`page text: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(-700)}`);
      break;
    }
    await page.waitForFunction(() => !document.body.innerText.includes("Working..."), null, { timeout: 60000 });
    presses.push(...placed.presses);
    const s = await sample(moveSample, k, placed.t0);
    const text = await page.evaluate(() => document.body.innerText);
    note(`move ${k}: tiles ${(text.match(/(\d+)\s*\/\s*38/) || [])[1]}; hash ${s.hash ? "seen" : "NOT seen"}; error lines: ${text.split("\n").filter((l) => /error|fail|revert|reject/i.test(l)).slice(0, 3).join(" | ") || "none"}`);
  }
} finally {
  const meta = { url, api: null, network: "devnet (dry run: instant blocks, not release figures)", startedAt, localHour: new Date().getHours(), notes };
  writeFileSync(join(out, "latency.json"), JSON.stringify(toJson(samples, meta), null, 2));
  writeFileSync(join(out, "latency.md"), renderMarkdown(samples, meta));
  writeFileSync(join(out, "probe.json"), JSON.stringify({ events: await probeEvents(page), presses, hashes: tracker.hashes }, null, 1));
  await page.screenshot({ path: join(out, "end.jpg"), type: "jpeg", quality: 60 }).catch(() => {});
  await browser.close();
  console.log(renderMarkdown(samples, meta));
}
