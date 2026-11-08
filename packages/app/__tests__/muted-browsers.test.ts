import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MUTED-BROWSERS (the user's ask of 2026-11-08: no music from the clients run in the background). Playwright mutes a headless
 * Chromium by itself (`--mute-audio` goes with `--headless`), so the e2e and the capture scripts are silent. A launch that may open
 * a window (`headless: false`, `headless: !HEADED`) is not: such a launch passes `--mute-audio` in its own options.
 *
 * Enforced on the source of `packages/app/e2e`, `packages/app/scripts` and the root `scripts`: every `chromium.launch(…)` and
 * `launchPersistentContext(…)` call is read, and one whose options set `headless` to anything but `true` must name `--mute-audio`.
 * The headless half of the rule rests on Playwright's own switch, checked here on the installed `playwright-core`.
 */

const APP = join(import.meta.dirname, "..");
const REPO = join(APP, "..", "..");
const DIRS = [join(APP, "e2e"), join(APP, "scripts"), join(REPO, "scripts")];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return /\.(?:ts|mts|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/** The text of a call's arguments, from the `(` at `open` to its match, skipping strings (template literals whole). */
function callArguments(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unclosed call at ${open}`);
}

interface Launch {
  file: string;
  line: number;
  options: string;
}

function launches(): Launch[] {
  return DIRS.flatMap(sources).flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return [...text.matchAll(/\bchromium\.launch\(|\blaunchPersistentContext\(/g)].map((m) => {
      const open = m.index + m[0].length - 1;
      return { file: relative(REPO, path), line: text.slice(0, m.index).split("\n").length, options: callArguments(text, open) };
    });
  });
}

/** Options that may open a window: a `headless` set to anything but the literal `true`. */
const MAY_BE_HEADED = /\bheadless\s*:(?!\s*true\b)/;

describe("muted browsers", () => {
  it("every launch that may open a window passes --mute-audio", () => {
    const all = launches();
    // The scan reads the repository's launches (the e2e's, the capture scripts', the benches'), not an empty list.
    expect(all.length).toBeGreaterThan(20);
    const headed = all.filter((l) => MAY_BE_HEADED.test(l.options));
    expect(headed.map((l) => l.file).sort()).toEqual(
      expect.arrayContaining(["packages/app/scripts/birds-bench.ts", "packages/app/scripts/cloud-bench.ts", "packages/app/scripts/fog-bench.ts", "packages/app/scripts/weather-bench.ts"]),
    );
    expect(headed.filter((l) => !l.options.includes("--mute-audio")).map((l) => `${l.file}:${l.line}`)).toEqual([]);
  });

  it("Playwright mutes a headless Chromium by itself (--mute-audio with --headless)", () => {
    const lib = join(dirname(createRequire(join(APP, "package.json")).resolve("playwright-core/package.json")), "lib");
    const switches = sources(lib).some((path) => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(/"--headless"/g)].some((m) => text.slice(m.index, m.index + 300).includes('"--mute-audio"'));
    });
    expect(switches).toBe(true);
  });
});
