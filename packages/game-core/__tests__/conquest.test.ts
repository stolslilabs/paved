import { describe, expect, it } from "vitest";
import {
  CONQUEST_CAPITAL_PLAN,
  CONQUEST_CYCLE_S,
  CONQUEST_EPOCH_S,
  CONQUEST_LEVEL_COSTS,
  CONQUEST_ODDS,
  CONQUEST_OFFERINGS_A_DAY,
  CONQUEST_PROVINCE,
  Conquest,
  conquestCrest,
  conquestDayOf,
  conquestDayStart,
  conquestEndsAt,
  conquestFinalCobbles,
  conquestGiftCobbles,
  conquestKnowledgeAt,
  conquestLeads,
  conquestMajority,
  conquestOf,
  conquestOfferingEvery,
  conquestOpensAt,
  conquestPhaseCobbles,
  conquestPhaseOfDay,
  conquestPlayDay,
  conquestPoints,
  conquestRestDay,
  conquestSeats,
  conquestSide,
  conquestStart,
  conquestZoneName,
} from "../src/conquest";
import { CATEGORY_CITY, edgeCategory } from "../src/engine/geometry";
import { BASE_PLAN_CODES } from "../src/rules/rarity";
import { GUILD_RANK } from "../src/social/guild";

// The Conquest's rules (the season's finale): the calendar and its loop, the checkerboard, the Offerings and the orders, the
// exploration, the requests and the gifts, the majority, the points, the tree and the rewards.

const N = 3;
const HOUR = 3_600;
/** A time of Conquest `N`: day `day` (1 to 28) at `hour`. */
const at = (day: number, hour = 12): number => conquestDayStart(N, day) + hour * HOUR;
const A = "0xa11ce";
const B = "0xb0b";
const MID = (CONQUEST_PROVINCE - 1) / 2;

/** A world of five allegiances (1 the best): a 3 by 3 checkerboard. */
const world = () => new Conquest(N, [1, 2, 3, 4, 5]);

describe("the Conquest's calendar", () => {
  it("runs three days of registration, then 28 days, and starts again", () => {
    expect(CONQUEST_CYCLE_S).toBe(31 * 86_400);
    expect(CONQUEST_EPOCH_S).toBe(Date.UTC(2026, 10, 2) / 1000);
    expect(conquestOf(CONQUEST_EPOCH_S)).toBe(0);
    expect(conquestOf(CONQUEST_EPOCH_S - 1)).toBe(-1);
    expect(conquestOpensAt(N) - conquestStart(N)).toBe(3 * 86_400);
    expect(conquestEndsAt(N)).toBe(conquestStart(N + 1));
    expect(conquestDayOf(conquestStart(N))).toBe(0);
    expect(conquestDayOf(conquestOpensAt(N) - 1)).toBe(0);
    expect(conquestDayOf(conquestOpensAt(N))).toBe(1);
    expect(conquestDayOf(conquestEndsAt(N) - 1)).toBe(28);
    expect(conquestDayOf(conquestEndsAt(N))).toBe(0);
  });

  it("gives each phase a week: six days of play and a rest day, Frontiers ending on D20", () => {
    expect([0, 1, 6, 7, 8, 13, 14, 15, 20, 21, 28].map(conquestPhaseOfDay)).toEqual(["registration", "foundation", "foundation", "foundation", "awakening", "awakening", "awakening", "frontiers", "frontiers", "results", "results"]);
    expect([7, 14].every(conquestRestDay)).toBe(true);
    expect(Array.from({ length: 30 }, (_, d) => d).filter(conquestPlayDay)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20]);
  });
});

