import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EngineError,
  EngineGame,
  drawFromBitmap,
  multiplier,
  poseidon,
  withdrawExtra,
} from "../src/engine";
import { CategoryType } from "../src/types/category";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const felt = (text: string): bigint => BigInt(`0x${Buffer.from(text).toString("hex")}`);
const SEED = felt("SEED");
const { North, East, South, West } = OrientationType;

/** The seed of a Challenge golden at `day(index)`: Poseidon(0, 1000 + index). */
const goldenSeed = (index: number): bigint => poseidon(0, 1000 + index);

/** origami's deck as `random_deck.cairo` has it (`from_bitmap` then `draw`): the reference. */
function referenceDraw(seed: bigint, number: number, bitmap: bigint): { card: number; remaining: number } {
  const keys = new Map<number, number>();
  const cards = new Map<number, number>();
  let remaining = number;
  const withdraw = (card: number): void => {
    const key = keys.get(card) ?? card;
    if (remaining !== key) {
      const latest = cards.get(remaining) ?? remaining;
      cards.set(key, latest);
      keys.set(latest, key);
    }
    remaining -= 1;
  };
  for (let card = 1; bitmap !== 0n && card <= number; card++, bitmap >>= 1n) {
    if ((bitmap & 1n) === 1n) withdraw(card);
  }
  const random = poseidon(seed, 0, remaining);
  const key = Number(random % BigInt(remaining)) + 1;
  const card = cards.get(key) ?? key;
  withdraw(card);
  return { card, remaining };
}

/** A Challenge game on the forced plans of a board, built by the game's player unless an owner is given. */
function board(moves: [PlanType, OrientationType, number, number, bigint?][]): {
  game: EngineGame;
  results: ReturnType<EngineGame["build"]>[];
} {
  const game = EngineGame.start({ deck: "simple", seed: 0n });
  const results = moves.map(([plan, orientation, x, y, owner]) => {
    game.force(plan);
    return game.build({ orientation, x, y }, owner);
  });
  return { game, results };
}

describe("engine draw", () => {
  it("matches the Cairo tests of random_deck.cairo", () => {
    // test_deck_new_draw (first card) and test_deck_from_bitmap (first card)
    expect(drawFromBitmap(SEED, 5, 0n)).toEqual({ card: 2, remaining: 4 });
    expect(drawFromBitmap(SEED, 5, 0b100n)).toEqual({ card: 5, remaining: 3 });
    expect(() => drawFromBitmap(SEED, 10, 0x3ffn)).toThrow("Deck: no cards left");
    expect(() => drawFromBitmap(SEED, 129, 0n)).toThrow("Deck: too many cards");
  });

  it("withdraws the Simple deck's extra cards as deck.cairo's test_tiles", () => {
    expect(withdrawExtra(0n, 0n, 72, 38)).toBe(0xc88526b74cd8588fe4n);
  });

  it("equals origami's deck on every state of whole games (the P-17 shortcut)", () => {
    for (const [seed, number] of [
      [SEED, 10],
      [0n, 10],
      [0xdeadbeefn, 16],
      [felt("CHALLENGE"), 72],
      [goldenSeed(10), 72],
    ] as const) {
      let current = seed;
      let bitmap = 0n;
      for (let count = 1; ; count++) {
        const expected = referenceDraw(current, number, bitmap);
        expect(drawFromBitmap(current, number, bitmap)).toEqual(expected);
        if (expected.remaining === 0) break;
        bitmap |= 1n << BigInt(expected.card - 1);
        current = poseidon(current, count);
      }
    }
  }, 60_000); // Whole games of draws: well over the default 5 s on a loaded machine (a load average of 30 and more).

  it("draws the goldens' first tiles from their seeds", () => {
    // daily_deck (day 3) and daily_full_deck (day 10): real draws, golden/daily.cairo and full_deck.cairo
    expect(EngineGame.start({ deck: "simple", seed: goldenSeed(3) }).hand?.plan).toBe(PlanType.CCCCCCCCC);
    expect(EngineGame.start({ deck: "simple", seed: goldenSeed(10) }).hand?.plan).toBe(PlanType.RFRFCCCFR);
  });

  it("is deterministic and leaves a cloned game alone", () => {
    const one = EngineGame.start({ deck: "simple", seed: goldenSeed(3) });
    const copy = one.clone();
    one.discard();
    expect(copy.hand?.plan).toBe(PlanType.CCCCCCCCC);
    copy.discard();
    expect(copy.hand).toEqual(one.hand);
    expect(copy.seed).toBe(one.seed);
  });
});

