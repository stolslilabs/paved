import { defineConfig } from "vitest/config";


// P-66: the tests run under a French locale and a Paris time zone, so a number or date that follows the process's locale
// (a bare `toLocaleString`, an `Intl` formatter with no locale) shows as "1 234,5" and fails an en-US assertion. Set
// before the workers start: they inherit it. `process-locale.test` checks it took.
process.env.LC_ALL = "fr_FR.UTF-8";
process.env.LANG = "fr_FR.UTF-8";
process.env.TZ = "Europe/Paris";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
