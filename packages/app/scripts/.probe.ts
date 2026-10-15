import { chromium } from "playwright-core";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 320, height: 740 } });
for (const id of process.argv.slice(3)) {
  await p.goto(`${process.argv[2]}/iframe.html?viewMode=story&id=${id}`);
  await p.waitForFunction(() => (window as any).__STORYBOOK_PREVIEW__?.currentRender?.phase === "finished", undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
  console.log(id, await p.evaluate(() => { const h = document.querySelector("header"); if (!h) return "no header"; const r = h.getBoundingClientRect(); return JSON.stringify({ header: [r.left, r.width, getComputedStyle(h).paddingLeft], kids: [...h.children].map((c) => { const q = c.getBoundingClientRect(); return [c.tagName, Math.round(q.width), (c as HTMLElement).scrollWidth, c.textContent?.slice(0, 20)]; }) }); }));
}
await b.close();
