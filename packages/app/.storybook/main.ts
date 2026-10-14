import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  // `public/` holds the Font Awesome scripts the Icon component loads; app-web's `public/` holds the renderer's models and
  // tile images, which the board stories load from `/renderer-assets` (`src/mocks/assets.ts`).
  staticDirs: ["../public", { from: "../../app-web/public", to: "/renderer-assets" }],
  core: { disableTelemetry: true },
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
};

export default config;
