import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** The Playwright battle test of Training (`bun run e2e`): a real browser, minutes long, so apart from `bun run test`. */
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    // The seeds, the scores and the move times in the log, the passing runs too.
    silent: false,
    reporters: ["verbose"],
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 180_000,
  },
});
