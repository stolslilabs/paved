/**
 * THEMES-RENDERS: the build-time renders of the real tile models the theme pages show, so no page opens a WebGL context per
 * tile (`TileView` is one live context each, and browsers keep about 16).
 *
 *   bun run build --filter @paved/renderer      (the page imports the renderer's dist)
 *   nice -n 10 node scripts/render-tiles.ts [--check] [--out <dir>] [--only story | story-<campaign> | battle | battle-<side>]
 *
 * Without `--check` it serves `render-tiles/page.ts` with the app's `public/` and manifest (a Vite server on a free local
 * port), opens it in one headless Chromium (playwright-core's, `bunx playwright-core install chromium-headless-shell` once),
 * and draws through the board's own `GameScene` (its look at the High tier, outlines forced on):
 *
 * - each plan in each theme the manifest lists, plus theme 0 (the base models), as a `TILE` x `TILE` WebP, the theme's first
 *   variant standing for its others: `public/renderer-assets/renders/<plan>.<theme>.<hash>.webp`;
 * - the same plans seen from straight above, north up, `TOP` x `TOP`, for the deck sheet (#606), which turns them as tile
 *   chips: `renders/<plan>-top.<theme>.<hash>.webp`;
 * - each theme's cover, a few tiles side by side for its card, `COVER_W` x `COVER_H`: `renders/cover.<theme>.<hash>.webp`;
 * - each Story campaign's background (#721), 16:10 at each of `STORY_WIDTHS`, in the campaign's theme:
 *   `renders/story-<campaign>-<width>.<theme>.<hash>.webp` (`STORY`);
 * - the battle logs' backgrounds (#857), an attack's and a defence's, made as the Story's are, 3:1 at each of `BATTLE_WIDTHS`:
 *   `renders/battle-<side>-<width>.<theme>.<hash>.webp` (`BATTLE`);
 * - `renders/sources.json`: the script's `VERSION` and, per render, the hashed model files it drew.
 *
 * Each run removes the renders of an earlier one; `--only story` draws the Story backgrounds alone and keeps the other renders
 * (and their entries in `sources.json`) as they are, and `--only story-<campaign>` one campaign's; `--only battle` (or
 * `battle-<side>`) the battle logs' backgrounds likewise. The hash is the first 10 hex digits of the file's SHA-256, as the models'
 * and tiles' (`vite/renderer-assets.ts` lists them in the manifest's `renders`). The pixels depend on the GPU and its driver,
 * so `--check` does not draw again: it fails when a render is missing or extra, a name's hash is not its file's, the
 * `VERSION` changed, or a model a render drew is no longer the manifest's (a model changed: render again). It needs no browser.
 *
 * On a machine with no GPU, Chromium draws with SwiftShader (software WebGL): the run says which, and the renders are then
 * layout-true but not the GPU's look.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
/** `--out <dir>`: another folder for the renders and their `sources.json` (the test checks a tampered copy). */
const outAt = process.argv.indexOf("--out");
const OUT = outAt > 0 ? resolve(process.argv[outAt + 1]!) : join(APP, "public/renderer-assets/renders");
const SOURCES = join(OUT, "sources.json");

/** Raise when the camera, the sizes, the cover's tiles or the look of the page change: `--check` then asks for a new run. */
const VERSION = 2;
/** A plan's render, square: three to a 375 px row at DPR 3 (about 105 CSS px a cell). */
const TILE = 320;
/** A plan's top-down render, square: the deck sheet's 40 px chip at DPR 3 (`deck-sheet.tsx`). */
const TOP = 120;
/** A theme's cover, 2:1, as its card. */
const COVER_W = 720;
const COVER_H = 360;
/** The cover's tiles: a city, roads, a wonder and a stop, side by side in two rows of four. */
const COVER = [
  { key: "cccccfrfc", dx: -2, dy: -1, orientation: 2 },
  { key: "rfrfffffr", dx: -1, dy: -1, orientation: 2 },
  { key: "wffffffff", dx: 0, dy: -1, orientation: 1 },
  { key: "rfrfrfcff", dx: 1, dy: -1, orientation: 1 },
  { key: "ccccccccc", dx: -2, dy: 0, orientation: 1 },
  { key: "sfrfrfrfr", dx: -1, dy: 0, orientation: 1 },
  { key: "rfffrfffr", dx: 0, dy: 0, orientation: 2 },
  { key: "ffcfffcff", dx: 1, dy: 0, orientation: 1 },
];
/**
 * A Story card's background widths (16:10): the phone's card at DPR 3 (343 CSS px, one a row at 375; the carousel's is
 * 86 % of that), and the tablet's and desktop's grid at DPR 2 (about 360 CSS px a card at most). The card picks by `srcset`.
 */
