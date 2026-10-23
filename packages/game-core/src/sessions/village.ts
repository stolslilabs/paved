import { DECKS, EngineGame } from "../engine";
import type { TerritoryCell } from "../engine";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";

// A village read from the chain (#646 PR 2), on the engine: the territory and the tiles of `Village.cells` and `Village.tiles`
// rebuilt (`EngineGame.villageOf`), so a client checks a reward's placement and scores it as `Village.place` does. Plan and
// orientation are the contracts' codes (plan 1 to 19, orientation 1 north to 4 west), cells relative to the starter.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A tile of `Village.tiles`: its id (1 the starter), plan and orientation codes, cell relative to the starter. */
export interface VillageTileCodes {
  readonly id: number;
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
}

/** The village of `cells` and `tiles` on the engine, the owner's cap `maxCells` (the chain's `max_cells`). */
export function villageGame(cells: readonly TerritoryCell[], tiles: readonly VillageTileCodes[], maxCells?: number): EngineGame {
  return EngineGame.villageOf({ territory: cells, tiles, maxCells });
}

const placement = (orientation: number, cell: TerritoryCell) => ({ orientation: ORIENTATIONS[orientation] as OrientationType, x: cell.x, y: cell.y });

/**
 * Why `Village.place` refuses the plan `plan` turned to `orientation` on `cell`, or null: the contract's revert text (`Village:
 * cell not owned`, `Tile: already exists`, `Tile: no neighbors`, `Tile: cannot place`), or the engine's for a code out of range.
 */
export function villageRefusal(game: EngineGame, plan: number, orientation: number, cell: TerritoryCell): string | null {
  if (!Number.isInteger(plan) || plan < 1 || plan >= PLANS.length) return "Village: invalid plan";
  if (!Number.isInteger(orientation) || orientation < 1 || orientation >= ORIENTATIONS.length) return "Village: invalid orientation";
  return game.refusal(placement(orientation, cell), PLANS[plan] as PlanType);
}

/** Places the plan on `cell` as `Village.place` does (refused as `villageRefusal` says); returns the points the move scored. */
export function placeInVillage(game: EngineGame, plan: number, orientation: number, cell: TerritoryCell): number {
  const refused = villageRefusal(game, plan, orientation, cell);
  if (refused) throw new Error(refused);
  return game.place(PLANS[plan] as PlanType, placement(orientation, cell)).points;
}

const LANE = 1n << 64n;
const LOW = (1n << 128n) - 1n;

/**
 * `offer_plans` of `rewards.cairo` (#642): a reward's 3 plan codes from its random, three 64-bit lanes (the low word's two
 * halves, then the high word's low half), each a card of the base deck's 72 (`BaseDeck::plan(lane % 72)`).
 */
export function offerPlans(random: bigint): [number, number, number] {
  const plan = (lane: bigint) => PLANS.indexOf(DECKS.simple.plan(Number(lane % 72n)));
  const low = random & LOW;
  return [plan(low % LANE), plan(low / LANE), plan((random >> 128n) % LANE)];
}
