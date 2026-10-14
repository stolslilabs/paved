// Part B of the Sepolia run (D-16): a throwaway Cartridge controller, headless on the VPS, virtual WebAuthn authenticator.
//   bun scripts/e2e-sepolia/part-b.mjs --out <dir> [--chromium <path>]                      dry run: stops at the username screen
//   bun scripts/e2e-sepolia/part-b.mjs --out <dir> --confirmed --username <name> --player <name> [--moves 3] [--purchases 1] [--extra-mint] [--surrender]
// With `--confirmed` it also writes `latency.json` and `latency.md` to the output folder: the player's waits for the faucet mint
// (`--extra-mint`), the purchases and the moves (S1, D-28; the marks are defined in docs/client/f-release.md, "Latency"; the code is latency.mjs).
// The release run is `--moves 5 --purchases 2 --extra-mint`: buy, mint aside, play the moves, surrender, buy again.
// Headless shell only, no persistent context. Without `--confirmed` the driver never adds the authenticator and never types or clicks inside
// the keychain: it presses Connect, reads the keychain's screen and lists its form controls (names and types, no values).
// With `--confirmed` it creates ONE account and keeps it for the whole run; the credential lives only in this browser context.
// Never written: credential ids, keys, session data, cookies, storage, request bodies or headers. Hashes of transactions and addresses are public chain data.
// If a keychain screen asks for anything unexpected (see STOP below) the driver stops and waits for a command file (`--cmd`), it never works around it.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkEvidence, isFailureText, operationName, redact, scrub } from "./scrub.mjs";
import { PROBE_SOURCE, boardPoints, createTracker, findAndPlace, faucetSample, moveSample, probeEvents, promptedBetween, purchaseSample, renderMarkdown, toJson, trackPage, txSince } from "./latency.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const out = arg("out", "/tmp/paved-e2e-out");
const url = arg("url", "https://paved.bal7hazar.com");
const api = arg("api", "https://api.paved.bal7hazar.com");
const confirmed = arg("confirmed", false) === true;
const username = String(arg("username", ""));
const wantMoves = Number(arg("moves", 3));
const wantPurchases = Math.max(1, Number(arg("purchases", 1)));
const cmdFile = String(arg("cmd", join(out, "cmd.json")));
const executablePath = arg(
  "chromium",
  join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"),
);
if (confirmed && !/^[a-z0-9-]{3,19}$/.test(username)) throw new Error("--confirmed needs --username (a throwaway name: a-z, 0-9, -, at most 19 characters: the keychain refuses longer)");
mkdirSync(out, { recursive: true });

// Redaction (see scrub.mjs): URLs lose query and fragment; the keychain's echoed registration request is cut; long hex and tokens are scrubbed.
// The public hashes and addresses the run records are kept apart, in `txs`.

const log = { stage: "start", console: [], requests: [], failures: [], frames: [], screens: [], txs: [], notes: [] };
// Latency (S1): the samples, the node's answers about each transaction, and when the run started.
const samples = [];
const tracker = createTracker();
const startedAt = new Date().toISOString();
const stage = (s) => (log.stage = s);
const note = (s) => (log.notes.push(`${log.stage}: ${scrub(s)}`), console.error(`[${log.stage}] ${scrub(s)}`));
const latencyMeta = () => ({ url, api, network: "sepolia", startedAt, localHour: new Date().getHours(), notes: log.notes.filter((n) => /^(extra-mint|buy-challenge|moves)/.test(n)).slice(-12) });
const save = () => {
  writeFileSync(join(out, "part-b-run.json"), JSON.stringify(log, null, 2));
  if (samples.length) {
    writeFileSync(join(out, "latency.json"), JSON.stringify(toJson(samples, latencyMeta()), null, 2));
    writeFileSync(join(out, "latency.md"), renderMarkdown(samples, latencyMeta()));
  }
};

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.addInitScript(PROBE_SOURCE); // the page's own marks, for latency.mjs
trackPage(page, tracker, (host) => /(^|\.)cartridge\.gg$/.test(host));
let cdp = null;
let authenticatorId = null;
let closed = false;
const closeAll = async () => {
  if (closed) return;
  closed = true;
  save();
  if (cdp && authenticatorId) await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  rmSync(cmdFile, { force: true });
  // The written files must not carry the registration: a hit stops everything with exit 5, and the files are not to be committed.
  const hits = checkEvidence(out);
  for (const h of hits) console.error(`EVIDENCE CHECK FAILED: ${h.word} in ${h.file}`);
  if (hits.length) process.exit(5);
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => closeAll().finally(() => process.exit(130)));

