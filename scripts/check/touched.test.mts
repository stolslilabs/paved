/** The touched set of scripts/check/touched.mts (GUARDS, P-71): `node --test scripts/check/touched.test.mts`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUARD_TESTS, TEST_HEAP_MB, appSources, isInput, plan, quickAppTests, topological, vercelInputs, workspace, type Pkg } from "./touched.mts";

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

test("a stories-only change builds the Storybook, not the client", () => {
  assert.deepEqual(at(["packages/app/src/components/elements/button.stories.tsx"]).vercel, ["storybook"]);
  assert.deepEqual(at(["packages/app/src/stories/renderer/placement-board.tsx"]).vercel, ["storybook"]);
  assert.deepEqual(at(["packages/app/.storybook/main.ts"]).vercel, ["storybook"]);
  assert.deepEqual(at(["packages/app/src/components/elements/button.tsx"]).vercel, ["client", "storybook"]);
});

test("a file a build copies from a public/ folder builds both projects, Markdown included", () => {
  assert.deepEqual(at(["packages/app/public/backgrounds/README.md"]).vercel, ["client", "storybook"]);
});

test("a package's README and docs, the root Markdown, the indexer, Cairo sources, the CI and the guards build no Vercel project", () => {
  for (const f of [
    "packages/renderer/README.md",
    "packages/game-core/docs/rules.md",
    "readme.md",
    "packages/indexer/src/events.ts",
    "contracts/src/systems/setup.cairo",
    ".github/workflows/test.yaml",
    ".claude/skills/paved-ui/SKILL.md",
    "scripts/vercel/ignore-build.sh",
  ])
    assert.deepEqual(at([f]).vercel, [], f);
});

test("isInput reads the excludes as git does", () => {
  const specs = ["packages/app", ":(exclude,glob)packages/*/README.md", ":(exclude,glob)packages/app/**/*.stories.tsx", ":(exclude)packages/app/.storybook"];
  assert.equal(isInput("packages/app/src/a.tsx", specs), true);
  assert.equal(isInput("packages/app/a.stories.tsx", specs), false);
  assert.equal(isInput("packages/app/src/x/a.stories.tsx", specs), false);
  assert.equal(isInput("packages/app/README.md", specs), false);
  assert.equal(isInput("packages/app/public/README.md", specs), true);
  assert.equal(isInput("packages/app/.storybook/main.ts", specs), false);
  assert.equal(isInput("packages/application/a.ts", specs), false);
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

test("topological puts each package after its dependencies", () => {
  assert.deepEqual(topological(["@paved/app", "@paved/renderer", "@paved/game-core", "@paved/indexer"], PKGS), [
    "@paved/game-core",
    "@paved/renderer",
    "@paved/app",
    "@paved/indexer",
  ]);
});

// `check --quick`: the app's tests that import a changed file directly.
const APP = new Map(
  Object.entries({
    "packages/app/src/lib/format.ts": "export const f = 1;",
    "packages/app/src/lib/money.ts": 'import { f } from "./format";\nexport const m = f;',
    "packages/app/src/data/balances.ts": "export const b = 1;",
    "packages/app/src/data/keys.ts": "export const k = 1;",
    "packages/app/src/data/index.ts": '// The data layer.\nexport { b } from "./balances";\nexport type { K } from "./keys";\nexport * from "./keys";\n',
    "packages/app/src/App.tsx": 'import { m } from "./lib/money";\nimport "./index.css";\nexport const App = () => m;',
    "packages/app/__tests__/data-fakes.ts": 'import { b } from "../src/data";\nexport const fake = b;',
    "packages/app/__tests__/format.test.ts": 'import { f } from "../src/lib/format.ts";\nimport "../src/index.css";',
    "packages/app/__tests__/money.test.ts": 'import { m } from "../src/lib/money";',
    "packages/app/__tests__/data.test.tsx": 'import { b } from "../src/data";\nimport { fake } from "./data-fakes";',
    "packages/app/__tests__/app.test.tsx": 'const { App } = await import("../src/App");\nvi.mock("../src/data/keys", () => ({}));',
  }),
);
const quickAt = (files: string[]) => quickAppTests(files, APP);

test("--quick: a changed source selects the tests that import it directly, not those further up the graph", () => {
  assert.deepEqual(quickAt(["packages/app/src/lib/format.ts"]), { all: false, tests: ["packages/app/__tests__/format.test.ts"] });
  assert.deepEqual(quickAt(["packages/app/src/lib/money.ts"]), { all: false, tests: ["packages/app/__tests__/money.test.ts"] });
});

test("--quick: a barrel is seen through, and a changed barrel selects its own importers", () => {
  assert.deepEqual(quickAt(["packages/app/src/data/balances.ts"]).tests, ["packages/app/__tests__/data.test.tsx"]);
  assert.deepEqual(quickAt(["packages/app/src/data/index.ts"]).tests, ["packages/app/__tests__/data.test.tsx"]);
  // keys.ts is re-exported by the barrel and mocked by app.test.tsx.
  assert.deepEqual(quickAt(["packages/app/src/data/keys.ts"]).tests, ["packages/app/__tests__/app.test.tsx", "packages/app/__tests__/data.test.tsx"]);
});

test("--quick: a dynamic import, a side-effect import of a stylesheet and a test helper are followed", () => {
  assert.deepEqual(quickAt(["packages/app/src/App.tsx"]).tests, ["packages/app/__tests__/app.test.tsx"]);
  // App.tsx imports it too, but app.test.tsx imports App.tsx, not the stylesheet.
  assert.deepEqual(quickAt(["packages/app/src/index.css"]).tests, ["packages/app/__tests__/format.test.ts"]);
  assert.deepEqual(quickAt(["packages/app/__tests__/data-fakes.ts"]).tests, ["packages/app/__tests__/data.test.tsx"]);
});

test("--quick: a changed test runs, a deleted source still selects its importers, a change outside the app selects none", () => {
  assert.deepEqual(quickAt(["packages/app/__tests__/money.test.ts"]).tests, ["packages/app/__tests__/money.test.ts"]);
  const gone = new Map(APP);
  gone.delete("packages/app/src/lib/format.ts");
  assert.deepEqual(quickAppTests(["packages/app/src/lib/format.ts"], gone).tests, ["packages/app/__tests__/format.test.ts"]);
  assert.deepEqual(quickAt(["packages/renderer/src/core/TileRenderer.ts", "docs/client/f-release.md", "packages/app/README.md"]), { all: false, tests: [] });
});

test("--quick: the app's test setup or a root file every package reads runs the whole suite", () => {
  for (const f of ["packages/app/vitest.config.ts", "packages/app/vitest.setup.ts", "packages/app/test-slow.ts", "packages/app/package.json", "bun.lock", "tsconfig.base.json"])
    assert.equal(quickAt([f]).all, true, f);
});

test("--quick: the real app's sources are read, and every test of its vitest include is among them", () => {
  const sources = appSources();
  assert.ok(sources.has("packages/app/src/data/index.ts"));
  const tests = quickAppTests(["packages/app/src/data/index.ts"], sources).tests;
  assert.ok(tests.length > 0 && tests.every((t) => /^packages\/app\/__tests__\/.*\.test\.tsx?$/.test(t)), tests.join(", "));
});
