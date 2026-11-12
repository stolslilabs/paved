import { describe, expect, it } from "vitest";
import {
  CENTER,
  CategoryType,
  JOUST_LOSS_COBBLES,
  JOUST_TILES,
  JOUST_WIN_COBBLES,
  OrientationType,
  SeededChallenge,
  joustBandOf,
  joustBoostOf,
  joustEndsAt,
  joustExpected,
  joustOpensAt,
  joustOutcome,
  joustPairs,
  joustPhaseOf,
  joustRatingChange,
  joustScore,
  joustWeekOf,
  joustWeekStart,
  type ScoreBoost,
  type SeededMove,
} from "../src";

const ORIENTATIONS = Object.values(OrientationType);
const at = (iso: string) => Date.parse(iso) / 1000;

describe("the Joust's calendar", () => {
  it("runs a week from Monday 00:00 UTC: four days of registration, then the joust until Sunday's end", () => {
    const week = joustWeekOf(at("2026-11-10T12:00:00Z"));
    expect(joustWeekStart(week)).toBe(at("2026-11-09T00:00:00Z"));
    expect(joustOpensAt(week)).toBe(at("2026-11-13T00:00:00Z"));
    expect(joustEndsAt(week)).toBe(at("2026-11-16T00:00:00Z"));
    expect(joustPhaseOf(at("2026-11-12T23:59:59Z"))).toBe("registration");
    expect(joustPhaseOf(at("2026-11-13T00:00:00Z"))).toBe("live");
    expect(joustPhaseOf(at("2026-11-15T23:59:59Z"))).toBe("live");
  });

  it("starts a new joust as one ends, roads and cities in turn", () => {
    const week = joustWeekOf(at("2026-11-15T23:59:59Z"));
    expect(joustWeekOf(at("2026-11-16T00:00:00Z"))).toBe(week + 1);
    expect(joustPhaseOf(at("2026-11-16T00:00:00Z"))).toBe("registration");
    expect(new Set([joustBoostOf(week), joustBoostOf(week + 1)])).toEqual(new Set(["roads", "cities"]));
    expect(joustBoostOf(week + 2)).toBe(joustBoostOf(week));
  });
});

describe("the Joust's rating", () => {
  it("moves by the proposal's table", () => {
    expect([joustRatingChange(1_000, 1_000, "win"), joustRatingChange(1_000, 1_000, "loss")]).toEqual([16, -16]);
    expect([joustRatingChange(1_000, 1_050, "win"), joustRatingChange(1_000, 1_050, "loss")]).toEqual([18, -14]);
    expect([joustRatingChange(1_000, 1_100, "win"), joustRatingChange(1_000, 1_100, "loss")]).toEqual([20, -12]);
    expect([joustRatingChange(1_000, 1_200, "win"), joustRatingChange(1_000, 1_200, "loss")]).toEqual([24, -8]);
    expect(Math.round(joustExpected(1_184, 1_196) * 100)).toBe(48);
    expect(joustRatingChange(1_184, 1_196, "win")).toBe(17);
  });

  it("bands ratings by the hundred", () => {
    expect(joustBandOf(1_184)).toBe(1_100);
    expect(joustBandOf(1_000)).toBe(1_000);
    expect(joustBandOf(999)).toBe(900);
  });
});

describe("the Joust's score", () => {
  it("adds the ten best and keeps the 11th and the jousters for a tie", () => {
    const bests = [5, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 1];
    expect(joustScore(bests)).toEqual({ total: 550, eleventh: 5, played: 12 });
    expect(joustScore([300])).toEqual({ total: 300, eleventh: 0, played: 1 });
  });

  it("gives the higher total the win, a tie to the 11th best then to the jousters, and a total of zero a loss", () => {
    const score = (total: number, eleventh = 0, played = 10) => ({ total, eleventh, played });
    expect(joustOutcome(score(10), score(9))).toBe("win");
    expect(joustOutcome(score(9), score(10))).toBe("loss");
    expect(joustOutcome(score(10, 5), score(10, 4))).toBe("win");
    expect(joustOutcome(score(10, 5, 11), score(10, 5, 12))).toBe("loss");
    expect(joustOutcome(score(10), score(10))).toBe("draw");
    expect(joustOutcome(score(0, 0, 0), score(0, 0, 0))).toBe("loss");
  });

  it("pays a fixed amount per jouster", () => {
    expect([JOUST_WIN_COBBLES, JOUST_LOSS_COBBLES]).toEqual([50, 15]);
  });
});

describe("the Joust's draw", () => {
  const random = () => 0.42;

  it("pairs inside a band, the odd one out with the band below, the very last a bye", () => {
    const entries = [1_250, 1_210, 1_180, 1_120, 1_110, 1_040, 930].map((rating, id) => ({ id, rating }));
    const { pairs, bye } = joustPairs(entries, random);
    expect(pairs).toHaveLength(3);
    const seen = [...pairs.flat(), bye!].map((e) => e.id).sort();
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // The two of the top band meet; the 1,100s' odd one meets the 1,000s' only one; the last one sits out.
    expect(pairs.some(([a, b]) => joustBandOf(a.rating) === 1_200 && joustBandOf(b.rating) === 1_200)).toBe(true);
    expect(pairs.some(([a, b]) => new Set([joustBandOf(a.rating), joustBandOf(b.rating)]).size === 2 && [a, b].some((e) => e.id === 5))).toBe(true);
    expect(bye?.id).toBe(6);
  });

  it("gives no bye to an even field", () => {
    expect(joustPairs([{ rating: 1_000 }, { rating: 1_300 }], random)).toMatchObject({ pairs: [[{ rating: 1_300 }, { rating: 1_000 }]], bye: null });
  });
});

/** A whole game on the seed, the first legal placement each turn (a discard when none): its moves. */
function movesOf(seed: bigint): SeededMove[] {
  const game = new SeededChallenge(seed, 1n, 7n);
  const moves: SeededMove[] = [];
  while (!game.over) {
    const p = game.rules.legalPlacements()[0];
    const move: SeededMove = p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
    game.play(move);
    moves.push(move);
  }
  return moves;
}

describe("a Joust game's boost", () => {
  const moves = movesOf(31n);
  const closings = (boost?: ScoreBoost) => SeededChallenge.replay(31n, 1n, moves, 7n, boost).rules.closings();
  const plain = closings();

  it("deals a Training game's tiles and closes roads and cities", () => {
    expect(JOUST_TILES).toBe(38);
    expect(plain.some((c) => c.category === CategoryType.Road && c.points > 0)).toBe(true);
  });

  it.each([
    ["roads", CategoryType.Road],
    ["cities", CategoryType.City],
  ] as const)("doubles %s alone", (boost, doubled) => {
    const boosted = closings(boost);
    expect(boosted).toHaveLength(plain.length);
    boosted.forEach((c, i) => {
      const before = plain[i]!.points;
      if (c.category !== doubled) expect(c.points).toBe(before);
      // A city is doubled; a road takes the city's base, so the contract's integer division may keep one point more.
      else if (boost === "cities") expect(c.points).toBe(before * 2);
      else expect(c.points - before * 2).toBeOneOf([0, 1]);
    });
  });
});
