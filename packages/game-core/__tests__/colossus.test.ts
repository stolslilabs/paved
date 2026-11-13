import { describe, expect, it } from "vitest";
import {
  COLOSSUS_DAYS,
  COLOSSUS_DISTRICT,
  COLOSSUS_DISTRICT_HOLES,
  COLOSSUS_HAND,
  COLOSSUS_HEART,
  COLOSSUS_MONUMENTS,
  COLOSSUS_RATION,
  COLOSSUS_TIERS,
  COLOSSUS_TOP,
  Colossus,
  ColossusBoard,
  colossusDayOf,
  colossusEndsAt,
  colossusFitting,
  colossusLots,
  colossusRation,
  colossusRingsFor,
  colossusSeasonOf,
  colossusSize,
  colossusTopCobbles,
  colossusWeekOf,
  colossusWeekStart,
  type ColossusEdge,
} from "../src/colossus";
import { PlanType } from "../src/types/plan";

// The Colossus's rules (the weekly collective event): the calendar, the site's size, the hands, the placement with its two fair-play
// rules and the seal, the stones and the gauge, the tiers and the top 10.

const PLANS = Object.values(PlanType);
const CITY = PLANS.indexOf(PlanType.CCCCCCCCC);
const WONDER = PLANS.indexOf(PlanType.WFFFFFFFF);
const WEEK = colossusWeekOf(Date.parse("2026-11-12T12:00:00Z") / 1000);
const START = colossusWeekStart(WEEK);
const builder = (i: number): string => `0x${(0xb0b0 + i).toString(16)}`;

/** A week played by `count` builders who lay every tile they can where the site hints, a day at a time. */
function playWeek(week: number, count = 57): Colossus {
  const site = new Colossus(week, 1);
  let seed = 7;
  const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  for (let day = 0; day < COLOSSUS_DAYS && site.completedAt === null; day++) {
    const at = colossusWeekStart(week) + day * 86_400 + 3_600;
    for (let i = 0; i < count; i++) {
      for (const card of site.hand(builder(i), day)) {
        if (site.completedAt !== null) break;
        const where = site.suggest(card.plan, random);
        if (where) site.build(builder(i), card.card, where.board, where.placement, at);
      }
    }
  }
  return site;
}

