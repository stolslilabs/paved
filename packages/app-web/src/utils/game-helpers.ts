import { getColorFromCharacter, getIndexFromCharacter, getRole, getSpotOffset, Spot, SpotType } from "@paved/game-core";
import type { CharacterRenderData, TileRenderData } from "@paved/renderer";
import type { SessionState } from "@paved/chain";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
export const CENTER = 2147483647;

/** The session's board as the renderer draws it (world x east, world z south). */
export function toRenderBoard(state: SessionState, playerId: string): {
  tiles: TileRenderData[];
  characters: CharacterRenderData[];
} {
  const spots = new Map(state.characters.map((c) => [c.tileId, c.spot]));
  const tiles = state.tiles.map((t) => ({
    game_id: state.key.gameId,
    id: t.id,
    player_id: playerId,
    plan: t.plan,
    orientation: t.orientation,
    x: t.x,
    y: t.y,
    occupied_spot: spots.get(t.id) ?? 0,
    worldX: t.x - CENTER,
    worldZ: CENTER - t.y,
    ...(t.pending ? { pending: true } : {}),
  }));
  const characters = state.characters.map((c) => {
    const offset = getSpotOffset(c.spot > 0 ? Spot.from(c.spot).value : SpotType.None);
    return {
      gameId: state.key.gameId,
      playerId,
      index: c.role,
      tileId: c.tileId,
      spot: c.spot,
      weight: 1,
      power: 1,
      color: getColorFromCharacter(c.role),
      name: getRole(getIndexFromCharacter(c.role)),
      worldX: c.x - CENTER + offset.dx,
      worldZ: CENTER - c.y + offset.dz,
    };
  });
  return { tiles, characters };
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
