import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThrottled } from "../src/core/interaction";

describe("createThrottled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires immediately on first call", () => {
    const fn = vi.fn();
    const throttled = createThrottled(fn, 50);

    throttled(1, 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it("suppresses calls within the throttle window", () => {
    const fn = vi.fn();
    const throttled = createThrottled(fn, 50);

    throttled(); // fires immediately
    throttled(); // suppressed
    throttled(); // suppressed
    throttled(); // suppressed

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires trailing call after throttle window expires", () => {
    const fn = vi.fn();
    const throttled = createThrottled(fn, 50);

    throttled("a"); // fires immediately
    throttled("b"); // suppressed, queued as trailing
    throttled("c"); // replaces trailing

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);

    // Trailing call should fire with last args
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("allows a new call after throttle window", () => {
    const fn = vi.fn();
    const throttled = createThrottled(fn, 50);

    throttled(); // fires
    vi.advanceTimersByTime(51);

    throttled(); // fires — window expired
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("limits high-frequency calls to expected rate", () => {
    const fn = vi.fn();
    const throttled = createThrottled(fn, 50);

    // Simulate 20 calls over 200ms
    for (let i = 0; i < 20; i++) {
      throttled(i);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(50); // flush trailing

    // At 50ms throttle over 200ms: ~4-5 calls max
    expect(fn.mock.calls.length).toBeLessThanOrEqual(6);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
