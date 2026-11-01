/** The rules of PvP v2 (#732, #741): the free village, slots and XP, starter layouts, the attack, chests, the shop, quests. */
import { describe, expect, it } from "vitest";
import {
  ALL_AREAS,
  ATTACK_STAR_PERCENTS,
  CategoryType,
  EngineGame,
  OrientationType,
  PlanType,
  CHEST_CHOICES,
  DAILY_MILESTONES,
  DAILY_QUESTS,
  LEVEL_CAP,
  PVP_CHESTS_PER_DAY,
  QUEST_BONUS_COBBLES,
  QueuedAttack,
  SHOP_PRICES,
  STARTER_LAYOUTS,
  STARTER_TILE,
  VillageDraft,
  XP_CAP,
  addXp,
  breakdownOf,
  byCategory,
  attackDeck,
  attackDeckSize,
  attackExtras,
  attackStarPoints,
  attackStars,
  dailyMilestoneRefusal,
  dailyMilestoneStates,
  milestonesToClaim,
  WEEKLY_MILESTONES,
  WEEKLY_QUESTS,
  weeklyMilestoneClaimed,
  weeklyMilestoneRefusal,
  weeklyMilestoneStates,
  baseCopies,
  basePlanOf,
  buildOrder,
  cobbleChanceBps,
  drawChest,
  freeInventory,
  inventoryOf,
  isPlanCode,
  layoutBreakdown,
  layoutGame,
  layoutRefusal,
  layoutScore,
  leagueBoostBps,
  levelStatus,
  poseidon,
  pvpChestGranted,
  pvpChestRank,
  pvpXp,
  rarityOf,
  sameLayout,
  shopEndsAt,
  shopOffers,
  slotsOf,
  starterIndex,
  starterLayout,
  storyChestRank,
  storyRankAt,
  storyXp,
  xpFloor,
  xpLevelOf,
  type LayoutTile,
} from "../src";
import { starterCandidate } from "../scripts/v2-layouts";

const STARTER = STARTER_LAYOUTS[0]!;
const plansOf = (tiles: readonly LayoutTile[]) => tiles.map((t) => t.plan);
const limits = (tiles: readonly LayoutTile[], slots = 9) => ({ slots, inventory: inventoryOf(plansOf(tiles)) });

describe("rarity", () => {
  it("tiers the 19 plans by their copies in the base deck: 5 common, 10 uncommon, 4 mythic", () => {
    const codes = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(codes.reduce((n, p) => n + baseCopies(p), 0)).toBe(72);
    const tiers = codes.map(rarityOf);
    expect(tiers.filter((t) => t === "common")).toHaveLength(5);
    expect(tiers.filter((t) => t === "uncommon")).toHaveLength(10);
    expect(codes.filter((p) => rarityOf(p) === "mythic")).toEqual([1, 6, 17, 19]);
    expect(codes.filter((p) => rarityOf(p) === "common")).toEqual([7, 8, 10, 11, 13]);
    expect(() => rarityOf(0)).toThrow();
    expect(() => rarityOf(20)).toThrow();
  });
});

