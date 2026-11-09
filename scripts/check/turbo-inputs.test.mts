/**
 * Turbo's cache replays a task only for unchanged inputs (APP-TEST-SHARD, #1131): every file a package's cached task reads
 * outside its own folder must be in the task's `inputs` (turbo.json), or in a workspace package it depends on (whose files
 * are in the dependency's build hash). Otherwise a change of that file replays a stale success from the CI's cache.
 *
 * This scans each package's tracked sources for relative paths that leave the package ("../../app/src/styles/theme.css")
 * and checks each lands in a package it depends on or matches a `$TURBO_ROOT$/` input of the task that reads it: the
 * `test` task for every package but the app, whose tests do not go through turbo; the `build` task for the app's sources.
 * Paths built from a root constant (`resolve(ROOT, "contracts/...")`) are not seen: keep those under the root inputs.
 *
 * `node --test scripts/check/turbo-inputs.test.mts`
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const turbo = JSON.parse(readFileSync(join(ROOT, "turbo.json"), "utf8")) as { tasks: Record<string, { inputs?: string[] }> };

type Pkg = { name: string; dir: string; deps: string[] };
const pkgs: Pkg[] = readdirSync(join(ROOT, "packages"))
  .filter((d) => existsSync(join(ROOT, "packages", d, "package.json")))
  .map((d) => {
    const json = JSON.parse(readFileSync(join(ROOT, "packages", d, "package.json"), "utf8")) as Record<string, Record<string, string> | string>;
    const all = { ...(json.dependencies as object), ...(json.devDependencies as object), ...(json.peerDependencies as object) };
    return { name: json.name as string, dir: `packages/${d}`, deps: Object.keys(all).filter((n) => n.startsWith("@paved/")) };
  });
const byName = new Map(pkgs.map((p) => [p.name, p]));

/** The folders of the workspace packages `p` depends on, transitively. */
function depDirs(p: Pkg, seen = new Set<string>()): string[] {
  for (const d of p.deps) {
    const dep = byName.get(d);
    if (dep && !seen.has(dep.dir)) {
      seen.add(dep.dir);
      depDirs(dep, seen);
    }
  }
  return [...seen];
}

