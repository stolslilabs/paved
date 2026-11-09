import { defineConfig } from "vitest/config";

// The slow profile (`PAVED_TEST_SLOW`, as packages/app/test-slow.ts reads it): unset or `0` is 1 (CI, a quiet machine), `1` is 3,
// any other number is the factor. The command-line tests start a Node process each (`main.test.ts`): 0.5 s as a median, but 7.2 s
// for one test at a load of 4.6 per core, past vitest's 5 s; the catch-up tests failed the board's check the same way (#1128).
// The ceilings are vitest's defaults (5 s a test, 10 s a hook), scaled; under the profile only, a failed test runs once more.
const raw = process.env.PAVED_TEST_SLOW ?? "";
const parsed = Number(raw);
const SLOW_FACTOR = raw === "" || !(parsed > 0) ? 1 : parsed === 1 ? 3 : parsed;

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/devnet/**"],
    testTimeout: 5_000 * SLOW_FACTOR,
    hookTimeout: 10_000 * SLOW_FACTOR,
    retry: SLOW_FACTOR > 1 ? 1 : 0,
  },
});
