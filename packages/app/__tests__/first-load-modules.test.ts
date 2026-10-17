import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, measureDist, readBudget } from "../scripts/bundle-budget.ts";

// What the first load of `/` must not carry (FIRST-LOAD): the game engine and the hashing under it, and the chain client's
// libraries. They are fetched by the pages and the actions that need them. Read from the source maps of the chunks the
// budget counts, so it runs on a build (`bun run build`) and is skipped without one.
const DIST = join(APP, "dist");
const built = existsSync(join(DIST, "index.html"));

const MOVED = [
  "game-core/dist/engine/",
  "game-core/dist/sessions/local-session.js",
  "game-core/dist/sessions/predicted-session.js",
  "@scure/starknet",
  "@noble/curves",
  "node_modules/starknet/",
  "@cartridge/controller",
];

describe.skipIf(!built)("the first load of / in the production build", () => {
  const { firstLoadFiles } = built ? measureDist(DIST, readBudget().firstLoad.route) : { firstLoadFiles: [] };

  // A chunk of no module of the app's own (the bundler's runtime, the preload helper) has no map.
  const maps = firstLoadFiles.filter((file) => existsSync(join(DIST, `${file}.map`)));

  it("is read from the chunks that have source maps", () => {
    expect(firstLoadFiles.length).toBeGreaterThan(5);
    expect(maps.length).toBeGreaterThan(firstLoadFiles.length / 2);
  });

  it("holds none of the modules moved out of it", () => {
    const sources = maps.flatMap((file) => (JSON.parse(readFileSync(join(DIST, `${file}.map`), "utf8")) as { sources: string[] }).sources.map((s) => `${file}: ${s}`));
    for (const moved of MOVED) expect(sources.filter((s) => s.includes(moved)), moved).toEqual([]);
  });
});
