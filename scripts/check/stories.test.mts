/** The wrap sweep's selection of scripts/check/stories.mts (CI-TIERS): `node --test scripts/check/stories.test.mts`. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_SHARDS, SLOW_SHARDS, selectStories, shardCount, slowShardCount, storyIds, storySources } from "./stories.mts";
import type { Pkg } from "./touched.mts";

const PKGS: Pkg[] = [
  { name: "@paved/game-core", dir: "packages/game-core", deps: [] },
  { name: "@paved/renderer", dir: "packages/renderer", deps: ["@paved/game-core"] },
  { name: "@paved/ui", dir: "packages/ui", deps: [] },
  { name: "@paved/app", dir: "packages/app", deps: ["@paved/game-core", "@paved/renderer", "@paved/ui"] },
  { name: "@paved/indexer", dir: "packages/indexer", deps: [] },
];
const A = "packages/app";
const APP = new Map(
  Object.entries({
    [`${A}/.storybook/preview.tsx`]: 'import "../src/styles/theme.css";\nimport { Provider } from "../src/providers/provider";\nimport { provideManifest } from "@paved/renderer";',
    [`${A}/.storybook/main.ts`]: 'export default { staticDirs: ["renderer-assets"] };',
    [`${A}/src/providers/provider.tsx`]: 'import { Sheet } from "../sheet/sheet";\nexport const Provider = Sheet;',
    [`${A}/src/sheet/sheet.tsx`]: 'import { tone } from "./tone";\nexport const Sheet = tone;',
    [`${A}/src/sheet/tone.ts`]: "export const tone = 1;",
    [`${A}/src/sheet/sheet.stories.tsx`]: 'import { Sheet } from "./sheet";',
    [`${A}/src/ui/amount.tsx`]: 'import { format } from "../lib/format";\nexport const Amount = format;',
    [`${A}/src/ui/amount.stories.tsx`]: 'import { Amount } from "./amount";',
    [`${A}/src/ui/index.ts`]: 'export { Amount } from "./amount";\nexport * from "./button";',
    [`${A}/src/ui/button.tsx`]: 'import { Icon } from "@paved/ui/icons";\nexport const Button = Icon;',
    [`${A}/src/ui/button.stories.tsx`]: 'import { Button } from ".";',
    [`${A}/src/lib/format.ts`]: "export const format = 1;",
    [`${A}/src/lib/worker-host.ts`]: 'new Worker(new URL("./job.worker.ts", import.meta.url));',
    [`${A}/src/lib/job.worker.ts`]: "export {};",
    [`${A}/src/board/board.tsx`]: 'import { draw } from "@paved/renderer";\nimport { host } from "../lib/worker-host";\nconst art = `/ui-art/play/${1}.webp`;',
    [`${A}/src/board/board.stories.tsx`]: 'const { Board } = await import("./board");',
    [`${A}/src/rules/rules.stories.tsx`]: 'import { rules } from "@paved/game-core";',
    [`${A}/src/styles/colors.stories.tsx`]: 'import { tokens } from "./tokens";',
    [`${A}/src/styles/tokens.ts`]: "export const tokens = {};",
    [`${A}/__tests__/amount.test.tsx`]: 'import { Amount } from "../src/ui/amount";',
  }),
);
const at = (files: string[]) => selectStories(files, APP, PKGS);
const some = (...files: string[]) => ({ all: false, files: files.map((f) => `${A}/src/${f}`).sort() });
const ALL = { all: true, files: [] };

test("a changed module selects the stories that import it, directly, through a chain or a barrel", () => {
  assert.deepEqual(at([`${A}/src/lib/format.ts`]), some("ui/amount.stories.tsx", "ui/button.stories.tsx"));
  assert.deepEqual(at([`${A}/src/ui/button.tsx`]), some("ui/button.stories.tsx"));
});

test("a changed story selects itself; a dynamic import and a worker URL are followed", () => {
  assert.deepEqual(at([`${A}/src/ui/amount.stories.tsx`]), some("ui/amount.stories.tsx"));
  assert.deepEqual(at([`${A}/src/lib/job.worker.ts`]), some("board/board.stories.tsx"));
});

test("a workspace package selects the stories that import it, by name or subpath, and those of the packages that depend on it", () => {
  assert.deepEqual(at(["packages/ui/src/icons.tsx"]), some("ui/button.stories.tsx"));
  // The renderer is imported by the preview (below); game-core reaches it as the renderer's dependency.
  assert.deepEqual(at(["packages/game-core/src/rules.ts"]), ALL);
  assert.deepEqual(at(["contracts/abis/Setup.json"]), ALL);
  const noRenderer = new Map(APP);
  noRenderer.set(`${A}/.storybook/preview.tsx`, 'import "../src/styles/theme.css";');
  assert.deepEqual(selectStories(["packages/renderer/src/core/TileRenderer.ts"], noRenderer, PKGS), some("board/board.stories.tsx"));
  assert.deepEqual(selectStories(["packages/game-core/src/rules.ts"], noRenderer, PKGS), some("board/board.stories.tsx", "rules/rules.stories.tsx"));
});

test("the tests, docs and Markdown of a package, the app's tests, e2e and scripts, and files outside the client select nothing", () => {
  for (const f of [
    "packages/game-core/__tests__/engine.test.ts",
    "packages/renderer/README.md",
    "packages/chain/test/codec.test.ts",
    "packages/indexer/src/events.ts",
    `${A}/__tests__/amount.test.tsx`,
    `${A}/e2e/training.e2e.ts`,
    `${A}/scripts/header-sweep.ts`,
    `${A}/vitest.config.ts`,
    `${A}/README.md`,
    `${A}/ui-sources/play/a.png`,
    "docs/client/f-release.md",
    "contracts/src/systems/setup.cairo",
  ])
    assert.deepEqual(at([f]), { all: false, files: [] }, f);
});

test("what every story reads selects every story", () => {
  for (const f of [
    "bun.lock",
    "package.json",
    "tsconfig.base.json",
    `${A}/package.json`,
    `${A}/vite.config.ts`,
    `${A}/vite/preload-trim.ts`,
    `${A}/.storybook/main.ts`,
    `${A}/.storybook/preview.tsx`,
    `${A}/src/styles/theme.css`,
    `${A}/scripts/wrap-sweep.ts`,
    `${A}/scripts/wrap-sweep-shard.ts`,
    `${A}/scripts/storybook-static-dirs.ts`,
    "scripts/check/stories.mts",
    ".github/workflows/test.yaml",
    ".github/actions/client-setup/action.yml",
  ])
    assert.deepEqual(at([f]), ALL, f);
});

test("whatever the preview imports, at any depth and through a workspace package, selects every story", () => {
  assert.deepEqual(at([`${A}/src/providers/provider.tsx`]), ALL);
  assert.deepEqual(at([`${A}/src/sheet/sheet.tsx`]), ALL);
  assert.deepEqual(at([`${A}/src/sheet/tone.ts`]), ALL);
  assert.deepEqual(at(["packages/renderer/src/index.ts"]), ALL);
});

test("a story of src/styles/ is a story like another; its stylesheets are every story", () => {
  assert.deepEqual(at([`${A}/src/styles/colors.stories.tsx`]), some("styles/colors.stories.tsx"));
  assert.deepEqual(at([`${A}/src/styles/tokens.ts`]), ALL);
});

test("a file of public/ selects the sources that name its folder, every story when none does", () => {
  assert.deepEqual(at([`${A}/public/ui-art/play/256/a.webp`]), some("board/board.stories.tsx"));
  assert.deepEqual(at([`${A}/public/wheel-art/a.webp`]), ALL);
  // Named by .storybook/main.ts only.
  assert.deepEqual(at([`${A}/public/renderer-assets/manifest.json`]), ALL);
});

test("a deleted module still selects the stories that imported it", () => {
  const gone = new Map(APP);
  gone.delete(`${A}/src/lib/format.ts`);
  assert.deepEqual(selectStories([`${A}/src/lib/format.ts`], gone, PKGS), some("ui/amount.stories.tsx", "ui/button.stories.tsx"));
});

test("storyIds maps story files to their ids through index.json's importPath, docs entries left out", () => {
  const index = {
    entries: {
      "ui-amount--docs": { id: "ui-amount--docs", type: "docs", importPath: "./src/ui/amount.stories.tsx" },
      "ui-amount--zero": { id: "ui-amount--zero", type: "story", importPath: "./src/ui/amount.stories.tsx" },
      "ui-amount--big": { id: "ui-amount--big", type: "story", importPath: "./src/ui/amount.stories.tsx" },
      "ui-button--plain": { id: "ui-button--plain", type: "story", importPath: "./src/ui/button.stories.tsx" },
    },
  };
  assert.deepEqual(storyIds(index, [`${A}/src/ui/amount.stories.tsx`]), ["ui-amount--big", "ui-amount--zero"]);
  assert.deepEqual(storyIds(index, []), []);
});

test("shards: one per 20 story files, at most the cap, the cap for every story", () => {
  assert.equal(shardCount({ all: false, files: [] }), 1);
  assert.equal(shardCount({ all: false, files: Array(20).fill("x") }), 1);
  assert.equal(shardCount({ all: false, files: Array(21).fill("x") }), 2);
  assert.equal(shardCount({ all: false, files: Array(500).fill("x") }), MAX_SHARDS);
  assert.equal(shardCount(ALL), MAX_SHARDS);
});

test("the real app: the preview is read, a story selects itself, theme.css and a module deep in the preview's graph every story", () => {
  const sources = storySources();
  assert.ok(sources.has(`${A}/.storybook/preview.tsx`));
  assert.deepEqual(selectStories([`${A}/src/styles/theme.css`], sources), ALL);
  // preview.tsx -> src/data/settings.ts -> src/data/device-store.ts.
  assert.deepEqual(selectStories([`${A}/src/data/device-store.ts`], sources), ALL);
  const own = selectStories([`${A}/src/components/elements/amount.stories.tsx`], sources);
  assert.deepEqual(own, { all: false, files: [`${A}/src/components/elements/amount.stories.tsx`] });
});

test("the merge queue and main sweep every story in MAX_SHARDS shards, SLOW_SHARDS slow, as a pull request that reaches every story", () => {
  const yaml = readFileSync(join(import.meta.dirname, "../../.github/workflows/test.yaml"), "utf8");
  const m = /printf 'stories=all\\nstory_files=\[\]\\nshards=(\[[\d,]+\])\\nshard_count=(\d+)\\nslow_shards=(\d+)\\n'/.exec(yaml);
  assert.ok(m, "the queue's shards line of test.yaml");
  assert.deepEqual(JSON.parse(m[1]!), Array.from({ length: MAX_SHARDS }, (_, k) => k + 1));
  assert.equal(Number(m[2]), MAX_SHARDS);
  assert.equal(Number(m[3]), slowShardCount(shardCount(ALL)));
  assert.equal(slowShardCount(MAX_SHARDS), SLOW_SHARDS);
});

test("slow shards: none for one shard, one at least for more, always one shard left for the others", () => {
  assert.equal(slowShardCount(1), 0);
  assert.equal(slowShardCount(2), 1);
  for (let n = 2; n <= MAX_SHARDS; n++) {
    assert.ok(slowShardCount(n) >= 1 && slowShardCount(n) <= n - 1, String(n));
  }
});
