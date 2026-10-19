// `gameStats` (#539) on CORE's golden and differential games (P-49 (3)): each fixture game replays on the engine, and
// its figures must agree with the moves' `Scored` events and with the structure state of the final board, counted again
// by `StructureBoard` from the placed tiles alone.

import { describe, expect, it } from "vitest";
import { EngineGame, gameStats, SCORING_CATEGORIES } from "../src/engine";
import { StructureBoard } from "../src/engine/structures";
import { CategoryType } from "../src/types/category";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";
import { PARITY_FIXTURE, loadParityFixture, replayParityGame } from "./parity-fixture";

const fixture = loadParityFixture(PARITY_FIXTURE);
const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** The final board's structures, counted from its tiles by a fresh union-find. */
function boardStructures(engine: EngineGame) {
  return new StructureBoard(
    engine.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: t.x, y: t.y })),
  ).structures();
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

describe("gameStats on the parity fixture", () => {
  it("covers golden and differential games", () => {
    expect(fixture.games.some((g) => g.source === "differential")).toBe(true);
    expect(fixture.games.filter((g) => g.source !== "differential").length).toBeGreaterThanOrEqual(11);
  });

  for (const game of fixture.games) {
    it(`${game.name}: agrees with its closings and its final board`, () => {
      const { engine, moves } = replayParityGame(game);
      const stats = gameStats(engine);

      // The closings are the moves' `Scored` events in order, each with the tile that closed it.
      const events = moves.flatMap((m) => m.result.scored.map((s) => ({ ...s, tileId: m.result.tileId })));
      expect(stats.closings.map(({ tiles: _, ...c }) => c)).toEqual(events);
      for (const [index, move] of game.moves.entries()) {
        if (move.scored) expect(moves[index]!.scored).toEqual(move.scored);
      }

      // Per category: the closed count and points are those of the closings; the largest is the one with the most tiles.
      for (const c of stats.categories) {
        const of = stats.closings.filter((s) => s.category === c.category);
        expect(c.closed).toBe(of.length);
        expect(c.points).toBe(of.reduce((sum, s) => sum + s.points, 0));
        expect(c.largest?.tiles ?? 0).toBe(Math.max(0, ...of.map((s) => s.tiles)));
        if (c.largest) expect(of).toContain(c.largest);
      }
      expect(stats.categories.map((c) => c.category)).toEqual([...SCORING_CATEGORIES]);
      expect(stats.best?.points ?? 0).toBe(Math.max(0, ...stats.closings.map((s) => s.points)));

      // Tiles and discards: the moves, and the score is the closings' points less the discards' penalty.
      const discards = moves.filter((m) => m.result.action === "discard");
      expect(stats.placed).toBe(moves.length - discards.length);
      expect(stats.discarded).toBe(discards.length);
      expect(stats.discardPenalty).toBe(discards.reduce((sum, m) => sum + m.result.points, 0));
      expect(stats.score).toBe(engine.score);
      expect(stats.score).toBe(stats.closings.reduce((sum, s) => sum + s.points, 0) - stats.discardPenalty);
      if (game.final.score != null) expect(stats.score).toBe(game.final.score);

      // The final board counted again: every closed road and city was scored, with its tiles; the open ones are left.
      const board = boardStructures(engine);
      for (const category of [CategoryType.Road, CategoryType.City]) {
        const closed = board.filter((s) => s.category === category && s.open === 0);
        expect(sorted(stats.closings.filter((s) => s.category === category).map((s) => s.tiles))).toEqual(sorted(closed.map((s) => s.tiles)));
        const open = board.filter((s) => s.category === category && s.open > 0);
        expect(stats.categories.find((c) => c.category === category)!.open).toBe(open.length);
      }
      // Every forest and wonder is either scored or left.
      for (const category of [CategoryType.Forest, CategoryType.Wonder]) {
        const c = stats.categories.find((s) => s.category === category)!;
        expect(c.closed + c.open).toBe(board.filter((s) => s.category === category).length);
      }
      const left = engine.openStructures();
      expect(stats.open.count).toBe(left.length);
      expect(stats.open.largest?.tiles ?? 0).toBe(Math.max(0, ...left.map((s) => s.tiles)));
    });
  }
});

describe("gameStats", () => {
  it("counts the starter's structures as open, and nothing placed or closed, at the start", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0x1234n });
    const stats = gameStats(game);
    expect(stats).toMatchObject({ score: 0, placed: 0, discarded: 0, discardPenalty: 0, closings: [], best: null });
    // RFFFRFCFR: a road, a city and forests, all open.
    expect(stats.open.count).toBe(boardStructures(game).length);
    expect(stats.open.count).toBeGreaterThan(0);
  });

  it("takes no part of a later move: a clone plays on, the figures read before stay", () => {
    const { engine } = replayParityGame(fixture.games.find((g) => g.name === "daily_city5")!);
    const before = gameStats(engine);
    const clone = engine.clone();
    expect(gameStats(clone)).toEqual(before);
    expect(clone.closings()).not.toBe(engine.closings());
  });
});
