/**
 * Fails when `storybook-static` holds the owner's whole Font Awesome files (the Storybook is published). `build-storybook`
 * runs it last. Node 24 runs it as is.
 *
 *   node scripts/storybook-guard.ts [--dir storybook-static]
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP, forbidden } from "./bundle-budget.ts";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf("--dir");
  const dir = at >= 0 ? resolve(process.cwd(), process.argv[at + 1]!) : join(APP, "storybook-static");
  const problems = forbidden(dir);
  if (problems.length > 0) {
    console.error(problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("storybook-static holds no whole Font Awesome file.");
}