describe("XP, levels and slots", () => {
  it("keeps the curve: 100 x n XP from level n to n + 1", () => {
    expect([1, 2, 3, 20].map(xpFloor)).toEqual([0, 100, 300, 19_000]);
    expect([0, 99, 100, 299, 300].map(xpLevelOf)).toEqual([1, 1, 2, 2, 3]);
  });

  it("caps the level at 20, and the XP stops at the cap", () => {
    expect(LEVEL_CAP).toBe(20);
    expect(XP_CAP).toBe(19_000);
    expect(xpLevelOf(10 ** 9)).toBe(20);
    expect(addXp(18_990, 20)).toEqual({ xp: 19_000, gained: 10 });
    expect(addXp(19_000, 20)).toEqual({ xp: 19_000, gained: 0 });
    expect(levelStatus(19_000)).toEqual({ xp: 19_000, level: 20, floor: 19_000, next: 19_000, capped: true, slots: 28 });
    expect(levelStatus(150)).toEqual({ xp: 150, level: 2, floor: 100, next: 300, capped: false, slots: 10 });
  });

  it("gives slots = 8 + level: 9 at level 1, 28 at the cap", () => {
    expect(slotsOf(1)).toBe(9);
    expect(slotsOf(20)).toBe(28);
    expect(slotsOf(25)).toBe(28);
  });

  it("gives PvP 0 / 5 / 10 / 20 XP by stars, Story 5 per star the first time", () => {
    expect([0, 1, 2, 3].map(pvpXp)).toEqual([0, 5, 10, 20]);
    expect(storyXp(0, 3)).toBe(15);
    expect(storyXp(1, 3)).toBe(10);
    expect(storyXp(3, 3)).toBe(0);
    expect(storyXp(2, 1)).toBe(0);
  });
});

describe("the free village", () => {
  it("accepts a starter layout, and scores it whatever the order its tiles are listed in", () => {
    expect(layoutRefusal(STARTER, limits(STARTER))).toBeNull();
    const score = layoutScore(STARTER);
    expect(score).toBeGreaterThan(0);
    expect(layoutScore([...STARTER].reverse())).toBe(score);
    expect(sameLayout(STARTER, [...STARTER].reverse())).toBe(true);
  });

  it("builds in one canonical order: a breadth-first walk from the starter", () => {
    const line = [{ plan: 10, orientation: 2, x: 2, y: 0 }, { plan: 10, orientation: 2, x: 1, y: 0 }];
    expect(buildOrder(line)?.map((t) => t.x)).toEqual([1, 2]);
    expect(buildOrder([{ plan: 10, orientation: 2, x: 2, y: 0 }])).toBeNull();
  });

  it("allows a line with no physical limit, as long as the slots hold it", () => {
    const line = Array.from({ length: 8 }, (_, i) => ({ plan: 10, orientation: 1, x: i + 1, y: 0 }));
    expect(layoutRefusal(line, limits(line))).toBeNull();
    expect(layoutRefusal(line, limits(line, 8))).toBe("too-many-tiles");
  });

  it("refuses each broken rule", () => {
    const inv = limits(STARTER);
    const [first, ...rest] = STARTER;
    expect(layoutRefusal([...STARTER, { plan: 10, orientation: 2, x: 50, y: 50 }], { ...inv, slots: 20 })).toBe("not-held");
    expect(layoutRefusal(STARTER, { slots: 9, inventory: inventoryOf(plansOf(rest)) })).toBe("not-held");
    expect(layoutRefusal([{ ...first!, plan: 0 }, ...rest], inv)).toBe("invalid-plan");
    expect(layoutRefusal([{ ...first!, orientation: 5 }, ...rest], inv)).toBe("invalid-orientation");
    expect(layoutRefusal([{ ...first!, x: 0, y: 0 }, ...rest], inv)).toBe("starter-cell");
    expect(layoutRefusal([{ ...first!, x: rest[0]!.x, y: rest[0]!.y }, ...rest], inv)).toBe("duplicate-cell");
    const far = { plan: 10, orientation: 2, x: 9, y: 9 };
    expect(layoutRefusal([far], limits([far]))).toBe("not-connected");
    // The starter's road runs east to west: a full city east of it does not match
    const city = { plan: 1, orientation: 1, x: 1, y: 0 };
    expect(layoutRefusal([city], limits([city]))).toBe("cannot-place");
  });

  it("counts the inventory left once a layout is placed", () => {
    const inventory = inventoryOf([...plansOf(STARTER), 10, 10]);
    const free = freeInventory(inventory, STARTER);
    expect(free.reduce((a, b) => a + b, 0)).toBe(2);
    expect(free[9]).toBe(2);
  });
});

