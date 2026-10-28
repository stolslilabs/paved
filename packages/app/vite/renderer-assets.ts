import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

/**
 * `asset-sources/`: the original models, the 1680 px tile images and the Draco decoder, the inputs of the compress scripts.
 * Not in `public/`, so the build never copies them; Storybook maps the folder to `/asset-sources`.
 */
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../asset-sources");
/**
 * The app's own copy of the models, compressed and content-hashed (`scripts/compress-models.ts`): in `public/`, so Vite
 * serves it in dev and copies it into `dist/` at build, at `<base>renderer-assets/models/<plan>.<hash>.glb`.
 */
const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), "../public/renderer-assets/models");
/**
 * The app's resized tile images (`scripts/compress-tiles.ts`), served like the models, at
 * `<base>renderer-assets/tiles/<plan>.<size>.<hash>.png`.
 */
const TILES = resolve(dirname(fileURLToPath(import.meta.url)), "../public/renderer-assets/tiles");
/** A resized tile image's name: its plan key, its size in pixels, then the first 10 hex digits of the file's SHA-256. */
const TILE = /^([a-z]{9})\.(\d+)\.([0-9a-f]{10})\.png$/;
/**
 * The build-time renders of the tiles (`scripts/render-tiles.ts`), at `<base>renderer-assets/renders/<plan>.<theme>.<hash>.webp`,
 * `renders/<plan>-top.<theme>.<hash>.webp` (seen from above), `renders/cover.<theme>.<hash>.webp` and the Story campaigns'
 * backgrounds, `renders/story-<campaign>-<width>.<theme>.<hash>.webp` (#721), and the battle logs' backgrounds,
 * `renders/battle-<side>-<width>.<theme>.<hash>.webp` (#857).
 */
const RENDERS = resolve(dirname(fileURLToPath(import.meta.url)), "../public/renderer-assets/renders");
/**
 * A render's name: a plan key (`<plan>-top` for its top-down render, #606), `cover`, a Story background (`story-<campaign>-<width>`)
 * or a battle log's (`battle-<side>-<width>`),
 * the theme id on chain (0 the base models), then the hash.
 */
const RENDER = /^([a-z]{9}(?:-top)?|cover|story-\d+-\d+|battle-(?:attack|defence)-\d+)\.(\d+)\.([0-9a-f]{10})\.webp$/;
/** A compressed model's name: its plan key, then the first 10 hex digits of the file's SHA-256. */
const HASHED = /^([a-z]{9})\.([0-9a-f]{10})\.glb$/;
/** A theme's compressed variant: the plan key, the set and the variant number, then the hash (`forest/rfrfffffr_HF_3.<hash>.glb`). */
const VARIANT = /^([a-z]{9})_[A-Z]{2}_(\d+)\.([0-9a-f]{10})\.glb$/;

/**
 * Each theme's folder under `models/`, by its `u8` id on chain (`Setup`'s skins, cobbles v1, part 3): Forest is theme 1, the
 * high-forest set (`scripts/compress-models.ts`). Theme 0, the default, is the base models.
 */
export const THEME_FOLDERS: Record<string, number> = { forest: 1 };

/**
 * What the renderer requests from `asset-sources/` (`AssetLoader`): a base model, the Draco decoder. The tile images are the
 * app's own copies (`tiles/`), not this folder's. Anything else in it (`models/extended/`, the `assets/tiles/` originals, the
 * notices, the decoder's README) is never served nor copied.
 */
const SERVED = [/^models\/[a-z]{9}\.glb$/, /^draco\/(draco_decoder\.js|draco_decoder\.wasm|draco_wasm_wrapper\.js)$/];

export const isRendererAsset = (path: string) => SERVED.some((re) => re.test(path));

const TYPES: Record<string, string> = { ".glb": "model/gltf-binary", ".png": "image/png", ".js": "text/javascript", ".wasm": "application/wasm" };

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** The served files, as paths relative to the source, with `/` separators. */
export function rendererAssetFiles(source = SOURCE): string[] {
  return [...walk(source)].map((f) => relative(source, f).split(sep).join("/")).filter(isRendererAsset).sort();
}

/**
 * The manifest's shape: the base models by plan key, each theme's variants by theme id, then plan key, variant order, and
 * the resized tile images by size in pixels, then plan key (`{ "256": { "ccccccccc": "tiles/ccccccccc.256.<hash>.png" } }`).
 */
export interface RendererManifest {
  models: Record<string, string>;
  tiles: Record<string, Record<string, string>>;
  themes: Record<string, Record<string, string[]>>;
  /** The tiles' renders by theme id, then plan key or `cover` (`{ "1": { "cover": "renders/cover.1.<hash>.webp" } }`). */
  renders: Record<string, Record<string, string>>;
}

/** The hash of `dir/name` against the one in its name: a mismatch fails the build. */
function checkHash(dir: string, name: string, hash: string): void {
  const actual = createHash("sha256").update(readFileSync(join(dir, name))).digest("hex").slice(0, 10);
  if (actual !== hash) throw new Error(`renderer-assets: ${name} hashes to ${actual}: run node scripts/compress-models.ts (or compress-tiles.ts, render-tiles.ts)`);
}