export const STORY_WIDTHS = [1040, 720] as const;
/**
 * The Story campaigns' backgrounds (#721), by campaign id, in its theme (`StoryCampaign.theme`: 0 Default, 1 Forest).
 * - The Tutorial: a puzzle picture, a small board with one tile lifted off its cell, offset and turned a little, its shadow
 *   on its cell's plate, as if about to drop into its slot. Outlines on, as the tile renders.
 * - Open Country and Dark Forest: a whole board (`board.ts`: every cell a fitting tile, no edge, no void; Dark Forest's leans
 *   to the plans with the most forest, the Forest set's showpiece) larger than the frame, seen low; no outlines, so
 *   neighbouring tiles meet with no dark line; the depth of field (the page's, at build only): the far and near rows out of
 *   focus, the middle ones sharp.
 */
const STORY = [
  {
    campaign: 1,
    theme: 0,
    spec: { board: { columns: 4, rows: 3, seed: 7 }, zoom: 3.5, polar: 50, azimuth: 28, lift: { cell: { dx: 1, dy: -1 }, height: 1.6, dx: -0.42, dz: 0.28, yaw: 12 } },
  },
  {
    campaign: 2,
    theme: 0,
    spec: { board: { columns: 11, rows: 17, seed: 2 }, zoom: 3.1, polar: 66, azimuth: 24, outlines: false, depthOfField: { focus: 0.56, sharp: 0.16, far: 6, near: 9 } },
  },
  {
    campaign: 3,
    theme: 1,
    spec: { board: { columns: 11, rows: 17, seed: 3, forest: 3 }, zoom: 3.1, polar: 66, azimuth: 24, outlines: false, depthOfField: { focus: 0.56, sharp: 0.16, far: 6, near: 9 } },
  },
] as const;
const storyName = (campaign: number, width: number) => `story-${campaign}-${width}`;
/**
 * A battle log card's background widths (3:1, #857): the phone's card at DPR 3 (343 CSS px at 375, 288 at 320), and the
 * League page's full width at 1440 (992 CSS px, `max-w-5xl`) at DPR 1 and 2. The card picks by `srcset`, `object-cover`
 * keeping the middle band on a wide screen (the sharp rows).
 */
export const BATTLE_WIDTHS = [720, 1040, 2000] as const;
/**
 * The battle logs' backgrounds (#857), made as the Story's campaigns' (Open Country's framing: a whole board seen low, no
 * outlines, the depth of field, a little wider), both in the Default theme (the owner's answer on #857, open point 2): the
 * two read apart by what they draw, how they are framed and their held light (the day and night cycle's, `dayNight`):
 * - an attack: an open village of the base deck, seen low and wide, under an autumn noon (warm);
 * - a defence: a walled town, its board leaning hard to the cities (`city`), seen from the other side, higher and closer,
 *   under a winter noon (cool).
 */
const BATTLE = [
  {
    side: "attack",
    theme: 0,
    spec: { board: { columns: 11, rows: 13, seed: 4 }, zoom: 2.6, polar: 66, azimuth: 24, outlines: false, dayNight: 1.3125, depthOfField: { focus: 0.5, sharp: 0.3, far: 4, near: 6 } },
  },
  {
    side: "defence",
    theme: 0,
    spec: { board: { columns: 11, rows: 13, seed: 5, city: 3 }, zoom: 3.2, polar: 54, azimuth: 204, outlines: false, dayNight: 2.3125, depthOfField: { focus: 0.5, sharp: 0.3, far: 4, near: 6 } },
  },
] as const;
const battleName = (side: string, width: number) => `battle-${side}-${width}`;
/** `--only story` (or `story-<campaign>`, `battle`, `battle-<side>`): those backgrounds alone, the other renders kept. */
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]! : null;
if (ONLY && !/^(story(-\d+)?|battle(-(attack|defence))?)$/.test(ONLY)) throw new Error(`render-tiles: --only takes story, story-<campaign>, battle or battle-<side>, not ${ONLY}`);
const PARTIAL = ONLY != null;

