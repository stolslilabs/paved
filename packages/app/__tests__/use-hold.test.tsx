import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_MS } from "../src/lib/haptics";
import { HOLD_MS, useHold, type HoldOptions } from "../src/lib/use-hold";

// TILE-HOLD (#630): the hold lifted out of `HoldButton`, one controller for every source.
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(options: Partial<HoldOptions> = {}) {
  const onComplete = vi.fn();
  const hook = renderHook((props: Partial<HoldOptions>) => useHold({ onComplete, ...props }), { initialProps: options });
  return { onComplete, hook, hold: () => hook.result.current };
}

describe("useHold", () => {
  it("fills over HOLD_MS and acts once at the end, with the light then the firm tick; completed() says so until the next start", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { onComplete, hold } = setup();
    expect(hold().state).toBe("idle");
    expect(hold().holdMs).toBe(HOLD_MS);
    act(() => void hold().start());
    expect(hold().state).toBe("holding");
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    expect(onComplete).not.toHaveBeenCalled();
    expect(hold().completed()).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(hold().state).toBe("done");
    expect(hold().completed()).toBe(true);
    expect(vibrate.mock.calls).toEqual([[HAPTIC_MS.light], [HAPTIC_MS.firm]]);
    act(() => hold().release());
    expect(hold().state).toBe("idle");
    expect(hold().completed()).toBe(true);
    act(() => void hold().start());
    expect(hold().completed()).toBe(false);
  });

  it("let go or cancelled before the end: nothing happens and the ring rewinds", () => {
    const { onComplete, hold } = setup({ holdMs: 500 });
    act(() => void hold().start());
    act(() => vi.advanceTimersByTime(300));
    act(() => hold().release());
    expect(hold().state).toBe("idle");
    act(() => void hold().start());
    act(() => vi.advanceTimersByTime(300));
    act(() => hold().cancel());
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete).not.toHaveBeenCalled();
    expect(hold().completed()).toBe(false);
  });

  it("disabled, starts nothing (start says so); turning disabled mid-hold drops it", () => {
    const { onComplete, hold, hook } = setup({ disabled: true });
    let started = true;
    act(() => void (started = hold().start()));
    expect(started).toBe(false);
    expect(hold().state).toBe("idle");
    hook.rerender({ disabled: false });
    act(() => void (started = hold().start()));
    expect(started).toBe(true);
    hook.rerender({ disabled: true });
    expect(hold().state).toBe("idle");
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("a change of what it validates (holdKey: a rotation, another cell) drops the hold under way", () => {
    const { onComplete, hold, hook } = setup({ holdKey: "1,0:1" });
    act(() => void hold().start());
    act(() => vi.advanceTimersByTime(HOLD_MS / 2));
    hook.rerender({ holdKey: "1,0:2" });
    expect(hold().state).toBe("idle");
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("acts on the latest action, and act() acts at once with no hold", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const hook = renderHook((props: { onComplete: () => void }) => useHold(props), { initialProps: { onComplete: first } });
    act(() => void hook.result.current.start());
    hook.rerender({ onComplete: latest });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    act(() => hook.result.current.act());
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it("stops at the unmount", () => {
    const { onComplete, hold, hook } = setup();
    act(() => void hold().start());
    hook.unmount();
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
