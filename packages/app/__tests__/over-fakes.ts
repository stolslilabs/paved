import { FakeGameViews, type GameKey, type GameView, type TileView } from "@paved/chain";
import { CENTER, CategoryType, EngineGame, OrientationType, PlanType } from "@paved/game-core";
import type { Closing } from "../src/data/training";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

export interface PlayedGame {
  seed: bigint;
  game: GameView;
  tiles: TileView[];
  /** What the engine says the moves closed, in move order: the page's list must equal it. */
  closings: Closing[];
}

/**
 * A Challenge game played to its end on the engine (the first legal placement of every tile, a discard when none is legal)
 * and written as the chain would hold it: `game(id)`, the `tiles()` list and the closings each build scored. The deck is
 * short (`tileLimit`) so the game ends within a few moves; the seed is searched until the game closes something.
 */
export function playedGame(id: number, player: string, tileLimit = 24, startTime = 1_000): PlayedGame {
  for (let seed = 0x5eed01n; ; seed += 1n) {
    const engine = EngineGame.start({ deck: "simple", seed, player: BigInt(player), tileLimit });
    const tiles: TileView[] = [
      { id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: ORIENTATIONS.indexOf(OrientationType.South), x: CENTER, y: CENTER },
    ];
    const closings: Closing[] = [];
    while (!engine.over && engine.hand) {
      const hand = engine.hand;
      const plan = PLANS.indexOf(hand.plan);
      const placement = engine.legalPlacements()[0];
      if (placement) {
        const result = engine.build(placement);
        tiles.push({ id: hand.id, status: 1, plan, orientation: ORIENTATIONS.indexOf(placement.orientation), x: placement.x + CENTER, y: placement.y + CENTER });
        for (const s of result.scored) closings.push({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points, tileId: result.tileId });
      } else {
        engine.discard();
        tiles.push({ id: hand.id, status: 2, plan, orientation: 0, x: 0, y: 0 });
      }
    }
    if (!engine.over || closings.length < 2) continue;
    const game: GameView = {
      id, playerId: player, mode: 1, seed: `0x${engine.seed.toString(16)}`, score: engine.score, over: true,
      tileCount: tiles.length, placedCount: tiles.filter((t) => t.status === 1).length, discardedCount: tiles.filter((t) => t.status === 2).length,
      tileId: 0, plan: 0, remainingCount: 0, deckSize: tileLimit, startTime, endTime: startTime + 600, dayId: Math.floor(startTime / 86_400), expiresAt: startTime + 86_400,
    };
    return { seed, game, tiles, closings };
  }
}

/** `views` holding `played` as `game(id)` and `tiles()`, with the seed it started from. */
export function holdGame(views: FakeGameViews, played: PlayedGame): void {
  const key: GameKey = { mode: "challenge", gameId: played.game.id };
  views.setGame(key, {
    game: played.game,
    tiles: played.tiles,
    builder: { gameId: played.game.id, playerId: played.game.playerId, tileId: 0, plan: 0 },
    initialSeed: `0x${played.seed.toString(16)}`,
  });
}
