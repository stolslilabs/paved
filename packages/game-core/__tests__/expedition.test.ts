import { describe, expect, it } from "vitest";
import {
  CategoryType,
  EXPEDITION_BAG,
  EXPEDITION_HAND,
  EXPEDITION_MAPS,
  EXPEDITION_RATION,
  EXPEDITION_TIERS,
  Expedition,
  OrientationType,
  PlanType,
  expeditionBag,
  expeditionCells,
  expeditionDayOf,
  expeditionEndsAt,
  expeditionNextTier,
  expeditionOrder,
  expeditionSeasonOf,
  expeditionTierOf,
  expeditionWeekOf,
  expeditionWeekStart,
  type ExpeditionEntry,
} from "../src";

const at = (iso: string) => Date.parse(iso) / 1000;
const { North, East, South, West } = OrientationType;
const WINTER = 400;
const SPRING = 401;
const SUMMER = 402;
const AUTUMN = 403;
const WILD = PlanType.WFFFFFFFF;
const CAP = PlanType.FFFFFFCFF;
const STRAIGHT = PlanType.RFFFRFFFR;
const CURVE = PlanType.RFRFFFFFR;

type Step = [PlanType, OrientationType, number, number];
const wild = (cells: number[][]): Step[] => cells.map(([x, y]) => [WILD, North, x!, y!]);

/** A board whose draw is `steps`' plans in order, a day drawn each time the hand is empty, each step laid. */
function play(week: number, steps: readonly Step[]): Expedition {
  const board = new Expedition(
    week,
    1n,
    steps.map(([plan]) => plan),
  );
  let day = 0;
  steps.forEach(([plan, orientation, x, y], index) => {
    if (board.hand.length === 0) board.draw(day++);
    expect(board.hand[0]).toEqual({ card: index, plan });
    board.build(index, { orientation, x, y });
  });
  return board;
}

/** North from the camp to the cell under a far landmark: the cap that closes the camp's city, then three plain tiles. */
const NORTH_TRAIL: Step[] = [[CAP, North, 0, 1], ...wild([[0, 2], [0, 3], [0, 4]])];

describe("the Expedition's calendar", () => {
  it("runs a week from Monday 00:00 UTC, a day each, the seasons' maps in turn", () => {
    const monday = at("2026-11-09T00:00:00Z");
    const week = expeditionWeekOf(monday);
    expect(expeditionWeekStart(week)).toBe(monday);
    expect(expeditionWeekOf(monday - 1)).toBe(week - 1);
    expect(expeditionEndsAt(week)).toBe(at("2026-11-16T00:00:00Z"));
    expect(expeditionDayOf(monday)).toBe(0);
    expect(expeditionDayOf(at("2026-11-11T13:00:00Z"))).toBe(2);
    expect(expeditionDayOf(at("2026-11-15T23:59:59Z"))).toBe(6);
    expect([WINTER, SPRING, SUMMER, AUTUMN, AUTUMN + 1].map(expeditionSeasonOf)).toEqual(["winter", "spring", "summer", "autumn", "winter"]);
  });

  it("pays the highest of four tiers", () => {
    expect(EXPEDITION_TIERS.map((t) => [t.score, t.cobbles])).toEqual([
      [4_000, 20],
      [6_000, 40],
      [8_000, 70],
      [10_000, 100],
    ]);
    expect(expeditionTierOf(3_999)).toBeNull();
    expect(expeditionTierOf(4_000)?.id).toBe("scout");
    expect(expeditionTierOf(8_412)?.id).toBe("explorer");
    expect(expeditionTierOf(25_000)?.id).toBe("cartographer");
    expect(expeditionNextTier(3_223)).toMatchObject({ id: "scout", score: 4_000 });
    expect(expeditionNextTier(10_000)).toBeNull();
  });
});

