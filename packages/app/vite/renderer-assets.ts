import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

/** app-web's `public/`: the source of the renderer's tile images and original models, the folder Storybook maps to `/renderer-assets`. */
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../app-web/public");
/**
 * The app's own copy of the models, compressed and content-hashed (`scripts/compress-models.ts`): in `public/`, so Vite
 * serves it in dev and copies it into `dist/` at build, at `<base>renderer-assets/models/<plan>.<hash>.glb`.
 */
const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), "../public/renderer-assets/models");
/** A compressed model's name: its plan key, then the first 10 hex digits of the file's SHA-256. */
const HASHED = /^([a-z]{9})\.([0-9a-f]{10})\.glb$/;

/**
 * What the renderer requests (`AssetLoader`): a base model, a tile image, the Draco decoder. Anything else in the folder
 * (`models/extended/`, `assets/tiles/00.png`, the notices, the decoder's README) is never served nor copied.
 */
const SERVED = [/^models\/[a-z]{9}\.glb$/, /^assets\/tiles\/[a-z]{9}\.png$/, /^draco\/(draco_decoder\.js|draco_decoder\.wasm|draco_wasm_wrapper\.js)$/];

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
 * The manifest the renderer's `AssetLoader` reads at `<base>renderer-assets/manifest.json`: each plan key to its hashed
 * model, from the names in `dir`. Fails when a name's hash is not its file's, or a plan has two files.
 */
export function rendererManifest(dir = MODELS): { models: Record<string, string> } {
  const models: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const match = HASHED.exec(name);
    if (!match) continue;
    const [, key, hash] = match as unknown as [string, string, string];
    const actual = createHash("sha256").update(readFileSync(join(dir, name))).digest("hex").slice(0, 10);
    if (actual !== hash) throw new Error(`renderer-assets: ${name} hashes to ${actual}: run node scripts/compress-models.ts`);
    if (models[key]) throw new Error(`renderer-assets: two models for ${key} (${models[key]}, models/${name})`);
    models[key] = `models/${name}`;
  }
  return { models };
}

/**
 * The renderer's assets at `<base>renderer-assets/`. The models are the app's compressed, hashed copy in `public/`
 * (Vite serves and copies it); this adds the manifest that names them, served in `vite` (dev, `no-cache`) and written into
 * `dist/renderer-assets/manifest.json` at build, and the tile images (the plan view's, and the tile chips'), served from
 * app-web's `public/` in dev and copied into `dist/renderer-assets/assets/tiles/` at build. In dev it also answers the
 * original names (`models/<plan>.glb`, `draco/`), what the loader asks for when no manifest lists a plan; the build ships
 * neither. `vite preview` serves `dist` as a static host does, so the built copy is what it shows. Storybook maps
 * app-web's folder itself (`staticDirs`), whole, with no manifest: the plugin stays out of its builds.
 */
export function rendererAssets(source = SOURCE, models = MODELS): Plugin {
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
          const body = JSON.stringify(rendererManifest(models));
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
      this.emitFile({ type: "asset", fileName: "renderer-assets/manifest.json", source: `${JSON.stringify(rendererManifest(models), null, 2)}\n` });
      for (const rel of rendererAssetFiles(source).filter((f) => f.startsWith("assets/tiles/"))) {
        this.emitFile({ type: "asset", fileName: `renderer-assets/${rel}`, source: readFileSync(join(source, rel)) });
      }
    },
  };
}