/**
 * The manifest the renderer's `AssetLoader` reads at `<base>renderer-assets/manifest.json`: each plan key to its hashed
 * model, from the names in `dir`; and `themes`, each theme's variants (`THEME_FOLDERS`) by its id on chain and plan key, in
 * variant order (`{ "1": { "rfrfffffr": ["models/forest/rfrfffffr_HF_1.<hash>.glb", ...] } }`), the input of the board's
 * skins (a later task: the renderer reads `models` only today); and `tiles`, the resized tile images in `tilesDir` by size
 * and plan key (the renderer draws the smallest that serves: `AssetLoader`); and `renders`, the tiles' build-time renders in
 * `rendersDir` by theme id and plan key or `cover` (the theme pages' images, `data/tile-renders.ts`). Fails when a name's
 * hash is not its file's, or a plan has two base files, two images of one size or two renders in one theme.
 */
export function rendererManifest(dir = MODELS, tilesDir: string | null = dir === MODELS ? TILES : null, rendersDir: string | null = dir === MODELS ? RENDERS : null): RendererManifest {
  const models: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const match = HASHED.exec(name);
    if (!match) continue;
    const [, key, hash] = match as unknown as [string, string, string];
    checkHash(dir, name, hash);
    if (models[key]) throw new Error(`renderer-assets: two models for ${key} (${models[key]}, models/${name})`);
    models[key] = `models/${name}`;
  }
  const themes: RendererManifest["themes"] = {};
  for (const [folder, theme] of Object.entries(THEME_FOLDERS)) {
    const path = join(dir, folder);
    if (!existsSync(path)) continue;
    const plans: Record<string, Array<[number, string]>> = {};
    for (const name of readdirSync(path)) {
      const match = VARIANT.exec(name);
      if (!match) continue;
      const [, key, n, hash] = match as unknown as [string, string, string, string];
      checkHash(path, name, hash);
      (plans[key] ??= []).push([Number(n), `models/${folder}/${name}`]);
    }
    themes[String(theme)] = Object.fromEntries(
      Object.keys(plans)
        .sort()
        .map((key) => {
          const variants = plans[key]!.sort((a, b) => a[0] - b[0]);
          if (new Set(variants.map(([n]) => n)).size !== variants.length) throw new Error(`renderer-assets: two files for ${folder}/${key} variant`);
          return [key, variants.map(([, file]) => file)];
        }),
    );
  }
  const tiles: RendererManifest["tiles"] = {};
  for (const name of tilesDir && existsSync(tilesDir) ? readdirSync(tilesDir).sort() : []) {
    const match = TILE.exec(name);
    if (!match) continue;
    const [, key, size, hash] = match as unknown as [string, string, string, string];
    checkHash(tilesDir!, name, hash);
    const sized = (tiles[size] ??= {});
    if (sized[key]) throw new Error(`renderer-assets: two ${size} px images for ${key} (${sized[key]}, tiles/${name})`);
    sized[key] = `tiles/${name}`;
  }
  const renders: RendererManifest["renders"] = {};
  for (const name of rendersDir && existsSync(rendersDir) ? readdirSync(rendersDir).sort() : []) {
    const match = RENDER.exec(name);
    if (!match) continue;
    const [, key, theme, hash] = match as unknown as [string, string, string, string];
    checkHash(rendersDir!, name, hash);
    const themed = (renders[theme] ??= {});
    if (themed[key]) throw new Error(`renderer-assets: two renders of ${key} in theme ${theme} (${themed[key]}, renders/${name})`);
    themed[key] = `renders/${name}`;
  }
  return { models, tiles, themes, renders };
}

/**
 * The renderer's assets at `<base>renderer-assets/`. The models are the app's compressed, hashed copy in `public/`
 * (Vite serves and copies it), and so are the resized tile images the renderer draws (`tiles/`, 256 px); this adds
 * the manifest that names them, served in `vite` (dev, `no-cache`) and written into `dist/renderer-assets/manifest.json` at
 * build. The 1680 px originals (`assets/tiles/`) are neither served nor copied: the renderer and the tile chips (a DOM `<img>`,
 * through the manifest) draw the 256 px copies, so those are the only tile images in `dist/`. In dev it also answers the
 * original names (`models/<plan>.glb`, `draco/`), what the loader asks for when no manifest lists a plan; the build ships
 * neither. `vite preview` serves `dist` as a static host does, so the built copy is what it shows. Storybook maps
 * `asset-sources/` itself (`staticDirs`), whole, with no manifest: the plugin stays out of its builds.
 */
export function rendererAssets(source = SOURCE, models = MODELS, tiles: string | null = models === MODELS ? TILES : null): Plugin {
  let prefix = "/renderer-assets/";
  let off = false;
  return {
    name: "paved:renderer-assets",
    configResolved(config) {
      prefix = `${config.base}renderer-assets/`;
      off = config.plugins.some((p) => p.name.startsWith("storybook:"));
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (off) return next();
        const url = (req.url ?? "").split("?")[0]!;
        if (!url.startsWith(prefix)) return next();
        let rel: string;
        try {
          rel = decodeURIComponent(url.slice(prefix.length));
        } catch {
          return next();
        }
        if (rel === "manifest.json") {
          const body = JSON.stringify(rendererManifest(models, tiles));
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.end(body);
          return;
        }
        const file = join(source, rel);
        if (!isRendererAsset(rel) || !existsSync(file)) return next();
        res.setHeader("Content-Type", TYPES[extname(rel)] ?? "application/octet-stream");
        res.setHeader("Content-Length", statSync(file).size);
        createReadStream(file).on("error", () => res.destroy()).pipe(res);
      });
    },
    generateBundle() {
      if (off) return;
      this.emitFile({ type: "asset", fileName: "renderer-assets/manifest.json", source: `${JSON.stringify(rendererManifest(models, tiles), null, 2)}\n` });
    },
  };
}