describe("the week's bag", () => {
  it("holds 42 cards, the same for every explorer, with the cards the map's objectives need", () => {
    for (const week of [WINTER, SPRING, SUMMER, AUTUMN]) {
      const bag = expeditionBag(week);
      expect(bag).toHaveLength(EXPEDITION_BAG);
      expect(expeditionBag(week)).toEqual(bag);
      const left = [...bag];
      for (const plan of EXPEDITION_MAPS[expeditionSeasonOf(week)].needs) {
        expect(left).toContain(plan);
        left.splice(left.indexOf(plan), 1);
      }
    }
    expect(expeditionBag(AUTUMN)).not.toEqual(expeditionBag(AUTUMN + 4));
  });

  it("is drawn by each board in its own order", () => {
    const one = expeditionOrder(AUTUMN, 1n);
    const two = expeditionOrder(AUTUMN, 2n);
    expect(one).not.toEqual(two);
    expect(expeditionOrder(AUTUMN, 1n)).toEqual(one);
    const sorted = (plans: PlanType[]) => [...plans].sort();
    expect(sorted(one)).toEqual(sorted(expeditionBag(AUTUMN)));
    expect(sorted(two)).toEqual(sorted(expeditionBag(AUTUMN)));
  });
});

describe("the ration", () => {
  /** The tiles drawn and lost by a week of visits on `days`, the hand keeping `kept[i]` tiles after visit `i` (none otherwise). */
  function visits(days: number[], kept: number[] = []) {
    const board = new Expedition(AUTUMN, 7n);
    let drawn = 0;
    let lost = 0;
    days.forEach((day, i) => {
      const out = board.draw(day);
      drawn += out.drawn;
      lost += out.lost;
      // Laying is not the point here: the tiles leave the hand by a discard.
      while (board.hand.length > (kept[i] ?? 0)) board.discard(board.hand[0]!.card);
    });
    return { drawn, lost };
  }

  it("brings 6 tiles a day, held up to 12: a missed day costs nothing, longer loses tiles (the proposal's table)", () => {
    expect(visits([0, 1, 2, 3, 4, 5, 6])).toEqual({ drawn: 42, lost: 0 });
    expect(visits([0, 2, 4, 6])).toEqual({ drawn: 42, lost: 0 });
    expect(visits([0, 1, 3, 6], [1, 2])).toEqual({ drawn: 34, lost: 8 });
    expect(visits([3, 4, 5, 6])).toEqual({ drawn: 30, lost: 12 });
    expect(visits([6])).toEqual({ drawn: 12, lost: 30 });
  });

  it("draws once a day, in the board's order, and says what a draw would bring", () => {
    const board = new Expedition(AUTUMN, 7n);
    expect(board.lastDay).toBe(-1);
    expect(board.due(1)).toEqual({ drawn: 12, lost: 0 });
    expect(board.draw(0)).toEqual({ drawn: EXPEDITION_RATION, lost: 0 });
    expect(board.hand.map((c) => c.plan)).toEqual(board.order.slice(0, 6));
    expect(board.draw(0)).toEqual({ drawn: 0, lost: 0 });
    expect(board.draw(1)).toEqual({ drawn: 6, lost: 0 });
    expect(board.hand).toHaveLength(EXPEDITION_HAND);
    expect(board.draw(2)).toEqual({ drawn: 0, lost: 6 });
    expect(board.toCome).toBe(24);
    expect(board.days[2]).toMatchObject({ drawn: 0, lost: 6 });
    expect(() => board.draw(7)).toThrow("Expedition: invalid day");
  });
});

