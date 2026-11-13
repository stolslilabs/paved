import { describe, expect, it } from "vitest";
import {
  CategoryType,
  MASTERPIECE_DAILY,
  MASTERPIECE_KINDS,
  MASTERPIECE_TIERS,
  MASTERPIECE_TILES,
  Masterpiece,
  OrientationType,
  PlanType,
  compareMasterpiece,
  masterpieceBars,
  masterpieceCards,
  masterpieceCounted,
  masterpieceDayOf,
  masterpieceEndsAt,
  masterpieceKindOf,
  masterpieceOf,
  masterpieceOrder,
  masterpiecePlaceAmong,
  masterpieceScore,
  masterpieceSeasonOf,
  masterpieceTierOf,
  masterpieceWeekOf,
  masterpieceWeekStart,
  masterpieceWorth,
  type ClosedStructure,
  type MasterpieceEntry,
  type MasterpieceKind,
} from "../src";
import { DECKS } from "../src/engine";

const at = (iso: string) => Date.parse(iso) / 1000;
const WEEK = masterpieceWeekOf(at("2026-11-10T12:00:00Z"));
/** A week of each kind, from `WEEK` on. */
const weekOf = (kind: MasterpieceKind) => [0, 1, 2, 3].map((i) => WEEK + i).find((w) => masterpieceKindOf(w) === kind)!;

/** Lays the board's next tile where it closes a structure of `category`; throws when no placement does. */
function close(board: Masterpiece, category: CategoryType) {
  for (const placement of board.legalPlacements()) {
    if (board.clone().build(placement).closed.some((c) => c.category === category)) return board.build(placement);
  }
  throw new Error(`no placement closes a ${category}`);
}

const closing = (category: CategoryType, size: number, points: number, tiles: number[] = []): ClosedStructure => ({ category, size, points, player: 1n, tiles: tiles.length || size, tileId: 0, areas: tiles.map((tileId) => ({ tileId, areas: [] })) });

describe("the Masterpiece's calendar", () => {
  it("runs a week from Monday 00:00 UTC to Sunday's end, a day at a time", () => {
    expect(masterpieceWeekStart(WEEK)).toBe(at("2026-11-09T00:00:00Z"));
    expect(masterpieceEndsAt(WEEK)).toBe(at("2026-11-16T00:00:00Z"));
    expect(masterpieceDayOf(at("2026-11-09T00:00:00Z"))).toBe(0);
    expect(masterpieceDayOf(at("2026-11-11T08:00:00Z"))).toBe(2);
    expect(masterpieceDayOf(at("2026-11-15T23:59:59Z"))).toBe(6);
  });

  it("starts a new week as one ends, the four seasons' kinds in turn", () => {
    expect(masterpieceWeekOf(at("2026-11-16T00:00:00Z"))).toBe(WEEK + 1);
    expect(new Set([0, 1, 2, 3].map((i) => masterpieceKindOf(WEEK + i)))).toEqual(new Set(["city", "road", "wonder", "forest"]));
    expect(masterpieceKindOf(WEEK + 4)).toBe(masterpieceKindOf(WEEK));
    expect(MASTERPIECE_KINDS[masterpieceSeasonOf(WEEK)]).toBe(masterpieceKindOf(WEEK));
  });
});

