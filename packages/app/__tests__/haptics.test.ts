import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_MS, haptic } from "../src/lib/haptics";

// BUBBLE-DISCARD (issue 606): the board's haptics, through the Vibration API only.

const define = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { value, configurable: true, writable: true });

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).vibrate;
  delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).switch;
  vi.restoreAllMocks();
});

describe("haptic", () => {
  it("buzzes through navigator.vibrate: light, then firm", () => {
    const vibrate = vi.fn(() => true);
    define(navigator, "vibrate", vibrate);
    haptic("light");
    haptic("firm");
    expect(vibrate.mock.calls).toEqual([[HAPTIC_MS.light], [HAPTIC_MS.firm]]);
    expect(HAPTIC_MS.light).toBeLessThan(HAPTIC_MS.firm);
  });

  it("without the Vibration API (iOS Safari) does nothing: no hidden switch is toggled, the iOS 18 workaround is not used unproven", () => {
    define(HTMLInputElement.prototype, "switch", false);
    const click = vi.spyOn(HTMLElement.prototype, "click");
    haptic("light");
    haptic("firm");
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector("input[switch]")).toBeNull();
  });

  it("never throws", () => {
    expect(() => haptic("firm")).not.toThrow();
    define(navigator, "vibrate", () => {
      throw new Error("blocked");
    });
    expect(() => haptic("light")).not.toThrow();
  });
});
