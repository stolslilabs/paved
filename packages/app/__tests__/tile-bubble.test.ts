import { describe, expect, it } from "vitest";
import { bubbleLimits, bubbleSize, placeBubble } from "../src/components/containers/tile-bubble";

const box = { left: 0, top: 0, width: 375, height: 812 } as DOMRect;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height }) as DOMRect;

describe("the tile bubble's position", () => {
  it("has 44 px touch targets", () => {
    expect(bubbleSize(2)).toEqual({ width: 100, height: 52 });
    expect(bubbleSize(1)).toEqual({ width: 52, height: 52 });
    // Close, Rotate and Validate (#568).
    expect(bubbleSize(3)).toEqual({ width: 148, height: 52 });
    // Cancel, Discard, Rotate and Validate (#606): inside a 375 px board with its 8 px margins.
    expect(bubbleSize(4)).toEqual({ width: 196, height: 52 });
    expect(bubbleSize(4).width).toBeLessThanOrEqual(375 - 2 * 8);
  });

  it("stands above and right of the tile's corner, overlapping it", () => {
    const limits = bubbleLimits(box, [], 0, 100);
    expect(placeBubble({ x: 150, y: 300 }, bubbleSize(2), limits)).toEqual({ x: 140, y: 258 });
  });

  it("is clamped inside the box on every side", () => {
    const size = bubbleSize(2);
    const limits = bubbleLimits(box, [], 0, size.width);
    expect(placeBubble({ x: 370, y: 5 }, size, limits)).toEqual({ x: 375 - 8 - size.width, y: 8 });
    expect(placeBubble({ x: -50, y: 900 }, size, limits)).toEqual({ x: 8, y: 812 - 8 - size.height });
  });

  it("never goes under the HUD or the hand panel", () => {
    const size = bubbleSize(2);
    const hud = rect(0, 0, 375, 96);
    const hand = rect(8, 520, 359, 284);
    const limits = bubbleLimits(box, [hud, hand], 100, size.width);
    expect(limits.top).toBe(96 + 8);
    expect(limits.bottom).toBe(520 - 8);
    expect(placeBubble({ x: 150, y: 20 }, size, limits).y).toBe(104);
    expect(placeBubble({ x: 150, y: 700 }, size, limits).y).toBe(520 - 8 - size.height);
  });

  it("ignores a panel the bubble does not overlap horizontally (tablet: the panel is on the right)", () => {
    const size = bubbleSize(2);
    const limits = bubbleLimits({ ...box, width: 900 } as DOMRect, [rect(500, 520, 384, 284)], 50, size.width);
    expect(limits.bottom).toBe(812 - 8);
  });
});