/** The zooms that frame one tile and the cover at the page's fixed distance. */
const TILE_ZOOM = 7.8;
const COVER_ZOOM = 3.6;
/** The zoom that fills the top-down square with the tile, its edge just inside. */
const TOP_ZOOM = 12;

/** A render's name: a plan key (`-top` for the top-down one), `cover`, a Story or a battle background, the theme id, then the hash. */
export const RENDER = /^([a-z]{9}(?:-top)?|cover|story-\d+-\d+|battle-(?:attack|defence)-\d+)\.(\d+)\.([0-9a-f]{10})\.webp$/;

interface Sources {
  version: number;
  /** Per render (`renders/<name>`), the model files it drew, as the manifest names them. */
  files: Record<string, string[]>;
}

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

/** The base models and theme variants the manifest lists now (the render's inputs). */
async function currentModels(): Promise<{ models: Record<string, string>; themes: Record<string, Record<string, string[]>> }> {
  const { rendererManifest } = await import("../vite/renderer-assets.ts");
  return rendererManifest();
}

/**
 * The renders a run writes: theme 0 and each theme of the manifest, each with its 19 plans, their top-down renders and its
 * cover; then each Story campaign's background at each width, and each battle background at each of its own.
 */
function expected(models: Record<string, string>, themes: Record<string, Record<string, string[]>>): Array<{ theme: number; name: string }> {
  const ids = [0, ...Object.keys(themes).map(Number)].sort((a, b) => a - b);
  const keys = Object.keys(models).sort();
  const tiles = ids.flatMap((theme) => [...keys, ...keys.map((key) => `${key}-top`), "cover"].map((name) => ({ theme, name })));
  return [
    ...tiles,
    ...STORY.flatMap(({ campaign, theme }) => STORY_WIDTHS.map((width) => ({ theme, name: storyName(campaign, width) }))),
    ...BATTLE.flatMap(({ side, theme }) => BATTLE_WIDTHS.map((width) => ({ theme, name: battleName(side, width) }))),
  ];
}

