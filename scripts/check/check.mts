/**
 * One local command that mirrors the CI's fast jobs (GUARDS, P-71): `bun run check` (alias `bun run check:pr`).
 *
 *   node scripts/check/check.mts [--all] [--pre-push [--head <sha>]]
 *
 * From the files changed since the merge base with origin/main (scripts/check/touched.mts), in order:
 *
 * 1. format: `scarb fmt --check` when contracts/ changed and scarb is on PATH (never a Cairo build). There is no
 *    TypeScript formatter in the repository; the CI has none either.
 * 2. lint: `bun run lint` (turbo; no package has a lint script today, so it passes at once until one does).
 * 3. typecheck: the touched packages and every package that depends on one, after their workspace dependencies are
 *    built (turbo's cache makes that instant when nothing changed).
 * 4. guard tests: the tests that hold a package to the ABIs, the deployment file and the goldens (GUARD_TESTS), and the
 *    guards' own tests.
 * 5. unit tests: the whole test script of each package typechecked, under its heap cap of AGENTS.md.
 * 6. the client's Vercel build (packages/app/vercel.json, Sepolia env), then the bundle budget with its margins, then
 *    the Storybook's Vercel build (the root vercel.json), each only when that project's inputs changed.
 *
 * `--pre-push` (the hook in .githooks/pre-push) runs 1, 3 and 4 for the touched packages only, on the pushed commit.
 * `--all` checks everything, as if every file had changed. Every step runs even after a failure, so one run says all
 * that is wrong; the last line is one summary: pass or fail, each step and its time. No secret, no network beyond the
 * package registry (the install of the Vercel commands).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { GUARD_TESTS, TEST_HEAP_MB, changedFiles, plan, workspace, type Plan } from "./touched.mts";
import { PROJECTS, ROOT, vercelBuild } from "./vercel-build.mts";

type Outcome = "ok" | "FAIL" | "skip";
interface Step {
  name: string;
  outcome: Outcome;
  ms: number;
  note?: string;
}

const args = process.argv.slice(2);
const prePush = args.includes("--pre-push");
const everything = args.includes("--all");
const headAt = args.indexOf("--head");
const head = headAt >= 0 ? args[headAt + 1] : undefined;

const steps: Step[] = [];
const started = Date.now();

function step(name: string, run: () => Outcome | { outcome: Outcome; note?: string }): void {
  console.log(`\n=== check: ${name}`);
  const t = Date.now();
  let r: { outcome: Outcome; note?: string };
  try {
    const out = run();
    r = typeof out === "string" ? { outcome: out } : out;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    r = { outcome: "FAIL" };
  }
  steps.push({ name, ...r, ms: Date.now() - t });
}
const skip = (note: string) => ({ outcome: "skip" as const, note });

/** Runs a command with an argument list from `cwd` (the root by default); ok when it exits 0. */
function sh(cmd: string, argv: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Outcome {
  console.log(`$ ${[cmd, ...argv].join(" ")}${opts.cwd ? `   (in ${opts.cwd})` : ""}`);
  const r = spawnSync(cmd, argv, { cwd: join(ROOT, opts.cwd ?? "."), env: { ...process.env, ...opts.env }, stdio: "inherit" });
  if (r.error) console.error(r.error.message);
  return r.status === 0 ? "ok" : "FAIL";
}
const all = (outcomes: Outcome[]): Outcome => (outcomes.includes("FAIL") ? "FAIL" : "ok");
const onPath = (bin: string) => spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
const heap = (pkg: string) => ({ NODE_OPTIONS: `--max-old-space-size=${TEST_HEAP_MB[pkg] ?? 1536}` });
const secs = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`);

// 0. What changed.
const pkgs = workspace();
let p: Plan = plan([]);
step("changes", () => {
  const files = everything ? null : changedFiles(undefined, head);
  if (files === null) {
    console.log(everything ? "--all: checking everything" : "no merge base with origin/main: checking everything");
    p = { ...plan(["bun.lock", "contracts/", "scripts/check/"]), files: [] };
    p.vercel = ["client", "storybook"];
    return { outcome: "ok", note: "everything" };
  }
  p = plan(files);
  console.log(`${files.length} file(s) changed since the merge base with ${process.env.PAVED_CHECK_BASE || "origin/main"}${head ? ` (to ${head.slice(0, 8)})` : " (working tree included)"}`);
  console.log(`touched: ${p.touched.join(", ") || "no package"}`);
  if (!prePush) console.log(`with their dependents: ${p.reach.join(", ") || "none"}`);
  console.log(`contracts: ${p.contracts ? "changed" : "unchanged"}; Vercel projects: ${p.vercel.join(", ") || "none"}; guard tooling: ${p.guards ? "changed" : "unchanged"}`);
  return { outcome: "ok", note: `${p.touched.length} pkg` };
});
const typed = prePush ? p.touched : p.reach;

// 1. Format.
step("format", () => {
  if (!p.contracts) return skip("no contracts change");
  if (!onPath("scarb")) {
    console.log("scarb is not on PATH: the contracts' format is not checked here (the CI checks it)");
    return skip("scarb absent");
  }
  return sh("scarb", ["fmt", "--check"], { cwd: "contracts" });
});

// 2. Lint.
if (!prePush) step("lint", () => sh("bun", ["run", "lint"]));

// 3. Typecheck.
step("typecheck", () => {
  if (typed.length === 0) return skip("no package");
  const deps = [...new Set(typed.flatMap((n) => pkgs.find((x) => x.name === n)?.deps ?? []))].filter((d) => !typed.includes(d));
  const outcomes: Outcome[] = [];
  // The workspace dependencies' dist/, which the packages' types import (turbo replays them when unchanged).
  if (deps.length > 0) outcomes.push(sh("bun", ["run", "build", ...deps.map((d) => `--filter=${d}`)]));
  const tsc = join(ROOT, "node_modules/.bin/tsc");
  for (const name of typed) {
    const dir = pkgs.find((x) => x.name === name)!.dir;
    outcomes.push(name === "@paved/indexer" ? sh(tsc, ["-p", `${dir}/tsconfig.json`, "--noEmit"]) : sh(tsc, ["-b", dir]));
  }
  return { outcome: all(outcomes), note: `${typed.length} pkg` };
});

// 4. Guard tests.
step("guard tests", () => {
  const outcomes: Outcome[] = [];
  let n = 0;
  for (const name of p.touched) {
    const files = GUARD_TESTS[name];
    if (!files) continue;
    n++;
    outcomes.push(sh("bun", ["run", "test", ...files], { cwd: pkgs.find((x) => x.name === name)!.dir, env: heap(name) }));
  }
  if (p.guards || !prePush) {
    n++;
    outcomes.push(sh("node", ["--test", "scripts/check/touched.test.mts"]));
    outcomes.push(sh("sh", ["scripts/vercel/ignore-build.test.sh"]));
  }
  return n === 0 ? skip("none touched") : { outcome: all(outcomes), note: `${n} set(s)` };
});

if (!prePush) {
  // 5. Unit tests.
  step("unit tests", () => {
    if (p.reach.length === 0) return skip("no package");
    const outcomes = p.reach.map((name) => sh("bun", ["run", "test"], { cwd: pkgs.find((x) => x.name === name)!.dir, env: heap(name) }));
    return { outcome: all(outcomes), note: `${p.reach.length} pkg` };
  });

  // 6. The Vercel builds, one at a time, and the budget of the client's build.
  let clientBuilt = false;
  step("vercel client", () => {
    if (!p.vercel.includes("client")) return skip("inputs unchanged");
    const outcome: Outcome = vercelBuild(PROJECTS.client) === 0 ? "ok" : "FAIL";
    clientBuilt = outcome === "ok";
    return outcome;
  });
  step("budget", () => {
    if (!clientBuilt) return skip(p.vercel.includes("client") ? "no client build" : "inputs unchanged");
    return sh("node", ["scripts/check/budget.mts"]);
  });
  step("vercel storybook", () => {
    if (!p.vercel.includes("storybook")) return skip("inputs unchanged");
    // The client's install already ran: the same command, from the same lockfile.
    return vercelBuild(PROJECTS.storybook, !clientBuilt) === 0 ? "ok" : "FAIL";
  });
}

const failed = steps.filter((s) => s.outcome === "FAIL");
const line = steps.map((s) => `${s.name} ${s.outcome === "skip" ? `skip (${s.note})` : `${s.outcome} ${secs(s.ms)}`}`).join(" | ");
console.log(`\ncheck${prePush ? " (pre-push)" : ""}: ${failed.length ? "FAIL" : "PASS"} in ${secs(Date.now() - started)} | ${line}`);
process.exit(failed.length ? 1 : 0);