describe("the Conquest's world", () => {
  it("is the smallest odd checkerboard that seats every allegiance", () => {
    expect([1, 5, 6, 13, 14, 25, 26].map(conquestSide)).toEqual([3, 3, 5, 5, 7, 7, 9]);
  });

  it("seats the best allegiance at the centre, then outward", () => {
    expect(conquestSeats(3)).toEqual([4, 0, 2, 6, 8]);
    expect(conquestSeats(5)).toHaveLength(13);
    expect(conquestSeats(5)[0]).toBe(12);
    expect(conquestZoneName(3, 4)).toBe("B2");
  });

  it("gives every allegiance a province with its capital, two wonders in each province and a Great Wonder in each free zone", () => {
    const w = world();
    expect(w.size).toBe(3 * CONQUEST_PROVINCE);
    expect(w.zones.filter((z) => z.province).map((z) => z.guild)).toEqual([2, 3, 1, 4, 5]);
    expect(w.tiles.filter((t) => t.kind === "capital")).toHaveLength(5);
    expect(w.tiles.filter((t) => t.kind === "wonder")).toHaveLength(10);
    expect(w.tiles.filter((t) => t.kind === "great")).toHaveLength(4);
    const centre = w.zones[4]!;
    expect(w.tileAt(centre.x0 + MID, centre.y0 + MID)).toMatchObject({ kind: "capital", guild: 1, plan: CONQUEST_CAPITAL_PLAN });
    // The capital's neighbours are explored from the start, nothing else.
    expect(w.exploredIn(centre)).toHaveLength(9);
    expect(w.exploredIn(w.zones[1]!)).toHaveLength(0);
  });
});

describe("the Offerings", () => {
  it("come one every two hours, wait up to twelve, and give 1 Knowledge each", () => {
    const w = world();
    expect(w.waiting(1, A, at(1, 0))).toMatchObject({ count: 0, every: 7_200, nextAt: at(1, 2) });
    expect(w.waiting(1, A, at(1, 6)).count).toBe(3);
    expect(w.offer(1, A, at(1, 6))).toEqual({ knowledge: 3, order: true });
    expect(w.allegiances.get(1)!.knowledge).toBe(3);
    expect(() => w.offer(1, A, at(1, 7))).toThrow("Conquest: no Offering yet");
    // A long absence: twelve wait, no more, and the clock starts again.
    expect(w.waiting(1, A, at(4, 0))).toMatchObject({ count: 12, nextAt: null });
    expect(w.offer(1, A, at(4, 0)).knowledge).toBe(12);
    expect(w.waiting(1, A, at(4, 1)).count).toBe(0);
    expect(w.waiting(1, A, at(4, 2)).count).toBe(1);
  });

  it("give the allegiance one order with a member's first Offering of a day of play, when they were a member as the day began", () => {
    const w = world();
    expect(w.ordersLeft(1, at(1, 6))).toBe(0);
    expect(w.offer(1, A, at(1, 6)).order).toBe(true);
    expect(w.offer(1, A, at(1, 12)).order).toBe(false);
    // B joined during the day: their Offering counts, their order does not.
    expect(w.offer(1, B, at(1, 13), at(1, 1)).order).toBe(false);
    expect(w.ordersLeft(1, at(1, 14))).toBe(1);
    // Orders not used are lost at midnight; a rest day gives none.
    expect(w.ordersLeft(1, at(2, 1))).toBe(0);
    expect(w.offer(1, A, at(7, 6))).toMatchObject({ order: false });
    expect(w.member(1, A).offeringDays).toEqual([1, 7]);
  });

  it("come faster with Devotion, down to one an hour, and end with Frontiers", () => {
    expect(CONQUEST_OFFERINGS_A_DAY.map((_, level) => conquestOfferingEvery(level))).toEqual([7200, 6646, 6171, 5760, 5400, 4800, 4547, 4320, 4114, 3927, 3600]);
    const w = world();
    expect(() => w.offer(1, A, conquestStart(N) + 60)).toThrow("Conquest: not open yet");
    w.offer(1, A, at(20, 23));
    expect(w.waiting(1, A, at(22, 0))).toMatchObject({ count: 0, nextAt: null });
    expect(() => w.offer(1, A, at(22, 0))).toThrow("Conquest: the Offerings are over");
  });
});

