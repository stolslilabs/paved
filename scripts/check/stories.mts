/**
 * The stories a change reaches (CI-TIERS, #1129): the wrap sweep of a pull request sweeps only them; the merge queue and
 * main sweep every story.
 *
 * A static walk of the app's import graph, as quickAppTests (touched.mts) but transitive: from the changed files to the
 * `*.stories.tsx` files that import them, directly or through any chain of modules, then to their story ids through the
 * built Storybook's `index.json` (`importPath`). A change of a workspace package (game-core, chain, renderer, ui) reaches
 * the sources that import it by name (`@paved/<name>`, any subpath), and so does a change of a package it depends on.
 * Every story is due when the change reaches what every story reads: the sweep and its helpers, `.storybook/**` and
 * everything its files import (at any depth, workspace packages included), the stylesheets of `src/styles/`, the build setup (vite.config.ts, vite/, vendor/),
 * the fonts (the app's package.json), a root file every package reads (bun.lock, package.json, ...), the workflow. A file
 * of `public/` reaches the sources that name its URL folder, every story when none does.
 *
 *   node scripts/check/stories.mts select <changed.txt>             # one changed path a line: GitHub outputs on stdout
 *   node scripts/check/stories.mts ids <index.json> <files.json>   # the story ids of those files, one a line
 *
 * Node 24 runs it as is (type stripping).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { OUTSIDE, appSources, touchesAll, workspace, type Pkg } from "./touched.mts";
import { ROOT } from "./vercel-build.mts";

const APP = "packages/app";
const APP_NAME = "@paved/app";

/**
 * The files of the app that select nothing by themselves: its tests, the e2e, its Markdown, the test setup, its scripts
 * (but those of the sweep, below), the art sources the build compresses (their outputs land in `public/` or `src/`).
 */
const APP_IGNORED = [/^__tests__\//, /^e2e\//, /\.md$/, /^vitest\.(?:config|setup)\.ts$/, /^test-slow\.ts$/, /^scripts\//, /^[a-z]+-sources\//];
/** The sweep and its helpers, and what `.storybook/main.ts` runs: every story. Paths from the repository root. */
const SWEEP_ALL = [
  /^packages\/app\/scripts\/wrap-sweep[^/]*\.ts$/,
  /^packages\/app\/scripts\/storybook-static-dirs\.ts$/,
  /^packages\/app\/asset-sources\//,
  /^scripts\/check\/(?:stories|touched|vercel-build)\.mts$/,
  /^\.github\/workflows\/test\.yaml$/,
  /^\.github\/actions\/client-setup\//,
];
/** The files of another workspace package that never reach its build: tests, docs, Markdown. */
const PKG_IGNORED = /(?:^|\/)(?:__tests__|test|docs)\/|\.test\.[cm]?[jt]sx?$|\.md$/;

/** The app's sources (src/, __tests__/, its root files) and its `.storybook/` files, as { repo path: text }. */
export function storySources(root = ROOT): Map<string, string> {
  const out = appSources(root);
  for (const d of readdirSync(join(root, APP, ".storybook"), { withFileTypes: true }))
    if (d.isFile() && /\.(?:ts|tsx)$/.test(d.name)) out.set(`${APP}/.storybook/${d.name}`, readFileSync(join(root, APP, ".storybook", d.name), "utf8"));
  return out;
}

/**
 * The module specifiers a source names: `from "..."`, `import "..."`, `import("...")`, `vi.mock("...")`, and the worker of
 * `new URL("./x.ts", import.meta.url)`. A query (`?url`, `?raw`) is dropped.
 */
export const specifiers = (text: string) =>
  [
    ...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.(?:mock|doMock|importActual)\s*\(\s*|\bnew\s+URL\s*\(\s*)["']([^"']+)["']/g),
  ].map((m) => m[1]!.replace(/\?.*$/, ""));

/** The workspace package a specifier names (`@paved/renderer/react` names `@paved/renderer`), or undefined. */
const packageOf = (spec: string, pkgs: Pkg[]) => pkgs.find((p) => spec === p.name || spec.startsWith(`${p.name}/`))?.name;

export interface Selection {
  /** Every story is due. */
  all: boolean;
  /** Else the story files the change reaches, from the repository root, sorted. */
  files: string[];
}

export function selectStories(files: string[], sources: Map<string, string>, pkgs: Pkg[] = workspace()): Selection {
  const ALL: Selection = { all: true, files: [] };
  if (touchesAll(files) || files.some((f) => SWEEP_ALL.some((r) => r.test(f)))) return ALL;
  /** The changed nodes of the graph: files of the app, and workspace packages by name. */
  const changed = new Set<string>();
  for (const f of files) {
    if (f.startsWith(`${APP}/`)) {
      const rel = f.slice(APP.length + 1);
      if (APP_IGNORED.some((r) => r.test(rel))) continue;
      // A file of public/ is read by its URL: it reaches the sources that name its folder (`/ui-art/`) or, at the root of
      // public/, itself (`/hud-noise.svg`). One no source names is read some other way (a manifest): every story.
      if (rel.startsWith("public/")) {
        const [top, ...more] = rel.slice("public/".length).split("/");
        const needle = more.length ? `/${top}/` : `/${top}`;
        const naming = [...sources].filter(([, text]) => text.includes(needle)).map(([path]) => path);
        if (naming.length === 0) return ALL;
        for (const n of naming) changed.add(n);
        continue;
      }
      // What every story reads, and what the graph does not see (the build's config, vite/, vendor/): all.
      // A stylesheet of src/styles/ (theme.css: the tokens) applies to every story; a story there is a story like another.
      if (!rel.startsWith("src/") || (rel.startsWith("src/styles/") && !rel.endsWith(".stories.tsx"))) return ALL;
      changed.add(f);
      continue;
    }
    for (const p of pkgs) if (p.name !== APP_NAME && f.startsWith(`${p.dir}/`) && !PKG_IGNORED.test(f.slice(p.dir.length + 1))) changed.add(p.name);
    for (const o of OUTSIDE) if (f.startsWith(o.prefix)) for (const n of o.packages) if (pkgs.some((p) => p.name === n)) changed.add(n);
  }
  // A package that depends on a changed package changes with it (its dist/ re-exports or uses it).
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of pkgs)
      if (p.name !== APP_NAME && !changed.has(p.name) && p.deps.some((d) => changed.has(d))) {
        changed.add(p.name);
        grew = true;
      }
  }
  if (changed.size === 0) return { all: false, files: [] };

  const exists = (f: string) => sources.has(f) || changed.has(f);
  const resolve = (from: string, spec: string) => {
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    return [base, ...[".ts", ".tsx", ".mts", ".js", ".jsx"].map((e) => base + e), ...["ts", "tsx"].map((e) => `${base}/index.${e}`)].find(exists);
  };
  /** Who imports each node: file -> the files that name it. */
  const importers = new Map<string, string[]>();
  for (const [file, text] of sources)
    for (const spec of specifiers(text)) {
      const to = spec.startsWith(".") ? resolve(file, spec) : packageOf(spec, pkgs);
      if (to && to !== file) importers.set(to, [...(importers.get(to) ?? []), file]);
    }
  const reached = new Set(changed);
  for (const queue = [...changed]; queue.length; )
    for (const by of importers.get(queue.pop()!) ?? []) if (!reached.has(by)) reached.add(by), queue.push(by);
  // The preview wraps every story and `.storybook/main.ts` sets what the build carries: a change that reaches either, at
  // any depth, through app modules or workspace packages (the renderer, for the asset manifest), reaches every story.
  if ([...reached].some((f) => f.startsWith(`${APP}/.storybook/`))) return ALL;
  return { all: false, files: [...reached].filter((f) => f.startsWith(`${APP}/src/`) && f.endsWith(".stories.tsx") && sources.has(f)).sort() };
}

