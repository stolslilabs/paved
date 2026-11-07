/**
 * APP-FEEL (P-69): the app does not behave like a web page on a phone. A mobile device context (Playwright's Pixel 7:
 * touch, mobile viewport) against the Vite dev server of this package, headless Chromium only:
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   node scripts/mobile-feel.ts [--url <server already up>]
 *
 * Checks:
 * - the chrome (a page of text): the viewport meta, `select-none` and `touch-action: manipulation`; a double tap and a
 *   pinch leave the page at scale 1; the iOS pinch events are cancelled; a double click selects no text;
 * - the board (Training): the canvas has `touch-action: none`, the page stays at scale 1 under a pinch on it, and the
 *   pinch reaches the renderer: the drawn board changes (the board is still without a gesture: the control).
 *
 * Chromium's touch emulation does not pinch-zoom a page even when its meta allows it (measured: scale 1 under a
 * pinch with `width=device-width, initial-scale=1`, headless shell and new headless), so the page-level scale checks
 * cannot fail here: the meta, the styles and the cancelled gesture events carry the guarantee, and iOS Safari is a
 * manual check (a real device or the Mac's iOS simulator).
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. Exit code 1 on a failed check.
 */
import { fileURLToPath } from "node:url";
import { chromium, devices, type CDPSession, type Page } from "playwright-core";
import { createServer as createVite } from "vite";

const ARGS = ["--enable-pinch", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const scale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1);

async function doubleTap(cdp: CDPSession, x: number, y: number): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await new Promise((r) => setTimeout(r, 80));
  }
  await new Promise((r) => setTimeout(r, 400));
}

async function pinch(cdp: CDPSession, x: number, y: number, scaleFactor: number): Promise<void> {
  await cdp.send("Input.synthesizePinchGesture", { x, y, scaleFactor, relativeSpeed: 400, gestureSourceType: "touch" });
  await new Promise((r) => setTimeout(r, 400));
}

