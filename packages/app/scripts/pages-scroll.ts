/**
 * PAGES-SCROLL (#782): every page and side panel scrolls to its last element when it is taller than the screen. Headless
 * Chromium against the Vite dev server of this package, on the mock (`VITE_DATA_SOURCE=mock`) with a devnet burner so the pages
 * read a connected player:
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   node scripts/pages-scroll.ts [--url <server already up, started with the same env>] [--shots <folder>]
 *
 * At 375 x 812 (a phone: touch, mobile viewport) each page is reached as the player reaches it, in the app (the session stays),
 * then dragged by touch to its end; at 1440 x 900 each page opens in the home's side panel and is scrolled by the wheel. Per
 * page and width it prints whether the page is taller than its region, how far it scrolled, whether its last element is in
 * view at the end, and whether its header stayed at the top. At 1440 it also checks the panel has no close button and that a
 * click on the village outside it, then Escape, close it. The lines are the pass's list of the PR. `--shots` saves the League
 * and the Chests at 375 px, scrolled to their end, in that folder.
 *
 * Chromium's touch emulation is not iOS Safari: a real phone (or the Mac's iOS simulator) stays the check of iOS.
 * Node 24 runs it as is (type stripping). Exit code 1 on a failed check.
 */
import { fileURLToPath } from "node:url";
import { chromium, devices, type CDPSession, type Locator, type Page } from "playwright-core";
import { createServer as createVite } from "vite";

/** The pages of the pass: the bar's, Missions and the Vault, and the second-level pages. */
const PAGES: readonly [path: string, title: string][] = [
  ["/village/shop", "Tile shop"],
  ["/village/chests", "Chests"],
  ["/pvp/league", "League"],
  ["/settings", "Settings"],
  ["/missions", "Missions"],
  ["/missions/lifetime", "Missions"],
  ["/vault", "Vault"],
  ["/pvp/defence", "Defence log"],
  ["/settings/theme", "Themes"],
  ["/settings/tiles", "My tiles"],
  ["/referral", "Referral"],
  ["/settings/credits", "Credits"],
];

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A finger's drag from `y0` to `y1`. */
async function drag(cdp: CDPSession, x: number, y0: number, y1: number): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
    await pause(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(400);
}

/** A move inside the app (the router hears `popstate`), so the connected session stays. */
async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.pushState(null, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await pause(2500);
}

interface Measure {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  lastInView: boolean;
  headerAtTop: boolean;
}

/** The region's figures, and whether the page's last element and its header are in the region's box. */
function measure(region: Locator): Promise<Measure> {
  return region.evaluate((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const header = el.querySelector("[data-slot=page-header]")?.getBoundingClientRect();
    const main = el.querySelector("main");
    let last: Element | null = main;
    while (last?.lastElementChild) last = last.lastElementChild;
    const end = last?.getBoundingClientRect();
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      lastInView: !!end && end.bottom <= box.bottom + 1 && end.top >= box.top,
      headerAtTop: !!header && Math.abs(header.top - box.top) < 1,
    };
  });
}

function report(width: number, title: string, path: string, m: Measure): void {
  const tall = m.scrollHeight > m.clientHeight + 1;
  const atEnd = m.scrollTop + m.clientHeight >= m.scrollHeight - 1;
  const how = tall ? `scrolls ${m.scrollTop} of ${m.scrollHeight - m.clientHeight} px` : "fits, nothing to scroll";
  check(`${width} px ${title} (${path}): reaches its last element`, (!tall || atEnd) && m.lastInView, how);
  check(`${width} px ${title} (${path}): header sticky at the top`, m.headerAtTop);
}

async function connect(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Connect$/ }).first().click({ timeout: 5000 }).catch(() => undefined);
  await pause(3000);
}

const arg = (name: string) => (process.argv.indexOf(name) >= 0 ? process.argv[process.argv.indexOf(name) + 1] : "");

async function phone(base: string, shots: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.goto(`${base}/village/chests`, { waitUntil: "networkidle" });
    await connect(page);
    for (const [path, title] of PAGES) {
      await goInApp(page, path);
      await page.getByRole("heading", { level: 1, name: title }).waitFor({ timeout: 10_000 });
      const region = page.locator("[data-slot=page-scroll]");
      for (let i = 0; i < 8; i++) {
        const m = await measure(region);
        if (m.scrollTop + m.clientHeight >= m.scrollHeight - 1) break;
        await drag(cdp, 187, 600, 150);
      }
      report(375, title, path, await measure(region));
      if (shots && (path === "/pvp/league" || path === "/village/chests")) await page.screenshot({ path: `${shots}/375${path.replace(/\//g, "-")}.png` });
    }
  } finally {
    await browser.close();
  }
}

async function desktop(base: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    // A player past the welcome: a close leads to the home, not to the welcome page.
    await context.addInitScript(() => localStorage.setItem("welcomed", "1"));
    const page = await context.newPage();
    await page.goto(`${base}/village/chests`, { waitUntil: "networkidle" });
    await connect(page);
    for (const [path, title] of PAGES) {
      await goInApp(page, path);
      const dialog = page.getByRole("dialog", { name: title });
      await dialog.waitFor({ timeout: 10_000 });
      check(`1440 px ${title} (${path}): no close button`, (await dialog.getByRole("button", { name: "Close" }).count()) === 0);
      const region = dialog.locator("[data-slot=page-scroll]");
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 8; i++) {
        const m = await measure(region);
        if (m.scrollTop + m.clientHeight >= m.scrollHeight - 1) break;
        await page.mouse.wheel(0, 600);
        await pause(300);
      }
      report(1440, title, path, await measure(region));
    }
    // The way out: a click on the village outside the panel, and Escape.
    await goInApp(page, "/pvp/league");
    await page.getByRole("dialog", { name: "League" }).waitFor();
    await page.mouse.click(200, 450);
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    check("1440 px: a click on the village closes the panel", (await page.getByRole("dialog").count()) === 0, new URL(page.url()).pathname);
    await goInApp(page, "/vault");
    await page.getByRole("dialog", { name: "Vault" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    check("1440 px: Escape closes the panel", (await page.getByRole("dialog").count()) === 0, new URL(page.url()).pathname);
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const given = arg("--url");
  // The mock, and a devnet burner so a connect needs no wallet: the mock writes to the device's ledger, never to a chain.
  process.env.VITE_DATA_SOURCE ??= "mock";
  process.env.VITE_PLAYER_ADDRESS ??= "0x0123456789abcdef";
  process.env.VITE_PLAYER_PRIVATE_KEY ??= "0x1";
  const vite = given
    ? null
    : await createVite({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
  if (vite) await vite.listen();
  const addr = vite?.httpServer?.address();
  const base = given || (addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "");
  if (!base) throw new Error("no server");
  try {
    await phone(base, arg("--shots"));
    await desktop(base);
  } finally {
    await vite?.close();
  }
  console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
  process.exitCode = failures.length ? 1 : 0;
}

await main();
