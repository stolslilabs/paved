import { describe, expect, it } from "vitest";
import {
  CENTER,
  FAIR_FLOOR,
  FAIR_MARKET,
  FAIR_OFFERS,
  FAIR_STALLS,
  FAIR_TIERS,
  FairDraft,
  OrientationType,
  PlanType,
  SeededChallenge,
  fairBars,
  fairDayOf,
  fairDeckPlans,
  fairEndsAt,
  fairInStall,
  fairIsMythic,
  fairPlanOf,
  fairRandomOf,
  fairSeasonOf,
  fairTierOf,
  fairWeekDayOf,
  fairWeekOf,
  fairWeekStart,
  rankFair,
  type FairSeason,
  type SeededMove,
} from "../src";

const ORIENTATIONS = Object.values(OrientationType);
const at = (iso: string) => Date.parse(iso) / 1000;
const cards = Array.from({ length: FAIR_MARKET }, (_, card) => card);

describe("the Fair's calendar", () => {
  it("runs a week from Monday 00:00 UTC to the next, a new one starting when one ends", () => {
    const week = fairWeekOf(at("2026-11-11T12:00:00Z"));
    expect(fairWeekStart(week)).toBe(at("2026-11-09T00:00:00Z"));
    expect(fairEndsAt(week)).toBe(at("2026-11-16T00:00:00Z"));
    expect(fairWeekOf(fairEndsAt(week))).toBe(week + 1);
    expect(fairWeekOf(fairEndsAt(week) - 1)).toBe(week);
  });

  it("counts the tries by UTC day, Monday the week's first", () => {
    expect(fairWeekDayOf(at("2026-11-09T00:00:00Z"))).toBe(0);
    expect(fairWeekDayOf(at("2026-11-12T23:59:59Z"))).toBe(3);
    expect(fairWeekDayOf(at("2026-11-15T23:59:59Z"))).toBe(6);
    expect(fairDayOf(at("2026-11-13T00:00:00Z"))).toBe(fairDayOf(at("2026-11-12T23:59:59Z")) + 1);
  });

  it("turns the stall with the weeks: the four seasons, a week each", () => {
    const seasons = [0, 1, 2, 3, 4].map((week) => fairSeasonOf(week));
    expect(new Set(seasons.slice(0, 4)).size).toBe(4);
    expect(seasons[4]).toBe(seasons[0]);
    expect(fairSeasonOf(-1)).toBe(seasons[3]);
  });
});

describe("the Fair's market", () => {
  it("is the base deck's 72 cards; the stalls hold 26, 22, 6 and 21 of them on 8, 4, 2 and 6 plans", () => {
    expect(FAIR_MARKET).toBe(72);
    const count = (season: FairSeason) => cards.filter((card) => fairInStall(card, season)).length;
    expect([count("winter"), count("spring"), count("summer"), count("autumn")]).toEqual([26, 22, 6, 21]);
    expect([FAIR_STALLS.winter.plans.length, FAIR_STALLS.spring.plans.length, FAIR_STALLS.summer.plans.length, FAIR_STALLS.autumn.plans.length]).toEqual([8, 4, 2, 6]);
  });

  it("names four mythics, six cards: the full city, the twin caps, the crossroads, the wonder with a road", () => {
    const mythics = cards.filter(fairIsMythic);
    expect(mythics).toHaveLength(6);
    expect(new Set(mythics.map(fairPlanOf))).toEqual(new Set([PlanType.CCCCCCCCC, PlanType.FFCFFFFFC, PlanType.SFRFRFRFR, PlanType.WFFFFFFFR]));
  });
});

/** A draft answered by `choose` (the offer's cards to a choice), to its end. */
function draft(season: FairSeason, seed: bigint, choose: (offerCards: number[]) => number): FairDraft {
  const d = new FairDraft(season, fairRandomOf(seed));
  while (!d.over) d.pick(choose(d.offer!.cards));
  return d;
}
const noMythic = (offer: number[]) => Math.max(0, offer.findIndex((card) => !fairIsMythic(card)));
const mythicFirst = (offer: number[]) => Math.max(0, offer.findIndex(fairIsMythic));

