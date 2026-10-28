import type { AssetManifest } from "@paved/renderer";

/**
 * The app's `asset-sources/`, which Storybook serves at this path (`staticDirs` in `.storybook/main.ts`): the source models
 * (`models/<plan>.glb`, uncompressed, and `models/extended/`), the Draco decoder and the 1680 px tile originals. The tile
 * browser reads the source models, and the tile chips take `originalTileArt` for their art; the board stories do not: they
 * read the app's compressed models at `APP_ASSETS` (LOAD-FAST), so a board story downloads 1.1 MB of models, not 15 MB.
 */
export const SOURCE_ASSETS = "/asset-sources";

/**
 * The app's own `public/renderer-assets/`, at the path the app serves it: the meshopt-compressed models under hashed names,
 * the Forest variants and the 256 px tiles. Storybook serves no `manifest.json` there; the preview hands the renderer
 * `APP_MANIFEST` for this path instead (`provideManifest`, `.storybook/preview.tsx`), so a story at this base path loads
 * exactly what the app loads.
 */
export const APP_ASSETS = "/renderer-assets";

/**
 * The manifest the app's build writes for `public/renderer-assets/` (`vite/renderer-assets.ts`, `rendererManifest`), read
 * here from the file names: the base models by plan key, the 256 px tiles by size and plan key, the Forest variants
 * (theme 1) by plan key in variant order, and the tiles' renders by theme and plan key (`scripts/render-tiles.ts`). The globs read the names only: no model or image is imported or bundled.
 * `renderer-manifest.test.ts` checks it equals the build's.
 */
const MODEL_FILES = Object.keys(import.meta.glob("../../public/renderer-assets/models/*.glb", { query: "?url" }));
const FOREST_FILES = Object.keys(import.meta.glob("../../public/renderer-assets/models/forest/*.glb", { query: "?url" }));
const TILE_FILES = Object.keys(import.meta.glob("../../public/renderer-assets/tiles/*.png", { query: "?url" }));
const RENDER_FILES = Object.keys(import.meta.glob("../../public/renderer-assets/renders/*.webp", { query: "?url" }));
const fileName = (file: string) => file.slice(file.lastIndexOf("/") + 1);
export const APP_MANIFEST: AssetManifest & {
  tiles: Record<string, Record<string, string>>;
  themes: Record<string, Record<string, string[]>>;
  renders: Record<string, Record<string, string>>;
} = (() => {
  const models: Record<string, string> = {};
  for (const file of [...MODEL_FILES].sort()) {
    const match = /\/([a-z]{9})\.[0-9a-f]{10}\.glb$/.exec(file);
    if (match) models[match[1]!] = `models/${fileName(file)}`;
  }
  const plans: Record<string, Array<[number, string]>> = {};
  for (const file of FOREST_FILES) {
    const match = /\/([a-z]{9})_HF_(\d+)\.[0-9a-f]{10}\.glb$/.exec(file);
    if (match) (plans[match[1]!] ??= []).push([Number(match[2]), `models/forest/${fileName(file)}`]);
  }
  const forest = Object.fromEntries(
    Object.keys(plans)
      .sort()
      .map((key) => [key, plans[key]!.sort((a, b) => a[0] - b[0]).map(([, path]) => path)]),
  );
  const tiles: Record<string, Record<string, string>> = {};
  for (const file of [...TILE_FILES].sort()) {
    const match = /\/([a-z]{9})\.(\d+)\.[0-9a-f]{10}\.png$/.exec(file);
    if (match) (tiles[match[2]!] ??= {})[match[1]!] = `tiles/${fileName(file)}`;
  }
  const renders: Record<string, Record<string, string>> = {};
  for (const file of [...RENDER_FILES].sort()) {
    const match = /\/([a-z]{9}(?:-top)?|cover|story-\d+-\d+|battle-(?:attack|defence)-\d+)\.(\d+)\.[0-9a-f]{10}\.webp$/.exec(file);
    if (match) (renders[match[2]!] ??= {})[match[1]!] = `renders/${fileName(file)}`;
  }
  return { models, tiles, themes: { "1": forest }, renders };
})();

/**
 * The tile chips' art in the stories and mocks: the 1680 px originals (`<base>/assets/tiles/<plan>.png`) Storybook serves from
 * `asset-sources/`, which has no manifest. The app's pages resolve the 256 px copies instead (`useTileArt`), and its build
 * ships no original.
 */
export const originalTileArt = (base: string) => (key: string) => `${base}/assets/tiles/${key}.png`;

/** The tiles' build-time renders in the stories and mocks: the app's own, at `APP_ASSETS`, as `useTileRenders` resolves them. */
export const appRenders = (theme: number, key: string): string | null => {
  const path = APP_MANIFEST.renders[String(theme)]?.[key];
  return path ? `${APP_ASSETS}/${path}` : null;
};

/** Forest's models per plan key (1 to 9), as `useThemeVariants` reads them. */
export const FOREST_VARIANTS: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(APP_MANIFEST.themes["1"] ?? {}).map(([key, files]) => [key, files.length]));
