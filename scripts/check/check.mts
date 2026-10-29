/**
 * One local command that mirrors the CI's fast jobs (GUARDS, P-71): `bun run check` (alias `bun run check:pr`).
 *
 *   node scripts/check/check.mts [--all] [--quick] [--pre-push [--head <sha>]]
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
 * `--quick` (`bun run check:quick`, about 3 minutes on a quiet machine) runs 1 to 4 as above, and in 5 the whole suites
 * of the touched packages other than the app, and of the app only the tests selected by quickAppTests: the changed tests
 * and those that import a changed file directly (not the whole import graph; the whole suite when its test setup
 * changed). It skips 6: the Vercel builds, the budget and the Storybook build. All it skips stays in the full check and
 * in the CI.
 * `--pre-push` (the hook in .githooks/pre-push) runs 1, 3 and 4 for the touched packages only, on the pushed commit.
 * `--all` checks everything, as if every file had changed. Every step runs even after a failure, so one run says all
 * that is wrong; the last line is one summary: pass or fail, each step and its time. Exit 0 passes, 2 is a failed check. No secret, no network beyond the
 * package registry (the install of the Vercel commands).
 *
 * One full run per worktree at a time: the builds write shared folders (`packages/app/storybook-static`, `dist`, the
 * Storybook's staged public folder), so two runs in one worktree clobber each other. A ticket file in the worktree's git
 * dir (a bakery lock, see lockWorktree) holds the place of the running check; a second run exits 1 at once, naming it (the
 * files of a dead run are removed). To wait
 * for a run, poll the pid in the message (`kill -0 <pid>`), never `pgrep -f check`: that matches its own shell. The
 * `--pre-push` run takes the same lock (its typecheck builds the shared `dist` folders); when a check holds it, the hook
 * gets exit 1, a crash of the runner, which lets the push through.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { isAbsolute, join } from "node:path";
import { APP_DIR, GUARD_TESTS, TEST_HEAP_MB, appSources, changedFiles, plan, quickAppTests, topological, workspace, type Plan } from "./touched.mts";
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
const quick = args.includes("--quick") && !prePush;
const headAt = args.indexOf("--head");
const head = headAt >= 0 ? args[headAt + 1] : undefined;

const steps: Step[] = [];
const started = Date.now();

/**
 * Takes the worktree's lock, or exits 1 naming the run that holds it. Released on exit.
 *
 * Lamport's bakery, on files in the worktree's git dir, so that no file is ever removed on the strength of a stale read:
 * a run only removes its own files, or those of a pid that is dead. A run raises `check-run.choosing.<pid>`, takes a ticket
 * one above the largest it sees (`check-run.ticket.<n>.<pid>`), lowers its flag, then looks at the other runs: it waits
 * for any run that is still choosing, and gives up (exit 1) when a live run holds a smaller ticket (ties go to the lower
 * pid). The holder of the smallest live ticket runs. No clock or age is read, so a run paused anywhere cannot let two in.
 * A pid reused by an unrelated process is the one case that reads as live.
 */