describe("the Masterpiece's cards", () => {
  it("deals twelve cards of the base deck a day, the same for every board", () => {
    const monday = masterpieceCards(WEEK, 0);
    expect(monday).toHaveLength(MASTERPIECE_DAILY);
    expect(masterpieceCards(WEEK, 0)).toEqual(monday);
    expect(masterpieceCards(WEEK, 1)).not.toEqual(monday);
    expect(masterpieceCards(WEEK + 1, 0)).not.toEqual(monday);
    // No more copies of a card than the base deck holds.
    const deck = Array.from({ length: DECKS.simple.total }, (_, i) => DECKS.simple.plan(i + 1));
    for (const plan of new Set(monday)) expect(monday.filter((p) => p === plan).length).toBeLessThanOrEqual(deck.filter((p) => p === plan).length);
  });

  it("draws each day's twelve in the board's own order, the days in order", () => {
    const a = masterpieceOrder(WEEK, 1n);
    const b = masterpieceOrder(WEEK, 2n);
    expect(a).toHaveLength(MASTERPIECE_TILES);
    expect(a).not.toEqual(b);
    for (let day = 0; day < 7; day++) {
      const slice = (order: PlanType[]) => [...order.slice(day * 12, day * 12 + 12)].sort();
      expect(slice(a)).toEqual([...masterpieceCards(WEEK, day)].sort());
      expect(slice(b)).toEqual(slice(a));
    }
  });
});

