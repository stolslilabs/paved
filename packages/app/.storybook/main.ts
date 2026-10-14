import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  // `public/` holds the Font Awesome scripts the Icon component loads.
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
};

export default config;
