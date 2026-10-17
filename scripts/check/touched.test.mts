/** The touched set of scripts/check/touched.mts (GUARDS, P-71): `node --test scripts/check/touched.test.mts`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUARD_TESTS, TEST_HEAP_MB, plan, vercelInputs, workspace, type Pkg } from "./touched.mts";

const PKGS: Pkg[] = [
  { name: "@paved/game-core", dir: "packages/game-core", deps: [] },
  { name: "@paved/chain", dir: "packages/chain", deps: ["@paved/game-core"] },
  { name: "@paved/renderer", dir: "packages/renderer", deps: ["@paved/game-core"] },
  { name: "@paved/app", dir: "packages/app", deps: ["@paved/chain", "@paved/game-core", "@paved/renderer"] },
  { name: "@paved/indexer", dir: "packages/indexer", deps: [] },
];
const INPUTS = { client: vercelInputs("client"), storybook: vercelInputs("storybook") };
const at = (files: string[]) => plan(files, PKGS, INPUTS);

test("a docs-only change touches no package and builds no Vercel project", () => {
  const p = at(["docs/client/f-release.md", "AGENTS.md", "book/src/intro.md"]);
  assert.deepEqual(p.touched, []);
  assert.deepEqual(p.reach, []);
  assert.deepEqual(p.vercel, []);
  assert.equal(p.contracts, false);
});

test("a CORE change of the ABIs touches the indexer, chain and game-core, and reaches the app", () => {
  const p = at(["contracts/abis/Setup.json", "contracts/src/systems/setup.cairo"]);
  assert.deepEqual(p.touched, ["@paved/chain", "@paved/game-core", "@paved/indexer"]);
  assert.deepEqual(p.reach, ["@paved/app", "@paved/chain", "@paved/game-core", "@paved/indexer", "@paved/renderer"]);
  assert.equal(p.contracts, true);
  assert.deepEqual(p.vercel, ["client", "storybook"]);
});

test("a Cairo source change alone checks the format and touches no package", () => {
  const p = at(["contracts/src/systems/challenge.cairo"]);
  assert.deepEqual(p.touched, []);
  assert.equal(p.contracts, true);
  assert.deepEqual(p.vercel, []);
});

test("a renderer change reaches the app, not the indexer, and builds both Vercel projects", () => {
  const p = at(["packages/renderer/src/core/TileRenderer.ts"]);
  assert.deepEqual(p.touched, ["@paved/renderer"]);
  assert.deepEqual(p.reach, ["@paved/app", "@paved/renderer"]);
  assert.deepEqual(p.vercel, ["client", "storybook"]);
});

test("the lockfile touches every package", () => {
  assert.deepEqual(at(["bun.lock"]).touched, PKGS.map((x) => x.name).sort());
});

test("the root vercel.json builds the Storybook only", () => {
  assert.deepEqual(at(["vercel.json"]).vercel, ["storybook"]);
  assert.deepEqual(at(["packages/app/vercel.json"]).vercel, ["client", "storybook"]);
});

test("a change of the guards runs their own tests", () => {
  assert.equal(at(["scripts/check/check.mts"]).guards, true);
  assert.equal(at([".githooks/pre-push"]).guards, true);
  assert.equal(at(["scripts/deploy.sh"]).guards, false);
});

test("every package of the workspace has a heap cap, and every guard test names a package of the workspace", () => {
  const names = workspace().map((x) => x.name);
  for (const n of names) assert.ok(TEST_HEAP_MB[n], `${n} has no heap cap in TEST_HEAP_MB`);
  for (const n of Object.keys(GUARD_TESTS)) assert.ok(names.includes(n), `${n} is not a workspace package`);
});