describe("the map and its trail", () => {
  it("writes the camp and the landmarks on an 11 by 12 map", () => {
    const cells = new Set(expeditionCells().map((c) => `${c.x},${c.y}`));
    expect(cells.size).toBe(132);
    const board = new Expedition(AUTUMN, 1n);
    expect(board.rules.tileAt(0, 0)?.plan).toBe(PlanType.RFFFRFCFR);
    expect(board.rules.placed()).toHaveLength(1 + 4 + 3);
    expect(board.map.name).toBe("The Sacred Wood");
    expect(board.objectives().map((o) => [o.id, o.bonus, o.done])).toEqual([
      ["crossroads", 300, false],
      ["ruin", 600, false],
      ["villages", 900, false],
      ["landmark", 1_500, false],
    ]);
    for (const map of Object.values(EXPEDITION_MAPS)) for (const site of map.sites) for (const t of site.tiles) expect(cells.has(`${t.x},${t.y}`)).toBe(true);
  });

  it("lays a tile next to the trail only: a landmark anchors nothing until it is reached", () => {
    const board = new Expedition(AUTUMN, 1n, [PlanType.WFFFFFFFR, WILD, WILD]);
    board.draw(0);
    // Against the crossroads alone, its road matched: the engine would take it, the trail does not.
    expect(board.refusal(PlanType.WFFFFFFFR, { orientation: South, x: 2, y: -3 })).toBe("Expedition: not on the trail");
    // Outside the map, on a tile, and against the camp's city.
    expect(board.refusal(WILD, { orientation: North, x: 6, y: 0 })).toBe("Village: cell not owned");
    expect(board.refusal(WILD, { orientation: North, x: 0, y: 0 })).toBe("Tile: already exists");
    expect(board.refusal(WILD, { orientation: North, x: 0, y: 1 })).toBe("Tile: cannot place");
    expect(new Set(board.legalPlacements(WILD).map((p) => `${p.x},${p.y}`))).toEqual(new Set(["0,-1"]));
    expect(() => board.build(5, { orientation: North, x: 0, y: -1 })).toThrow("Expedition: not in hand");
    board.build(1, { orientation: North, x: 0, y: -1 });
    expect(board.hand.map((c) => c.card)).toEqual([0, 2]);
    expect(board.laid).toBe(1);
  });

  it("reaches the old crossroads: 300, once", () => {
    const board = play(AUTUMN, wild([[0, -1], [1, -1], [2, -1], [2, -2]]));
    expect(board.done).toEqual([]);
    const done = play(AUTUMN, [...wild([[0, -1], [1, -1], [2, -1], [2, -2]]), [PlanType.WFFFFFFFR, South, 2, -3]]);
    expect(done.done).toEqual(["crossroads"]);
    // The road from the tile's wonder to the crossroads closes too: 2 tiles, 209.
    expect(done.boardScore).toBe(209);
    expect(done.bonus).toBe(300);
    expect(done.score).toBe(509);
    // The crossroads is on the trail now: a tile goes against it alone.
    expect(done.refusal(PlanType.SFRFRFRFR, { orientation: North, x: 4, y: -3 })).toBeNull();
  });

  it("surrounds the ruin: its wonder's 900 and 600", () => {
    const around = wild([[0, -1], [-1, -1], [-1, -2], [-2, -2], [-3, -2], [-3, -3], [-3, -4], [-2, -4], [-1, -4], [-1, -3]]);
    const board = play(AUTUMN, around.slice(0, 9));
    expect(board.objectives()[1]).toMatchObject({ id: "ruin", done: false, count: 7, of: 8 });
    const done = play(AUTUMN, around);
    expect(done.objectives()[1]).toMatchObject({ done: true, count: 8 });
    expect(done.rules.closings().filter((c) => c.category === CategoryType.Wonder)).toHaveLength(1);
    expect(done.boardScore).toBe(900);
    expect(done.score).toBe(1_500);
  });

  it("links the two villages by one road through the camp: a road of 7 and 900", () => {
    const steps: Step[] = [
      [STRAIGHT, North, -1, 0],
      [STRAIGHT, North, 1, 0],
      [STRAIGHT, North, -2, 0],
      [STRAIGHT, North, 2, 0],
    ];
    expect(play(AUTUMN, steps.slice(0, 3)).done).toEqual([]);
    const done = play(AUTUMN, steps);
    expect(done.done).toEqual(["villages"]);
    expect(done.rules.closings()).toMatchObject([{ category: CategoryType.Road, size: 7, points: 823 }]);
    expect(done.score).toBe(823 + 900);
  });
});