function lockWorktree(): void {
  const git = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: ROOT, encoding: "utf8" });
  if (git.status !== 0) return; // not a git checkout: nothing to key a lock on
  const gitDir = git.stdout.trim();
  const dir = isAbsolute(gitDir) ? gitDir : join(ROOT, gitDir);
  const choosing = join(dir, `check-run.choosing.${process.pid}`);
  let ticketFile = "";
  const release = () => {
    rmSync(choosing, { force: true });
    if (ticketFile) rmSync(ticketFile, { force: true });
  };
  const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const isAlive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return pid > 0;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "EPERM";
    }
  };
  /** The live runs' files, as { kind, n, pid }; a dead run's files are removed on the way. */
  const entries = () => {
    const out: Array<{ kind: "choosing" | "ticket"; n: number; pid: number }> = [];
    for (const name of readdirSync(dir)) {
      const m = /^check-run\.(?:(choosing)\.(\d+)|ticket\.(\d+)\.(\d+))$/.exec(name);
      if (!m) continue;
      const pid = Number(m[2] ?? m[4]);
      if (pid !== process.pid && !isAlive(pid)) rmSync(join(dir, name), { force: true });
      else out.push({ kind: m[1] ? "choosing" : "ticket", n: Number(m[3] ?? 0), pid });
    }
    return out;
  };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => process.exit(130));

  writeFileSync(choosing, "");
  const n = 1 + Math.max(0, ...entries().filter((e) => e.kind === "ticket").map((e) => e.n));
  ticketFile = join(dir, `check-run.ticket.${n}.${process.pid}`);
  writeFileSync(ticketFile, "");
  rmSync(choosing, { force: true });

  const deadline = Date.now() + 60_000;
  for (;;) {
    const others = entries().filter((e) => e.pid !== process.pid);
    const ahead = others.find((e) => e.kind === "ticket" && (e.n < n || (e.n === n && e.pid < process.pid)));
    if (ahead) {
      console.error(`check: another check is running in this worktree (pid ${ahead.pid}); wait for it (poll \`kill -0 ${ahead.pid}\`) instead of starting a second one.`);
      process.exit(1);
    }
    if (!others.some((e) => e.kind === "choosing")) return;
    if (Date.now() > deadline) {
      console.error("check: another check has been starting for 60 s; not taking the worktree lock.");
      process.exit(1);
    }
    pause(20);
  }
}
lockWorktree();

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
/**
 * The slow profile of the tests (`PAVED_TEST_SLOW`, packages/app/test-slow.ts): set by the caller it is kept as given; else on when
 * the 1-minute load average passes the core count (a loaded machine), off in CI. Read once, when the run starts.
 */