/** The story ids of `index.json` whose `importPath` (from the app's directory) is one of `files` (from the repository root). */
export function storyIds(index: { entries: Record<string, { id: string; type: string; importPath?: string }> }, files: string[]): string[] {
  const want = new Set(files);
  return Object.values(index.entries)
    .filter((e) => e.type === "story" && e.importPath && want.has(posix.join(APP, e.importPath)))
    .map((e) => e.id)
    .sort();
}

/**
 * The wrap-sweep shards of a pull request: one per SHARD_FILES story files, at most MAX_SHARDS, and MAX_SHARDS for every
 * story, as the merge queue and main do (test.yaml, SWEEP-SPEED). Each shard pays its setup and the Storybook build (about 4 to
 * 5 min: the header-sweep job, which adds three short checks, takes 6.0 min p50), then about 15 s a story file (a full shard,
 * 52 files of the 210, takes 17.2 min p50): 20 files keep a shard near 10 min.
 */
export const SHARD_FILES = 20;
export const MAX_SHARDS = 10;
export function shardCount(s: Selection): number {
  return s.all ? MAX_SHARDS : Math.min(MAX_SHARDS, Math.max(1, Math.ceil(s.files.length / SHARD_FILES)));
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "select" && rest.length === 1) {
    const files = readFileSync(rest[0]!, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    // The API lists at most 3000 files of a pull request: a longer list may miss some, so every story.
    const s = files.length >= 3000 ? { all: true, files: [] } : selectStories(files, storySources());
    const n = shardCount(s);
    const mode = s.all ? "all" : s.files.length ? "some" : "none";
    console.error(`Wrap sweep: ${mode}${s.all ? "" : `, ${s.files.length} story file(s)`} from ${files.length} changed file(s); ${n} shard(s).`);
    for (const f of s.files) console.error(`  ${f}`);
    console.log(`stories=${mode}`);
    console.log(`story_files=${JSON.stringify(s.files)}`);
    console.log(`shards=${JSON.stringify(Array.from({ length: n }, (_, k) => k + 1))}`);
    console.log(`shard_count=${n}`);
  } else if (cmd === "ids" && rest.length === 2) {
    const ids = storyIds(JSON.parse(readFileSync(rest[0]!, "utf8")), JSON.parse(readFileSync(rest[1]!, "utf8")));
    if (ids.length) console.log(ids.join("\n"));
  } else {
    console.error("usage: stories.mts select <changed.txt> | stories.mts ids <index.json> <files.json>");
    process.exit(2);
  }
}