describe("the season's landmark", () => {
  it("autumn: the sacred wood closed by its ring road", () => {
    const board = play(AUTUMN, [...NORTH_TRAIL, [CURVE, East, -1, 5], [CURVE, North, 1, 5], [STRAIGHT, East, -1, 6], [STRAIGHT, East, 1, 6], [CURVE, South, -1, 7], [CURVE, West, 1, 7]]);
    expect(board.done).toEqual(["landmark"]);
    const closings = board.rules.closings();
    expect(closings.find((c) => c.category === CategoryType.Road)).toMatchObject({ size: 8, points: 963 });
    expect(closings.find((c) => c.category === CategoryType.Forest)).toMatchObject({ tiles: 9 });
    expect(board.bonus).toBe(1_500);
  });

  it("winter: the ruined citadel closed, a city of 7", () => {
    const board = play(WINTER, [...NORTH_TRAIL, [CAP, East, 1, 5], [CAP, West, -1, 5], [CAP, East, 1, 6], [CAP, West, -1, 6], [CAP, North, 0, 7]]);
    expect(board.map.name).toBe("The Ruined Citadel");
    expect(board.done).toEqual(["landmark"]);
    expect(board.rules.closings().at(-1)).toMatchObject({ category: CategoryType.City, size: 7 });
  });

  it("spring: one road through the two waystones and the two remnants, 9 tiles", () => {
    const steps: Step[] = [...NORTH_TRAIL, [WILD, North, 0, 5], [STRAIGHT, North, 0, 6], [STRAIGHT, North, 1, 6], [STRAIGHT, North, 3, 6], [STRAIGHT, North, -2, 6], [STRAIGHT, North, -3, 6]];
    expect(play(SPRING, steps.slice(0, -1)).done).toEqual([]);
    const done = play(SPRING, steps);
    expect(done.done).toEqual(["landmark"]);
    expect(done.rules.closings().at(-1)).toMatchObject({ category: CategoryType.Road, size: 9, points: 1_108 });
  });

  it("summer: the great wonder surrounded, the map's second wonder", () => {
    const board = play(SUMMER, [...NORTH_TRAIL, ...wild([[0, 5], [-1, 5], [1, 5], [-1, 6], [1, 6], [-1, 7], [0, 7], [1, 7]])]);
    expect(board.done).toEqual(["landmark"]);
    expect(board.objectives()[3]).toMatchObject({ kind: "surround", count: 8, of: 8, done: true });
  });
});

describe("a board's log", () => {
  it("plays again to the same board, and a discard takes 50 points at most", () => {
    const log: ExpeditionEntry[] = [
      { k: "draw", day: 0 },
      { k: "build", card: 0, o: 1, x: -1, y: 0 },
      { k: "build", card: 1, o: 1, x: 1, y: 0 },
      { k: "build", card: 2, o: 1, x: -2, y: 0 },
      { k: "build", card: 3, o: 1, x: 2, y: 0 },
      { k: "discard", card: 4 },
      { k: "draw", day: 2 },
    ];
    const order = [STRAIGHT, STRAIGHT, STRAIGHT, STRAIGHT, ...Array.from({ length: 14 }, () => WILD)];
    const board = Expedition.replay(AUTUMN, 1n, log, order);
    expect(board.boardScore).toBe(823 - 50);
    expect(board.score).toBe(823 - 50 + 900);
    expect(board.days[0]).toEqual({ drawn: 6, lost: 0, laid: 4, discarded: 1 });
    expect(board.hand).toHaveLength(12);
    expect(board.toCome).toBe(0);
    const copy = board.clone();
    copy.discard(copy.hand[0]!.card);
    expect(board.hand).toHaveLength(12);
    expect(() => Expedition.replay(AUTUMN, 1n, [{ k: "build", card: 0, o: 1, x: -1, y: 0 }], order)).toThrow("Expedition: not in hand");
  });
});
