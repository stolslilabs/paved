import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_MS, haptic } from "../src/lib/haptics";

// BUBBLE-DISCARD (#606): the board's haptics, through the Vibration API, else iOS 18's switch, else nothing.

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

  it("without the Vibration API, toggles a hidden switch where the browser knows one (iOS 18 Safari), and leaves nothing behind", () => {
    define(HTMLInputElement.prototype, "switch", false);
    const clicks: Element[] = [];
    vi.spyOn(HTMLLabelElement.prototype, "click").mockImplementation(function (this: HTMLLabelElement) {
      clicks.push(this);
    });
    haptic("light");
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.querySelector("input")).toHaveAttribute("switch");
    expect(document.querySelector("input[switch]")).toBeNull();
  });

  it("does nothing elsewhere, and never throws", () => {
    expect(() => haptic("firm")).not.toThrow();
    define(navigator, "vibrate", () => {
      throw new Error("blocked");
    });
    expect(() => haptic("light")).not.toThrow();
  });
});
