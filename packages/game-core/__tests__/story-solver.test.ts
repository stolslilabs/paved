import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EngineGame } from "../src/engine";
import { solve } from "../src/engine/solver";
import { STORY_LEVELS, twoStars } from "../src/story/plan";
import { PlanType } from "../src/types/plan";

const DOC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "client", "story-mode.md");

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
  it("has 8 to 12 levels", () => {
    expect(STORY_LEVELS.length).toBeGreaterThanOrEqual(8);
    expect(STORY_LEVELS.length).toBeLessThanOrEqual(12);
    expect(STORY_LEVELS.map((level) => level.id)).toEqual(STORY_LEVELS.map((_, index) => index + 1));
  });

  it("rounds the 2-star threshold up", () => {
    expect(twoStars(321)).toBe(225);
    expect(twoStars(643)).toBe(451);
    expect(twoStars(100)).toBe(70);
    expect(twoStars(1)).toBe(1);
  });

  const doc = readFileSync(DOC, "utf8");
  for (const level of STORY_LEVELS) {
    it(`level ${level.id} "${level.title}": the solver finds the stored optimum`, () => {
      const started = performance.now();
      const solution = solve(level.deck, { placed: level.placed });
      const elapsed = Math.round(performance.now() - started);
      console.info(`story level ${level.id}: optimum ${solution.optimum}, ${solution.nodes} nodes, ${elapsed} ms`);
      expect(solution.optimum).toBe(level.optimum);
      // The moves replay to the same score on the engine
      const game = EngineGame.start({ deck: "story", seed: 0n, sequence: level.deck, placed: level.placed });
      for (const move of solution.moves) {
        if (move.action === "discard") game.discard();
        else game.build(move.placement);
      }
      expect(game.over).toBe(true);
      expect(game.score).toBe(level.optimum);
    }, 120_000);

    it(`level ${level.id}: the plan document states its deck, optimum and 2-star threshold`, () => {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${level.id} |`));
      expect(row, `row of level ${level.id} in story-mode.md`).toBeDefined();
      expect(row).toContain(level.title);
      expect(row).toContain(level.deck.join(" "));
      expect(row).toContain(`**${level.optimum}**`);
      expect(row).toContain(String(twoStars(level.optimum)));
    });
  }
});
