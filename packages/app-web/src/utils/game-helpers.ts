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

/** Whether the SpotSelector overlay should be visible */
export function shouldShowSpotSelector(
  character: number,
  selectedTile: { col: number; row: number } | null,
  hoverValid: boolean,
): boolean {
  return character > 0 && selectedTile !== null && hoverValid;
}

const KEY_TO_SPOT: Record<string, number> = {
  "5": 1,  // Center
  "7": 2,  // NW
  "8": 3,  // N
  "9": 4,  // NE
  "6": 5,  // E
  "3": 6,  // SE
  "2": 7,  // S
  "1": 8,  // SW
  "4": 9,  // W
};

/** Map a numpad key to a spot number (1-9), or null if not a valid spot key */
export function spotKeyToNumber(key: string): number | null {
  return KEY_TO_SPOT[key] ?? null;
}
