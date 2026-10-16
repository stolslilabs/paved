/**
 * Where the renderer finds its models (`<base>/models/<plan>.glb`) and, with no manifest, its tile images: app-web's
 * `public/`, which Storybook serves at this path (`staticDirs` in `.storybook/main.ts`). The board stories load the models
 * from it; the tile chips take `originalTileArt` for their art.
 */
export const RENDERER_ASSETS = "/renderer-assets";

/**
 * The tile chips' art in the stories and mocks: the 1680 px originals (`<base>/assets/tiles/<plan>.png`) Storybook serves from
 * app-web's `public/`, which has no manifest. The app's pages resolve the 256 px copies instead (`useTileArt`), and its build
 * ships no original.
 */
export const originalTileArt = (base: string) => (key: string) => `${base}/assets/tiles/${key}.png`;
