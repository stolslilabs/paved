import { chromium } from "playwright-core";
const shots = `${process.env.TMPDIR}/shots`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
import { writeFileSync } from "node:fs";
const snap = async (page, path) => { const c = await page.context().newCDPSession(page); const { data } = await c.send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(data, "base64")); await c.detach(); };
const check = (page) => page.evaluate(() => {
  const box = document.querySelector("[data-slot=home-overlays]");
  if (!box) return "no overlays";
  const [p, b] = [...box.querySelectorAll("[data-out=u2]")].map((e) => e.getBoundingClientRect());
  const l = box.querySelector("[data-slot=scroll-region]").getBoundingClientRect();
  const r = box.querySelector("[data-out=r0]").getBoundingClientRect();
  const wheel = !!box.querySelector("[data-testid=season-wheel]");
  const turning = box.getAnimations({ subtree: true }).filter((a) => a instanceof CSSTransition).length;
  return { ok: l.top >= p.bottom && r.top >= b.bottom, leftTop: Math.round(l.top), profileBottom: Math.round(p.bottom), rightTop: Math.round(r.top), balancesBottom: Math.round(b.bottom), wheel, turning, leftVar: box.style.getPropertyValue("--left-top") };
});
for (const w of process.argv.slice(2).map(Number)) {
  const page = await browser.newPage({ viewport: { width: w, height: w > 1000 ? 900 : 700 } });
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http") && u.hostname !== "localhost") console.log("EXTERNAL", r.url()); });
  await page.goto("http://localhost:6325/");
  await page.getByRole("button", { name: /^Edit village, score/ }).waitFor({ timeout: 60000 });
  await page.getByTestId("season-wheel").waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log(w, "load", JSON.stringify(await check(page)));
  await snap(page, `${shots}/app-${w}-load.png`);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: /^Edit village, score/ }).click();
    await page.getByRole("button", { name: "Leave edit mode" }).click({ timeout: 120000 });
    await page.getByRole("button", { name: /^Edit village, score/ }).waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    console.log(w, "edit", i, JSON.stringify(await check(page)));
  }
  await snap(page, `${shots}/app-${w}-after-edit.png`);
  const explore = page.getByRole("button", { name: "Explore" });
  if (await explore.count()) {
    await explore.click();
    await page.getByRole("button", { name: "Exit camera" }).click({ timeout: 120000 });
    await page.waitForTimeout(1500);
    console.log(w, "camera", JSON.stringify(await check(page)));
    await snap(page, `${shots}/app-${w}-after-camera.png`);
  } else console.log(w, "no Explore button (plan view)");
  await page.close();
}
await browser.close();
