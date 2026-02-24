/** Find the next unplaced tile (orientation === 0) with id > currentTileId */
export function findNextTile(
  rows: any[],
  currentTileId: number,
): { tile_id: number; tile_plan: number } | null {
  let best: { tile_id: number; tile_plan: number } | null = null;

  for (const row of rows) {
    const id = Number(row.id);
    const orientation = Number(row.orientation);
    if (id > currentTileId && orientation === 0) {
      if (!best || id < best.tile_id) {
        best = { tile_id: id, tile_plan: Number(row.plan) };
      }
    }
  }

  return best;
}

/** Decide whether the poll should overwrite builderState.
 *  Returns false when a tx is in-flight and the poll still reports the same tile
 *  (i.e. contract hasn't processed the tx yet). */
export function shouldPollUpdateBuilder(
  inFlightTileId: number | null,
  pollTileId: number,
): boolean {
  if (inFlightTileId === null) return true;
  return inFlightTileId !== pollTileId;
}
