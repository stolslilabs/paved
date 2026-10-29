/**
 * NUM-LOCALE (P-66): the built Storybook in a browser whose locale is `de-DE` (and whose time zone is Berlin), over
 * the stories that show amounts, scores, counts, percentages and dates. Every figure must read en-US ("12,345.67",
 * "Thu, Oct 15"), never the German "12.345,67" or "15. Okt.". Headless Chromium only (Playwright's headless shell),
 * against `storybook-static` served on the loopback.
 *
 *   bun run --filter @paved/app build-storybook
 *   node scripts/locale-check.ts [--dir storybook-static]
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. The browser is the one `playwright-core` names:
 * `bunx playwright-core install chromium-headless-shell` once. Exit code 1 when a story does not read en-US.
 */
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/** What each story must show: a text (substring of the story's text) or a pattern. */
const EXPECTED: { story: string; shows: (string | RegExp)[] }[] = [
  { story: "elements-amount--large", shows: ["12,345.67"] },
  { story: "elements-amount--tile", shows: ["8.42"] },
  { story: "elements-score--final", shows: ["4,820"] },
  { story: "elements-cobbles--large", shows: ["1,000"] },
  { story: "elements-deadline--hours-left", shows: [/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{2}:\d{2}/] },
];

/** German forms an en-US page never shows: a point between thousands, a comma before decimals, a day with a point, a German month. */
const GERMAN = /\d\.\d{3}\b|\d,\d{1,2}\s*(?:USDC|PAVED)|\b\d{1,2}\.\s?(?:Okt|Mär|Dez)|\b(?:Okt|Mär|Dez|Mai)\.?\b|\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\.,/;

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

/** The static site, on the loopback, on a free port. */
async function serve(dir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(dir, path);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

const argDir = process.argv.indexOf("--dir");
const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..", argDir > 0 ? process.argv[argDir + 1] : "storybook-static");

const { server, origin } = await serve(dir);
const browser = await chromium.launch({ headless: true });
const failures: string[] = [];
try {
  const context = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin", reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const { story, shows } of EXPECTED) {
    await page.goto(`${origin}/iframe.html?viewMode=story&id=${story}`);
    // The story's render, play function included, has ended (wrap-sweep's test).
    await page.waitForFunction(
      () => {
        const render = (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender;
        return document.body.classList.contains("sb-show-errordisplay") || ["finished", "completed", "errored", "aborted"].includes(render?.phase ?? "");
      },
      undefined,
      { timeout: 60_000 },
    );
    // The browser really is German: its own formatting differs, so a pass is not an en-US browser's.
    const own = await page.evaluate(() => ({ language: navigator.language, sample: (1234.5).toLocaleString() }));
    if (!own.language.startsWith("de") || own.sample !== "1.234,5") failures.push(`${story}: the browser is not de-DE (${own.language}, ${own.sample})`);
    const text = await page.evaluate(() => document.querySelector("#storybook-root")?.textContent ?? "");
    for (const want of shows) {
      if (typeof want === "string" ? !text.includes(want) : !want.test(text)) failures.push(`${story}: expected ${String(want)} in "${text}"`);
    }
    const german = GERMAN.exec(text);
    if (german) failures.push(`${story}: German form "${german[0]}" in "${text}"`);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`locale-check: ${failures.length} failure(s)\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`locale-check: ${EXPECTED.length} stories read en-US in a de-DE browser.`);