page.on("console", (m) => {
  // `stack` is the first script URL of the message (its stack line is cut with the rest of an rpc error line by `scrub`), without query.
  if (["error", "warning"].includes(m.type())) log.console.push({ stage: log.stage, type: m.type(), text: scrub(m.text()).slice(0, 400), from: redact(m.location().url || "").slice(0, 120), stack: redact((m.text().match(/\bat (https?:\/\/[^\s)]+)/) || [])[1] || "").replace(/:\d+(:\d+)?$/, "").slice(0, 160) });
});
page.on("pageerror", (e) => log.console.push({ stage: log.stage, type: "pageerror", text: scrub(e.message).slice(0, 400) }));
page.on("request", (r) => {
  const u = new URL(r.url());
  log.requests.push({ stage: log.stage, method: r.method(), host: u.host, path: u.pathname });
});
page.on("requestfailed", (r) => log.failures.push({ stage: log.stage, url: redact(r.url()).slice(0, 200), error: r.failure()?.errorText }));
page.on("framenavigated", (f) => log.frames.push({ stage: log.stage, url: redact(f.url()).slice(0, 200) }));
// Transaction hashes only: the answers of Cartridge's RPC and paymaster are searched for `transaction_hash`; nothing else of them is kept.
page.on("response", async (res) => {
  if (!/cartridge\.gg$/.test(new URL(res.url()).host) || res.request().method() !== "POST") return;
  const body = await res.text().catch(() => "");
  for (const m of body.matchAll(/"transaction_hash"\s*:\s*"(0x[0-9a-fA-F]{1,64})"/g)) {
    if (!log.txs.some((t) => t.hash === m[1])) log.txs.push({ stage: log.stage, hash: m[1], at: Date.now() });
  }
});

const shot = (name) => page.screenshot({ path: join(out, `${name}.jpg`), type: "jpeg", quality: 70 });
const bodyText = (target = page) => target.evaluate(() => document.body.innerText).catch((e) => `unreadable: ${e}`);
const sleep = (ms) => page.waitForTimeout(ms);

// The keychain: the frame of x.cartridge.gg that carries the visible screen.
const keychainFrame = () => page.frames().find((f) => /(^|\.)x\.cartridge\.gg$/.test(new URL(f.url()).host) && !f.isDetached());
const keychainOpen = async () => {
  const iframe = page.locator('iframe[src*="x.cartridge.gg"]').first();
  return (await iframe.count()) > 0 && (await iframe.isVisible().catch(() => false));
};
async function keychainScreen(name) {
  const f = keychainFrame();
  const read = async () => (f ? await bodyText(f) : "(no keychain frame)");
  let raw = await read();
  // Form controls: kind and label only, never a value.
  const controls = f
    ? await f
        .evaluate(() => [...document.querySelectorAll("input,button,a,[role=button],[role=tab],select")].map((e) => ({
          tag: e.tagName.toLowerCase(),
          type: e.getAttribute("type"),
          name: e.getAttribute("name"),
          placeholder: e.getAttribute("placeholder"),
          autocomplete: e.getAttribute("autocomplete"),
          text: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 60),
          disabled: e.disabled === true,
        })))
        .catch(() => [])
    : [];
  // No screenshot while the failure text is on screen: the keychain prints its registration request there. The text is read again
  // after the picture in case the failure appeared meanwhile, and a picture taken then is deleted.
  let failed = isFailureText(raw);
  if (!failed) {
    await shot(name);
    raw = await read();
    failed = isFailureText(raw);
    if (failed) rmSync(join(out, `${name}.jpg`), { force: true });
  }
  const at = new Date().toISOString();
  // On a failure the operation name is read from the raw text, before scrub, and only the name is kept.
  const operation = failed ? operationName(raw) : null;
  const seen = failed ? ["Authentication failed. Please try again.", "Please try connecting again"].filter((p) => raw.includes(p)) : [];
  const text = scrub(raw) + (seen.length ? `\n[lines seen after the cut: ${seen.join(" | ")}]` : "");
  writeFileSync(join(out, `${name}.txt`), text);
  log.screens.push({ name, at, text, controls, failed, operation, screenshot: !failed });
  return { text, controls, failed, operation, at };
}

