import type { StorybookConfig } from "@storybook/react-vite";
import { STATIC_DIRS } from "../scripts/storybook-static-dirs.ts";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  // `public/` holds the Font Awesome scripts the Icon component loads and `renderer-assets/` (hashed models, 256 px tiles),
  // which the board stories read with the app's manifest (`preview.tsx`); `asset-sources/` (source models, originals,
  // Draco decoder) is served at a path of its own, `/asset-sources`, for the tile browser and the original tile art
  // (`src/mocks/assets.ts`). No two entries write one folder: `scripts/storybook-static-dirs.ts` checks it.
  staticDirs: STATIC_DIRS,
  // Vite would also copy the whole `public/` into `storybook-static/` (its own `publicDir`): off, `staticDirs` is the one way
  // in, and it leaves out `public/music/` but for the tracks the stories play (P-81).
  // The app's mock build carries no starknet.js and writes an offline worker (`vite.config.ts`, #927, `paved:mock-*`); the
  // stories build their own sources, some on the chain's fakes, keep starknet.js and need no worker, whatever the network.
  viteFinal: (config) => ({ ...config, publicDir: false, plugins: config.plugins?.flat().filter((p) => !(p && typeof p === "object" && "name" in p && String(p.name).startsWith("paved:mock-"))) }),
  core: { disableTelemetry: true },
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
};

export default config;