describe("the Fair's draft", () => {
  it("offers three tiles of three plans, the first from the season's stall, twenty times", () => {
    // Summer's stall sells out (six wonders): its own test below.
    for (const season of ["winter", "spring", "autumn"] as const) {
      const d = new FairDraft(season, fairRandomOf(7n));
      let offers = 0;
      while (!d.over) {
        const offer = d.offer!;
        offers += 1;
        expect(offer.cards).toHaveLength(3);
        expect(new Set(offer.cards.map(fairPlanOf)).size).toBe(3);
        expect(offer.stall).toBe(true);
        expect(fairInStall(offer.cards[0]!, season)).toBe(true);
        d.pick(noMythic(offer.cards));
      }
      expect(offers).toBe(FAIR_OFFERS);
      expect(d.deck).toHaveLength(FAIR_OFFERS);
    }
  });

  it("takes a card out of the market: a deck holds no card twice, and the next offer never shows the one on the table", () => {
    for (let seed = 1n; seed <= 30n; seed++) {
      const d = new FairDraft("spring", fairRandomOf(seed));
      while (!d.over) {
        const offer = d.offer!;
        for (const card of offer.cards) expect(d.deck).not.toContain(card);
        if (d.next) for (const card of d.next.cards) expect(offer.cards).not.toContain(card);
        d.pick(Number(seed % 3n));
      }
      expect(new Set(d.deck).size).toBe(d.deck.length);
    }
  });

  it("makes a mythic cost two picks: the offer after it passes, the deck holds one tile fewer", () => {
    let seen = 0;
    for (let seed = 1n; seed <= 40n; seed++) {
      const d = draft("spring", seed, mythicFirst);
      const mythics = d.deck.filter(fairIsMythic).length;
      seen += mythics;
      expect(d.passed).toHaveLength(mythics);
      expect(d.deck).toHaveLength(FAIR_OFFERS - mythics);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("shows no mythic at the last offer: no offer is left to pass", () => {
    for (let seed = 1n; seed <= 200n; seed++) {
      const d = new FairDraft("spring", fairRandomOf(seed));
      while (!d.over) {
        if (d.offer!.number === FAIR_OFFERS) expect(d.offer!.cards.some(fairIsMythic)).toBe(false);
        d.pick(noMythic(d.offer!.cards));
      }
    }
  });

  it("draws every try's offers from its own seed, and replays the same from its picks", () => {
    const a = draft("autumn", 11n, () => 1);
    const b = draft("autumn", 12n, () => 1);
    expect(a.deck).not.toEqual(b.deck);
    const again = FairDraft.replay("autumn", fairRandomOf(11n), a.picks);
    expect(again.deck).toEqual(a.deck);
    expect(again.over).toBe(true);
  });

  it("refuses a pick that is not of the offer, and any pick once the draft is over", () => {
    const d = new FairDraft("winter", fairRandomOf(3n));
    expect(() => d.pick(3)).toThrow("Fair: not a tile of the offer");
    expect(() => d.pick(-1)).toThrow("Fair: not a tile of the offer");
    while (!d.over) d.pick(noMythic(d.offer!.cards));
    expect(() => d.pick(0)).toThrow("Fair: the draft is over");
  });

  it("falls back on the whole market once the stall is sold out (summer's six wonders)", () => {
    const d = new FairDraft("summer", fairRandomOf(5n));
    while (!d.over && d.offer!.stall) d.pick(0);
    expect(d.deck.filter((card) => fairInStall(card, "summer"))).toHaveLength(6);
    expect(d.over).toBe(false);
    expect(d.offer!.cards).toHaveLength(3);
  });
});

/** Plays `game` to its end: each tile at its first legal placement, discarded when it fits nowhere. */
function playOut(game: SeededChallenge): SeededMove[] {
  const moves: SeededMove[] = [];
  while (!game.over) {
    const placement = game.rules.legalPlacements()[0];
    const move: SeededMove = placement ? { kind: "build", orientation: ORIENTATIONS.indexOf(placement.orientation), x: CENTER + placement.x, y: CENTER + placement.y } : { kind: "discard" };
    game.play(move);
    moves.push(move);
  }
  return moves;
}

describe("a Fair game", () => {
  it("plays the starter, then the drafted deck and nothing else, in an order of its seed", () => {
    const deck = draft("spring", 21n, mythicFirst).deck;
    const game = new SeededChallenge(99n, 1n, undefined, undefined, deck);
    expect(game.view().deckSize).toBe(deck.length + 1);
    const moves = playOut(game);
    expect(moves).toHaveLength(deck.length);
    const played = game
      .tiles()
      .slice(1)
      .map((t) => Object.values(PlanType)[t.plan]);
    expect([...played].sort()).toEqual(deck.map(fairPlanOf).sort());
    expect(fairDeckPlans(deck)).toHaveLength(deck.length + 1);

    const other = new SeededChallenge(100n, 1n, undefined, undefined, deck);
    playOut(other);
    const order = (g: SeededChallenge) =>
      g
        .tiles()
        .slice(1)
        .map((t) => t.plan);
    expect(order(other)).not.toEqual(order(game));

    const again = SeededChallenge.replay(99n, 1n, moves, undefined, undefined, deck);
    expect(again.score).toBe(game.score);
    expect(again.over).toBe(true);
  });
});

describe("the Fair's ranking", () => {
  it("counts a best of 1,000 or more, by score then by the earlier end", () => {
    const ranking = rankFair([
      { name: "a", score: 4_000, at: 20 },
      { name: "b", score: 4_000, at: 10 },
      { name: "c", score: FAIR_FLOOR - 10, at: 1 },
      { name: "d", score: FAIR_FLOOR, at: 5 },
    ]);
    expect(ranking.map((r) => r.name)).toEqual(["b", "a", "d"]);
    expect(ranking.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it("pays by tier: the top 1%, 5%, 20%, 50% and every counted try below", () => {
    expect(FAIR_TIERS.map((t) => t.cobbles)).toEqual([300, 150, 60, 20, 5]);
    // 200 players: 2 in the first tier, 10 in the first two, 40, 100, then the rest.
    expect([1, 2, 3, 10, 11, 40, 41, 100, 101, 200].map((place) => fairTierOf(place, 200))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    // A small week: the first place is always of the first tier.
    expect(fairTierOf(1, 3)).toBe(0);
    expect(fairTierOf(3, 3)).toBe(4);
  });

  it("reads each tier's bar: the least score in it", () => {
    const ranking = rankFair(Array.from({ length: 100 }, (_, i) => ({ score: 6_000 - i * 10, at: i })));
    expect(fairBars(ranking)).toEqual([6_000, 5_960, 5_810, 5_510, 5_010]);
    expect(fairBars([])).toEqual([null, null, null, null, null]);
  });
});