describe("the Colossus's calendar", () => {
  it("runs a week from Monday 00:00 UTC, a day at a time, the seasons' monuments in turn", () => {
    expect(new Date(START * 1000).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(colossusEndsAt(WEEK)).toBe(colossusWeekStart(WEEK + 1));
    expect(colossusWeekOf(START - 1)).toBe(WEEK - 1);
    expect(colossusDayOf(START)).toBe(0);
    expect(colossusDayOf(START + 3 * 86_400 + 5)).toBe(3);
    expect(colossusDayOf(colossusEndsAt(WEEK) - 1)).toBe(6);
    expect(new Set([0, 1, 2, 3].map((i) => colossusSeasonOf(WEEK + i))).size).toBe(4);
    expect(colossusSeasonOf(WEEK + 4)).toBe(colossusSeasonOf(WEEK));
    expect(COLOSSUS_MONUMENTS.spring.name).toBe("The Great Road");
  });
});

describe("the site's size", () => {
  it("follows the proposal's table: lots, cells, holes and the builders it is sized for", () => {
    expect(colossusSize(1)).toEqual({ rings: 1, lots: 4, districts: 12, cells: 1_024, holes: 576, builders: 57 });
    expect(colossusSize(3)).toMatchObject({ lots: 8, cells: 4_096, holes: 2_304, builders: 230 });
    expect(colossusSize(5)).toMatchObject({ lots: 12, districts: 140, cells: 9_216, holes: 5_184, builders: 518 });
    expect(colossusSize(20)).toMatchObject({ lots: 42, cells: 112_896, holes: 63_504, builders: 6_350 });
  });

  it("takes the fewest rings that hold ten holes a builder, twenty at most", () => {
    expect(colossusRingsFor(1)).toBe(1);
    expect(colossusRingsFor(57)).toBe(1);
    expect(colossusRingsFor(58)).toBe(2);
    expect(colossusRingsFor(500)).toBe(5);
    expect(colossusRingsFor(1_000_000)).toBe(20);
  });

  it("names its lots: the four middle ones the heart, a district each around them", () => {
    const lots = colossusLots(1);
    expect(lots).toHaveLength(16);
    expect(lots.filter((l) => l.heart).map((l) => [l.col, l.row, l.board])).toEqual([[1, 1, 0], [2, 1, 0], [1, 2, 0], [2, 2, 0]]);
    expect(lots.filter((l) => !l.heart).map((l) => l.board)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(lots[0]!.name).toBe("A1");
    expect(lots[15]!.name).toBe("D4");
    expect(colossusLots(5).filter((l) => !l.heart)).toHaveLength(140);
  });
});

describe("the rewards", () => {
  it("pays 75 Cobbles over the four tiers and 150, 100, 75, then 50 each to the top 10", () => {
    expect(COLOSSUS_TIERS.map((t) => [t.share, t.cobbles])).toEqual([[25, 10], [50, 15], [75, 20], [100, 30]]);
    expect(COLOSSUS_TIERS.reduce((sum, t) => sum + t.cobbles, 0)).toBe(75);
    expect([1, 2, 3, 4, 10, 11, 0].map(colossusTopCobbles)).toEqual([150, 100, 75, 50, 50, 0, 0]);
    expect(COLOSSUS_TOP).toBe(10);
  });
});

describe("the hands", () => {
  it("draws three tiles a day for each address, the same at every read", () => {
    const mine = colossusRation(WEEK, 2, 0x51a7n);
    expect(mine).toHaveLength(COLOSSUS_RATION);
    expect(mine.map((c) => c.card)).toEqual([6, 7, 8]);
    expect(colossusRation(WEEK, 2, 0x51a7n)).toEqual(mine);
    expect(mine.every((c) => c.plan > 0 && c.plan < PLANS.length)).toBe(true);
    // Across a week and a few addresses the hands are not all alike.
    const hands = new Set([1n, 2n, 3n, 4n, 5n].flatMap((a) => Array.from({ length: 7 }, (_, d) => colossusRation(WEEK, d, a).map((c) => c.plan).join())));
    expect(hands.size).toBeGreaterThan(20);
  });

  it("holds a day's tiles until the next day's end: six at most, less those laid", () => {
    const site = new Colossus(WEEK, 1);
    const me = builder(0);
    expect(site.hand(me, 0).map((c) => c.card)).toEqual([0, 1, 2]);
    expect(site.hand(me, 1)).toHaveLength(COLOSSUS_HAND);
    expect(site.hand(me, 2).map((c) => c.day)).toEqual([1, 1, 1, 2, 2, 2]);
    const card = site.hand(me, 0).find((c) => site.suggest(c.plan, () => 0))!;
    const where = site.suggest(card.plan, () => 0)!;
    site.build(me, card.card, where.board, where.placement, START + 60);
    expect(site.hand(me, 0).map((c) => c.card)).not.toContain(card.card);
    expect(site.hand(me, 1)).toHaveLength(COLOSSUS_HAND - 1);
    // The same card is not laid twice, nor one of a day gone.
    expect(site.refusal(me, card.card, where.board, where.placement, START + 120)).toBe("Colossus: not in hand");
    expect(site.refusal(me, 0, 1, { orientation: 1, x: 0, y: 0 }, START + 2 * 86_400)).toBe("Colossus: not in hand");
    expect(site.refusal(me, 0, 1, { orientation: 1, x: 0, y: 0 }, colossusEndsAt(WEEK))).toBe("Colossus: the week is over");
  });
});

describe("the fair-play rules", () => {
  it("knows which holes no card fits: 26 of the 81 ways to close one on four sides", () => {
    const edges: ColossusEdge[] = ["F", "R", "C"];
    let dead = 0;
    for (const n of edges) for (const e of edges) for (const s of edges) for (const w of edges) if (colossusFitting(n, e, s, w) === 0) dead += 1;
    expect(dead).toBe(26);
    // The proposal's example: forest north and south, road east; a city on the fourth side fits no card, a forest 2, a road 8.
    expect(colossusFitting("F", "R", "F", "C")).toBe(0);
    expect(colossusFitting("F", "R", "F", "F")).toBe(2);
    expect(colossusFitting("F", "R", "F", "R")).toBe(8);
  });

  it("refuses a tile that is no hole's, has no neighbour or shows another edge", () => {
    const board = new ColossusBoard(1, 3, [{ x: 0, y: 0, plan: CITY, orientation: 1 }]);
    expect(board.refusal(CITY, { orientation: 1, x: 0, y: 0 })).toBe("Colossus: not a hole");
    expect(board.refusal(CITY, { orientation: 1, x: 3, y: 0 })).toBe("Colossus: not a hole");
    expect(board.refusal(CITY, { orientation: 1, x: 2, y: 2 })).toBe("Tile: no neighbors");
    expect(board.refusal(WONDER, { orientation: 1, x: 1, y: 0 })).toBe("Tile: cannot place");
    expect(board.refusal(CITY, { orientation: 1, x: 1, y: 0 })).toBeNull();
  });

  it("never leaves a closed hole that no card fits, through a whole week", () => {
    const site = playWeek(WEEK + 1);
    for (const board of site.boards) {
      // Every hole left is one a card can still take, or waits for a neighbour.
      for (const hole of board.hardHoles()) expect(hole.cards).toBeGreaterThan(0);
    }
  });
});

describe("the stones", () => {
  it("counts an edge facing the wall as closed: the last tile of a walled city sets every tile as a stone, its builder's", () => {
    const board = new ColossusBoard(1, 2, [
      { x: 0, y: 0, plan: CITY, orientation: 1 },
      { x: 1, y: 0, plan: CITY, orientation: 1 },
      { x: 0, y: 1, plan: CITY, orientation: 1 },
    ]);
    expect(board.stones).toBe(0);
    expect(board.holes).toBe(1);
    expect(board.preview(CITY, { orientation: 1, x: 1, y: 1 })).toBe(4);
    const laid = board.place(CITY, { orientation: 1, x: 1, y: 1 }, "0xa");
    expect(laid).toEqual({ stones: 4, sealed: [], full: true });
    expect(board.stones).toBe(4);
    expect(board.tiles().every((t) => t.stone)).toBe(true);
    expect(board.tileAt(1, 1)).toMatchObject({ by: "0xa", plan: CITY });
    expect(board.tileAt(0, 0)!.by).toBeNull();
  });

  it("counts the structures the pre-built tiles already close as stones of nobody", () => {
    const board = new ColossusBoard(1, 1, [{ x: 0, y: 0, plan: CITY, orientation: 1 }]);
    expect(board.stones).toBe(1);
    expect(board.full).toBe(true);
  });

  it("draws a site of a heart and twelve districts, about half built, the heart closed until the gauge reaches 50%", () => {
    const site = new Colossus(WEEK, 1);
    expect(site.boards).toHaveLength(13);
    expect(site.boards[0]!.size).toBe(COLOSSUS_HEART);
    expect(site.boards[0]!.holes).toBe(144);
    for (const district of site.boards.slice(1)) {
      expect(district.size).toBe(COLOSSUS_DISTRICT);
      expect(district.holes).toBe(COLOSSUS_DISTRICT_HOLES);
      expect(district.tiles()).toHaveLength(28);
    }
    expect(site.holes).toBe(576);
    expect(site.cells).toBe(1_024);
    expect(site.stonesFor(50)).toBe(512);
    expect(site.heartOpen).toBe(false);
    const me = builder(0);
    const card = site.hand(me, 0)[0]!;
    expect(site.refusal(me, card.card, 0, { orientation: 1, x: 0, y: 0 }, START)).toBe("Colossus: the heart is not open");
    // The same week draws the same site.
    const again = new Colossus(WEEK, 1);
    expect(again.boards[3]!.tiles()).toEqual(site.boards[3]!.tiles());
    expect(new Colossus(WEEK + 1, 1).boards[3]!.tiles()).not.toEqual(site.boards[3]!.tiles());
  });

  it("gives a closing's stones to the builder whose tile closed it, and previews them", () => {
    const site = new Colossus(WEEK, 1);
    const me = builder(1);
    let found: { card: number; board: number; placement: { orientation: number; x: number; y: number }; stones: number } | null = null;
    for (const card of site.hand(me, 0)) {
      site.boards.slice(1).forEach((board, i) => {
        for (const p of board.legalPlacements(card.plan)) {
          const stones = board.preview(card.plan, p);
          if (stones > 0 && !found) found = { card: card.card, board: i + 1, placement: p, stones };
        }
      });
    }
    // A fresh site always offers a closing to one of three tiles on some district (a hole closed on four sides).
    expect(found).not.toBeNull();
    const before = site.stones;
    const move = site.build(me, found!.card, found!.board, found!.placement, START + 30);
    expect(move.stones).toBe(found!.stones);
    expect(move.before).toBe(before);
    expect(site.stones).toBe(before + move.stones + move.sealed.length);
    expect(site.builder(me)).toEqual({ address: me, tiles: 1, stones: found!.stones, at: START + 30 });
    expect(site.ranking()[0]!.address).toBe(me);
  });

  it("completes: every hole filled or sealed, every cell a stone, the four tiers reached in order, a capstone named", () => {
    const site = playWeek(WEEK);
    expect(site.completedAt).not.toBeNull();
    expect(site.holes).toBe(0);
    expect(site.stones).toBe(site.cells);
    expect(site.boards.every((b) => b.full && b.tiles().every((t) => t.stone))).toBe(true);
    expect(site.heartOpen).toBe(true);
    expect(site.tierAt.every((at) => at !== null)).toBe(true);
    expect([...site.tierAt].sort((a, b) => a! - b!)).toEqual(site.tierAt);
    expect(site.capstone).not.toBeNull();
    // The builders' stones and nobody's (set at the start, sealed holes) make the whole site.
    const ranking = site.ranking();
    expect(ranking.reduce((sum, b) => sum + b.stones, 0)).toBeLessThanOrEqual(site.cells);
    expect(ranking.every((b, i) => i === 0 || ranking[i - 1]!.stones >= b.stones)).toBe(true);
    // Complete, it takes no more tile.
    const late = builder(0);
    expect(site.refusal(late, site.hand(late, 6)[0]?.card ?? 18, 1, { orientation: 1, x: 0, y: 0 }, colossusEndsAt(WEEK) - 10)).toBe("Colossus: complete");
  });
});