async function main(): Promise<void> {
  const given = process.argv.indexOf("--url") >= 0 ? process.argv[process.argv.indexOf("--url") + 1] : "";
  // The mock, as the PAGES-SCROLL pass: the connected Referral below reads no chain, nothing is sent.
  if (!given) process.env.VITE_DATA_SOURCE ??= "mock";
  // The scan from the app's page only, as the Training e2e's: crawling `scripts/` fails on a render page's bare `three`, Vite
  // then skips the pre-bundling and reloads the page each time it finds a dependency at run time, which on a cold cache (CI)
  // lands in the middle of the tab page's checks (a connected page's `zustand`: its scroll offset lost to the reload).
  const vite = given
    ? null
    : await createVite({
        root: fileURLToPath(new URL("..", import.meta.url)),
        logLevel: "error",
        server: { port: 0, host: "127.0.0.1" },
        optimizeDeps: { entries: ["index.html"] },
      });
  if (vite) await vite.listen();
  const addr = vite?.httpServer?.address();
  const base = given || (addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "");
  if (!base) throw new Error("no server");

  const browser = await chromium.launch({ headless: true, args: ARGS });
  try {
    const context = await browser.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" });
    // The welcome seen: the village (`/`) opens, not the welcome.
    await context.addInitScript(() => localStorage.setItem("welcomed", "1"));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    // The chrome: the Referral is text and rows, no board (the Vault and Settings, the HUD's drawers since VAULT-PAGE and SETTINGS-PAGE,
    // draw the village under them).
    await page.goto(`${base}/referral`, { waitUntil: "networkidle" });
    await page.getByRole("heading").first().waitFor();
    const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "");
    check("viewport meta forbids zoom", /maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta) && /viewport-fit=cover/.test(meta), meta);
    const styles = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { select: s.userSelect, touch: s.touchAction };
    });
    check("body is select-none and touch-action manipulation", styles.select === "none" && styles.touch === "manipulation", JSON.stringify(styles));

    const box = (await page.getByRole("heading").first().boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await doubleTap(cdp, cx, cy);
    check("chrome: a double tap does not zoom", (await scale(page)) === 1, `scale ${await scale(page)}`);
    await page.mouse.dblclick(cx, cy);
    check("chrome: a double click selects no text", (await page.evaluate(() => getSelection()?.toString() ?? "")) === "");
    await pinch(cdp, cx, cy, 2.5);
    check("chrome: a pinch does not zoom", (await scale(page)) === 1, `scale ${await scale(page)}`);

    // FOOTER-FIXED (#611): the document never scrolls or bounces; the page scrolls in its own region, its header sticking to
    // the viewport's top through a scroll. DOCK-UNDER-PAGES (2026-11-04): a page carries no dock, its way out is its Back.
    // The tab page is the Referral, connected (the mock's device key, nothing sent): its link, its share and its earnings, taller
    // than its region on an iPhone SE's view under Safari's bars (548 px, the PAGES-SCROLL pass's short screen) at the Pixel 7's
    // width. It is the last page of its own: the Vault (VAULT-PAGE), Settings (SETTINGS-PAGE) and the others are the HUD's drawers.
    // It is reached from the profile's Invite (a push over the village): its Back goes back to the village, Forward to it again.
    // A guest's Connect while the app still has one; none once every player has an account (the owner's ruling of 2026-11-07).
    const connect = page.getByRole("button", { name: "Connect" });
    if (await connect.count()) await connect.first().click();
    const link = page.getByLabel("Your referral link");
    await link.waitFor();
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Profile: / }).click();
    await page.getByRole("dialog", { name: "Profile" }).getByRole("button", { name: "Invite" }).click();
    await page.waitForURL(/\/referral$/);
    const phone = page.viewportSize()!;
    await page.setViewportSize({ width: phone.width, height: 548 });
    // The session's change draws the page again: its region is waited for, not assumed.
    await page.waitForLoadState("networkidle");
    await page.locator("[data-slot=page-scroll]").first().waitFor();
    await link.waitFor();
    await page.waitForTimeout(500);
    const header = page.locator("[data-slot=page-header]").first();
    const headerTop = async () => (await header.boundingBox())!.y;
    const docStyles = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overscrollBehaviorY,
      body: getComputedStyle(document.body).overscrollBehaviorY,
      region: getComputedStyle(document.querySelector("[data-slot=page-scroll]")!).overscrollBehaviorY,
    }));
    check("tab page: html and body take no overscroll, the region contains its own", docStyles.html === "none" && docStyles.body === "none" && docStyles.region === "contain", JSON.stringify(docStyles));
    const docks = await page.getByRole("navigation", { name: "Main" }).count();
    const backs = header.getByRole("button", { name: "Back" });
    check("tab page: no dock on a page, Back at its top left", docks === 0 && (await backs.count()) === 1, `${docks} dock(s)`);
    const headerBefore = await headerTop();
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const docScroll = await page.evaluate(() => document.scrollingElement!.scrollTop);
    check("tab page: the document does not scroll", docScroll === 0, `scrollTop ${docScroll}`);
    check("tab page: the header does not move on a scroll", (await headerTop()) === headerBefore, `${await headerTop()} vs ${headerBefore}`);
    // A step back and forward brings the page back where it was left (the region keeps its offset per history entry).
    const region = page.locator("[data-slot=page-scroll]").first();
    const left = await region.evaluate((el) => (el.scrollTop = el.scrollHeight, el.scrollTop));
    await page.waitForTimeout(300);
    await backs.click();
    await page.waitForURL(/\/$/);
    await page.goForward();
    await link.waitFor();
    await page.waitForTimeout(500);
    const back = await region.evaluate((el) => el.scrollTop);
    check("tab page: Forward to the page restores its scroll offset", left > 0 && Math.abs(back - left) < 2, `left at ${left}, back at ${back}`);
    await region.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(300);
    // To an entry left at the top returns to the top: the Referral left at 0, the village, then Forward. A dispatched click: a
    // pointer's would first scroll the region to the header's Back.
    await backs.dispatchEvent("click");
    await page.waitForURL(/\/$/);
    await page.waitForTimeout(500);
    await page.goForward();
    await link.waitFor();
    await page.waitForTimeout(500);
    const backToTop = await region.evaluate((el) => el.scrollTop);
    check("tab page: to an entry left at the top returns to the top", backToTop === 0, `scrollTop ${backToTop}`);
    // A fresh document (a typed URL) opens at the top: its first entry never takes another page's offset.
    await region.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    // Another document first (the village): a typed URL that is the current one is a reload, which keeps its entry.
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.goto(`${base}/referral`, { waitUntil: "networkidle" });
    await region.waitFor();
    await link.waitFor();
    await page.waitForTimeout(500);
    const fresh = await region.evaluate((el) => el.scrollTop);
    check("tab page: a fresh load of /referral opens at the top", fresh === 0, `scrollTop ${fresh}`);
    // The first entry of that fresh document keeps its offset across a reload of a later entry (the village, typed).
    const kept = await region.evaluate((el) => (el.scrollTop = el.scrollHeight, el.scrollTop));
    await page.waitForTimeout(300);
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.goBack();
    await link.waitFor();
    await page.waitForTimeout(500);
    const afterReload = await region.evaluate((el) => el.scrollTop);
    check("tab page: Back after a reload of the next page restores the first entry's offset", kept > 0 && Math.abs(afterReload - kept) < 2, `left at ${kept}, back at ${afterReload}`);
    await page.setViewportSize(phone);

    // iOS Safari ignores the meta: its pinch is the page's `gesturestart` and `gesturechange`, which must be cancelled.
    const cancelled = await page.evaluate(() =>
      ["gesturestart", "gesturechange"].map((type) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
        return e.defaultPrevented;
      }),
    );
    check("chrome: the iOS pinch events (gesturestart, gesturechange) are cancelled", cancelled.every(Boolean), cancelled.join());

    // The board: Training draws the real renderer (software WebGL).
    await page.goto(`${base}/training`, { waitUntil: "load" });
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    check("board: the canvas is touch-action none", (await canvas.evaluate((el) => getComputedStyle(el).touchAction)) === "none");
    check("board: the page does not scroll or bounce (overscroll-behavior none)", await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === "none"));
    const cb = (await canvas.boundingBox())!;
    const bx = cb.x + cb.width / 2;
    const by = cb.y + cb.height / 2;
    const clip = { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
    // The control: the board is still when nobody touches it, so a change after the pinch is the pinch's. It settles first: its
    // last frames come as its models and its passes are ready, seconds later on a slow machine (CI's software WebGL), so it is
    // looked at every 1.5 s until two looks match, ten at most; a board that keeps moving never matches.
    let before = await page.screenshot({ clip, animations: "allow" });
    let looks = 1;
    let still = false;
    while (!still && looks < 10) {
      await page.waitForTimeout(1500);
      const again = await page.screenshot({ clip, animations: "allow" });
      looks++;
      still = before.equals(again);
      before = again;
    }
    check("control: the board is still without a gesture", still, `${looks} looks 1.5 s apart`);
    await pinch(cdp, bx, by, 2);
    await page.waitForTimeout(1500);
    const after = await page.screenshot({ clip, animations: "allow" });
    check("board: a pinch leaves the page at scale 1", (await scale(page)) === 1, `scale ${await scale(page)}`);
    check("board: a pinch zooms the board", !before.equals(after));
    const prevented = await page.evaluate(() => {
      let contextMenu = false;
      // A bubble listener on the document runs after React's root handler (the PR's `onContextMenu`): it sees what the
      // app left of the event, not what three's OrbitControls did at the canvas.
      document.addEventListener("contextmenu", (e) => (contextMenu = e.defaultPrevented), { once: true });
      document.querySelector("canvas")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      return contextMenu;
    });
    check("board: the context menu is off", prevented);
  } finally {
    await browser.close();
    await vite?.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
}

await main();