describe("the exploration", () => {
  it("draws a cell's Knowledge from its zone's odds: 11 on average in a province, 20 in a free zone", () => {
    for (const kind of ["province", "free"] as const) {
      const odds = CONQUEST_ODDS[kind];
      expect(odds.reduce((sum, o) => sum + o.share, 0)).toBe(100);
      expect(Math.round(odds.reduce((sum, o) => sum + o.knowledge * o.share, 0) / 100)).toBe(kind === "free" ? 20 : 11);
      const drawn = Array.from({ length: 2_000 }, (_, i) => conquestKnowledgeAt(N, i % 50, Math.floor(i / 50), kind === "free"));
      expect(drawn.every((k) => odds.some((o) => o.knowledge === k))).toBe(true);
      expect(new Set(drawn).size).toBe(5);
    }
    expect(conquestKnowledgeAt(N, 3, 4, false)).toBe(conquestKnowledgeAt(N, 3, 4, false));
  });

  it("takes one cell a day per member, in the allegiance's province until Frontiers opens every zone", () => {
    const w = world();
    const home = w.zones[4]!;
    const free = w.zones[1]!;
    const found = w.explore(1, A, home.x0, home.y0, at(1));
    expect(found.knowledge).toBe(conquestKnowledgeAt(N, home.x0, home.y0, false));
    expect(w.allegiances.get(1)!.knowledge).toBe(found.knowledge);
    expect(w.isExplored(home.x0, home.y0)).toBe(true);
    expect(() => w.explore(1, A, home.x0 + 1, home.y0, at(1, 13))).toThrow("Conquest: already explored today");
    expect(() => w.explore(1, B, home.x0, home.y0, at(1, 13))).toThrow("Conquest: the cell is explored");
    expect(() => w.explore(1, B, free.x0, free.y0, at(2))).toThrow("Conquest: the zone is closed");
    expect(() => w.explore(1, B, w.zones[0]!.x0, 0, at(9))).toThrow("Conquest: the zone is closed");
    expect(() => w.explore(1, B, home.x0 + 1, home.y0, at(7))).toThrow("Conquest: nobody explores today");
    expect(() => w.explore(1, B, home.x0 + MID, home.y0 + MID, at(2))).toThrow("Conquest: the cell is built");
    expect(w.explore(1, B, free.x0, free.y0, at(15)).knowledge).toBe(conquestKnowledgeAt(N, free.x0, free.y0, true));
    expect(() => w.explore(1, B, -1, 0, at(16))).toThrow("Conquest: no such cell");
    expect(() => w.explore(1, A, free.x0 + 1, free.y0, at(21))).toThrow("Conquest: nobody explores today");
  });
});

/** The capital's side cell that faces its city edge, and the first tile that fits there. */
function cityCell(w: Conquest, guild: number) {
  const zone = w.zones.find((z) => z.guild === guild)!;
  const cx = zone.x0 + MID;
  const cy = zone.y0 + MID;
  const side = [2, 4, 6, 8].find((direction) => edgeCategory(CONQUEST_CAPITAL_PLAN, 1, direction) === CATEGORY_CITY)!;
  const [x, y] = side === 2 ? [cx, cy + 1] : side === 4 ? [cx + 1, cy] : side === 6 ? [cx, cy - 1] : [cx - 1, cy];
  return { x: x!, y: y! };
}

