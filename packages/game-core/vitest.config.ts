import { defineConfig } from "vitest/config";


// P-66: the tests run under a French locale and a Paris time zone, so a number or date that follows the process's locale
// (a bare `toLocaleString`, an `Intl` formatter with no locale) shows as "1 234,5" and fails an en-US assertion. Set
// before the workers start: they inherit it. `process-locale.test` checks it took.
process.env.LC_ALL = "fr_FR.UTF-8";
process.env.LANG = "fr_FR.UTF-8";
process.env.TZ = "Europe/Paris";

// The slow profile (`PAVED_TEST_SLOW`, as `packages/app/test-slow.ts` reads it: unset or `0` is 1, `1` is 3, any other number is
// the factor) multiplies vitest's 5 s default on a loaded machine: the guard `engine-parity` transcribes the Cairo tests, 10 s there.
const raw = process.env.PAVED_TEST_SLOW ?? "";
const parsed = Number(raw);
const SLOW_FACTOR = raw === "" || !(parsed > 0) ? 1 : parsed === 1 ? 3 : parsed;

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 5_000 * SLOW_FACTOR,
  },
});
