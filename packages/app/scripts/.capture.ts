// scratch: node scripts/.capture.ts <origin> <outdir> <suffix> id[:selector] ...
import { chromium } from "playwright-core";
const [origin, out, suffix, ...shots] = process.argv.slice(2);
const b = await chromium.launch({ headless: true });
for (const width of [360, 320]) {
  const p = await b.newPage({ viewport: { width, height: 740 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  for (const s of shots) {
    const [id, sel] = s.split("|");
    await p.goto(`${origin}/iframe.html?viewMode=story&id=${id}`);
    await p.waitForFunction(() => (window as any).__STORYBOOK_PREVIEW__?.currentRender?.phase === "finished");
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const file = `${out}/${id}${sel ? "-part" : ""}-${width}-${suffix}.png`;
    if (sel) await p.locator(sel).first().screenshot({ path: file });
    else await p.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await p.close();
}
await b.close();
