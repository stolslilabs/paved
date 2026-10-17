/**
 * What a change touches (GUARDS, P-71): from the files changed since the merge base with origin/main, the workspace
 * packages to typecheck and test, their guard tests, whether the contracts' format is checked, and which Vercel
 * projects to build. `scripts/check/check.mts` (the root `check`) and `.githooks/pre-push` read it.
 *
 * The rules follow the CI's `Detect changes` (.github/workflows/test.yaml) and the census of P-71: a CORE change of
 * the ABIs or the deployment files touches the indexer, @paved/chain and @paved/game-core, though it is outside
 * packages/.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./vercel-build.mts";

export interface Pkg {
  name: string;
  dir: string;
  /** The workspace packages it depends on. */
  deps: string[];
}

/** The workspace packages of packages/*, read from their package.json. */
export function workspace(root = ROOT): Pkg[] {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      try {
        const json = JSON.parse(readFileSync(join(root, "packages", d.name, "package.json"), "utf8"));
        const all = { ...json.dependencies, ...json.devDependencies } as Record<string, string>;
        return [{ name: json.name as string, dir: `packages/${d.name}`, deps: Object.keys(all).filter((k) => k.startsWith("@paved/")) }];
      } catch {
        return [];
      }
    });
}

/**
 * The guard tests: the fast tests that hold a package to what another part of the repository hands it (the ABIs, the
 * deployment file, the rules' goldens). The census of P-71 found 70 of 134 failed CI jobs on CORE pull requests that
 * broke one of these. Paths from the package's directory.
 */
export const GUARD_TESTS: Record<string, string[]> = {
  "@paved/indexer": ["src/events.test.ts", "src/deployment.test.ts"],
  "@paved/chain": [
    "test/codec.test.ts",
    "test/events.test.ts",
    "test/economy.test.ts",
    "test/controller.test.ts",
    "test/deployment.test.ts",
    "test/fixtures.test.ts",
    "test/review.test.ts",
  ],
  "@paved/game-core": ["__tests__/engine-parity.test.ts"],
};

/** The heap cap of each package's tests, from AGENTS.md ("Node test peaks"): 1.5x the measured peak. */
export const TEST_HEAP_MB: Record<string, number> = {
  "@paved/game-core": 384,
  "@paved/chain": 448,
  "@paved/renderer": 384,
  "@paved/ui": 384,
  "@paved/app-web": 1536,
  "@paved/app": 1536,
  "@paved/app-native": 256,
  "@paved/indexer": 384,
};

/** Paths outside packages/ that touch packages, as prefixes. */
const OUTSIDE: Array<{ prefix: string; packages: string[] }> = [
  { prefix: "contracts/abis/", packages: ["@paved/indexer", "@paved/chain", "@paved/game-core"] },
  { prefix: "contracts/deployments/", packages: ["@paved/indexer", "@paved/chain", "@paved/game-core"] },
  { prefix: "contracts/fixtures/", packages: ["@paved/game-core"] },
  { prefix: "contracts/src/structure/tables.cairo", packages: ["@paved/game-core"] },
  { prefix: "contracts/src/tests/golden/", packages: ["@paved/game-core"] },
  { prefix: "contracts/src/tests/differential.cairo", packages: ["@paved/game-core"] },
];
/** Root files every package reads: a change of one touches them all. */
const EVERYTHING = ["bun.lock", "package.json", "turbo.json", "tsconfig.base.json"];

/** `names` with every package after the workspace packages it depends on (ties by name). */
export function topological(names: string[], pkgs: Pkg[]): string[] {
  const out: string[] = [];
  const visit = (name: string, path: string[]) => {
    if (out.includes(name) || path.includes(name)) return;
    for (const dep of [...(pkgs.find((x) => x.name === name)?.deps ?? [])].sort()) if (names.includes(dep)) visit(dep, [...path, name]);
    out.push(name);
  };
  for (const name of [...names].sort()) visit(name, []);
  return out;
}

