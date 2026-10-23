/** A PvP attack on the engine (#643, #647 PR 2): `AttackRun` and `EngineGame.discardPlan`. */
import { describe, expect, it } from "vitest";
import { AttackRun, DISCARD_POINTS, EngineGame, startTerritory, type AttackMoveCodes } from "../src";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const territory = [...startTerritory(), { x: 2, y: 0 }, { x: 2, y: 1 }];

/** The first legal move of each plan, a discard where it fits nowhere. */
function play(plans: readonly number[]): AttackMoveCodes[] {
  const run = new AttackRun({ territory });
  const moves: AttackMoveCodes[] = [];
  for (const plan of plans) {
    const cell = run.slots(plan)[0];
    const move: AttackMoveCodes = cell ? { plan, discard: false, orientation: run.orientations(plan, cell)[0]!, cell } : { plan, discard: true };
    run.apply(move);
    moves.push(move);
  }
  return moves;
}

describe("an attack on the engine", () => {
  it("scores the moves as a village game placing the same tiles", () => {
    const moves = play([10, 9, 13, 18, 10, 12, 3, 7]);
    const builds = moves.filter((m) => !m.discard);
    expect(builds.length).toBeGreaterThan(3);
    const village = EngineGame.village({ territory });
    for (const m of builds) village.place(PLANS[m.plan] as PlanType, { orientation: ORIENTATIONS[m.orientation] as OrientationType, x: m.cell.x, y: m.cell.y });
    const run = AttackRun.replay({ territory }, builds);
    expect(run.score).toBe(village.score);
    expect(run.game.placed()).toEqual(village.placed());
  });

  it("keeps a move inside the snapshot's territory", () => {
    const run = new AttackRun({ territory });
    for (const cell of run.slots(10)) expect(territory).toContainEqual(cell);
    expect(run.refusal(10, 1, { x: 3, y: 0 })).toBe("Village: cell not owned");
    expect(run.refusal(10, 1, { x: 0, y: 0 })).toBe("Tile: already exists");
    expect(() => run.apply({ plan: 10, discard: false, orientation: 1, cell: { x: 0, y: 0 } })).toThrow("Tile: already exists");
    expect(run.played).toHaveLength(0);
  });

  it("opens the board for an NPC village, its level's tiles placed", () => {
    const run = new AttackRun({ territory: null, placed: [{ plan: 10, orientation: 1, x: 1, y: 0 }] });
    expect(run.game.placed()).toHaveLength(2);
    expect(run.slots(10).some((c) => Math.abs(c.x) > 1 || Math.abs(c.y) > 1)).toBe(true);
  });

  it("discards at the engine's penalty, at most the score", () => {
    const run = new AttackRun({ territory });
    expect(run.apply({ plan: 10, discard: true }).delta).toBe(0);
    const moves = play([10, 9, 13, 18, 10, 12]);
    const scored = AttackRun.replay({ territory }, moves);
    const before = scored.score;
    const step = scored.apply({ plan: 7, discard: true });
    expect(step.delta).toBe(-Math.min(before, DISCARD_POINTS));
    expect(step.result.action).toBe("discard");
    expect(scored.game.discarded).toBe(moves.filter((m) => m.discard).length + 1);
  });
});