describe("a layout's points by structure", () => {
  it("adds up to the layout's score on every starter layout, the most points first, each structure once", () => {
    for (const layout of STARTER_LAYOUTS) {
      const { lines, other, score } = layoutBreakdown(layout);
      expect(score).toBe(layoutScore(layout));
      expect(other).toBe(0);
      expect(lines.reduce((sum, l) => sum + l.points, 0)).toBe(score);
      expect(lines.length).toBeGreaterThan(0);
      for (let i = 1; i < lines.length; i++) expect(lines[i - 1]!.points).toBeGreaterThanOrEqual(lines[i]!.points);
      expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    }
  });

  it("gives each structure its areas by cell, on the layout's cells, as many as its tiles", () => {
    const cells = new Set([STARTER_TILE, ...STARTER].map((t) => `${t.x},${t.y}`));
    for (const line of layoutBreakdown(STARTER).lines) {
      expect(line.areas).toHaveLength(line.tiles);
      for (const a of line.areas) {
        expect(cells.has(`${a.x},${a.y}`)).toBe(true);
        expect(a.areas).toBeGreaterThan(0);
        expect(a.areas).toBeLessThanOrEqual(0x1ff);
      }
    }
  });

  it("is a function of the layout alone: the same lines whatever the listing order", () => {
    expect(layoutBreakdown([...STARTER].reverse())).toEqual(layoutBreakdown(STARTER));
  });

  it("keeps a structure's key while the layout changes elsewhere", () => {
    const before = layoutBreakdown(STARTER).lines;
    // The last tile sent back: the structures it was not part of keep their keys.
    const last = STARTER[STARTER.length - 1]!;
    const after = new Set(layoutBreakdown(STARTER.slice(0, -1)).lines.map((l) => l.key));
    const untouched = before.filter((l) => !l.areas.some((a) => a.x === last.x && a.y === last.y));
    expect(untouched.length).toBeGreaterThan(0);
    for (const l of untouched) expect(after.has(l.key)).toBe(true);
  });

  it("lights a line's own areas, but a wonder's tile alone, its line still counting the 9 (#792)", () => {
    for (const line of layoutBreakdown(STARTER).lines) expect(line.lit).toBe(line.areas);
    // A wonder at (1, 0), its 8 around it: the starter, six written and the last built, which closes it.
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.force(PlanType.WFFFFFFFR);
    game.build({ orientation: OrientationType.North, x: 1, y: 0 });
    [[1, 1], [2, 1], [2, 0], [2, -1], [1, -1], [0, -1]].forEach(([x, y], index) => {
      game.write({ id: 100 + index, plan: PlanType.FFFFFFCFF, orientation: OrientationType.North, x: x!, y: y! });
    });
    game.force(PlanType.FFFFFFCFF);
    game.build({ orientation: OrientationType.North, x: 0, y: 1 });
    const { lines } = breakdownOf(game);
    const wonder = lines.find((l) => l.category === CategoryType.Wonder)!;
    expect(wonder.tiles).toBe(9);
    expect(wonder.areas).toHaveLength(9);
    expect(wonder.points).toBeGreaterThan(0);
    expect(wonder.lit).toEqual([{ x: 1, y: 0, areas: ALL_AREAS }]);
    // The other lines light what they hold.
    for (const line of lines.filter((l) => l !== wonder)) expect(line.lit).toBe(line.areas);
  });

  it("is empty for the starter alone, and puts the points no structure holds on their own", () => {
    expect(layoutBreakdown([])).toEqual({ lines: [], other: 0, score: 0 });
    const game = layoutGame(STARTER);
    const { lines, other } = breakdownOf(game);
    expect(lines.reduce((sum, l) => sum + l.points, 0) + other).toBe(game.score);
  });

  it("sums the lines by kind (#831): the four kinds, adding up to the score, the most points first, the fixed order on a tie", () => {
    for (const layout of STARTER_LAYOUTS) {
      const breakdown = layoutBreakdown(layout);
      const sums = byCategory(breakdown);
      expect(sums.map((s) => s.category).sort()).toEqual([CategoryType.City, CategoryType.Forest, CategoryType.Road, CategoryType.Wonder]);
      expect(sums.reduce((sum, s) => sum + s.points, 0) + breakdown.other).toBe(breakdown.score);
      for (let i = 1; i < sums.length; i++) expect(sums[i - 1]!.points).toBeGreaterThanOrEqual(sums[i]!.points);
      for (const { category, points } of sums) {
        expect(points).toBe(breakdown.lines.filter((l) => l.category === category).reduce((sum, l) => sum + l.points, 0));
      }
    }
    // No structure: every kind at 0, in the fixed order.
    expect(byCategory({ lines: [] })).toEqual([CategoryType.Road, CategoryType.City, CategoryType.Forest, CategoryType.Wonder].map((category) => ({ category, points: 0 })));
  });
});

