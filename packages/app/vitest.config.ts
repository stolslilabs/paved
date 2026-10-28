import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { SLOW_FACTOR, slow } from "./test-slow";


// P-66: the tests run under a French locale and a Paris time zone, so a number or date that follows the process's locale
// (a bare `toLocaleString`, an `Intl` formatter with no locale) shows as "1 234,5" and fails an en-US assertion. Set
// before the workers start: they inherit it. `process-locale.test` checks it took.
process.env.LC_ALL = "fr_FR.UTF-8";
process.env.LANG = "fr_FR.UTF-8";
process.env.TZ = "Europe/Paris";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // The suite's one margin: a test is a few hundred ms, but under heavy load a whole run stalls now and
    // then, 0.5 s tests taking 4.5 to 5.8 s (X7 and X8 measures). The stall hits the whole run, so any file can be its victim: the
    // margin is global, not per file. A file with a longer test says so, with its times.
    // `PAVED_TEST_SLOW` (test-slow.ts) multiplies it, with every wait ceiling of the suite, on a loaded machine.
    testTimeout: slow(15_000),
    hookTimeout: slow(10_000),
    // Under the slow profile only (a loaded machine, never CI): a stall still outlasts a scaled ceiling now and then, a
    // different test each run (the board's checks of #213 lost 1 to 3 of 1944, none twice in a row). Once more, with its
    // lazy chunks then loaded, tells such a stall from a real failure, which fails both times.
    retry: SLOW_FACTOR > 1 ? 1 : 0,
    // The token tests read computed colours from the compiled stylesheet.
    css: true,
  },
});