describe("the masterpiece", () => {
  it("is the closed structure of the kind that scores the most, the larger at equal points", () => {
    const closings = [closing(CategoryType.Road, 9, 1_100), closing(CategoryType.City, 2, 418), closing(CategoryType.City, 14, 3_873), closing(CategoryType.City, 8, 1_926)];
    expect(masterpieceOf(closings, "city")).toEqual({ kind: "city", size: 14, points: 3_873, closing: 2 });
    expect(masterpieceOf(closings, "road")).toEqual({ kind: "road", size: 9, points: 1_100, closing: 0 });
    expect(masterpieceOf(closings, "forest")).toBeNull();
    expect(masterpieceOf([closing(CategoryType.City, 3, 500), closing(CategoryType.City, 4, 500)], "city")).toMatchObject({ size: 4, closing: 1 });
  });

  it("crowns a wonder with the best closed structure on its nine tiles, their points added", () => {
    const wonder = closing(CategoryType.Wonder, 0, 900, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(masterpieceOf([wonder], "wonder")).toEqual({ kind: "wonder", size: 9, points: 900, closing: 0 });
    const closings = [closing(CategoryType.City, 20, 6_359, [30, 31]), wonder, closing(CategoryType.Road, 4, 438, [9, 12]), closing(CategoryType.City, 6, 1_379, [3, 14])];
    expect(masterpieceOf(closings, "wonder")).toEqual({ kind: "wonder", size: 15, points: 2_279, closing: 3 });
  });

  it("scores its points less 50 a discard, never under zero, and counts from 8", () => {
    const piece = { kind: "city" as const, size: 31, points: 12_721, closing: 0 };
    expect(masterpieceScore(piece, 2)).toBe(12_621);
    expect(masterpieceScore({ ...piece, points: 80 }, 2)).toBe(0);
    expect(masterpieceScore(null, 3)).toBe(0);
    expect([masterpieceCounted(null), masterpieceCounted({ size: 7 }), masterpieceCounted({ size: 8 })]).toEqual([false, false, true]);
  });

  it("prices an open structure by the engine's formula (the proposal's table for a city)", () => {
    expect([8, 20, 31, 46].map((size) => masterpieceWorth("city", size))).toEqual([1_926, 6_359, 12_721, 26_726]);
    expect(masterpieceWorth("road", 8)).toBe(963);
    expect(masterpieceWorth("wonder", 9)).toBe(900);
    expect(masterpieceWorth("forest", 10, 3)).toBe(1_134);
  });
});

describe("the Masterpiece's ranking", () => {
  it("orders by the score, then the size, then the earlier closing", () => {
    const a = { score: 5_000, size: 18, at: 50 };
    expect(compareMasterpiece(a, { score: 4_999, size: 30, at: 1 })).toBeLessThan(0);
    expect(compareMasterpiece(a, { score: 5_000, size: 19, at: 90 })).toBeGreaterThan(0);
    expect(compareMasterpiece(a, { score: 5_000, size: 18, at: 60 })).toBeLessThan(0);
    expect(masterpiecePlaceAmong(a, [{ score: 9_000, size: 30, at: 1 }, { score: 5_000, size: 18, at: 60 }, { score: 5_000, size: 18, at: 10 }])).toBe(3);
  });

  it("gives the tier of a place among the counted masterpieces, the kinder side of a bar", () => {
    const tier = (place: number | null, counted: number) => masterpieceTierOf(place, counted)?.id ?? null;
    expect([1, 59, 60, 292, 293, 1_168, 1_169, 2_920, 2_921, 5_840].map((p) => tier(p, 5_840))).toEqual(["top1", "top1", "top5", "top5", "top20", "top20", "top50", "top50", "counted", "counted"]);
    expect(tier(212, 5_840)).toBe("top5");
    // A week of three: the first place is the top 1 %, the kinder side.
    expect([1, 2, 3].map((p) => tier(p, 3))).toEqual(["top1", "top50", "counted"]);
    expect([tier(null, 10), tier(11, 10), tier(1, 0)]).toEqual([null, null, null]);
    expect(MASTERPIECE_TIERS.map((t) => t.cobbles)).toEqual([300, 150, 60, 20, 5]);
  });

  it("reads each tier's bar from the week's counted scores", () => {
    const scores = Array.from({ length: 200 }, (_, i) => 2_000 + i * 10);
    expect(masterpieceBars(scores).map((b) => b.from)).toEqual([3_980, 3_900, 3_600, 3_000, 2_000]);
    expect(masterpieceBars([]).every((b) => b.from === null)).toBe(true);
  });
});

describe("a Masterpiece board", () => {
  const order = [PlanType.FFFFFFCFF, PlanType.FFFFFFCFF, PlanType.FFFFFFCFF];

  it("opens twelve tiles a day: a missed day's tiles wait, the days to come do not", () => {
    const board = new Masterpiece(WEEK, 7n);
    expect([board.waiting(0), board.toCome(0)]).toEqual([12, 72]);
    expect([board.waiting(3), board.toCome(3)]).toEqual([48, 36]);
    expect([board.waiting(6), board.toCome(6), board.waiting(9)]).toEqual([84, 0, 84]);
    board.discard();
    expect([board.played, board.waiting(0), board.days()]).toEqual([1, 11, [1, 0, 0, 0, 0, 0, 0]]);
  });

  it("makes a closed structure of the kind its masterpiece, and a discard costs 50", () => {
    const board = new Masterpiece(weekOf("city"), 1n, order);
    expect([board.piece(), board.score, board.prospect()?.size]).toEqual([null, 0, 1]);
    const move = close(board, CategoryType.City);
    expect(move).toMatchObject({ improved: true, points: 419, piece: { kind: "city", size: 2, points: 419 } });
    expect(masterpieceCounted(board.piece())).toBe(false);
    const discard = board.discard();
    expect([discard.points, discard.improved, board.score, board.discards]).toEqual([-50, false, 369, 1]);
    expect(board.next).toBe(PlanType.FFFFFFCFF);
  });

  it("counts nothing for a structure of another kind", () => {
    const board = new Masterpiece(weekOf("road"), 1n, order);
    const move = close(board, CategoryType.City);
    expect([move.improved, move.points, board.piece(), board.score]).toEqual([false, 0, null, 0]);
  });

  it("plays a log again to the same board, and refuses a move with no tile left", () => {
    const board = new Masterpiece(weekOf("city"), 1n, order);
    const log: MasterpieceEntry[] = [];
    const placement = board.legalPlacements()[0]!;
    board.build(placement);
    log.push({ k: "build", o: Object.values(OrientationType).indexOf(placement.orientation), x: placement.x, y: placement.y });
    board.discard();
    log.push({ k: "discard" });
    board.discard();
    log.push({ k: "discard" });
    const again = Masterpiece.replay(board.week, 1n, log, order);
    expect([again.played, again.laid, again.discards, again.score]).toEqual([3, 1, 2, board.score]);
    expect(again.next).toBeNull();
    expect(() => again.discard()).toThrow("Masterpiece: no tile left");
    expect(again.refusal(placement)).toBe("Masterpiece: no tile left");
  });
});