// STOP: anything the owner's gate did not allow. The driver pauses and reports instead of clicking.
const STOP = /e-?mail|phone|\bsms\b|credit|debit|card|payment|pay with|buy (crypto|eth|usdc|strk)|purchase|deposit|add funds|bridge|on-?ramp|kyc|verify your|recovery phrase|seed/i;
const SAFE_BUTTON = /^(sign up|create|create account|continue|connect|create session|approve|confirm|accept|ok|got it|next|done|submit|register)$/i;

async function pause(reason) {
  note(`PAUSED: ${reason}`);
  save();
  writeFileSync(join(out, "PAUSED.txt"), `${reason}\n`);
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    if (existsSync(cmdFile)) {
      let cmd;
      try {
        cmd = JSON.parse(readFileSync(cmdFile, "utf8"));
      } catch {
        await sleep(500);
        continue;
      }
      rmSync(cmdFile, { force: true });
      rmSync(join(out, "PAUSED.txt"), { force: true });
      return cmd;
    }
    await sleep(1000);
  }
  return { do: "quit" };
}

// A real (trusted) click on a keychain button found by its visible text, not its accessible name: the first live attempt found
// `getByRole("button", { name })` timing out on an enabled SIGN UP. Falls back to a mouse click at the button's position, which
// keeps the user activation WebAuthn needs in a cross-origin iframe.
async function clickButton(text) {
  const f = keychainFrame();
  if (!f) return;
  const button = f.locator("button", { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }).first();
  try {
    await button.click({ timeout: 8000 });
  } catch (e) {
    note(`click failed (${String(e).split("\n")[0]}); trying a mouse click`);
    const box = await button.boundingBox().catch(() => null);
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

// Commands from the command file while paused: click a button or any text in the keychain, or press a key. Nothing else.
async function runCmd(cmd) {
  const f = keychainFrame();
  if (!f) return;
  if (cmd.do === "click") await f.getByRole("button", { name: cmd.text }).first().click({ timeout: 10000 }).catch((e) => note(`click failed: ${e}`));
  else if (cmd.do === "clicktext") await f.getByText(cmd.text).first().click({ timeout: 10000 }).catch((e) => note(`clicktext failed: ${e}`));
  else if (cmd.do === "key") await page.keyboard.press(cmd.key);
}

// Walks the keychain screens (sign-up, session approval, a prompt) until it closes. Stops on a STOP word or an unknown screen.
async function walkKeychain(label, { maxScreens = 12 } = {}) {
  for (let n = 1; n <= maxScreens; n++) {
    await sleep(2500);
    if (!(await keychainOpen())) return true;
    const { text, controls, failed, operation, at } = await keychainScreen(`${label}-${String(n).padStart(2, "0")}`);
    // Registration failed on Cartridge's side: stop, never retry in this run. The operation name and time are what the report needs.
    if (failed) {
      note(`REGISTRATION FAILED at ${at}: operation ${operation ?? "unknown"}; text: ${text.split("\n").filter((l) => /error/i.test(l)).join(" | ")}`);
      log.registrationFailed = { at, operation: operation ?? "unknown" };
      return "failed";
    }
    // The method chooser: PASSKEY only, never SMS or Other options.
    if (/Create Controller/i.test(text) && controls.some((c) => c.tag === "button" && /^\s*passkey\s*$/i.test(c.text))) {
      note('method chooser: choosing "PASSKEY" (never SMS or Other options)');
      await clickButton("PASSKEY");
      continue;
    }
    if (STOP.test(text)) {
      const cmd = await pause(`the keychain shows text that was not expected (${(text.match(STOP) || [])[0]})`);
      if (cmd.do === "quit") return false;
      await runCmd(cmd);
      continue;
    }
    const buttons = controls.filter((c) => (c.tag === "button" || c.tag === "a") && !c.disabled && SAFE_BUTTON.test(c.text.replace(/\s+/g, " ")));
    if (!buttons.length) {
      const cmd = await pause("no known button on this keychain screen");
      if (cmd.do === "quit") return false;
      await runCmd(cmd);
      continue;
    }
    note(`click "${buttons[0].text}"`);
    await clickButton(buttons[0].text);
  }
  return !(await keychainOpen());
}

const tiles = async () => {
  const m = (await bodyText()).match(/(\d+)\s*\/\s*38/);
  return m ? Number(m[1]) : null;
};

// A latency sample from the marks seen since `t0`. It is "prompted" when a keychain screen opened meanwhile (the wait then includes a
// person's approval, which the Controller's session is meant to avoid), and then it stays out of median and max.
async function sampleOf(make, n, t0, screens0) {
  const events = await probeEvents(page);
  const s = make(n, t0, txSince(tracker, t0), events);
  s.prompted = log.screens.length > screens0 || promptedBetween(events, t0, s.t3 ?? s.t2 ?? Date.now());
  note(`latency ${s.kind} ${n}: ${JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k, v]) => /^t\d-t\d$/.test(k) && v !== null)))}${s.prompted ? " (prompted)" : ""}`);
  return s;
}

// The main flow runs in try/finally: whatever happens, the evidence is saved and checked and the context is closed.
try {
  // ---- 0. load
  stage("load");
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => note(`goto: ${e}`));
  await sleep(3000);
  await shot("b01-loaded");
  writeFileSync(join(out, "b01-page-text.txt"), scrub(await bodyText()));
  note(`keychain visible before Connect: ${await keychainOpen()}`);

  // ---- 1. Connect: the keychain's first screen
  stage("connect");
  await page.getByRole("button", { name: /connect/i }).first().click({ timeout: 15000 });
  await sleep(8000);
  const first = await keychainScreen("b02-keychain-username");
  note(`keychain visible after Connect: ${await keychainOpen()}; controls: ${JSON.stringify(first.controls.map((c) => [c.tag, c.type, c.name, c.placeholder, c.text]))}`);

  if (!confirmed) {
    note("dry run: stopped at the username screen, nothing typed, no authenticator added");
    await closeAll();
    console.log(JSON.stringify({ out, dryRun: true, console: log.console.length, screens: log.screens.length }, null, 1));
    process.exit(0);
  }

  // ---- 2. Sign up with the virtual authenticator (confirmed only)
  stage("signup");
  cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  ({ authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  }));
  const kc = keychainFrame();
  await kc.locator("input").first().fill(username, { timeout: 15000 });
  await sleep(2500); // the keychain looks the name up
  // The name is offered as a "Create New" suggestion; SIGN UP stays disabled until it is chosen (found on the first live attempt).
  await kc.getByText("Create New").first().click({ timeout: 15000 }).catch((e) => note(`create-new row: ${e}`));
  await kc.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 15000 }).catch((e) => note(`sign up still disabled: ${e}`));
  await sleep(500);
  const afterName = await keychainScreen("b03-keychain-after-username");
  note(`after the username: buttons ${JSON.stringify(afterName.controls.filter((c) => c.tag === "button").map((c) => c.text))}`);
  // The name must be new: "Create New". An existing account (no such line) stops the run, never another name.
  if (!/create new/i.test(afterName.text)) {
    note("the keychain does not offer Create New for this name: stopping, no account created by this run");
    await closeAll();
    process.exit(3);
  }
  const walked = await walkKeychain("b04-signup");
  if (walked === "failed") {
    await closeAll();
    process.exit(4);
  }
  if (!walked) {
    await closeAll();
    process.exit(2);
  }
  await sleep(3000);
  await shot("b05-after-signup");
  writeFileSync(join(out, "b05-page-text.txt"), scrub(await bodyText()));

  // ---- 3. The player is the connected wallet (D-25 (E)): no account to create, no name to type. The landing page
  // welcomes the Controller username.
  stage("connected-player");
  await page.getByText(new RegExp(`welcome, ${username}`, "i")).first().waitFor({ timeout: 180000 }).catch((e) => note(`welcome not seen: ${e}`));
  await sleep(3000);
  await shot("b07-account-created");
  const afterCreate = scrub(await bodyText());
  writeFileSync(join(out, "b07-page-text.txt"), afterCreate);
  note(`balance line: ${(afterCreate.match(/[^\n]*USDC[^\n]*/g) || []).slice(0, 4).join(" | ")}`);

  // ---- 4. Optional extra mint (a failure of this optional step is noted and the run goes on to the purchase)
  if (arg("extra-mint", false) === true) {
    stage("extra-mint");
    try {
      const screens0 = log.screens.length;
      const t0 = Date.now(); // the click on "Mint Test Tokens" (latency mark t0)
      // The Tamagui button is not a `button` role in the client: found by its text (as the devnet dry run proved).
      await page.getByText(/^mint test tokens$/i).first().click({ timeout: 15000 });
      await walkKeychain("b08-mint");
      await page.waitForFunction(() => document.body.textContent.includes("Minting..."), null, { timeout: 15000 }).catch(() => note("Minting... not seen"));
      await page.waitForFunction(() => !document.body.textContent.includes("Minting..."), null, { timeout: 180000 });
      await sleep(1500);
      samples.push(await sampleOf(faucetSample, 1, t0, screens0));
      await shot("b08-after-mint");
    } catch (e) {
      note(`extra mint failed, going on: ${String(e).split("\n")[0]}`);
    }
  }

  // ---- 5. Buy a Challenge game, lowest stake. While a Challenge game is active the landing offers "Resume", not the stake picker
  // (Landing.tsx hasActiveGame), so a second purchase happens after the first game is surrendered (step 6b).
  stage("buy-challenge");
  const buy = async (p) => {
    await page.getByTestId("mode-card-challenge").click({ timeout: 20000 });
    await sleep(2500);
    await page.getByRole("radio", { name: "1", exact: true }).click({ timeout: 15000 });
    await sleep(2500);
    if (p === 1) {
      await shot("b09-challenge-dialog");
      writeFileSync(join(out, "b09-challenge-dialog.txt"), scrub(await bodyText()));
    }
    await page.getByRole("button", { name: /^buy for/i }).click({ timeout: 15000 });
    const screens0 = log.screens.length;
    const t0 = Date.now(); // the click on "Confirm purchase" (latency mark t0)
    await page.getByRole("button", { name: /^confirm purchase$/i }).click({ timeout: 15000 });
    await walkKeychain(`b10-buy${p > 1 ? `-${p}` : ""}`, { maxScreens: 4 });
    await page.waitForURL(/\/game\?.*id=\d+/, { timeout: 240000 }).catch((e) => note(`no game url: ${e}`));
    const id = new URL(page.url()).searchParams.get("id");
    note(`game id ${id}`);
    await sleep(6000);
    samples.push(await sampleOf(purchaseSample, p, t0, screens0));
    return id;
  };
  const gameId = await buy(1);
  await shot("b11-game");

  // ---- 6. Moves: hover the board and press C (the client's own hotkey), rotating with R, until the tile counter rises
  stage("moves");
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const moves = [];
  const points = boardPoints(box);
  for (let k = 0; k < wantMoves; k++) {
    const before = await tiles();
    const screens0 = log.screens.length;
    const txBefore = log.txs.length;
    const { placed, t0 } = await findAndPlace(page, points); // t0: the key press that was accepted (latency mark t0)
    if (!placed) {
      note(`move ${k + 1}: no valid slot found by the scan`);
      await shot(`b12-move-${k + 1}-noslot`);
      break;
    }
    await page.waitForFunction(() => !document.body.innerText.includes("Working..."), null, { timeout: 180000 }).catch((e) => note(`move ${k + 1} still working: ${e}`));
    await walkKeychain(`b12-move-${k + 1}-keychain`, { maxScreens: 2 });
    await sleep(4000);
    samples.push(await sampleOf(moveSample, k + 1, t0, screens0));
    const after = await tiles();
    moves.push({ n: k + 1, tilesBefore: before, tilesAfter: after, txs: log.txs.slice(txBefore).map((t) => t.hash) });
    note(`move ${k + 1}: tiles ${before} -> ${after}; txs ${log.txs.slice(txBefore).map((t) => t.hash).join(",")}`);
    await shot(`b13-move-${k + 1}`);
  }
  log.moves = moves;

  const surrender = async (label) => {
    stage("surrender");
    await page.getByRole("button", { name: /^surrender$/i }).first().click({ timeout: 15000 });
    await page.getByRole("button", { name: /^confirm surrender$/i }).click({ timeout: 15000 });
    await walkKeychain(`${label}-surrender`, { maxScreens: 2 });
    await sleep(8000);
    await shot(`${label}-surrendered`);
  };
  // ---- 6b. More purchases (`--purchases N`): the game played above is surrendered first, then back to the landing without a reload
  // (the Controller session stays; the purchase pushed /game onto the history) and the next game is bought. Those games are not played.
  if (wantPurchases > 1) {
    await surrender("b14");
    for (let p = 2; p <= wantPurchases; p++) {
      stage("buy-challenge");
      await page.evaluate(() => history.back());
      if (!(await page.getByTestId("mode-card-challenge").isVisible({ timeout: 20000 }).catch(() => false))) {
        note(`purchase ${p}: the landing did not come back, no further purchase`);
        break;
      }
      await sleep(3000);
      await buy(p);
      if (p < wantPurchases) await surrender(`b14-${p}`);
    }
  } else if (arg("surrender", false) === true) await surrender("b14");
  writeFileSync(join(out, "b13-game-text.txt"), scrub(await bodyText()));

  // ---- 7. Indexer: poll /v1/head until it has the game, bounded at 30 minutes
  stage("indexer");
  const get = async (p) => (await fetch(`${api}/v1/${p}`)).json();
  let game = null;
  const until = Date.now() + 30 * 60 * 1000;
  while (Date.now() < until) {
    const head = await get("head").catch(() => null);
    const g = await get(`games/challenge/${gameId}`).catch(() => null);
    note(`behind ${head?.behind}; game ${g?.game ? "indexed" : g?.status ?? "?"}`);
    if (g?.game) {
      game = g.game;
      // wait until the moves are in too: the game's score row is current once `behind` is small
      if ((head?.behind ?? 1e9) < 20) break;
    }
    await sleep(30000);
  }
  const keep = (name, v) => writeFileSync(join(out, `b-indexer-${name}.json`), JSON.stringify(v, null, 2));
  keep("head", await get("head"));
  if (game) {
    keep("game", await get(`games/challenge/${gameId}`));
    const pid = game.player_id;
    keep("player", await get(`players/${pid}`));
    keep("player-games", await get(`players/${pid}/games`));
    const day = game.day_id;
    keep("tournament", await get(`tournaments/${day}`));
    keep("leaderboard", await get(`tournaments/${day}/leaderboard?limit=20`));
    log.player_id = pid;
    log.game = { id: gameId, day };
  }
  // the UI's leaderboard, to compare
  await page.goto(`${url}/leaderboard`, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => note(`leaderboard: ${e}`));
  await sleep(6000);
  await shot("b15-leaderboard");
  writeFileSync(join(out, "b15-leaderboard-text.txt"), scrub(await bodyText()));

  // ---- 8. The two `Unauthenticated ... access denied` errors, now that a session exists
  stage("console-recheck");
  const denied = log.console.filter((c) => /Unauthenticated|access denied/i.test(c.text));
  note(`access-denied errors: ${denied.length} (by stage: ${JSON.stringify(denied.reduce((a, c) => ((a[c.stage] = (a[c.stage] || 0) + 1), a), {}))})`);

  // ---- 9. Close: the context holds the only copy of the credential and the session
  stage("close");
  await closeAll();
  console.log(JSON.stringify({ out, console: log.console.length, txs: log.txs.length, moves: moves.length, gameId }, null, 1));
} finally {
  await closeAll();
}
