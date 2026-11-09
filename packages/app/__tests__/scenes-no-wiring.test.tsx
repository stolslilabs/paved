import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("no wiring (SC1, SC2)", () => {
  const src = join(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

  const tiers = () => ["components/elements", "components/containers", "components/scenes", "mocks"].flatMap((d) => files(join(src, d)));

  it("imports only types from @paved/chain in the scenes, containers, elements and mocks", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/chain"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
  });

  // SC2: the quests, achievements and referral read the indexer's answers. Its package is the daemon (SQLite, starknet.js):
  // never a value import, and no request (fetch, the chain package's IndexerClient, a session) from these tiers.
  it("imports only types from @paved/indexer, and calls no indexer, chain or session", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/indexer[^"]*"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
    const calls = tiers().filter((f) => /\bfetch\(|IndexerClient|createEconomyClient|RpcEconomyViews|EconomyWriter|PageSession|LocalSession|useAsyncRead|useIndexerRead/.test(readFileSync(f, "utf8")));
    expect(calls).toEqual([]);
  });

  // P1 put the shell on the routes: the pages import their scenes, lazily (routes/pages/*). The first bundle's own files
  // (the entry, the app, the router table) hold no scene and no mock; the lazy modules are checked by the built chunk list.
  it("keeps the entry, the app and the router table free of scenes and mocks", () => {
    for (const f of ["main.tsx", "App.tsx", "routes/router.tsx"]) expect(readFileSync(join(src, f), "utf8")).not.toMatch(/components\/scenes|mocks\//);
  });

  it("reaches the page modules only through import(), never statically", () => {
    const outside = files(join(src, "routes")).filter((f) => !f.includes(join("routes", "pages")) && !f.endsWith("pages.ts"));
    for (const f of outside) expect(readFileSync(f, "utf8")).not.toMatch(/^\s*(import|export)\b[^;]*from\s+["']\.\/pages\//m);
    // The page loaders (`page-loaders.ts`) are the one table of `import()`s; the router and the prefetch go through it.
    const loaders = readFileSync(join(src, "routes/page-loaders.ts"), "utf8");
    const dynamic = [...loaders.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length;
    expect(dynamic).toBeGreaterThanOrEqual(14);
    expect(loaders.match(/\.\/pages\//g)).toHaveLength(dynamic);
    const router = readFileSync(join(src, "routes/router.tsx"), "utf8");
    expect(router).toMatch(/PAGE_LOADERS/);
    // The router's own `import()` is the not-found page, which is in no route of the table.
    expect(router.match(/\.\/pages\//g)).toHaveLength([...router.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length);
  });
});
