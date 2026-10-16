/**
 * Where the renderer finds its models (`<base>/models/<plan>.glb`), its Draco decoder (`<base>/draco/`) and, with no manifest,
 * its tile images: app-web's `public/`, which Storybook serves at this path (`staticDirs` in `.storybook/main.ts`). It has
 * a path of its own: the app's `public/renderer-assets/` (the hashed models and the 256 px tiles) is served at
 * `APP_ASSETS`, and no two static copies write one folder. The board stories load the models from it; the tile chips take
 * `originalTileArt` for their art.
 */
export const APP_WEB_ASSETS = "/app-web-assets";

/**
 * The app's own `public/renderer-assets/`, at the path the app serves it (hashed models, Forest variants, 256 px tiles, no
 * `manifest.json`): a story that hands the renderer a manifest of its own loads from it.
 */
export const APP_ASSETS = "/renderer-assets";

/**
 * The tile chips' art in the stories and mocks: the 1680 px originals (`<base>/assets/tiles/<plan>.png`) Storybook serves from
 * app-web's `public/`, which has no manifest. The app's pages resolve the 256 px copies instead (`useTileArt`), and its build
 * ships no original.
 */
export const originalTileArt = (base: string) => (key: string) => `${base}/assets/tiles/${key}.png`;