async function check(): Promise<void> {
  const { models, themes } = await currentModels();
  const problems: string[] = [];
  const sources: Sources | null = existsSync(SOURCES) ? (JSON.parse(readFileSync(SOURCES, "utf8")) as Sources) : null;
  if (!sources) problems.push("renders/sources.json is missing");
  else if (sources.version !== VERSION) problems.push(`renders/sources.json is version ${sources.version}, the script ${VERSION}`);
  const files = existsSync(OUT) ? readdirSync(OUT).filter((n) => n !== "sources.json") : [];
  const listed = new Set<string>();
  for (const { theme, name } of expected(models, themes)) {
    const found = files.filter((f) => f.startsWith(`${name}.${theme}.`));
    const file = found.length === 1 && RENDER.test(found[0]!) ? found[0]! : null;
    if (!file) {
      problems.push(`${name}.${theme}: ${found.length === 0 ? "missing" : `${found.length} files`}`);
      continue;
    }
    listed.add(file);
    if (hashOf(readFileSync(join(OUT, file))) !== RENDER.exec(file)![3]) problems.push(`${file}: its hash is not its name's`);
    const drew = sources?.files[`renders/${file}`];
    const variants = new Set(Object.values(themes).flatMap((plans) => Object.values(plans).flat()));
    const known = new Set([...Object.values(models), ...variants]);
    if (!drew || drew.length === 0) problems.push(`${file}: not in sources.json`);
    else for (const model of drew) if (!known.has(model)) problems.push(`${file}: drew ${model}, no longer a model of the manifest`);
  }
  for (const f of files) if (!listed.has(f)) problems.push(`${f}: not a render of this script`);
  console.log(`${listed.size} renders: ${problems.length === 0 ? "current" : `${problems.length} problems`}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    console.error("public/renderer-assets/renders is not what this script writes: run node scripts/render-tiles.ts");
    process.exit(1);
  }
}

async function run(): Promise<void> {
  const started = performance.now();
  const { models, themes } = await currentModels();
  const { createServer } = await import("vite");
  const { rendererAssets } = await import("../vite/renderer-assets.ts");
  const { chromium } = await import("playwright-core");
  const server = await createServer({
    configFile: false,
    root: join(HERE, "render-tiles"),
    publicDir: join(APP, "public"),
    plugins: [rendererAssets()],
    // No reload while it draws: an edit of the page mid-run would navigate away from a render.
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null },
    logLevel: "warn",
  });
  await server.listen();
  const address = server.resolvedUrls?.local[0];
  if (!address) throw new Error("render-tiles: the server has no local address");
  // A GPU when the machine gives headless Chromium one (ANGLE on Metal on macOS); SwiftShader otherwise.
  const browser = await chromium.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-gpu", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] });
  const kept: Sources | null = PARTIAL && existsSync(SOURCES) ? (JSON.parse(readFileSync(SOURCES, "utf8")) as Sources) : null;
  if (PARTIAL && kept?.version !== VERSION) throw new Error(`render-tiles: --only ${ONLY} keeps renders of another version: run the whole script`);
  /** A render `--only` draws again: `story-1` names `story-1-720`, `battle` every `battle-<side>-<width>`. */
  const redrawn = (name: string) => name.startsWith(`${ONLY}-`);
  const written: Sources = { version: VERSION, files: kept ? Object.fromEntries(Object.entries(kept.files).filter(([file]) => !redrawn(file.slice("renders/".length)))) : {} };
  let bytes = 0;
  try {
    const page = await browser.newPage({ viewport: { width: COVER_W * 2, height: COVER_W * 2 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error(`page: ${e.message}`));
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.error(`page ${m.type()}: ${m.text()}`));
    await page.goto(address);
    await page.waitForFunction(() => "paved" in window);
    const gl = await page.evaluate(() => (window as unknown as { paved: { setup(): Promise<{ renderer: string | null; software: boolean }> } }).paved.setup());
    console.log(`WebGL: ${gl.software ? "software (SwiftShader)" : "GPU"}`);
    mkdirSync(OUT, { recursive: true });
    for (const name of readdirSync(OUT)) if (!PARTIAL || redrawn(name)) unlinkSync(join(OUT, name));
    for (const { theme, name } of expected(models, themes)) {
      if (PARTIAL && !redrawn(name)) continue;
      const top = name.endsWith("-top");
      const [, campaign, width] = (/^story-(\d+)-(\d+)$/.exec(name) ?? []).map(Number);
      const [, side, battleWidth] = /^battle-(attack|defence)-(\d+)$/.exec(name) ?? [];
      const spec = campaign
        ? { theme, tiles: [], width, height: (width! * 10) / 16, ...STORY.find((s) => s.campaign === campaign)!.spec }
        : side
          ? { theme, tiles: [], width: Number(battleWidth), height: Math.round(Number(battleWidth) / 3), ...BATTLE.find((s) => s.side === side)!.spec }
          : name === "cover"
            ? { theme, tiles: COVER, width: COVER_W, height: COVER_H, zoom: COVER_ZOOM }
            : top
              ? { theme, tiles: [{ key: name.slice(0, -"-top".length), dx: 0, dy: 0, orientation: 1 }], width: TOP, height: TOP, zoom: TOP_ZOOM, top: true }
              : { theme, tiles: [{ key: name, dx: 0, dy: 0, orientation: 1 }], width: TILE, height: TILE, zoom: TILE_ZOOM };
      const out = await page.evaluate(
        (s) => (window as unknown as { paved: { render(s: unknown): Promise<{ webp: string; models: string[] }> } }).paved.render(s),
        spec,
      );
      const body = Buffer.from(out.webp.slice(out.webp.indexOf(",") + 1), "base64");
      if (body.subarray(8, 12).toString("latin1") !== "WEBP") throw new Error(`render-tiles: ${name}.${theme} is not a WebP`);
      const file = `${name}.${theme}.${hashOf(body)}.webp`;
      writeFileSync(join(OUT, file), body);
      written.files[`renders/${file}`] = [...new Set(out.models)].sort();
      bytes += body.length;
      console.log(`${file}: ${body.length} B`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(SOURCES, `${JSON.stringify(written, null, 2)}\n`);
  const count = Object.keys(written.files).length;
  console.log(`${count} renders, ${bytes} B in all, ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

if (process.argv.includes("--check")) await check();
else await run();
