import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // The suite's one margin: a test is a few hundred ms, but under heavy load a whole run stalls now and
    // then, 0.5 s tests taking 4.5 to 5.8 s (X7 and X8 measures). The stall hits the whole run, so any file can be its victim: the
    // margin is global, not per file. A file with a longer test says so, with its times.
    testTimeout: 15_000,
    // The token tests read computed colours from the compiled stylesheet.
    css: true,
  },
});