const loaded = !process.env.CI && loadavg()[0] > availableParallelism();
const slowProfile = process.env.PAVED_TEST_SLOW ?? (loaded ? "1" : "");
if (slowProfile) console.log(`PAVED_TEST_SLOW=${slowProfile}: the tests' wait ceilings are scaled${process.env.PAVED_TEST_SLOW ? "" : " (load average above the core count)"}`);
const testEnv = (pkg: string) => ({ ...heap(pkg), ...(slowProfile ? { PAVED_TEST_SLOW: slowProfile } : {}) });
const secs = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`);

// 0. What changed.
const pkgs = workspace();
let p: Plan = plan([]);
let whole = everything;
step("changes", () => {
  const files = everything ? null : changedFiles(undefined, head);
  if (files === null) {
    console.log(everything ? "--all: checking everything" : "no merge base with origin/main: checking everything");
    p = { ...plan(["bun.lock", "contracts/", "scripts/check/"]), files: [] };
    p.vercel = ["client", "storybook"];
    whole = true;
    return { outcome: "ok", note: "everything" };
  }
  p = plan(files);
  console.log(`${files.length} file(s) changed since the merge base with ${process.env.PAVED_CHECK_BASE || "origin/main"}${head ? ` (to ${head.slice(0, 8)})` : " (working tree included)"}`);
  console.log(`touched: ${p.touched.join(", ") || "no package"}`);
  if (!prePush) console.log(`with their dependents: ${p.reach.join(", ") || "none"}`);
  console.log(`contracts: ${p.contracts ? "changed" : "unchanged"}; Vercel projects: ${p.vercel.join(", ") || "none"}; guard tooling: ${p.guards ? "changed" : "unchanged"}`);
  return { outcome: "ok", note: `${p.touched.length} pkg` };
});
// In dependency order: `tsc -b` of a package rewrites the dist/ its dependents' types import.
const typed = topological(prePush ? p.touched : p.reach, pkgs);

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
    outcomes.push(sh("bun", ["run", "test", ...files], { cwd: pkgs.find((x) => x.name === name)!.dir, env: testEnv(name) }));
  }
  if (p.guards || !prePush) {
    n++;
    outcomes.push(sh("node", ["--test", "scripts/check/touched.test.mts"]));
    outcomes.push(sh("sh", ["scripts/vercel/ignore-build.test.sh"]));
  }
  return n === 0 ? skip("none touched") : { outcome: all(outcomes), note: `${n} set(s)` };
});

/**
 * The unit tests of `--quick`: the whole suites of the touched packages but the app (seconds each), and of the app the
 * tests quickAppTests selects. The packages reached only through a dependency are left to the full check.
 */
function quickUnitTests(): { outcome: Outcome; note?: string } {
  const others = p.touched.filter((name) => name !== "@paved/app");
  const outcomes = others.map((name) => sh("bun", ["run", "test"], { cwd: pkgs.find((x) => x.name === name)!.dir, env: testEnv(name) }));
  let app = "";
  if (p.touched.includes("@paved/app")) {
    const sel = whole ? { all: true, tests: [] } : quickAppTests(p.files, appSources());
    const tests = sel.tests.map((t) => t.slice(APP_DIR.length + 1));
    console.log(`app tests: ${sel.all ? "the whole suite" : `${tests.length} selected${tests.length ? `: ${tests.join(", ")}` : ""}`}`);
    if (sel.all || tests.length > 0) outcomes.push(sh("bun", ["run", "test", ...tests], { cwd: APP_DIR, env: testEnv("@paved/app") }));
    app = sel.all ? "app all" : `app ${tests.length} file(s)`;
  }
  if (outcomes.length === 0) return skip(p.touched.length ? "no app test selected" : "no package");
  return { outcome: all(outcomes), note: [others.length ? `${others.length} pkg` : "", app].filter(Boolean).join(", ") };
}

if (!prePush) {
  // 5. Unit tests.
  step("unit tests", () => {
    if (quick) return quickUnitTests();
    if (p.reach.length === 0) return skip("no package");
    const outcomes = p.reach.map((name) => sh("bun", ["run", "test"], { cwd: pkgs.find((x) => x.name === name)!.dir, env: testEnv(name) }));
    return { outcome: all(outcomes), note: `${p.reach.length} pkg` };
  });

  // 6. The Vercel builds, one at a time, and the budget of the client's build.
  let clientBuilt = false;
  step("vercel client", () => {
    if (quick) return skip("--quick");
    if (!p.vercel.includes("client")) return skip("inputs unchanged");
    const outcome: Outcome = vercelBuild(PROJECTS.client) === 0 ? "ok" : "FAIL";
    clientBuilt = outcome === "ok";
    return outcome;
  });
  step("budget", () => {
    if (quick) return skip("--quick");
    if (!clientBuilt) return skip(p.vercel.includes("client") ? "no client build" : "inputs unchanged");
    return sh("node", ["scripts/check/budget.mts"]);
  });
  step("vercel storybook", () => {
    if (quick) return skip("--quick");
    if (!p.vercel.includes("storybook")) return skip("inputs unchanged");
    // The client's install already ran: the same command, from the same lockfile.
    return vercelBuild(PROJECTS.storybook, !clientBuilt) === 0 ? "ok" : "FAIL";
  });
}

const failed = steps.filter((s) => s.outcome === "FAIL");
const line = steps.map((s) => `${s.name} ${s.outcome === "skip" ? `skip (${s.note})` : `${s.outcome} ${secs(s.ms)}`}`).join(" | ");
console.log(`\ncheck${prePush ? " (pre-push)" : quick ? " (quick)" : ""}: ${failed.length ? "FAIL" : "PASS"} in ${secs(Date.now() - started)} | ${line}`);
// 2 is a failed check; any other non-zero exit is a crash of the runner, which the pre-push hook lets through.
process.exit(failed.length ? 2 : 0);