describe("building", () => {
  it("asks for an open zone, an explored cell next to a tile of the allegiance, and matching edges", () => {
    const w = world();
    const home = w.zones[4]!;
    const { x, y } = cityCell(w, 1);
    const fits = w.fitting(1, x, y, at(1));
    expect(fits.length).toBeGreaterThan(0);
    const { plan, orientations } = fits[0]!;
    const tile = { x, y, plan, orientation: orientations[0]! };
    expect(w.buildRefusal(1, tile, at(1))).toBeNull();
    expect(w.buildRefusal(1, tile, at(7))).toBe("Conquest: nobody builds today");
    expect(w.buildRefusal(1, tile, at(21))).toBe("Conquest: nobody builds today");
    expect(w.buildRefusal(2, tile, at(1))).toBe("Conquest: the zone is closed");
    // In Frontiers the zone is open to a rival, who has no tile next to the cell.
    expect(w.buildRefusal(2, tile, at(15))).toBe("Conquest: not next to a tile of the allegiance");
    expect(w.buildRefusal(1, { ...tile, x: home.x0, y: home.y0 }, at(1))).toBe("Conquest: the cell is not explored");
    expect(w.buildRefusal(1, { ...tile, x: home.x0 + MID, y: home.y0 + MID }, at(1))).toBe("Conquest: the cell is built");
    expect(w.buildRefusal(1, { ...tile, plan: 99 }, at(1))).toBe("Conquest: no such tile");
    // A diagonal neighbour of the capital is explored, but touches no tile by a side.
    expect(w.buildRefusal(1, { ...tile, x: home.x0 + MID + 1, y: home.y0 + MID + 1 }, at(1))).toBe("Conquest: not next to a tile of the allegiance");
    const wrong = BASE_PLAN_CODES.flatMap((p) => [1, 2, 3, 4].map((o) => ({ x, y, plan: p, orientation: o }))).find((t) => w.buildRefusal(1, t, at(1)) === "Tile: cannot place");
    expect(wrong).toBeDefined();
    expect(w.frontier(1, at(1))).toHaveLength(4);
    expect(w.frontier(1, at(7))).toHaveLength(0);
  });

  it("builds a request's tile when a member gives it: one order, the giver's name, Cobbles by rarity", () => {
    const w = world();
    const { x, y } = cityCell(w, 1);
    const { plan, orientations } = w.fitting(1, x, y, at(1))[0]!;
    const request = w.request(1, A, { x, y, plan, orientation: orientations[0]! }, at(1));
    expect([...w.requests.values()]).toEqual([request]);
    // A request spends no order; the gift needs one.
    expect(() => w.give(1, B, request.id, at(1, 13))).toThrow("Conquest: no order left today");
    expect(() => w.give(2, B, request.id, at(1, 13))).toThrow("Conquest: no such request");
    w.offer(1, B, at(1, 13));
    const built = w.give(1, B, request.id, at(1, 14));
    expect(built.tile).toMatchObject({ x, y, plan, guild: 1, by: B, day: 1, kind: "tile" });
    expect(built.cobbles).toBe(conquestGiftCobbles(plan));
    expect(w.requests.size).toBe(0);
    expect(w.ordersLeft(1, at(1, 15))).toBe(0);
    expect(w.allegiances.get(1)!.tiles).toBe(1);
    expect(w.member(1, B).tiles).toBe(1);
    expect(w.tileAt(x, y)).toBe(built.tile);
  });

  it("keeps one request per cell for an allegiance, and drops one that no longer fits", () => {
    const w = world();
    const { x, y } = cityCell(w, 1);
    const fits = w.fitting(1, x, y, at(1));
    const first = w.request(1, A, { x, y, plan: fits[0]!.plan, orientation: fits[0]!.orientations[0]! }, at(1));
    const second = w.request(1, A, { x, y, plan: fits[1]!.plan, orientation: fits[1]!.orientations[0]! }, at(1, 13));
    expect([...w.requests.keys()]).toEqual([second.id]);
    expect(first.id).not.toBe(second.id);
    expect(() => w.request(1, A, { x: x + 5, y, plan: fits[0]!.plan, orientation: 1 }, at(1))).toThrow();
  });

  it("pays a closed structure to the allegiance with the most tiles in it, with the level of the moment", () => {
    // Every tile that fits the capital's city edge, one world each: at least one closes the capital's city (two tiles).
    const closings = BASE_PLAN_CODES.flatMap((plan) =>
      [1, 2, 3, 4].flatMap((orientation) => {
        const w = world();
        const { x, y } = cityCell(w, 1);
        if (w.buildRefusal(1, { x, y, plan, orientation }, at(1)) !== null) return [];
        w.allegiances.get(1)!.knowledge = 1_000;
        w.research(1, "cities", at(1));
        w.offer(1, A, at(1, 6));
        const request = w.request(1, A, { x, y, plan, orientation }, at(1, 6));
        const { scored } = w.give(1, A, request.id, at(1, 6));
        return scored.filter((s) => s.kind === "city").map((s) => ({ s, w }));
      }),
    );
    expect(closings.length).toBeGreaterThan(0);
    const { s, w } = closings.find((c) => c.s.size === 2) ?? closings[0]!;
    expect(s).toMatchObject({ winner: 1, counts: [[1, s.size]], day: 1, phase: "foundation" });
    expect(s.points).toBe(conquestPoints("city", s.size, 1));
    expect(w.allegiances.get(1)!.score.foundation).toBe(s.points);
    expect(w.ranking()[0]).toEqual({ guild: 1, score: s.points });
    expect(w.ranking("awakening")[0]).toEqual({ guild: 1, score: 0 });
  });

  it("gives a tie to nobody", () => {
    expect(conquestMajority(new Map([[1, 3], [2, 2]]))).toBe(1);
    expect(conquestMajority(new Map([[1, 2], [2, 2]]))).toBeNull();
    expect(conquestMajority(new Map([[1, 2], [2, 2], [3, 3]]))).toBe(3);
    expect(conquestMajority(new Map())).toBeNull();
  });

  it("grows the points faster than the size, and adds the branch's bonus", () => {
    expect(conquestPoints("city", 10)).toBe(2_523);
    expect(conquestPoints("city", 30)).toBe(12_044);
    expect(Math.round(conquestPoints("city", 60) / 1_000)).toBe(48);
    expect(conquestPoints("city", 30, 10)).toBe(19_271);
    expect(conquestPoints("city", 30, 5)).toBe(15_658);
    expect(conquestPoints("great", 9) / conquestPoints("wonder", 9)).toBeCloseTo(4, 2);
  });
});

