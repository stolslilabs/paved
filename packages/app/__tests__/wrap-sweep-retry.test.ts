import { describe, expect, it, vi } from "vitest";
import { isNavigationTimeout, renderWithRetry, sweepStory } from "../scripts/wrap-sweep-retry.ts";

const TIMEOUT = "page.goto: Timeout 30000ms exceeded.";

/** `attempt` that answers with the given results in turn; pages are numbers, a fresh one is the next number. */
function run(results: (string | null)[]) {
  const attempt = vi.fn(async (_page: number) => results.shift() ?? null);
  const fresh = vi.fn(async (old: number) => old + 1);
  const log = vi.fn();
  return { attempt, fresh, log, done: renderWithRetry(0, attempt, fresh, log, "ui-button--loading 360") };
}

describe("wrap sweep retry", () => {
  it("only a goto timeout is a navigation timeout", () => {
    expect(isNavigationTimeout(TIMEOUT)).toBe(true);
    expect(isNavigationTimeout("page.waitForFunction: Timeout 60000ms exceeded.")).toBe(false);
    expect(isNavigationTimeout("errored: boom")).toBe(false);
    expect(isNavigationTimeout(null)).toBe(false);
  });

  it("a navigation that times out once then succeeds is clean, on a fresh page, and logged", async () => {
    const r = run([TIMEOUT, null]);
    expect(await r.done).toEqual({ error: null, page: 1 });
    expect(r.attempt.mock.calls.map(([p]) => p)).toEqual([0, 1]);
    expect(r.log).toHaveBeenCalledWith("retried after navigation timeout: ui-button--loading 360");
  });

  it("a second timeout is a finding", async () => {
    const r = run([TIMEOUT, TIMEOUT]);
    expect(await r.done).toEqual({ error: TIMEOUT, page: 1 });
    expect(r.attempt).toHaveBeenCalledTimes(2);
  });

  it("a clean story and any other error are not retried", async () => {
    for (const result of [null, "errored: boom", "page.waitForFunction: Timeout 60000ms exceeded."]) {
      const r = run([result]);
      expect(await r.done).toEqual({ error: result, page: 0 });
      expect(r.attempt).toHaveBeenCalledTimes(1);
      expect(r.fresh).not.toHaveBeenCalled();
      expect(r.log).not.toHaveBeenCalled();
    }
  });
});

describe("sweepStory", () => {
  function deps(renders: (string | null)[], inspected: { kind: string; element: string }[]) {
    return {
      render: vi.fn(async (_page: number, _id: string) => renders.shift() ?? null),
      fresh: vi.fn(async (old: number) => old + 1),
      setWidth: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      inspect: vi.fn(async () => inspected),
      wait: vi.fn(async () => {}),
      log: vi.fn(),
    };
  }
  const overflow = { kind: "overflow", element: 'div "Too long"' };

  it("a real wrap finding is reported at each width and the navigation is not retried", async () => {
    const d = deps([null], [overflow]);
    const { findings } = await sweepStory(0, "ui-button--loading", [360, 320], d);
    expect(findings).toEqual([
      { story: "ui-button--loading", width: 360, ...overflow },
      { story: "ui-button--loading", width: 320, ...overflow },
    ]);
    expect(d.render).toHaveBeenCalledTimes(1);
    expect(d.fresh).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
  });

  it("a timeout then a wrap finding: retried once, the finding still reported", async () => {
    const d = deps([TIMEOUT, null], [overflow]);
    const { page, findings } = await sweepStory(0, "s", [360], d);
    expect(page).toBe(1);
    expect(findings).toEqual([{ story: "s", width: 360, ...overflow }]);
    expect(d.render).toHaveBeenCalledTimes(2);
  });

  it("a timeout then a clean story has no finding; two timeouts are an error finding at each width", async () => {
    expect((await sweepStory(0, "s", [360, 320], deps([TIMEOUT, null], []))).findings).toEqual([]);
    const d = deps([TIMEOUT, TIMEOUT], []);
    const { findings } = await sweepStory(0, "s", [360, 320], d);
    expect(findings.map((f) => [f.width, f.kind, f.element])).toEqual([
      [360, "error", TIMEOUT],
      [320, "error", TIMEOUT],
    ]);
    expect(d.inspect).not.toHaveBeenCalled();
  });
});
