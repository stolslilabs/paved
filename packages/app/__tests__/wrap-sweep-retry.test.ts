import { describe, expect, it, vi } from "vitest";
import { isNavigationTimeout, renderWithRetry } from "../scripts/wrap-sweep-retry.ts";

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
