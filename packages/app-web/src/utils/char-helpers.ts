import {
  Spot,
  SpotType,
  getSpotOffset,
  getColorFromCharacter,
  getRole,
  getIndexFromCharacter,
} from "@paved/game-core";
import type { CharacterRenderData } from "@paved/renderer";

function computeCharWorldPos(
  tileWorldX: number,
  tileWorldZ: number,
  spot: number,
): { worldX: number; worldZ: number } {
  const spotType = spot > 0 ? Spot.from(spot).value : SpotType.None;
  const offset = getSpotOffset(spotType);
  return {
    worldX: tileWorldX + offset.dx,
    worldZ: tileWorldZ + offset.dz,
  };
}

export function buildCharQuery(gameId: number): string {
  return `SELECT * FROM [paved-Char] WHERE game_id = ${gameId}`;
}

export function toRenderCharacters(
  charRows: any[],
  tileMap: Map<number, { worldX: number; worldZ: number }>,
): CharacterRenderData[] {
  const result: CharacterRenderData[] = [];
  for (const row of charRows) {
    const tileId = Number(row.tile_id);
    const tile = tileMap.get(tileId);
    if (!tile) continue;

    const spot = Number(row.spot);
    const index = Number(row.index);
    const pos = computeCharWorldPos(tile.worldX, tile.worldZ, spot);

    result.push({
      gameId: Number(row.game_id),
      playerId: String(row.player_id),
      index,
      tileId,
      spot,
      weight: Number(row.weight),
      power: Number(row.power),
      color: getColorFromCharacter(index),
      name: getRole(getIndexFromCharacter(index)),
      ...pos,
    });
  }
  return result;
}