describe("the knowledge tree", () => {
  it("costs 4,550 a branch, 22,750 in all, bought level by level until Frontiers ends", () => {
    expect(CONQUEST_LEVEL_COSTS.reduce((a, b) => a + b, 0)).toBe(4_550);
    const w = world();
    expect(() => w.research(1, "roads", at(1))).toThrow("Conquest: not enough Knowledge");
    w.allegiances.get(1)!.knowledge = 4_600;
    expect(w.research(1, "roads", at(1))).toEqual({ level: 1, cost: 40 });
    for (let level = 2; level <= 10; level++) w.research(1, "roads", at(7));
    expect(w.allegiances.get(1)!.knowledge).toBe(50);
    expect(() => w.research(1, "roads", at(8))).toThrow("Conquest: the branch is complete");
    expect(() => w.research(1, "cities", at(21))).toThrow("Conquest: research is closed");
    expect(() => w.research(9, "cities", at(2))).toThrow("Conquest: the allegiance is not registered");
    // Devotion: the Offerings come every hour and a half at level 4.
    w.allegiances.get(1)!.knowledge = 400;
    for (let level = 1; level <= 4; level++) w.research(1, "devotion", at(8));
    expect(w.waiting(1, A, at(8)).every).toBe(5_400);
  });
});

describe("roles and rewards", () => {
  it("lets the Leader and the Officers lead", () => {
    expect([GUILD_RANK.recruit, GUILD_RANK.member, GUILD_RANK.veteran, GUILD_RANK.officer, GUILD_RANK.leader].map(conquestLeads)).toEqual([false, false, false, true, true]);
  });

  it("pays the podium more, and crests the final podium", () => {
    expect([1, 2, 3, 4, 20].map(conquestPhaseCobbles)).toEqual([150, 100, 75, 25, 25]);
    expect([1, 2, 3, 4, 20].map(conquestFinalCobbles)).toEqual([400, 250, 150, 50, 50]);
    expect([1, 2, 3, 4].map(conquestCrest)).toEqual(["gold", "silver", "bronze", null]);
  });
});
