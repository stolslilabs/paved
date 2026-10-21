// The game-over replay of a Challenge game on the VRF (#645): its tiles after the spawn's three are not the seed's draws,
// so `replayGame` takes them from `tiles()`.
import { describe, expect, it } from "vitest";
import { CENTER, EngineGame, OrientationType, PlanType, poseidon } from "@paved/game-core";
import type { TileView } from "@paved/chain";
import { replayGame } from "../src/data/over";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x6d6f636bn;
const PLAYER = "0xabc";

/** A whole VRF game played by its first legal move, each queued tile drawn from a random of its own, with its `tiles()`. */
function played(): { game: EngineGame; tiles: TileView[] } {
  const game = EngineGame.start({ deck: "simple", seed: SEED, player: BigInt(PLAYER), vrf: true });
  const tiles: TileView[] = [{ id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: 3, x: CENTER, y: CENTER }];
  while (!game.over) {
    const hand = game.hand!;
    const p = game.legalPlacements()[0];
    if (p) {
      game.build(p);
      tiles.push({ id: hand.id, status: 1, plan: PLANS.indexOf(hand.plan), orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y });
    } else {
      game.discard();
      tiles.push({ id: hand.id, status: 2, plan: PLANS.indexOf(hand.plan), orientation: 0, x: 0, y: 0 });
    }
    for (const tile of game.queue) if (tile.plan === null) game.supply(poseidon(SEED, 99, tile.id));
  }
  return { game, tiles };
}

describe("replayGame on a VRF game (#645)", () => {
  it("replays it from its tiles: the chain's score, every closing", () => {
    const { game, tiles } = played();
    const replay = replayGame(SEED, tiles, { playerId: PLAYER, deckSize: game.tileLimit, over: true, score: game.score });
    expect(replay.stats.score).toBe(game.score);
    expect(replay.closings.reduce((sum, c) => sum + c.points, 0)).toBe(game.closings().reduce((sum, c) => sum + c.points, 0));
    expect(replay.tiles).toHaveLength(game.built + 1);
  });

  it("refuses a game whose spawn tiles are not the seed's", () => {
    const { game, tiles } = played();
    expect(() => replayGame(SEED + 1n, tiles, { playerId: PLAYER, deckSize: game.tileLimit, over: true, score: game.score })).toThrow(/Replay/);
  });
});
