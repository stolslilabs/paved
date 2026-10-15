import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

/** app-web's `public/`: the one source of the renderer's assets, the folder Storybook maps to `/renderer-assets` too. */
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../app-web/public");

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
 * Serves the renderer's assets at `<base>renderer-assets/` from app-web's `public/` in `vite` (dev), and copies them into
 * `dist/renderer-assets/` at build: nothing is committed twice (until P12 moves them into the app). `vite preview` serves
 * `dist` as a static host does, so the built copy is what it shows. Storybook maps the same folder itself (`staticDirs`),
 * whole: the plugin stays out of its builds.
 */
export function rendererAssets(source = SOURCE): Plugin {
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
        const file = join(source, rel);
        if (!isRendererAsset(rel) || !existsSync(file)) return next();
        res.setHeader("Content-Type", TYPES[extname(rel)] ?? "application/octet-stream");
        res.setHeader("Content-Length", statSync(file).size);
        createReadStream(file).on("error", () => res.destroy()).pipe(res);
      });
    },
    generateBundle() {
      if (off) return;
      for (const rel of rendererAssetFiles(source)) {
        this.emitFile({ type: "asset", fileName: `renderer-assets/${rel}`, source: readFileSync(join(source, rel)) });
      }
    },
  };
}
