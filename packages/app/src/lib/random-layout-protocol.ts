import type { LayoutBreakdown, LayoutTile, RandomLayout, RandomLayoutBudget } from "@paved/game-core";

// What the page and the die's worker (#803) say to each other: a request, its answer. Apart from the runner, so the worker's
// chunk does not take the runner (which makes the worker).

export interface RandomLayoutRequest {
  readonly id: number;
  /** The whole stock by plan, `stock[plan - 1]` (the starter left out). */
  readonly stock: readonly number[];
  readonly slots: number;
  readonly seed: number;
}

/** A built village: its tiles (the starter left out) and, from the worker, its points (#758), so the page never rebuilds them. */
export interface RandomLayoutBuilt {
  readonly tiles: LayoutTile[];
  readonly points?: LayoutBreakdown;
}

export type RandomLayoutAnswer =
  | ({ readonly id: number; readonly tries: number; readonly exhausted: boolean; readonly timedOut: boolean } & RandomLayoutBuilt)
  | { readonly id: number; readonly error: string };

/**
 * The worker's answer to a request (its whole logic, here so it is tested without a worker): the layout, and its points by
 * `breakdown` (the engine's rebuild, off the main thread too: the page's live score and points read them as they are).
 */
export function answerRandomLayout(
  request: RandomLayoutRequest,
  generate: (stock: readonly number[], slots: number, seed: number, budget?: RandomLayoutBudget) => RandomLayout,
  breakdown?: (tiles: readonly LayoutTile[]) => LayoutBreakdown,
): RandomLayoutAnswer {
  try {
    const { tiles, tries, exhausted, timedOut } = generate(request.stock, request.slots, request.seed);
    return { id: request.id, tiles, points: breakdown?.(tiles), tries, exhausted, timedOut };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}
