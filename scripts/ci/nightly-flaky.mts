/**
 * The nightly run's report (FLAKY-QUARANTINE, #1128; `.github/workflows/nightly.yaml`). It reads the vitest JSON reports of
 * the night's runs (`--reporter=json`), lists every test that failed at least once, and for each: a comment on its open issue
 * labelled `flaky`, or a new issue. An issue is found by the key in its body (`<!-- flaky-key: <file> > <test> -->`), so a
 * renamed title still matches, and an issue opened by hand is found when its body carries the key.
 *
 *   node scripts/ci/nightly-flaky.mts <report.json>...     (GH_TOKEN, GITHUB_REPOSITORY, and GITHUB_RUN_URL for the link)
 *   node scripts/ci/nightly-flaky.mts --dry-run <report.json>...   prints what it would write, calls nothing
 *
 * It never fails the run for a failed test: the nightly blocks nothing. Its tests: `node --test scripts/ci/nightly-flaky.test.mts`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LABEL = "flaky";

/** The part of vitest's JSON report read here (its jest-compatible shape). */
export interface Report {
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: { title: string; ancestorTitles: string[]; status: string; failureMessages?: string[] }[];
  }[];
}

/** A test that failed at least once in the night, with each failure's run and first line. */
export interface Failure {
  /** `<file> > <describe> > ... > <test>`: the issue's key. A file that failed to load is `<file>` alone. */
  key: string;
  file: string;
  test: string;
  /** The runs it failed in (the reports' names: `app-1`, `chain`...) and its first message line in each. */
  runs: { run: string; message: string }[];
  /** How many of the night's reports ran its file. */
  ranIn: number;
}

/** The first non-empty line of a failure, without colour codes, cut to 300 characters. */
export function firstLine(message: string | undefined): string {
  const line = (message ?? "").replace(/\x1b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim() !== "") ?? "";
  return line.trim().slice(0, 300);
}

/** Every test that failed in at least one report, in a stable order. `root` makes the files relative to the repository. */
export function failures(reports: { run: string; report: Report }[], root: string): Failure[] {
  const byKey = new Map<string, Failure>();
  const ran = new Map<string, number>();
  for (const { run, report } of reports) {
    for (const file of report.testResults) {
      const path = relative(root, file.name);
      ran.set(path, (ran.get(path) ?? 0) + 1);
      const failed = file.assertionResults.filter((a) => a.status === "failed");
      // A file that failed with no failed test (its import, a hook outside the tests): the file is the key.
      const entries =
        failed.length > 0
          ? failed.map((a) => ({ test: [...a.ancestorTitles, a.title].join(" > "), message: firstLine(a.failureMessages?.[0]) }))
          : file.status === "failed"
            ? [{ test: "", message: firstLine(file.message) }]
            : [];
      for (const e of entries) {
        const key = e.test ? `${path} > ${e.test}` : path;
        const f = byKey.get(key) ?? { key, file: path, test: e.test, runs: [], ranIn: 0 };
        f.runs.push({ run, message: e.message });
        byKey.set(key, f);
      }
    }
  }
  for (const f of byKey.values()) f.ranIn = ran.get(f.file) ?? 0;
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** A key as its marker holds it: `--` cannot appear in an HTML comment (a test name could hold it). */
const markerKey = (key: string): string => key.replaceAll("--", "- -");

/** The marker an issue's body carries. */
export const marker = (key: string): string => `<!-- flaky-key: ${markerKey(key)} -->`;

/** An issue's title: GitHub takes 256 characters, a test's full name can be longer (the indexer's schema test). */
export function title(f: Failure): string {
  const full = `FLAKY: ${f.key}`;
  return full.length <= 200 ? full : `${full.slice(0, 199)}…`;
}

/** What the night says of one test: its runs and messages, with the run's link. */
export function nightNote(f: Failure, runUrl: string): string {
  const lines = f.runs.map((r) => `- \`${r.run}\`: ${r.message ? `\`${r.message.replaceAll("`", "'")}\`` : "(no message)"}`);
  return [`Failed ${f.runs.length} of ${f.ranIn} nightly run(s) of its file: ${runUrl}`, "", ...lines].join("\n");
}

export function issueBody(f: Failure, runUrl: string): string {
  return [
    marker(f.key),
    `A test that failed in the nightly run (\`.github/workflows/nightly.yaml\`) without a change of its own: R7 of AGENTS.md ("Flaky tests").`,
    "",
    `- File: \`${f.file}\``,
    f.test ? `- Test: ${f.test}` : "- The file failed outside its tests (its import or a hook).",
    "",
    nightNote(f, runUrl),
    "",
    "Confirm it (its file 10 times under its heap cap, `PAVED_TEST_SLOW` unset), then quarantine it (`it.skip` under a `// FLAKY(#<this issue>)` line) or fix the race.",
  ].join("\n");
}

/** The open issues labelled `flaky`, by the key their body carries (as its marker holds it). */
export function issuesByKey(issues: { number: number; body: string | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of issues) {
    const m = /<!-- flaky-key: (.*?) -->/.exec(i.body ?? "");
    if (m && !out.has(m[1]!)) out.set(m[1]!, i.number);
  }
  return out;
}

/** For each failure: comment on its issue, or open one. */
export function plan(fs: Failure[], open: Map<string, number>, runUrl: string): ({ kind: "comment"; issue: number; body: string } | { kind: "create"; title: string; body: string })[] {
  return fs.map((f) => {
    const issue = open.get(markerKey(f.key));
    return issue !== undefined ? { kind: "comment", issue, body: nightNote(f, runUrl) } : { kind: "create", title: title(f), body: issueBody(f, runUrl) };
  });
}

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}

function main(argv: string[]): number {
  const dry = argv[0] === "--dry-run";
  const files = (dry ? argv.slice(1) : argv).filter((f) => {
    if (existsSync(f)) return true;
    // A run that died before writing its report (an out-of-memory worker): said, not fatal; the job's log has the rest.
    console.log(`${f}: no report (the run stopped before writing it)`);
    return false;
  });
  const reports = files.map((f) => ({ run: f.replace(/^.*\//, "").replace(/\.json$/, ""), report: JSON.parse(readFileSync(f, "utf8")) as Report }));
  const found = failures(reports, process.cwd());
  console.log(`${found.length} test(s) failed at least once in ${reports.length} report(s)`);
  for (const f of found) console.log(`- ${f.key}: ${f.runs.length} of ${f.ranIn}`);
  if (found.length === 0) return 0;
  const runUrl = process.env.GITHUB_RUN_URL ?? "(no run URL)";
  const open = dry
    ? new Map<string, number>()
    : issuesByKey(JSON.parse(gh(["issue", "list", "--label", LABEL, "--state", "open", "--limit", "500", "--json", "number,body"])) as { number: number; body: string }[]);
  for (const step of plan(found, open, runUrl)) {
    if (dry) {
      console.log(step.kind === "comment" ? `would comment on #${step.issue}` : `would open "${step.title}"`);
      continue;
    }
    if (step.kind === "comment") gh(["issue", "comment", String(step.issue), "--body-file", "-"], step.body);
    else gh(["issue", "create", "--label", LABEL, "--title", step.title, "--body-file", "-"], step.body);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