describe("the village editor's draft", () => {
  it("places, moves, turns and sends back tiles, and stays valid at every step", () => {
    const draft = new VillageDraft({ slots: 10, inventory: inventoryOf([...plansOf(STARTER), 10]) }, STARTER);
    expect(draft.used).toBe(9);
    expect(draft.score).toBe(layoutScore(STARTER));
    const spot = draft.placements(10)[0]!;
    expect(draft.placeRefusal(spot)).toBeNull();
    draft.place(spot);
    expect(draft.used).toBe(10);
    expect(draft.free.every((n) => n === 0)).toBe(true);
    expect(draft.placeRefusal({ ...spot, x: spot.x + 40 })).toBe("too-many-tiles");
    expect(draft.liftRefusal(0, 0)).toBe("starter");
    expect(draft.moveRefusal({ x: 0, y: 0 }, { x: 5, y: 5, orientation: 1 })).toBe("starter");
    expect(draft.liftRefusal(77, 77)).toBe("no-tile");
    // The tile just placed has a single neighbour: it lifts
    expect(draft.lift(spot.x, spot.y)).toEqual(spot);
    expect(draft.tileAt(0, 0)).toEqual(STARTER_TILE);
    draft.reset();
    expect(draft.tiles).toEqual([]);
    expect(draft.score).toBe(0);
  });

  it("never lets the village split: a tile holding others cannot be lifted", () => {
    const line = [{ plan: 10, orientation: 1, x: 1, y: 0 }, { plan: 10, orientation: 1, x: 2, y: 0 }];
    const draft = new VillageDraft(limits(line), line);
    expect(draft.liftRefusal(1, 0)).toBe("not-connected");
    expect(() => draft.lift(1, 0)).toThrow("not-connected");
    expect(draft.liftRefusal(2, 0)).toBeNull();
    // A turn in place is a move to the same cell: the road turned north-south no longer meets its neighbour's
    expect(draft.moveRefusal({ x: 2, y: 0 }, { x: 2, y: 0, orientation: 3 })).toBeNull();
    expect(draft.moveRefusal({ x: 2, y: 0 }, { x: 2, y: 0, orientation: 2 })).toBe("cannot-place");
    draft.move({ x: 2, y: 0 }, { x: -1, y: 0, orientation: 1 });
    expect(draft.tileAt(-1, 0)?.plan).toBe(10);
  });
});

