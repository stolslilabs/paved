/** The editor's random compact layout (#803): valid, as many tiles as fit, near a square, the seed's determinism, the budget. */
import { describe, expect, it, vi } from "vitest";
import { BASE_PLAN_CODES, RANDOM_LAYOUT_STEPS, STARTER_LAYOUTS, inventoryOf, layoutRefusal, randomLayout, sameLayout, type LayoutTile } from "../src";

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

const unbounded = { steps: Number.POSITIVE_INFINITY };

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

  it("gives the same layout for the same seed under its default budget, however slow the machine", () => {
    // The review's case: one of each plan, 28 slots, seed 11. The budget counts work, not time, so a clock that runs fast (a
    // slow machine) changes nothing.
    const now = vi.spyOn(Date, "now");
    const runs = [0, 200, 10_000].map((tick) => {
      let clock = 0;
      now.mockImplementation(() => (clock += tick));
      return randomLayout(every(1), 28, 11);
    });
    now.mockRestore();
    for (const run of runs) expect(run).toEqual(runs[0]);
    expect(randomLayout(every(1), 28, 11).tiles).toEqual(runs[0]!.tiles);
    const p = vi.spyOn(performance, "now").mockReturnValue(1e12);
    expect(randomLayout(every(1), 28, 11).tiles).toEqual(runs[0]!.tiles);
    p.mockRestore();
  });

  it("gives the starter alone for an empty stock", () => {
    expect(randomLayout(every(0), 28, 7).tiles).toEqual([]);
  });

  it("stops at the tries budget", () => {
    expect(randomLayout(every(1), 28, 5, { tries: 1 }).tries).toBe(1);
    expect(randomLayout(every(1), 28, 5, { tries: 6 }).tries).toBe(6);
  });

  it("stops at the step budget with the best found, the same each time, never before the first try", () => {
    const first = randomLayout(every(1), 28, 5, { tries: 1 });
    // A budget of two tries' steps: a third try never starts.
    const budget = { steps: first.steps + 1 };
    const result = randomLayout(every(1), 28, 5, budget);
    expect(result.exhausted).toBe(true);
    expect(result.tries).toBe(2);
    expect(result.steps).toBeGreaterThanOrEqual(budget.steps);
    expect(layoutRefusal(result.tiles, { slots: 28, inventory: every(1) })).toBeNull();
    expect(randomLayout(every(1), 28, 5, budget)).toEqual(result);
    // No step at all: the first try still runs.
    expect(randomLayout(every(3), 28, 5, { steps: 0 }).tries).toBe(1);
  });

  it("keeps the hardest stock within its default budget, all its tries run", () => {
    // One of each plan never fills a perfect box, so all 48 tries run: about 91,000 steps, under the budget.
    const result = randomLayout(every(1), 28, 11);
    expect(RANDOM_LAYOUT_STEPS).toBe(100_000);
    expect(result.tries).toBe(48);
    expect(result.exhausted).toBe(false);
    expect(result.steps).toBeLessThan(RANDOM_LAYOUT_STEPS);
  });
});
