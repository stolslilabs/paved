import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    // The first test of each file pays the cold import of tamagui and game-core, which on a cold CI
    // runner exceeds vitest's 5000 ms default (ActionBar, then IngameStatus, timed out once each and
    // passed on rerun). Size the timeouts for that import here, for every file, rather than per file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