describe("the starter layouts", () => {
  it("are 64, each the starter plus 8 common or uncommon tiles, valid at level 1, scoring more than 0", () => {
    expect(STARTER_LAYOUTS).toHaveLength(64);
    for (const layout of STARTER_LAYOUTS) {
      expect(layout).toHaveLength(8);
      expect(layout.every((t) => rarityOf(t.plan) !== "mythic")).toBe(true);
      expect(layoutRefusal(layout, limits(layout, slotsOf(1)))).toBeNull();
      expect(layoutScore(layout)).toBeGreaterThan(0);
    }
  });

  it("are what the generator gives (the first two candidates)", () => {
    expect(starterCandidate(0)?.tiles).toEqual(STARTER_LAYOUTS[0]);
    expect(starterCandidate(1)?.tiles).toEqual(STARTER_LAYOUTS[1]);
  }, 60_000);

  it("give a player the same one on every device", () => {
    expect(starterIndex(0x1234n)).toBe(starterIndex(0x1234n));
    expect(starterLayout(0x1234n)).toEqual(STARTER_LAYOUTS[starterIndex(0x1234n)]);
    const picks = new Set(Array.from({ length: 200 }, (_, i) => starterIndex(BigInt(i + 1))));
    expect(picks.size).toBeGreaterThan(40);
  });
});

