/** The editor's random compact layout (#803): valid, as many tiles as fit, near a square, the seed's determinism, the budget. */
import { describe, expect, it } from "vitest";
import { BASE_PLAN_CODES, STARTER_LAYOUTS, inventoryOf, layoutRefusal, randomLayout, sameLayout, type LayoutTile } from "../src";

/** A stock of `copies` of every plan. */
const every = (copies: number) => BASE_PLAN_CODES.map(() => copies);
/** A new player's stock: a starter layout's 8 tiles. */
const starterStock = inventoryOf(STARTER_LAYOUTS[0]!.map((t) => t.plan));

/** The bounding box of a layout, the starter at (0, 0) included. */
function box(tiles: readonly LayoutTile[]) {
  const xs = [0, ...tiles.map((t) => t.x)];
  const ys = [0, ...tiles.map((t) => t.y)];
  return { width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 };
}

const unbounded = { ms: Number.POSITIVE_INFINITY };

describe("randomLayout", () => {
  it.each([
    ["a new player's stock, level 1", starterStock, 9],
    ["a large stock, level 20", every(3), 28],
    ["a large stock, few slots", every(3), 12],
    ["a stock smaller than the slots", every(1), 28],
  ])("gives a valid layout of as many tiles as fit: %s", (_, stock, slots) => {
    for (const seed of [1, 2, 3, 99, 0xffffffff]) {
      const { tiles } = randomLayout(stock, slots, seed, unbounded);
      expect(layoutRefusal(tiles, { slots, inventory: stock })).toBeNull();
      expect(tiles).toHaveLength(Math.min(slots - 1, stock.reduce((s, n) => s + n, 0)));
    }
  });

  it("keeps the shape near a square", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { tiles } = randomLayout(every(3), 28, seed, unbounded);
      const { width, height } = box(tiles);
      // 28 cells: a 6 x 5 box at best; one row or column more at most.
      expect(Math.max(width, height)).toBeLessThanOrEqual(7);
      expect(Math.abs(width - height)).toBeLessThanOrEqual(2);
    }
  });

  it("gives the same layout for the same seed, another for another seed", () => {
    const a = randomLayout(every(2), 20, 42, unbounded);
    const b = randomLayout(every(2), 20, 42, unbounded);
    expect(b.tiles).toEqual(a.tiles);
    const others = [43, 44, 45].map((seed) => randomLayout(every(2), 20, seed, unbounded).tiles);
    expect(others.some((t) => !sameLayout(t, a.tiles))).toBe(true);
    expect(new Set([a.tiles, ...others].map((t) => JSON.stringify(t))).size).toBeGreaterThan(2);
  });

  it("gives the starter alone for an empty stock", () => {
    expect(randomLayout(every(0), 28, 7).tiles).toEqual([]);
  });

  it("stops at the step budget", () => {
    // One try only: the first, whatever it gives.
    expect(randomLayout(every(1), 28, 5, { tries: 1, ms: Number.POSITIVE_INFINITY }).tries).toBe(1);
    expect(randomLayout(every(1), 28, 5, { tries: 6, ms: Number.POSITIVE_INFINITY }).tries).toBe(6);
  });

  it("stops at the time budget with the best found, never before the first try", () => {
    let clock = 0;
    const now = () => (clock += 100);
    // One of each plan never fills a perfect box, so every try would run: the clock stops them.
    const result = randomLayout(every(1), 28, 5, { ms: 250, now });
    expect(result.timedOut).toBe(true);
    // The clock reads 100 ms more at each look: the start, then before tries 2 and 3 (100 and 200 ms), then 300 ms.
    expect(result.tries).toBe(3);
    expect(layoutRefusal(result.tiles, { slots: 28, inventory: every(1) })).toBeNull();
    // Out of time at once: the first try still runs.
    expect(randomLayout(every(3), 28, 5, { ms: 0, now: () => 0 }).tries).toBe(1);
  });

  it("runs within its default budget", () => {
    const start = performance.now();
    // Every try runs (about 20 ms here), or the tries stop at 150 ms: a try started just before runs on (a try is a few ms).
    const result = randomLayout(every(1), 28, 11);
    expect(performance.now() - start).toBeLessThan(400);
    expect(result.tiles).toHaveLength(19);
  });
});