describe("engine placement", () => {
  it("starts with the starter facing South at (0, 0) and the first tile in hand", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    expect(game.placed()).toEqual([
      { id: 1, plan: PlanType.RFFFRFCFR, orientation: South, x: 0, y: 0, owner: 1n },
    ]);
    expect(game.tileCount).toBe(2);
    expect(game.hand?.id).toBe(2);
  });

  it("refuses a taken position, a lone tile and a facing edge of another category", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.force(PlanType.RFFFRFFFR);
    expect(game.refusal({ orientation: North, x: 0, y: 0 })).toBe("Tile: already exists");
    expect(game.refusal({ orientation: North, x: 2, y: 0 })).toBe("Tile: no neighbors");
    // The starter's north edge is a city: a straight road facing North shows it a forest
    expect(game.refusal({ orientation: North, x: 0, y: 1 })).toBe("Tile: cannot place");
    expect(() => game.build({ orientation: North, x: 0, y: 1 })).toThrow(EngineError);
    expect(() => game.build({ orientation: North, x: 0, y: 1 })).toThrow("Tile: cannot place");
    // Nothing changed: the same tile is still in hand and the road east of the starter fits
    expect(game.hand?.plan).toBe(PlanType.RFFFRFFFR);
    expect(game.legalPlacements()).toContainEqual({ orientation: North, x: 1, y: 0 });
    expect(game.build({ orientation: North, x: 1, y: 0 }).scored).toEqual([]);
  });

  it("lists only legal placements, each one accepted", () => {
    const game = EngineGame.start({ deck: "simple", seed: goldenSeed(10) });
    const placements = game.legalPlacements();
    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements) expect(game.refusal(placement)).toBeNull();
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        for (const orientation of [North, East, South, West]) {
          const listed = placements.some((p) => p.x === x && p.y === y && p.orientation === orientation);
          expect(game.canPlace({ orientation, x, y })).toBe(listed);
        }
      }
    }
  });
});

describe("engine game", () => {
  it("discards for 50 points, at most the score", () => {
    const { game } = board([[PlanType.FFCFFFCFF, North, 0, 1]]);
    expect(game.score).toBe(2 * 200 * multiplier(2) / 10000 | 0);
    const before = game.score;
    const held = game.hand;
    const result = game.discard();
    expect(result).toMatchObject({ action: "discard", points: 50, score: before - 50, scored: [] });
    expect(result.tileId).toBe(held?.id);
    expect(game.discarded).toBe(1);
    expect(game.hand?.id).toBe((held?.id ?? 0) + 1);
    const empty = EngineGame.start({ deck: "simple", seed: 0n });
    expect(empty.discard()).toMatchObject({ points: 0, score: 0 });
  });

  it("ends at the tile limit and refuses every move after", () => {
    const game = EngineGame.start({ deck: "simple", seed: goldenSeed(3), tileLimit: 3 });
    expect(game.discard().over).toBe(false);
    const last = game.discard();
    expect(last.over).toBe(true);
    expect(game.tileCount).toBe(3);
    expect(game.hand).toBeNull();
    expect(() => game.discard()).toThrow("Game: is over");
    expect(() => game.build({ orientation: North, x: 1, y: 0 })).toThrow("Game: is over");
  });

  it("keeps the tile in hand on a surrender", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    const held = game.hand;
    game.surrender();
    expect(game.over).toBe(true);
    expect(game.hand).toEqual(held);
    expect(() => game.surrender()).toThrow("Game: is over");
  });

  it("closes a forest for 0 points with one Scored (forest_open, P-15)", () => {
    const { game, results } = board([
      [PlanType.RFFFRFCFR, South, 1, 0],
      [PlanType.CFFFCFFFC, East, 1, 1],
      [PlanType.FFFFCCCFF, East, 1, 2],
      [PlanType.CCCCCFFFC, South, 0, 2],
      [PlanType.CFFFCFFFC, East, 0, 1],
    ]);
    expect(results[4].scored).toEqual([{ category: CategoryType.Forest, size: 2, points: 0, player: 1n }]);
    expect(game.score).toBe(0);
    expect(game.counts.forests).toBe(1);
  });

  it("plays the Tutorial's script and refuses a discard the script does not burn", () => {
    const game = EngineGame.start({ deck: "tutorial", seed: 0n });
    expect(game.scriptedPlacement()).toEqual({ orientation: North, x: -1, y: 0 });
    expect(() => game.discard()).toThrow("Orientation: is valid");
    expect(() => game.build({ orientation: North, x: 0, y: 1 })).toThrow("Tutorial: not the scripted placement");
    for (let step = 0; step < 7; step++) game.build();
    // Index 8 (CCCCCCCCC) is burned, index 9 goes west of (2, 0)
    expect(game.hand?.plan).toBe(PlanType.CCCCCCCCC);
    expect(game.scriptedPlacement()).toBeNull();
    expect(() => game.build()).toThrow("Orientation: not valid");
    game.discard();
    expect(game.scriptedPlacement()).toEqual({ orientation: West, x: 1, y: 0 });
    expect(game.build().over).toBe(true);
    expect(game.score).toBe(2794);
  });
});

