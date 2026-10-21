// The engine's VRF queue (#645, D-30, docs/architecture/challenge-vrf.md): the hand and the next two tiles, as
// `GameImpl::advance` keeps them. The golden games check it against the contract (`engine-parity.test.ts`); these check
// its rules on their own.

import { describe, expect, it } from "vitest";
import { EngineError, EngineGame, drawFromBitmap, poseidon, popcount, withdrawExtra } from "../src/engine";
import { DECKS } from "../src/engine/decks";
import { PlanType } from "../src/types/plan";

const SEED = 0x6d6f636bn;
const PLANS = Object.values(PlanType);

/** The plan `seed` picks from `bitmap`, and the bitmap after it. */
function pick(seed: bigint, bitmap: bigint): { plan: PlanType; bitmap: bigint } {
  const { card, remaining } = drawFromBitmap(seed, DECKS.simple.total, bitmap);
  return { plan: DECKS.simple.plan(card), bitmap: remaining === 0 ? 0n : bitmap | (1n << BigInt(card - 1)) };
}

describe("a VRF game", () => {
  it("draws the hand from the seed and the next two from Poseidon(seed, 1) and Poseidon(seed, 2)", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true });
    let bitmap = withdrawExtra(1n << BigInt(DECKS.simple.starter), SEED, DECKS.simple.total, DECKS.simple.count);
    const hand = pick(SEED, bitmap);
    const next = pick(poseidon(SEED, 1), hand.bitmap);
    const after = pick(poseidon(SEED, 2), next.bitmap);
    bitmap = after.bitmap;
    expect(game.hand).toEqual({ id: 2, plan: hand.plan });
    expect(game.queue).toEqual([
      { id: 3, plan: next.plan },
      { id: 4, plan: after.plan },
    ]);
    expect(game.tiles).toBe(bitmap);
    expect(game.seed).toBe(SEED);
    expect(game.tileCount).toBe(2);
  });

  it("brings the next tile into the hand and leaves the tile two ahead to draw", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true });
    const [next, after] = game.queue;
    expect(game.drawsNext).toBe(true);
    game.discard();
    expect(game.hand).toEqual({ id: 3, plan: next!.plan });
    expect(game.queue).toEqual([after, { id: 5, plan: null }]);
    // The seed never changes
    expect(game.seed).toBe(SEED);
    const before = game.tiles;
    const drawn = game.supply(0x1234n);
    expect(drawn).toEqual({ id: 5, plan: pick(0x1234n, before).plan });
    expect(game.queue[1]).toEqual({ id: 5, plan: drawn.plan });
    expect(popcount(game.tiles)).toBe(popcount(before) + 1);
  });

  it("waits for a tile in hand not drawn yet, then takes the plan a receipt names", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true });
    game.discard();
    game.discard();
    // The hand is tile 4 (drawn at the spawn); tiles 5 and 6 are not drawn yet
    expect(game.queue.map((t) => t.plan)).toEqual([null, null]);
    game.discard();
    expect(game.hand).toBeNull();
    expect(game.handPending).toBe(true);
    expect(() => game.discard()).toThrow(new EngineError("Engine: the tile in hand is not drawn yet"));
    game.supplyPlan(5, PlanType.RFFFRFFFR);
    expect(game.hand).toEqual({ id: 5, plan: PlanType.RFFFRFFFR });
    // A tile already known keeps its plan
    expect(() => game.supplyPlan(5, PlanType.CCCCCCCCC)).toThrow(EngineError);
    expect(() => game.supplyPlan(99, PlanType.CCCCCCCCC)).toThrow(EngineError);
  });

  it("draws nothing for the last two moves, and the move that ends the game", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true, tileLimit: 5 });
    expect(game.queue.map((t) => t.id)).toEqual([3, 4]);
    expect(game.drawsNext).toBe(true);
    game.discard();
    expect(game.queue.map((t) => t.id)).toEqual([4, 5]);
    game.supply(7n);
    expect(game.drawsNext).toBe(false);
    game.discard();
    expect(game.queue.map((t) => t.id)).toEqual([5]);
    expect(game.drawsNext).toBe(false);
    game.discard();
    expect(game.queue).toEqual([]);
    game.discard();
    expect(game.over).toBe(true);
    expect(game.drawsNext).toBe(false);
    expect(game.tileCount).toBe(5);
  });

  it("keeps the queue apart from a forced hand", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true });
    const queue = game.queue;
    game.force(PlanType.CCCCCCCCC);
    expect(game.hand?.plan).toBe(PlanType.CCCCCCCCC);
    expect(game.queue).toEqual(queue);
    expect(PLANS).toContain(queue[0]!.plan);
  });

  it("clones its queue", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, vrf: true });
    game.discard();
    const copy = game.clone();
    game.supply(3n);
    expect(copy.queue[1]!.plan).toBeNull();
  });

  it("is refused off the simple deck", () => {
    expect(() => EngineGame.start({ deck: "tutorial", seed: SEED, vrf: true })).toThrow(EngineError);
  });
});
