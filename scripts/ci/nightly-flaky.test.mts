/** The nightly run's report (scripts/ci/nightly-flaky.mts, #1128): `node --test scripts/ci/nightly-flaky.test.mts`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { failures, firstLine, issueBody, issuesByKey, marker, plan, title, type Report } from "./nightly-flaky.mts";

const ROOT = "/repo";
const file = (name: string, tests: [string[], string, string, string?][], status = "passed", message?: string): Report["testResults"][number] => ({
  name: `${ROOT}/${name}`,
  status,
  message,
  assertionResults: tests.map(([ancestorTitles, title, s, m]) => ({ ancestorTitles, title, status: s, failureMessages: m ? [m] : [] })),
});
const OVER = "packages/app/__tests__/over-board-retry.test.tsx";

test("lists each test that failed at least once, with the runs it failed in, out of the runs of its file", () => {
  const run = (failed: boolean): Report => ({
    testResults: [
      file(OVER, [[["OverScene"], "loads the board", failed ? "failed" : "passed", 'TestingLibraryElementError: Unable to find role="img"\n  at x']], failed ? "failed" : "passed"),
      file("packages/app/__tests__/a.test.tsx", [[[], "passes", "passed"], [[], "skipped", "skipped"]]),
    ],
  });
  const fs = failures([{ run: "app-1", report: run(true) }, { run: "app-2", report: run(false) }, { run: "app-3", report: run(true) }], ROOT);
  assert.deepEqual(fs, [
    {
      key: `${OVER} > OverScene > loads the board`,
      file: OVER,
      test: "OverScene > loads the board",
      runs: [
        { run: "app-1", message: 'TestingLibraryElementError: Unable to find role="img"' },
        { run: "app-3", message: 'TestingLibraryElementError: Unable to find role="img"' },
      ],
      ranIn: 3,
    },
  ]);
});

test("a file that failed outside its tests (its import) is its own key", () => {
  const fs = failures([{ run: "chain", report: { testResults: [file("packages/chain/src/x.test.ts", [], "failed", "\n\u001b[31mError: Cannot find module\u001b[39m")] } }], ROOT);
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.key, "packages/chain/src/x.test.ts");
  assert.equal(fs[0]!.test, "");
  assert.equal(fs[0]!.runs[0]!.message, "Error: Cannot find module");
  assert.match(issueBody(fs[0]!, "https://run"), /failed outside its tests/);
});

test("a clean night lists nothing", () => {
  assert.deepEqual(failures([{ run: "ui", report: { testResults: [file("packages/ui/a.test.tsx", [[[], "ok", "passed"]])] } }], ROOT), []);
});

test("comments on the open issue whose body carries the test's key, and opens one for a test with none", () => {
  const report: Report = { testResults: [file(OVER, [[["A"], "one", "failed", "boom"], [["A"], "two -- dashes", "failed", "bang"]], "failed")] };
  const [one, two] = failures([{ run: "app-1", report }], ROOT);
  const open = issuesByKey([
    { number: 7, body: `${marker(one!.key)}\nfirst` },
    { number: 9, body: "no key" },
    { number: 8, body: null },
  ]);
  const steps = plan([one!, two!], open, "https://github.com/o/r/actions/runs/1");
  assert.equal(steps[0]!.kind, "comment");
  assert.equal(steps[0]!.kind === "comment" && steps[0]!.issue, 7);
  assert.match(steps[0]!.body, /Failed 1 of 1 nightly run\(s\) of its file: https:\/\/github.com\/o\/r\/actions\/runs\/1/);
  assert.equal(steps[1]!.kind, "create");
  // An HTML comment cannot hold `--`: the key is written without it, and still found the next night.
  assert.ok(!steps[1]!.body.split("\n")[0]!.slice(4, -3).includes("--"));
  assert.equal(issuesByKey([{ number: 3, body: steps[1]!.body }]).size, 1);
  assert.equal(plan([two!], issuesByKey([{ number: 3, body: steps[1]!.body }]), "u")[0]!.kind, "comment");
});

test("a title stays under GitHub's 256 characters", () => {
  const long = failures([{ run: "indexer", report: { testResults: [file("packages/indexer/src/indexer.test.ts", [[["the database"], "x".repeat(400), "failed", "Test timed out in 5000ms."]], "failed")] } }], ROOT);
  assert.ok(title(long[0]!).length <= 200);
  assert.ok(title(long[0]!).startsWith("FLAKY: packages/indexer/src/indexer.test.ts > the database > xxx"));
});

test("a message is its first line, without colours, cut", () => {
  assert.equal(firstLine("\n\n  \u001b[31mAssertionError\u001b[39m: expected 1\nstack"), "AssertionError: expected 1");
  assert.equal(firstLine(undefined), "");
  assert.equal(firstLine("y".repeat(500)).length, 300);
});
