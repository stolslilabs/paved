/**
 * The press bubble's position (LONGPRESS-EDIT, #799): one button by the pressed tile's top-right corner, as the tile bubble stood before
 * TILE-ACTIONS (its helpers moved to `press-bubble.tsx` with it; the press bubble itself is unchanged).
 */
import { describe, expect, it } from "vitest";
import { bubbleSize, placeBubble } from "../src/components/containers/press-bubble";
import { bubbleLimits } from "../src/components/containers/tile-actions-layout";

const box = { left: 0, top: 0, width: 375, height: 812 } as DOMRect;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height }) as DOMRect;

describe("the press bubble's position", () => {
  it("has a 44 px touch target", () => {
    expect(bubbleSize(1)).toEqual({ width: 52, height: 52 });
  });

  it("stands above and right of the tile's corner, overlapping it", () => {
    const limits = bubbleLimits(box, [], 0, 52);
    expect(placeBubble({ x: 150, y: 300 }, bubbleSize(1), limits)).toEqual({ x: 140, y: 258 });
  });

  it("is clamped inside the box on every side", () => {
    const size = bubbleSize(1);
    const limits = bubbleLimits(box, [], 0, size.width);
    expect(placeBubble({ x: 370, y: 5 }, size, limits)).toEqual({ x: 375 - 8 - size.width, y: 8 });
    expect(placeBubble({ x: -50, y: 900 }, size, limits)).toEqual({ x: 8, y: 812 - 8 - size.height });
  });

  it("never goes under the HUD or the hand panel", () => {
    const size = bubbleSize(1);
    const limits = bubbleLimits(box, [rect(0, 0, 375, 96), rect(8, 520, 359, 284)], 100, size.width);
    expect(placeBubble({ x: 150, y: 20 }, size, limits).y).toBe(104);
    expect(placeBubble({ x: 150, y: 700 }, size, limits).y).toBe(520 - 8 - size.height);
  });
});
