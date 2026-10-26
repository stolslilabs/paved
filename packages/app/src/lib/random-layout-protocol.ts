import type { LayoutTile, RandomLayout, RandomLayoutBudget } from "@paved/game-core";

// What the page and the die's worker (#803) say to each other: a request, its answer. Apart from the runner, so the worker's
// chunk does not take the runner (which makes the worker).

export interface RandomLayoutRequest {
  readonly id: number;
  /** The whole stock by plan, `stock[plan - 1]` (the starter left out). */
  readonly stock: readonly number[];
  readonly slots: number;
  readonly seed: number;
}

export type RandomLayoutAnswer =
  | { readonly id: number; readonly tiles: LayoutTile[]; readonly tries: number; readonly exhausted: boolean; readonly timedOut: boolean }
  | { readonly id: number; readonly error: string };

/** The worker's answer to a request (its whole logic, here so it is tested without a worker). */
export function answerRandomLayout(
  request: RandomLayoutRequest,
  generate: (stock: readonly number[], slots: number, seed: number, budget?: RandomLayoutBudget) => RandomLayout,
): RandomLayoutAnswer {
  try {
    const { tiles, tries, exhausted, timedOut } = generate(request.stock, request.slots, request.seed);
    return { id: request.id, tiles, tries, exhausted, timedOut };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}
