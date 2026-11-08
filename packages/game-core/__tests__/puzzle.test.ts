import { describe, expect, it } from "vitest";
import {
  EngineGame,
  OrientationType,
  PUZZLE_TILES,
  PlanType,
  SeededChallenge,
  pageStateOf,
  puzzleDayEnd,
  puzzleDayOf,
  puzzleDeck,
  puzzlePlaceAmong,
  rankPuzzle,
} from "../src";

const PLANS = Object.values(PlanType);
const DAY_SEED = 0x7055a1e5eedn;

/** Every plan a seeded game deals, the starter and its 37 draws, by discarding each tile in hand (a discard always plays). */
function dealt(seed: bigint, deckSeed?: bigint): PlanType[] {
  const game = new SeededChallenge(seed, 1n, deckSeed);
  const plans: PlanType[] = [PlanType.RFFFRFCFR];
  while (!game.over) {
    const hand = game.rules.hand!;
    plans.push(hand.plan);
    game.play({ kind: "discard" });
  }
  return plans;
}

const sorted = (plans: readonly PlanType[]) => [...plans].sort();

describe("the Puzzle's deck", () => {
  it("is the 38 cards a game of the day deals, the starter first", () => {
    const deck = puzzleDeck(DAY_SEED);
    expect(deck).toHaveLength(PUZZLE_TILES);
    expect(deck[0]).toBe(PlanType.RFFFRFCFR);
    expect(sorted(dealt(11n, DAY_SEED))).toEqual(sorted(deck));
  });

  it("is the same for every game of the day, each drawing it in its own order", () => {
    const a = dealt(11n, DAY_SEED);
    const b = dealt(22n, DAY_SEED);
    expect(sorted(a)).toEqual(sorted(b));
    expect(a).not.toEqual(b);
  });

  it("changes with the day's seed", () => {
    expect(sorted(puzzleDeck(DAY_SEED))).not.toEqual(sorted(puzzleDeck(DAY_SEED + 1n)));
  });

  it("leaves a game without a deck seed as it was: the deck and the draws from one seed", () => {
    expect(dealt(11n)).toEqual(dealt(11n, 11n));
    expect(sorted(dealt(11n))).toEqual(sorted(puzzleDeck(11n)));
  });

  it("is refused to a deck other than the simple one", () => {
    expect(() => EngineGame.start({ deck: "tutorial", seed: 1n, deckSeed: 2n })).toThrow("Game: only a simple deck takes a deck seed");
  });
});

describe("the Puzzle's day", () => {
  it("is the UTC day, ending at the next day's start", () => {
    expect(puzzleDayOf(86_400 * 20_400 + 3_600)).toBe(20_400);
    expect(puzzleDayEnd(20_400)).toBe(86_400 * 20_401);
  });
});

describe("the Puzzle's ranking", () => {
  it("puts the best score first, an equal score set earlier before", () => {
    const ranked = rankPuzzle([
      { id: "a", score: 900, at: 30 },
      { id: "b", score: 1_200, at: 50 },
      { id: "c", score: 900, at: 10 },
    ]);
    expect(ranked.map((r) => [r.id, r.place])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("places a result among the others", () => {
    const others = [
      { score: 1_000, at: 5 },
      { score: 800, at: 1 },
    ];
    expect(puzzlePlaceAmong({ score: 1_200, at: 9 }, others)).toBe(1);
    expect(puzzlePlaceAmong({ score: 800, at: 9 }, others)).toBe(3);
    expect(puzzlePlaceAmong({ score: 800, at: 0 }, others)).toBe(2);
  });
});

describe("a Puzzle game as a board reads it", () => {
  it("shows the hand and the two tiles drawn after it", () => {
    const game = new SeededChallenge(11n, 1n, DAY_SEED);
    const state = pageStateOf(game.rules, { gameId: 7, playerId: "0x9" });
    expect(state.key.gameId).toBe(7);
    expect(state.game).toMatchObject({ playerId: "0x9", score: 0, over: false, placedCount: 1, deckSize: PUZZLE_TILES });
    expect(state.hand?.plan).toBe(PLANS.indexOf(game.rules.hand!.plan));
    expect(state.coming).toHaveLength(2);
    expect(state.tiles[0]).toMatchObject({ id: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: Object.values(OrientationType).indexOf(OrientationType.South) });
  });
});