describe("engine D-19 owners", () => {
  it("gives a tie to nobody: player 0, 0 points, the event kept", () => {
    // Gas scenario a: a cap north of the starter closes a city of 2 tiles, one per owner
    const { game, results } = board([[PlanType.FFCFFFCFF, North, 0, 1, 2n]]);
    expect(results[0].scored).toEqual([{ category: CategoryType.City, size: 2, points: 0, player: 0n }]);
    expect(game.score).toBe(0);
    expect(game.counts.structures).toBe(1);
    expect(game.tileAt(0, 1)?.owner).toBe(2n);
  });

  it("gives a closed structure to the owner with the most tiles", () => {
    // daily_city5: the starter and the cap for player 1, the three corridors for player 2
    const { results } = board([
      [PlanType.CFFFCFFFC, East, 0, 1, 2n],
      [PlanType.CFFFCFFFC, East, 0, 2, 2n],
      [PlanType.CFFFCFFFC, East, 0, 3, 2n],
      [PlanType.FFFFFFCFF, North, 0, 4],
    ]);
    expect(results[3].scored).toEqual([{ category: CategoryType.City, size: 5, points: 1122, player: 2n }]);
  });

  it("counts a tile once even when two of its areas are in the structure (ruling 1)", () => {
    // The city ring of `once_per_move_city`: 7 nodes on 6 tiles, the closing tile's two caps in
    // it. Player 2 holds the closing tile and two of the ring (4 nodes, 3 tiles), player 3 the
    // other three (3 nodes, 3 tiles): a tie by tiles, so nobody scores, where nodes would say 2.
    const game = cityRing([2n, 2n, 3n, 3n, 3n]);
    const result = game.build({ orientation: North, x: 20, y: 20 }, 2n);
    expect(result.scored).toEqual([{ category: CategoryType.City, size: 7, points: 0, player: 0n }]);
  });

  it("counts a forest's own tiles, not those of the roads and cities around it (ruling 2)", () => {
    // forest_caps: the forest of 2 tiles between the corridors is on (0, 1) and (1, 1); its points
    // come from the two cities, whose caps (0, 2), (1, 2) and (1, 0) belong to player 3
    const { results } = board([
      [PlanType.CFFFCFFFC, East, 0, 1, 2n],
      [PlanType.FFFFFFCFF, North, 0, 2, 3n],
      [PlanType.FFFFFFCFF, North, 1, 2, 3n],
      [PlanType.RFFFRFCFR, South, 1, 0, 3n],
      [PlanType.CFFFCFFFC, East, 1, 1, 2n],
    ]);
    const forest = results[4].scored.find((scored) => scored.category === CategoryType.Forest);
    expect(forest).toEqual({ category: CategoryType.Forest, size: 2, points: 628, player: 2n });
  });

  it("counts a wonder's tile and its 8 neighbours (ruling 3)", () => {
    // The wonder at (1, 0) for player 2; around it the starter (player 1), (1, 1) for 2, three
    // tiles for 3, two for 4, and the closing tile at (0, 1) for `last`
    const close = (last: bigint): ReturnType<EngineGame["build"]> => {
      const game = EngineGame.start({ deck: "simple", seed: 0n });
      game.force(PlanType.WFFFFFFFR);
      game.build({ orientation: North, x: 1, y: 0 }, 2n);
      const ring: [number, number, bigint][] = [
        [1, 1, 2n], [2, 1, 3n], [2, 0, 3n], [2, -1, 3n], [1, -1, 4n], [0, -1, 4n],
      ];
      ring.forEach(([x, y, owner], index) => {
        game.write({ id: 100 + index, plan: PlanType.FFFFFFCFF, orientation: North, x, y }, owner);
      });
      game.force(PlanType.FFFFFFCFF);
      return game.build({ orientation: North, x: 0, y: 1 }, last);
    };
    const wonder = (result: ReturnType<EngineGame["build"]>) =>
      result.scored.find((scored) => scored.category === CategoryType.Wonder);
    // 2 holds the wonder, (1, 1) and (0, 1): 3 tiles against 3 for player 3, a tie
    expect(wonder(close(2n))).toEqual({ category: CategoryType.Wonder, size: 0, points: 0, player: 0n });
    // 3 holds (0, 1) too: 4 tiles, the majority
    expect(wonder(close(3n))).toEqual({ category: CategoryType.Wonder, size: 0, points: 900, player: 3n });
  });
});