const inputsOf = (p: Pkg, task: string) => turbo.tasks[`${p.name}#${task}`]?.inputs ?? turbo.tasks[task]?.inputs ?? [];
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|css|html)$/;
/** Relative paths in quotes that start by going up: "../x", '../../y/z', `../../w/${n}` (cut at the interpolation). */
const UP = /["'`]((?:\.\.\/)+[^"'`\s$]*)/g;

/**
 * Files whose reads the scan cannot follow: a folder named once in a constant, then joined (`${APP}/public/...`), or a
 * path resolved from something else than the file's folder. Each lists the root-relative paths it really reads, which
 * must be covered like any other; `[]` when no cached task runs it, with the reason.
 */
const REVIEWED: Record<string, { reads: string[]; why: string }> = {
  "packages/renderer/__tests__/helpers/model-meshes.ts": {
    reads: ["packages/app/public/renderer-assets/models", "packages/app/asset-sources/models"],
    why: "APP, then SHIPPED and SOURCES under it",
  },
  "packages/renderer/__tests__/voxelizer.test.ts": {
    reads: ["packages/app/public/renderer-assets/models", "packages/app/asset-sources/models"],
    why: "APP, then SHIPPED and SOURCES under it",
  },
  "packages/chain/test/devnet/devnet.ts": { reads: ["contracts/deployments/devnet.json"], why: "REPO, then the devnet deployment" },
  "packages/chain/test/e2e-devnet.test.ts": { reads: ["contracts/deployments/devnet.json"], why: "REPO, then the devnet deployment" },
  "packages/chain/test/e2e-predicted.test.ts": { reads: ["contracts/deployments/devnet.json"], why: "REPO, then the devnet deployment" },
  "packages/game-core/scripts/transcribe-goldens.ts": {
    reads: ["contracts/src/tests/golden", "contracts/src/tests/differential.cairo"],
    why: "ROOT, then readRepository() of the goldens and the differential test",
  },
  "packages/indexer/test/devnet/devnet.ts": {
    reads: ["scripts/deploy.sh", "contracts/deployments"],
    why: "ROOT, then deploy.sh devnet (the devnet scenario only, PAVED_DEVNET)",
  },
  "packages/app/scripts/direction-renders.ts": { reads: [], why: "a capture script run by hand: not part of the app's build" },
};

/** The text of a source without its comments (a `//` to the end of the line, the lines of a block comment). */
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
    .map((line) => line.replace(/\s\/\/\s.*$/, ""))
    .join("\n");

/** The root-relative paths a package's files reach outside the package, with the file that names each. */
function escapes(p: Pkg, skip: (file: string) => boolean): { file: string; target: string }[] {
  const files = execFileSync("git", ["ls-files", p.dir], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => SOURCE.test(f) && !skip(f));
  const out: { file: string; target: string }[] = [];
  for (const file of files) {
    if (REVIEWED[file]) {
      for (const target of REVIEWED[file].reads) out.push({ file, target });
      continue;
    }
    const text = code(readFileSync(join(ROOT, file), "utf8"));
    for (const m of text.matchAll(UP)) {
      const target = relative(ROOT, resolve(ROOT, dirname(file), m[1])).split(sep).join("/");
      if (target === p.dir || target.startsWith(`${p.dir}/`)) continue;
      // The repo root or the packages folder, named to join paths to later: what it reads is not in the literal.
      out.push({ file, target: target === "" || target === "packages" || target.startsWith("..") ? `${target || "."} (a root to join to: list the reads in REVIEWED)` : target });
    }
  }
  return out;
}

/** The escapes no input covers: not in a dependency's folder, and matching no `$TURBO_ROOT$/` glob (as a file or a folder). */
function uncovered(p: Pkg, task: string, skip: (file: string) => boolean): string[] {
  const globs = inputsOf(p, task).filter((g) => g.startsWith("$TURBO_ROOT$/")).map((g) => g.slice("$TURBO_ROOT$/".length));
  const deps = depDirs(p);
  const covered = (t: string) =>
    deps.some((d) => t === d || t.startsWith(`${d}/`)) ||
    globs.some((g) => matchesGlob(t, g) || matchesGlob(`${t}/x`, g) || (!/[*?]/.test(g) && g.startsWith(`${t}/`)));
  return escapes(p, skip)
    .filter(({ target }) => !covered(target))
    .map(({ file, target }) => `${file} reads ${target}`);
}

const appOnlyTests = (f: string) => /\/(__tests__|e2e|\.storybook)\//.test(f) || /\.stories\.tsx?$/.test(f);

for (const p of pkgs) {
  const task = p.name === "@paved/app" ? "build" : "test";
  test(`${p.name}#${task}: every file it reads outside the package is in its inputs`, () => {
    assert.deepEqual(uncovered(p, task, p.name === "@paved/app" ? appOnlyTests : () => false), []);
  });
}

test("the scan sees a read of a sibling package that is not a dependency", () => {
  const renderer = byName.get("@paved/renderer")!;
  assert.ok(escapes(renderer, () => false).some(({ target }) => target.startsWith("packages/app/src/styles/")));
  assert.ok(uncovered({ ...renderer, name: "@paved/none" }, "test", () => false).length > 0);
});

test("every reviewed file still exists and still leaves its package", () => {
  for (const file of Object.keys(REVIEWED)) {
    assert.ok(existsSync(join(ROOT, file)), `${file} is gone: drop it from REVIEWED`);
    assert.match(readFileSync(join(ROOT, file), "utf8"), /["'`](\.\.\/)+/, `${file} no longer goes up: drop it from REVIEWED`);
  }
});