describe("the attack", () => {
  it("has a deck of ceil(1.15 x S)", () => {
    expect([9, 10, 20, 25, 28].map(attackDeckSize)).toEqual([11, 12, 23, 29, 33]);
    expect(attackExtras(8, 9)).toBe(3);
    expect(attackExtras(4, 9)).toBe(7);
  });

  it("holds every tile the defender placed, plus extras from the base deck, in an order drawn from the random", () => {
    const placed = plansOf(STARTER);
    const deck = attackDeck(placed, 9, 0xabcn);
    expect(deck).toHaveLength(11);
    const left = [...deck];
    for (const plan of placed) left.splice(left.indexOf(plan), 1);
    expect(left).toHaveLength(3);
    expect(attackDeck(placed, 9, 0xabcn)).toEqual(deck);
    expect(attackDeck(placed, 9, 0xabdn)).not.toEqual(deck);
    // A defender who placed half the tiles gives the attacker more extras, never a smaller deck
    expect(attackDeck(placed.slice(0, 4), 9, 1n)).toHaveLength(11);
  });

  it("draws the extras with the base deck's odds", () => {
    const counts = new Map<number, number>();
    const draws = 2_000;
    for (let i = 0; i < draws; i++) {
      const plan = basePlanOf(poseidon(0x77n, i));
      counts.set(plan, (counts.get(plan) ?? 0) + 1);
    }
    // Within about 4 standard deviations of each plan's share (at most 0.0074 at 2,000 draws)
    for (const [plan, n] of counts) expect(Math.abs(n / draws - baseCopies(plan) / 72)).toBeLessThan(0.03);
  }, 60_000);

  it("shows the tile in hand and the next two, and plays on an unbounded board", () => {
    const deck = attackDeck(plansOf(STARTER), 9, 5n);
    const attack = new QueuedAttack(deck);
    expect(attack.view).toEqual(deck.slice(0, 3));
    expect(attack.left).toBe(10);
    let far = 0;
    while (!attack.over) {
      const cell = attack.slots().sort((a, b) => Math.abs(b.x) + Math.abs(b.y) - Math.abs(a.x) - Math.abs(a.y))[0];
      if (cell) {
        attack.apply({ discard: false, orientation: attack.orientations(cell)[0]!, cell });
        far = Math.max(far, Math.abs(cell.x), Math.abs(cell.y));
      } else attack.apply({ discard: true });
      expect(attack.view).toEqual(deck.slice(attack.played, attack.played + 3));
    }
    expect(far).toBeGreaterThan(1);
    expect(attack.hand).toBeNull();
    expect(() => attack.apply({ discard: true })).toThrow("over");
    const replay = QueuedAttack.replay(deck, attack.run.played.map((m) => (m.discard ? { discard: true as const } : { discard: false as const, orientation: m.orientation, cell: m.cell })));
    expect(replay.score).toBe(attack.score);
  });

  it("refuses a build that does not fit, as the engine does", () => {
    const attack = new QueuedAttack([1]);
    expect(attack.refusal(1, { x: 1, y: 0 })).toBe("Tile: cannot place");
    expect(() => attack.apply({ discard: false, orientation: 1, cell: { x: 1, y: 0 } })).toThrow("Tile: cannot place");
  });

  it("gives stars at 80 / 90 / 100 % of the village's score", () => {
    expect(ATTACK_STAR_PERCENTS).toEqual([80, 90, 100]);
    expect(attackStarPoints(1_000)).toEqual([800, 900, 1_000]);
    expect([0, 799, 800, 899, 900, 999, 1_000, 2_000].map((s) => attackStars(s, 1_000))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(attackStarPoints(333)).toEqual([267, 300, 333]);
  });
});

describe("chests", () => {
  it("rank PvP by stars: none, basic, rare, epic, with 1, 2 or 3 choices", () => {
    expect([0, 1, 2, 3].map(pvpChestRank)).toEqual([null, "basic", "rare", "epic"]);
    expect(CHEST_CHOICES).toEqual({ basic: 1, rare: 2, epic: 3 });
  });

  it("rank Story by the level's place: the first half basic, then rare, the last epic; only on 3 stars, the first time", () => {
    expect(Array.from({ length: 12 }, (_, i) => storyRankAt(i + 1, 12))).toEqual([
      ...new Array(6).fill("basic"),
      ...new Array(5).fill("rare"),
      "epic",
    ]);
    expect(storyChestRank(12, 12, 2, 3)).toBe("epic");
    expect(storyChestRank(12, 12, 3, 3)).toBeNull();
    expect(storyChestRank(1, 12, 0, 2)).toBeNull();
  });

  it("caps PvP chests at 3 a day", () => {
    expect(PVP_CHESTS_PER_DAY).toBe(3);
    expect([0, 1, 2, 3, 4].map(pvpChestGranted)).toEqual([true, true, true, false, false]);
  });

  it("draw their tiles from the base deck's odds, and Cobbles at the rank's chance boosted by the league", () => {
    expect(leagueBoostBps(0)).toBe(10_000);
    expect(leagueBoostBps(22)).toBe(20_000);
    expect(leagueBoostBps(11)).toBe(15_000);
    expect(cobbleChanceBps("basic", 0)).toBe(200);
    expect(cobbleChanceBps("rare", 0)).toBe(500);
    expect(cobbleChanceBps("epic", 22)).toBe(2_000);
    const epic = drawChest("epic", 0, 9n);
    expect(epic.plans).toHaveLength(3);
    expect(drawChest("epic", 0, 9n)).toEqual(epic);
    expect(drawChest("basic", 0, 9n).plans).toHaveLength(1);
    const draws = 2_000;
    let cobbles = 0;
    let mythics = 0;
    for (let i = 0; i < draws; i++) {
      const chest = drawChest("epic", 22, BigInt(i));
      if (chest.cobbles > 0) cobbles += 1;
      if (chest.plans.some((p) => rarityOf(p) === "mythic")) mythics += 1;
    }
    // Within about 4 standard deviations (0.009 at 2,000 draws)
    expect(Math.abs(cobbles / draws - 0.2)).toBeLessThan(0.04);
    // Without putting back by plan (#868): 24.7 % (23.0 % with putting back)
    expect(Math.abs(mythics / draws - 0.247)).toBeLessThan(0.04);
  }, 60_000);

  it("offer distinct plans in a rare or epic chest, the first choice as a basic chest's, the same for the same random (#868)", () => {
    const draws = 1_000;
    let mythics = 0;
    for (let i = 0; i < draws; i++) {
      const random = BigInt(i) * 0x9e3779b97f4a7c15n;
      const epic = drawChest("epic", 0, random);
      const rare = drawChest("rare", 0, random);
      expect(new Set(epic.plans).size).toBe(3);
      expect(epic.plans.every(isPlanCode)).toBe(true);
      expect(rare.plans).toEqual(epic.plans.slice(0, 2));
      if (rare.plans.some((p) => rarityOf(p) === "mythic")) mythics += 1;
      if (i < 50) {
        expect(drawChest("basic", 0, random).plans).toEqual([basePlanOf(poseidon(random, 0))]);
        expect(drawChest("epic", 0, random)).toEqual(epic);
      }
    }
    // 972,105 / 5,868,128 = 16.6 % (16.0 % with putting back); about 4 standard deviations (0.012) at 1,000 draws
    expect(Math.abs(mythics / draws - 0.166)).toBeLessThan(0.05);
  }, 60_000);
});

describe("the daily shop", () => {
  it("offers 3 distinct base plans a day, the same for everyone, priced by rarity", () => {
    const day = 20_750;
    const offers = shopOffers(day);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((o) => o.plan)).size).toBe(3);
    expect(shopOffers(day)).toEqual(offers);
    for (const o of offers) expect(o.price).toBe(SHOP_PRICES[rarityOf(o.plan)]);
    expect(SHOP_PRICES).toEqual({ common: 10, uncommon: 20, mythic: 50 });
    expect(shopEndsAt(day)).toBe((day + 1) * 86_400);
  });

  it("changes with the day, a mythic about one day in six", () => {
    let changed = 0;
    let mythic = 0;
    const days = 600;
    for (let day = 0; day < days; day++) {
      if (shopOffers(day).map((o) => o.plan).join() !== shopOffers(day + 1).map((o) => o.plan).join()) changed += 1;
      if (shopOffers(day).some((o) => o.rarity === "mythic")) mythic += 1;
    }
    expect(changed).toBeGreaterThan(days * 0.99);
    // 1 - C(15, 3) / C(19, 3) = 52.4 % of days show a mythic; each mythic shows 3 / 19 of days, about one in six
    expect(Math.abs(mythic / days - 0.524)).toBeLessThan(0.08);
  }, 60_000);
});

