import { defineConfig } from "vitest/config";


// P-66: the tests run under a French locale and a Paris time zone, so a number or date that follows the process's locale
// (a bare `toLocaleString`, an `Intl` formatter with no locale) shows as "1 234,5" and fails an en-US assertion. Set
// before the workers start: they inherit it. `process-locale.test` checks it took.
process.env.LC_ALL = "fr_FR.UTF-8";
process.env.LANG = "fr_FR.UTF-8";
process.env.TZ = "Europe/Paris";

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
