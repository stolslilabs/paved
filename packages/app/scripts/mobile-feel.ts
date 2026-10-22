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
  const vite = given
    ? null
    : await createVite({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
  if (vite) await vite.listen();
  const addr = vite?.httpServer?.address();
  const base = given || (addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "");
  if (!base) throw new Error("no server");

  const browser = await chromium.launch({ headless: true, args: ARGS });
  try {
    const context = await browser.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    // The chrome: Settings is text and rows, no board.
    await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
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

    // FOOTER-FIXED (#611): the document never scrolls or bounces; the page scrolls in its own region and the navigation
    // stays at the viewport's bottom through a scroll.
    const nav = page.getByRole("navigation", { name: "Main" });
    const navTop = async () => (await nav.boundingBox())!.y;
    const docStyles = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overscrollBehaviorY,
      body: getComputedStyle(document.body).overscrollBehaviorY,
      region: getComputedStyle(document.querySelector("[data-slot=page-scroll]")!).overscrollBehaviorY,
    }));
    check("tab page: html and body take no overscroll, the region contains its own", docStyles.html === "none" && docStyles.body === "none" && docStyles.region === "contain", JSON.stringify(docStyles));
    const viewportHeight = page.viewportSize()!.height;
    const navBox = (await nav.boundingBox())!;
    check("tab page: the navigation sits at the viewport's bottom", Math.abs(navBox.y + navBox.height - viewportHeight) < 1, `${navBox.y + navBox.height} vs ${viewportHeight}`);
    const navBefore = await navTop();
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const docScroll = await page.evaluate(() => document.scrollingElement!.scrollTop);
    check("tab page: the document does not scroll", docScroll === 0, `scrollTop ${docScroll}`);
    check("tab page: the navigation does not move on a scroll", (await navTop()) === navBefore, `${await navTop()} vs ${navBefore}`);
    const navPosition = await nav.evaluate((el) => getComputedStyle(el).position);
    check("tab page: the navigation is position fixed", navPosition === "fixed", navPosition);
    // Back brings the page back where it was left (the region keeps its offset per history entry).
    const region = page.locator("[data-slot=page-scroll]");
    const left = await region.evaluate((el) => (el.scrollTop = el.scrollHeight, el.scrollTop));
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Credits/ }).click();
    await page.waitForURL(/credits/);
    await page.goBack();
    await page.getByRole("button", { name: /Credits/ }).waitFor();
    await page.waitForTimeout(500);
    const back = await region.evaluate((el) => el.scrollTop);
    check("tab page: Back restores the page's scroll offset", left > 0 && Math.abs(back - left) < 2, `left at ${left}, back at ${back}`);
    await region.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(300);
    // The same page kept mounted across entries: Settings picked again opens a new entry at the top, and Back returns to the
    // first entry's offset, the top included.
    const settingsTab = nav.getByRole("button", { name: "Settings" });
    await settingsTab.click();
    await page.waitForTimeout(300);
    await region.evaluate((el) => (el.scrollTop = 500));
    await page.waitForTimeout(300);
    await page.goBack();
    await page.waitForTimeout(500);
    const backToTop = await region.evaluate((el) => el.scrollTop);
    check("tab page: Back to an entry left at the top returns to the top", backToTop === 0, `scrollTop ${backToTop}`);
    await region.evaluate((el) => (el.scrollTop = 500));
    await page.waitForTimeout(300);
    await settingsTab.click();
    await page.waitForTimeout(500);
    const newEntry = await region.evaluate((el) => el.scrollTop);
    check("tab page: the current tab picked again opens a new entry at the top", newEntry === 0, `scrollTop ${newEntry}`);
    // A fresh document (a typed URL) opens at the top: its first entry never takes another page's offset.
    await region.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    for (const path of ["/vault", "/settings"]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await region.waitFor();
      await page.waitForTimeout(500);
      const fresh = await region.evaluate((el) => el.scrollTop);
      check(`tab page: a fresh load of ${path} opens at the top`, fresh === 0, `scrollTop ${fresh}`);
    }
    // The first entry of that fresh document keeps its offset across a reload of a later entry.
    const kept = await region.evaluate((el) => (el.scrollTop = el.scrollHeight, el.scrollTop));
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Credits/ }).click();
    await page.waitForURL(/credits/);
    await page.reload({ waitUntil: "networkidle" });
    await page.goBack();
    await page.getByRole("button", { name: /Credits/ }).waitFor();
    await page.waitForTimeout(500);
    const afterReload = await region.evaluate((el) => el.scrollTop);
    check("tab page: Back after a reload of the next page restores the first entry's offset", kept > 0 && Math.abs(afterReload - kept) < 2, `left at ${kept}, back at ${afterReload}`);

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
