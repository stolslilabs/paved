/**
 * Where the renderer finds its models and tile images (`<base>/models/<plan>.glb`, `<base>/assets/tiles/<plan>.png`):
 * app-web's `public/`, which Storybook serves at this path (`staticDirs` in `.storybook/main.ts`). The board stories
 * load the models from it, and the tile chips of the hand and the welcome mosaic their art.
 */
export const RENDERER_ASSETS = "/renderer-assets";