/** The city ring of `test_once_per_move_city_reached_from_two_start_spots`, written at (20, 20). */
function cityRing(owners: bigint[] = []): EngineGame {
  const game = EngineGame.start({ deck: "simple", seed: 0n });
  const tiles: [PlanType, OrientationType, number, number][] = [
    [PlanType.FFFFCCCFF, North, 20, 21],
    [PlanType.FFFFCCCFF, East, 21, 21],
    [PlanType.CFFFCFFFC, East, 21, 20],
    [PlanType.FFFFCCCFF, South, 21, 19],
    [PlanType.FFFFCCCFF, West, 20, 19],
  ];
  tiles.forEach(([plan, orientation, x, y], index) => {
    game.write({ id: 100 + index, plan, orientation, x, y }, owners[index]);
  });
  game.force(PlanType.FFCFFFCFF);
  return game;
}

describe("engine boards written without a move (Cairo e2e and differential)", () => {
  it("scores a road reached from two start spots once (e2e/forest.cairo, once per move)", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.write({ id: 100, plan: PlanType.RFRFFFFFR, orientation: South, x: 20, y: 21 });
    game.write({ id: 101, plan: PlanType.RFRFFFFFR, orientation: West, x: 21, y: 21 });
    game.write({ id: 102, plan: PlanType.RFRFFFFFR, orientation: North, x: 21, y: 20 });
    game.force(PlanType.SFRFRFFFR);
    const result = game.build({ orientation: North, x: 20, y: 20 });
    const roads = result.scored.filter((scored) => scored.category === CategoryType.Road);
    expect(roads).toEqual([{ category: CategoryType.Road, size: 5, points: 561, player: 1n }]);
    expect(game.score).toBe(890);
  });

  it("scores a city reached from two start spots once (e2e/forest.cairo, once per move)", () => {
    const result = cityRing().build({ orientation: North, x: 20, y: 20 });
    expect(result.scored).toEqual([{ category: CategoryType.City, size: 7, points: 1646, player: 1n }]);
    expect(result.score).toBe(1646);
  });

  it("closes the wonder ring of differential.cairo (test_differential_wonder_ring)", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.force(PlanType.WFFFFFFFR);
    game.build({ orientation: North, x: 1, y: 0 });
    [[1, 1], [2, 1], [2, 0], [2, -1], [1, -1], [0, -1]].forEach(([x, y], index) => {
      game.write({ id: 100 + index, plan: PlanType.FFFFFFCFF, orientation: North, x, y });
    });
    const before = game.score;
    game.force(PlanType.FFFFFFCFF);
    const result = game.build({ orientation: North, x: 0, y: 1 });
    expect(result.score).toBeGreaterThan(before);
    expect(result.scored).toContainEqual({ category: CategoryType.Wonder, size: 0, points: 900, player: 1n });
  });
});

describe("engine purity", () => {
  it("has no clock, no randomness and no I/O in src/engine", () => {
    const folder = resolve(__dirname, "../src/engine");
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(resolve(folder, file), "utf8");
      expect(source, file).not.toMatch(/Math\.random|\bDate\b|performance\.now|from "node:|require\(|\bfetch\(|process\./);
    }
  });
});
