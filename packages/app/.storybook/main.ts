import type { StorybookConfig } from "@storybook/react-vite";
import { STATIC_DIRS } from "../scripts/storybook-static-dirs.ts";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  // `public/` holds the Font Awesome scripts the Icon component loads and `renderer-assets/` (hashed models, 256 px tiles),
  // which the board stories read with the app's manifest (`preview.tsx`); app-web's `public/` (source models, originals,
  // Draco decoder) is served at a path of its own, `/app-web-assets`, for the tile browser and the original tile art
  // (`src/mocks/assets.ts`). No two entries write one folder: `scripts/storybook-static-dirs.ts` checks it.
  staticDirs: STATIC_DIRS,
  core: { disableTelemetry: true },
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
};

export default config;
