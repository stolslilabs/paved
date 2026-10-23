import { EngineGame } from "../engine";
import type { MoveResult, Placement, TerritoryCell } from "../engine";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";

// A PvP attack (#643) on the engine: the defender's territory at the attack's start, the starter, then the attacker's moves
// as `Arena.moves` lists them, each built or discarded as `Arena`'s finish replays them. The board, the score, the structures a
// move closed and the legal cells of the tile in hand come from it, so the attack screen and a replay show what the chain will
// score. Plan and orientation are the contracts' codes (plan 1 to 19, orientation 1 north to 4 west), cells relative to the
// starter. The session keeps its engine between moves: a move is applied, never replayed from the start.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A move of `Arena.moves`: the plan, and a discard or the tile built turned to an orientation code at a cell. */
export type AttackMoveCodes =
  | { readonly plan: number; readonly discard: true }
  | { readonly plan: number; readonly discard: false; readonly orientation: number; readonly cell: TerritoryCell };

/** A tile placed before the attack, a Story level's (an NPC village, #643): plan and orientation codes, the cell. */
export interface PlacedCodes {
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
}

/** What a move did: the points it added (a build) or took (a discard, negative), and the structures it closed. */
export interface AttackStepResult {
  readonly delta: number;
  readonly result: MoveResult;
}

const planOf = (code: number): PlanType => {
  const plan = PLANS[code];
  if (!plan || code < 1) throw new Error(`Not a plan code: ${code}`);
  return plan as PlanType;
};

const orientationOf = (code: number): OrientationType => {
  const orientation = ORIENTATIONS[code];
  if (!orientation || code < 1) throw new Error(`Not an orientation code: ${code}`);
  return orientation as OrientationType;
};

/** The ORIENTATIONS codes, 1 north to 4 west. */
const ORIENTATION_CODES = [1, 2, 3, 4] as const;

/**
 * An attack on the engine. `territory` is the snapshot's cells (the 3 x 3 of the start, then the parcels the defender owned
 * at the start, `Village.cells`' first ones); null is an open board (an NPC village's Story level). `placed` are an NPC
 * level's tiles on the board before the attack.
 */
export class AttackRun {
  readonly game: EngineGame;
  private readonly moves: AttackMoveCodes[] = [];

  constructor(config: { territory: readonly TerritoryCell[] | null; placed?: readonly PlacedCodes[] }) {
    this.game = EngineGame.start({
      deck: "village",
      seed: 0n,
      territory: config.territory ?? undefined,
      placed: config.placed?.map((t) => ({ plan: planOf(t.plan), orientation: orientationOf(t.orientation), x: t.x, y: t.y })),
    });
  }

  /** An attack with `moves` already played (a resume, or a replay up to a move). */
  static replay(config: { territory: readonly TerritoryCell[] | null; placed?: readonly PlacedCodes[] }, moves: readonly AttackMoveCodes[]): AttackRun {
    const run = new AttackRun(config);
    for (const move of moves) run.apply(move);
    return run;
  }

  /** The moves applied, in order. */
  get played(): readonly AttackMoveCodes[] {
    return this.moves;
  }

  get score(): number {
    return this.game.score;
  }

  /** Why `Arena.play` would refuse the plan built at `cell` turned to `orientation`, or null (the engine's revert text). */
  refusal(plan: number, orientation: number, cell: TerritoryCell): string | null {
    return this.game.refusal(this.placement(orientation, cell), planOf(plan));
  }

  /** The cells where the plan fits in some orientation, each once, in the engine's order. */
  slots(plan: number): TerritoryCell[] {
    const seen = new Map<string, TerritoryCell>();
    for (const p of this.game.legalPlacements(planOf(plan))) {
      const key = `${p.x},${p.y}`;
      if (!seen.has(key)) seen.set(key, { x: p.x, y: p.y });
    }
    return [...seen.values()];
  }

  /** The orientation codes the plan fits at `cell`, 1 to 4. */
  orientations(plan: number, cell: TerritoryCell): number[] {
    return ORIENTATION_CODES.filter((o) => this.refusal(plan, o, cell) === null);
  }

  /** The points the plan would score built at `cell` turned to `orientation`, on a copy of the engine; null where it is refused. */
  preview(plan: number, orientation: number, cell: TerritoryCell): number | null {
    if (this.refusal(plan, orientation, cell) !== null) return null;
    return this.game.clone().place(planOf(plan), this.placement(orientation, cell)).points;
  }

  /** Applies one move as the finish does: built (refused as `refusal` says) or discarded. */
  apply(move: AttackMoveCodes): AttackStepResult {
    const plan = planOf(move.plan);
    const before = this.game.score;
    const result = move.discard ? this.game.discardPlan(plan) : this.game.place(plan, this.placement(move.orientation, move.cell));
    this.moves.push(move);
    return { delta: this.game.score - before, result };
  }

  private placement(orientation: number, cell: TerritoryCell): Placement {
    return { orientation: orientationOf(orientation), x: cell.x, y: cell.y };
  }
}
