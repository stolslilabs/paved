import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EngineGame } from "../src/engine";
import { solve } from "../src/engine/solver";
import { beam } from "../src/engine/beam";
import { seededDeck } from "../src/story/deck";
import { decodeLine, encodeLine, replayLine } from "../src/story/line";
import { CAMPAIGNS, OPEN_COUNTRY, TUTORIAL, twoStars } from "../src/story/plan";
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
  it("has campaigns of 11 levels, numbered from 1", () => {
    expect(CAMPAIGNS.map((c) => c.id)).toEqual([1, 2]);
    for (const campaign of CAMPAIGNS) {
      expect(campaign.levels).toHaveLength(11);
      expect(campaign.levels.map((level) => level.id)).toEqual(campaign.levels.map((_, index) => index + 1));
    }
  });

  it("rounds the 2-star threshold up", () => {
    expect(twoStars(321)).toBe(225);
    expect(twoStars(643)).toBe(451);
    expect(twoStars(100)).toBe(70);
    expect(twoStars(1)).toBe(1);
  });

  it("grows the second campaign from about 10 tiles to the simple deck's 38", () => {
    const tiles = OPEN_COUNTRY.levels.map((level) => level.deck.length + 1);
    expect(tiles[0]).toBe(10);
    expect(tiles.at(-1)).toBe(38);
    for (let index = 1; index < tiles.length; index++) expect(tiles[index]).toBeGreaterThan(tiles[index - 1] as number);
  });

  it("takes each deck of the second campaign from the Challenge's draw of its seed", () => {
    for (const level of OPEN_COUNTRY.levels) {
      expect(level.seed, `level ${level.id} has a seed`).toBeDefined();
      expect(level.deck).toEqual(seededDeck(BigInt(level.seed as number), level.deck.length));
      expect(level.method).toBe("best-known");
    }
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
