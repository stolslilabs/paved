import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EngineGame } from "../src/engine";
import { solve } from "../src/engine/solver";
import { beam } from "../src/engine/beam";
import { designer } from "../src/engine/designer";
import { seededDeck } from "../src/story/deck";
import { decodeLine, encodeLine, replayLine } from "../src/story/line";
import { CAMPAIGNS, DARK_FOREST, OPEN_COUNTRY, TUTORIAL, twoStars } from "../src/story/plan";
import { PlanType } from "../src/types/plan";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOC = join(ROOT, "docs", "client", "story-mode.md");
const DEPLOY = join(ROOT, "scripts", "deploy.sh");

describe("story deck", () => {
  it("draws the sequence in order, with no random draw", () => {
    const deck = [PlanType.CFFFCFFFC, PlanType.RFFFRFFFR];
    const game = EngineGame.start({ deck: "story", seed: 7n, sequence: deck });
    expect(game.tileLimit).toBe(3);
    expect(game.hand?.plan).toBe(deck[0]);
    game.discard();
    expect(game.hand?.plan).toBe(deck[1]);
    game.discard();
    expect(game.over).toBe(true);
  });

  it("refuses a tile limit beyond its sequence", () => {
    expect(() =>
      EngineGame.start({ deck: "story", seed: 0n, sequence: [PlanType.WFFFFFFFF], tileLimit: 3 }),
    ).toThrow("tile limit exceeds the sequence");
    expect(EngineGame.start({ deck: "story", seed: 0n, sequence: [PlanType.WFFFFFFFF], tileLimit: 2 }).tileLimit).toBe(2);
  });

  it("starts with the placed tiles on the board, uncounted", () => {
    const game = EngineGame.start({
      deck: "story",
      seed: 0n,
      sequence: [PlanType.RFFFRFFFR],
      placed: [{ plan: PlanType.WFFFFFFFF, orientation: "North" as never, x: 0, y: -1 }],
    });
    expect(game.placed()).toHaveLength(2);
    expect(game.tileLimit).toBe(2);
    expect(game.tileAt(0, -1)?.plan).toBe(PlanType.WFFFFFFFF);
  });

  it("needs a sequence", () => {
    expect(() => EngineGame.start({ deck: "story", seed: 0n })).toThrow("a story needs a sequence");
  });

  it("is the same game whatever the seed", () => {
    const deck = [PlanType.SFRFRFRFR, PlanType.SFRFRFRFR];
    const a = EngineGame.start({ deck: "story", seed: 1n, sequence: deck });
    const b = EngineGame.start({ deck: "story", seed: 999n, sequence: deck });
    for (const game of [a, b]) {
      game.build({ orientation: "North" as never, x: 1, y: 0 });
      game.build({ orientation: "North" as never, x: -1, y: 0 });
    }
    expect(a.score).toBe(321);
    expect(b.score).toBe(321);
  });
});

