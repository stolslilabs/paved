import { Spot, SpotType, getSpotOffset } from "@paved/game-core";

export function computeCharWorldPos(
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
