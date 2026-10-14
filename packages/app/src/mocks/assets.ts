/**
 * Where the renderer finds its models and tile images (`<base>/models/<plan>.glb`, `<base>/assets/tiles/<plan>.png`):
 * app-web's `public/`, which Storybook serves at this path once `.storybook/main.ts` maps it (`staticDirs`), the change
 * SC1 escalated (its allowlist leaves `.storybook/` out). Until then the board stories draw the board's colour only.
 */
export const RENDERER_ASSETS = "/renderer-assets";
