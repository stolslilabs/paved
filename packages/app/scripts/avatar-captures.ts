/**
 * AVATAR-CREATOR (#626 PR 2): the creator page's captures at 375 x 812 and 1440 x 900 (DPR 2), from the stories
 * `Scenes/AvatarCreator` (two tabs, a priced variant) and `Containers/ProfileSlot` (the saved avatar at the top left of a menu
 * page), for the pull request.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/avatar-captures.ts --out <folder> [--url http://localhost:6006] [--gpu]
 *
 * Without `--gpu` it runs headless on SwiftShader (software WebGL). Node 24 runs it as is (type stripping).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const URL_BASE = arg("url", "http://localhost:6006");
const OUT = arg("out", "");
const GPU = process.argv.includes("--gpu");
const ONLY = arg("only", "");
if (!OUT) throw new Error("--out <folder> is required");

const SIZES = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const CAPTURES = [
  { name: "creator-skin", story: "scenes-avatarcreator--saved" },
  { name: "creator-headwear", story: "scenes-avatarcreator--headwear" },
  { name: "creator-priced", story: "scenes-avatarcreator--priced" },
  { name: "creator-background", story: "scenes-avatarcreator--background" },
  { name: "menu-saved-avatar", story: "containers-profileslot--saved-avatar" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: GPU ? ["--enable-gpu", "--use-angle=default", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const capture of CAPTURES.filter((c) => !ONLY || c.name.includes(ONLY))) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
      await page.goto(`${URL_BASE}/iframe.html?id=${capture.story}&viewMode=story`, { waitUntil: "networkidle" });
      // The story mounted (the first visit waits for Storybook's compile), then its stills.
      await page.waitForSelector("#storybook-root [data-slot=avatar-still], #storybook-root [data-slot=profile-avatar]", { state: "attached", timeout: 60_000 });
      // The stills render in a queue after the render chunk loads: wait until every still has its image.
      await page.waitForFunction(() => [...document.querySelectorAll("[data-slot=avatar-still]")].every((el) => el.tagName === "IMG" || el.querySelector("img")), null, { timeout: 30_000 });
      await page.waitForTimeout(800);
      const file = join(OUT, `${capture.name}-${size.width}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(file);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
