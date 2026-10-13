// Parity of the off-chain engine with CORE's golden and differential games: each game of
// `fixtures/parity.json` (transcribed from the Cairo tests by `scripts/transcribe-goldens.ts`)
// replays on the engine with exactly the plans drawn, the scores, the `Scored` events and the final
// counters the Cairo tests assert.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PARITY_TARGET,
  readRepository,
  renderFixture,
  transcribe,
  type ParityFixture,
} from "../scripts/transcribe-goldens";
import { EngineGame } from "../src/engine";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const fixture = JSON.parse(readFileSync(PARITY_TARGET, "utf8")) as ParityFixture;

describe("engine parity fixture", () => {
  it("is the transcription of the Cairo tests on this commit", () => {
    expect(readFileSync(PARITY_TARGET, "utf8")).toBe(renderFixture(transcribe(readRepository)));
  });

  it("covers every golden file", () => {
    for (const file of ["daily", "forest", "full_deck", "tutorial"]) {
      expect(fixture.games.some((game) => game.source.includes(`golden/${file}.cairo`))).toBe(true);
    }
  });
});

describe.each(fixture.games.map((game) => [game.name, game] as const))("parity: %s", (_, game) => {
  it("replays exactly", () => {
    const engine = EngineGame.start({
      deck: game.deck,
      seed: BigInt(game.seed),
      tileLimit: game.tileLimit ?? undefined,
    });
    game.moves.forEach((move, step) => {
      const at = `step ${step}`;
      expect(engine.hand?.plan, `${at}: drawn plan`).toBe(
        move.drawn === null ? engine.hand?.plan : (move.drawn as PlanType),
      );
      if (move.plan !== engine.hand?.plan) engine.force(move.plan as PlanType);
      const before = engine.score;
      const result =
        move.action === "discard"
          ? engine.discard()
          : engine.build(
              move.orientation === undefined
                ? undefined
                : {
                    orientation: move.orientation as OrientationType,
                    x: move.x as number,
                    y: move.y as number,
                  },
            );
      if (move.score !== null) expect(result.score, `${at}: score`).toBe(move.score);
      if (move.scored) {
        expect(
          result.scored.map(({ category, size, points }) => ({ category, size, points })),
          `${at}: Scored`,
        ).toEqual(move.scored);
      }
      // One player: every `Scored` goes to the game's player, and adds up to the move's points
      for (const scored of result.scored) expect(scored.player).toBe(engine.player);
      const points = result.scored.reduce((sum, scored) => sum + scored.points, 0);
      if (move.action === "discard") {
        expect(before - result.score, `${at}: penalty`).toBe(result.points);
      } else {
        expect(result.score - before, `${at}: points`).toBe(points);
      }
    });
    const { outcome } = game;
    if (outcome.score !== undefined) expect(engine.score, "final score").toBe(outcome.score);
    if (outcome.scoreAbove !== undefined) expect(engine.score).toBeGreaterThan(outcome.scoreAbove);
    if (outcome.built !== undefined) expect(engine.built, "built").toBe(outcome.built);
    if (outcome.discarded !== undefined) expect(engine.discarded, "discarded").toBe(outcome.discarded);
    if (outcome.tileCount !== undefined) expect(engine.tileCount, "tile count").toBe(outcome.tileCount);
    if (outcome.over !== undefined) expect(engine.over, "over").toBe(outcome.over);
  });
});
