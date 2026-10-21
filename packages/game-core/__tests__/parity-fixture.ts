// Loader of the parity fixture in the format of `docs/architecture/parity-fixture.md`. E2 switches
// `PARITY_FIXTURE` to CORE's file (`../../contracts/fixtures/parity.json`); nothing else changes.
// The hand transcription of E1 may leave out a move's `drawn` (null), `scored` or `score`, and parts
// of `final`, where the Cairo source has no literal: an absent value is not checked.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CENTER, EngineGame, type MoveResult } from "../src/engine";
import { CategoryType } from "../src/types/category";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";
import type { FixtureGame, FixtureScored, ParityFixture } from "../scripts/transcribe-goldens";

export const PARITY_FIXTURE = resolve(__dirname, "fixtures/parity.json");

export function loadParityFixture(path: string = PARITY_FIXTURE): ParityFixture {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as ParityFixture;
  if (fixture.version !== 1) throw new Error(`parity fixture: version ${fixture.version}`);
  return fixture;
}

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

export interface ReplayedMove {
  /** The plan code in hand before the move (before a forced plan replaces it). */
  drawn: number;
  result: MoveResult;
  /** The move's `Scored` events in the fixture's terms (codes, no player). */
  scored: FixtureScored[];
}

/** Plays a fixture game on the engine: a discard for orientation 0, else a build of `plan` at `x, y`. */
export function replayParityGame(game: FixtureGame): { engine: EngineGame; moves: ReplayedMove[] } {
  const engine = EngineGame.start({
    deck: game.source === "tutorial" ? "tutorial" : "simple",
    seed: BigInt(game.seed),
    tileLimit: game.tile_limit,
    vrf: game.vrf === true,
  });
  const moves = game.moves.map((move) => {
    const drawn = PLANS.indexOf(engine.hand?.plan ?? PlanType.None);
    // A VRF game (#645): the engine says whether the move draws, the fixture gives the random it draws
    const draws = engine.drawsNext;
    if (move.plan !== drawn) engine.force(PLANS[move.plan] as PlanType);
    const result =
      move.orientation === 0
        ? engine.discard()
        : engine.build({
            orientation: ORIENTATIONS[move.orientation] as OrientationType,
            x: move.x - CENTER,
            y: move.y - CENTER,
          });
    if (game.vrf) {
      if (draws !== (move.random !== null && move.random !== undefined)) throw new Error(`parity: ${game.name} draws ${draws}, fixture ${move.random}`);
      if (move.random && !result.over) engine.supply(BigInt(move.random));
    }
    const scored = result.scored.map(({ category, size, points }) => ({
      category: CATEGORIES.indexOf(category),
      size,
      points,
    }));
    return { drawn, result, scored };
  });
  return { engine, moves };
}