describe("quests", () => {
  it("pay bonus Cobbles for every quest of a week, none for the day (#869)", () => {
    expect(QUEST_BONUS_COBBLES).toEqual({ weekly: 60 });
    expect("daily" in QUEST_BONUS_COBBLES).toBe(false);
  });

  it("five dailies a day, two milestones: 3 done give 10 Cobbles, 5 give 15, 25 a day", () => {
    expect(DAILY_QUESTS).toBe(5);
    expect(DAILY_MILESTONES).toEqual([
      { done: 3, cobbles: 10 },
      { done: 5, cobbles: 15 },
    ]);
    expect(DAILY_MILESTONES.reduce((sum, m) => sum + m.cobbles, 0)).toBe(25);
    // The last milestone is every daily of the day.
    expect(DAILY_MILESTONES.at(-1)!.done).toBe(DAILY_QUESTS);
  });

  it("a milestone is claimable once reached, once a day", () => {
    expect(dailyMilestoneStates(0, 0)).toEqual(["locked", "locked"]);
    expect(dailyMilestoneStates(2, 0)).toEqual(["locked", "locked"]);
    expect(dailyMilestoneStates(3, 0)).toEqual(["claimable", "locked"]);
    expect(dailyMilestoneStates(3, 0b01)).toEqual(["claimed", "locked"]);
    expect(dailyMilestoneStates(5, 0b01)).toEqual(["claimed", "claimable"]);
    expect(dailyMilestoneStates(5, 0)).toEqual(["claimable", "claimable"]);
    expect(dailyMilestoneStates(5, 0b11)).toEqual(["claimed", "claimed"]);

    expect(dailyMilestoneRefusal(0, 2, 0)).toBe("not-reached");
    expect(dailyMilestoneRefusal(0, 3, 0)).toBeNull();
    expect(dailyMilestoneRefusal(0, 3, 0b01)).toBe("milestone-claimed");
    expect(dailyMilestoneRefusal(1, 4, 0b01)).toBe("not-reached");
    expect(dailyMilestoneRefusal(1, 5, 0b01)).toBeNull();
    expect(dailyMilestoneRefusal(1, 5, 0b10)).toBe("milestone-claimed");
    for (const step of [-1, 2, 0.5]) expect(dailyMilestoneRefusal(step, 5, 0)).toBe("no-milestone");
  });

  it("five weeklies a week, two milestones (#976): 3 done give 50 Cobbles, 5 give 100, 150 a week", () => {
    expect(WEEKLY_QUESTS).toBe(5);
    expect(WEEKLY_MILESTONES).toEqual([
      { done: 3, cobbles: 50 },
      { done: 5, cobbles: 100 },
    ]);
    expect(WEEKLY_MILESTONES.reduce((sum, m) => sum + m.cobbles, 0)).toBe(150);
    // The last milestone is every weekly of the week, and each gift is worth more than any of the day's.
    expect(WEEKLY_MILESTONES.at(-1)!.done).toBe(WEEKLY_QUESTS);
    const dayBest = Math.max(...DAILY_MILESTONES.map((m) => m.cobbles));
    for (const m of WEEKLY_MILESTONES) expect(m.cobbles).toBeGreaterThan(dayBest);
  });

  it("a milestone of the week is claimable once reached, once a week (#976)", () => {
    expect(weeklyMilestoneStates(0, 0)).toEqual(["locked", "locked"]);
    expect(weeklyMilestoneStates(2, 0)).toEqual(["locked", "locked"]);
    expect(weeklyMilestoneStates(3, 0)).toEqual(["claimable", "locked"]);
    expect(weeklyMilestoneStates(4, 0b01)).toEqual(["claimed", "locked"]);
    expect(weeklyMilestoneStates(5, 0b01)).toEqual(["claimed", "claimable"]);
    expect(weeklyMilestoneStates(5, 0)).toEqual(["claimable", "claimable"]);
    expect(weeklyMilestoneStates(5, 0b11)).toEqual(["claimed", "claimed"]);
    expect(weeklyMilestoneClaimed(0b10, 1)).toBe(true);
    expect(weeklyMilestoneClaimed(0b10, 0)).toBe(false);

    // Allowed: reached and not claimed.
    expect(weeklyMilestoneRefusal(0, 3, 0)).toBeNull();
    expect(weeklyMilestoneRefusal(1, 5, 0b01)).toBeNull();
    // Refused: too few weeklies done.
    expect(weeklyMilestoneRefusal(0, 2, 0)).toBe("not-reached");
    expect(weeklyMilestoneRefusal(1, 4, 0b01)).toBe("not-reached");
    // Refused: already claimed this week (even with too few done: the claim is told first).
    expect(weeklyMilestoneRefusal(0, 3, 0b01)).toBe("milestone-claimed");
    expect(weeklyMilestoneRefusal(1, 5, 0b10)).toBe("milestone-claimed");
    // Refused: no such milestone.
    for (const step of [-1, 2, 0.5, Number.NaN]) expect(weeklyMilestoneRefusal(step, 5, 0)).toBe("no-milestone");
  });

  it("counts the gifts reached and not claimed, the day's and the week's (#976: the home's Missions count)", () => {
    expect(milestonesToClaim(WEEKLY_MILESTONES, 0, 0)).toBe(0);
    expect(milestonesToClaim(WEEKLY_MILESTONES, 3, 0)).toBe(1);
    expect(milestonesToClaim(WEEKLY_MILESTONES, 5, 0)).toBe(2);
    expect(milestonesToClaim(WEEKLY_MILESTONES, 5, 0b01)).toBe(1);
    expect(milestonesToClaim(WEEKLY_MILESTONES, 5, 0b11)).toBe(0);
    expect(milestonesToClaim(DAILY_MILESTONES, 4, 0)).toBe(1);
    expect(milestonesToClaim(DAILY_MILESTONES, 4, 0b01)).toBe(0);
  });
});