export interface Plan {
  files: string[];
  /** The packages the change is in (or reaches from outside packages/), sorted. */
  touched: string[];
  /** `touched` and every package that depends on one of them, sorted: what `check` typechecks and tests. */
  reach: string[];
  /** contracts/** changed: `scarb fmt --check`. */
  contracts: boolean;
  /** The Vercel projects whose inputs changed (scripts/vercel/ignore-build.sh --paths). */
  vercel: Array<"client" | "storybook">;
  /** The guard tooling itself changed (scripts/check, scripts/vercel, .githooks): its own tests run. */
  guards: boolean;
}

const under = (file: string, path: string) => file === path || file.startsWith(path.endsWith("/") ? path : `${path}/`);

/**
 * Whether a file is among a project's inputs, read as git reads the ignore step's pathspecs: a plain entry is a path
 * and everything under it; `:(exclude)<path>` and `:(exclude,glob)<pattern>` take files back out (in a glob, `**` spans
 * directories, `*` stays within one).
 */
export function isInput(file: string, pathspecs: string[]): boolean {
  const glob = (pattern: string) =>
    new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?")}$`);
  const excluded = pathspecs.some((spec) => {
    const m = /^:\(exclude(,glob)?\)(.*)$/.exec(spec);
    if (!m) return false;
    return m[1] ? glob(m[2]!).test(file) : under(file, m[2]!);
  });
  return !excluded && pathspecs.some((spec) => !spec.startsWith(":(") && under(file, spec));
}

/** The inputs of a Vercel project, from the ignore step, so the two never disagree. */
export function vercelInputs(project: "client" | "storybook", root = ROOT): string[] {
  return execFileSync("sh", [join(root, "scripts/vercel/ignore-build.sh"), "--paths", project], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

export function plan(files: string[], pkgs: Pkg[] = workspace(), inputs = { client: vercelInputs("client"), storybook: vercelInputs("storybook") }): Plan {
  const touched = new Set<string>();
  const all = files.some((f) => EVERYTHING.includes(f) || /^tsconfig[^/]*\.json$/.test(f));
  for (const f of files) {
    for (const p of pkgs) if (all || under(f, p.dir)) touched.add(p.name);
    for (const o of OUTSIDE) if (f.startsWith(o.prefix)) for (const n of o.packages) if (pkgs.some((p) => p.name === n)) touched.add(n);
  }
  const reach = new Set(touched);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of pkgs)
      if (!reach.has(p.name) && p.deps.some((d) => reach.has(d))) {
        reach.add(p.name);
        grew = true;
      }
  }
  return {
    files,
    touched: [...touched].sort(),
    reach: [...reach].sort(),
    contracts: files.some((f) => f.startsWith("contracts/")),
    vercel: (["client", "storybook"] as const).filter((v) => files.some((f) => isInput(f, inputs[v]))),
    guards: files.some((f) => f.startsWith("scripts/check/") || f.startsWith("scripts/vercel/") || f.startsWith(".githooks/")),
  };
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/**
 * The files changed between the merge base of `base` (origin/main) and `head`, plus, when `head` is the working tree,
 * the uncommitted and untracked ones. Without rename detection, so a moved file names both its old and new place. Null when the merge base cannot be found: the caller then checks everything.
 */
export function changedFiles(base = process.env.PAVED_CHECK_BASE || "origin/main", head?: string): string[] | null {
  try {
    const mb = git("merge-base", base, head ?? "HEAD");
    const files = new Set(git("diff", "--name-only", "--no-renames", mb, head ?? "HEAD").split("\n"));
    if (!head) {
      for (const f of git("diff", "--name-only", "--no-renames", "HEAD").split("\n")) files.add(f);
      for (const f of git("ls-files", "--others", "--exclude-standard").split("\n")) files.add(f);
    }
    files.delete("");
    return [...files].sort();
  } catch {
    return null;
  }
}