describe("story plan", () => {
  it("has campaigns numbered from 1, each of 12 levels numbered from 1 (#721)", () => {
    expect(CAMPAIGNS.map((c) => c.id)).toEqual([1, 2, 3]);
    for (const campaign of CAMPAIGNS) {
      expect(campaign.levels, campaign.name).toHaveLength(12);
      expect(campaign.levels.map((level) => level.id)).toEqual(campaign.levels.map((_, index) => index + 1));
    }
  });

  it("starts every level from the starter alone: no tile placed before the first draw (#721)", () => {
    for (const campaign of CAMPAIGNS) {
      for (const level of campaign.levels) expect(level.placed, `${campaign.id}-${level.id} has placed tiles`).toBeUndefined();
    }
  });

  it("gives every level one tip: one sentence, never the whole line nor a star threshold (#721)", () => {
    for (const campaign of CAMPAIGNS) {
      for (const level of campaign.levels) {
        const name = `${campaign.id}-${level.id}`;
        expect(level.tip, name).toMatch(/^[A-Z][^.!?]*[^\s.!?][.!?]$/);
        expect(level.tip, name).not.toBe(level.intro);
        expect(level.tip, name).not.toContain(level.line);
        // No figure: no score a star needs, and no cell either.
        expect(level.tip, name).not.toMatch(/\d/);
      }
    }
  });

  it("draws the Tutorial and Open Country in the Default theme, Dark Forest in the Forest theme (theme 1)", () => {
    expect(CAMPAIGNS.map((c) => c.theme)).toEqual([0, 0, 1]);
  });

  it("deals 9 to 16 tiles a level outside the Tutorial, never fewer than the level before (#721)", () => {
    for (const campaign of [OPEN_COUNTRY, DARK_FOREST]) {
      const tiles = campaign.levels.map((level) => level.deck.length + 1);
      for (const [index, count] of tiles.entries()) {
        expect(count, `${campaign.id}-${index + 1}`).toBeGreaterThanOrEqual(9);
        expect(count, `${campaign.id}-${index + 1}`).toBeLessThanOrEqual(16);
        if (index > 0) expect(count, `${campaign.id}-${index + 1}`).toBeGreaterThanOrEqual(tiles[index - 1] as number);
      }
    }
    // Open Country uses every size from 9 to 16
    expect(new Set(OPEN_COUNTRY.levels.map((level) => level.deck.length + 1))).toEqual(new Set([9, 10, 11, 12, 13, 14, 15, 16]));
  });

  it("rounds the 2-star threshold up", () => {
    expect(twoStars(321)).toBe(225);
    expect(twoStars(643)).toBe(451);
    expect(twoStars(100)).toBe(70);
    expect(twoStars(1)).toBe(1);
  });

  // The seeded draws are CPU-bound: the test passed 5 s, the default timeout, on CI (main included).
  it("takes each deck of the long campaigns from the Challenge's draw of its seed: Open Country 1 to 12, Dark Forest 13 to 24", () => {
    for (const [campaign, first] of [[OPEN_COUNTRY, 1], [DARK_FOREST, 13]] as const) {
      for (const level of campaign.levels) {
        expect(level.seed, `${campaign.id}-${level.id}`).toBe(first + level.id - 1);
        expect(level.deck).toEqual(seededDeck(BigInt(level.seed as number), level.deck.length));
        expect(level.method).toBe("best-known");
      }
    }
  }, 30_000);

  it("sets the Tutorial on chain as the plan has it (deploy.sh's FRESH_STORY_CAMPAIGNS and FRESH_STORY_LEVELS)", () => {
    const script = readFileSync(DEPLOY, "utf8");
    /** The quoted entries of the bash array `FRESH_STORY_<name>=( ... )`. */
    const array = (name: string): string[] => {
      const body = new RegExp(`^FRESH_STORY_${name}=\\(([^)]*)\\)`, "m").exec(script)?.[1] ?? "";
      return [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1] as string);
    };
    expect(array("CAMPAIGNS")).toEqual([`1 ${TUTORIAL.levels.length} 2`]);
    const codes = Object.values(PlanType);
    expect(array("LEVELS")).toEqual(TUTORIAL.levels.map((level) => `1 ${level.id} ${level.target} ${level.deck.map((plan) => codes.indexOf(plan)).join(",")} -`));
  });

  it("encodes and decodes a line", () => {
    const line = "N1,0 D E-1,2 S0,-3 W10,10";
    expect(encodeLine(decodeLine(line))).toBe(line);
    expect(decodeLine("")).toEqual([]);
    expect(() => decodeLine("X1,0")).toThrow("not a move");
  });

  it("the beam search finds the exact optimum of the Tutorial's levels (a check of the search, not of the plan)", () => {
    for (const level of TUTORIAL.levels.slice(0, 5)) {
      const found = beam(level.deck, { width: 64, placed: level.placed, tail: 2 });
      expect(found.score).toBe(level.target);
      const game = replayLine(level.deck, encodeLine(found.moves), level.placed);
      expect(game.score).toBe(found.score);
    }
  }, 60_000);

  it("keeps a seed line in the beam: even the narrowest search ends at least at the seed's score", () => {
    // Tutorial 7's stored line is its exact optimum (asserted below): no need to solve it again here.
    const level = TUTORIAL.levels[6]!;
    const seed = decodeLine(level.line).map((move, index) =>
      move.action === "build" ? { ...move, plan: level.deck[index]! } : { action: "discard" as const, plan: level.deck[index]! },
    );
    expect(beam(level.deck, { width: 1, placed: level.placed }).score).toBeLessThan(level.target);
    const seeded = beam(level.deck, { width: 1, placed: level.placed, seed });
    expect(seeded.score).toBe(level.target);
    expect(replayLine(level.deck, encodeLine(seeded.moves), level.placed).score).toBe(level.target);
  }, 30_000);

  it("plays the designer's rules: score what can be scored, else keep the board tidy, discard only what fits nowhere", () => {
    // Tutorial 1: the designer closes the road of 3 (two crossroads around the starter's road)
    const level = TUTORIAL.levels[0]!;
    expect(designer(level.deck).score).toBe(level.target);
    // Tutorial 3: the full city fits north of the starter, so the designer keeps it (never discards a tile that fits)
    const three = designer(TUTORIAL.levels[2]!.deck);
    expect(three.moves.every((move) => move.action === "build")).toBe(true);
  });

  const doc = readFileSync(DOC, "utf8");
  for (const campaign of CAMPAIGNS) {
    for (const level of campaign.levels) {
      const name = `${campaign.name} ${level.id} "${level.title}"`;
      if (level.method === "exact") {
        it(`${name}: the solver finds the stored optimum`, () => {
          const started = performance.now();
          const solution = solve(level.deck, { placed: level.placed });
          const elapsed = Math.round(performance.now() - started);
          console.info(`story ${campaign.id}-${level.id}: optimum ${solution.optimum}, ${solution.nodes} nodes, ${elapsed} ms`);
          expect(solution.optimum).toBe(level.target);
        }, 120_000);
      }

      if (level.method === "best-known") {
        it(`${name}: the designer's line is the rules' line, and the target is not below it`, () => {
          expect(level.designer, "a designer's line").toBeTruthy();
          const played = designer(level.deck, level.placed);
          expect(level.designer).toBe(encodeLine(played.moves));
          const game = replayLine(level.deck, level.designer as string, level.placed);
          expect(game.over).toBe(true);
          expect(game.score).toBe(played.score);
          expect(level.target).toBeGreaterThanOrEqual(played.score);
          expect(doc).toContain(`designer ${played.score}`);
        });
      }

      it(`${name}: the stored line replays to the target`, () => {
        const game = replayLine(level.deck, level.line, level.placed);
        expect(game.over).toBe(true);
        expect(game.score).toBe(level.target);
      });

      it(`${name}: the plan document states its deck, target and 2-star threshold`, () => {
        const row = doc.split("\n").find((line) => line.startsWith(`| ${campaign.id}-${level.id} |`));
        expect(row, `row of level ${campaign.id}-${level.id} in story-mode.md`).toBeDefined();
        expect(row).toContain(level.title);
        expect(row).toContain(`**${level.target}**`);
        expect(row).toContain(String(twoStars(level.target)));
        expect(row).toContain(level.method === "exact" ? "exact" : "best known");
        expect(doc).toContain(level.deck.join(" "));
      });
    }
  }
});
