// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/helpers/conflict.cairo

import { Tile } from "../models/tile";
import { Spot, SpotType } from "../types/spot";
import { Orientation } from "../types/orientation";
import { Store, Tiles } from "../store";

export type VisitedType = { [key: string]: boolean };

export function checkFeatureIdle(
  gameId: number,
  tile: Tile,
  orientation: number,
  x: number,
  y: number,
  at: number,
  tiles: Tiles,
): boolean {
  const spot: Spot = Spot.from(at);
  if (spot.value === SpotType.None) return true;
  const conflict: Conflict = new Conflict();
  const store: Store = new Store(gameId, tiles);
  tile.orientation = Orientation.from(orientation);
  tile.x = x;
  tile.y = y;
  return !conflict.start(tile, spot, store);
}

export class Conflict {
  public status: boolean = false;

  public start(tile: Tile, at: Spot, store: Store): boolean {
    const visited: VisitedType = {};
    this.status = false;
    this.iter(tile, at, visited, store);
    return this.status;
  }

  public iter(tile: Tile, at: Spot, visited: VisitedType, store: Store): void {
    const area = tile.area(at);
    const visitedKey = tile.getKey(area);
    if (visited[visitedKey]) {
      return;
    }
    visited[visitedKey] = true;

    const spot = tile.occupiedSpot;
    if (spot.value !== SpotType.None && tile.areConnected(at, spot)) {
      this.status = true;
      return;
    }

    const northOrientedMoves = tile.northOrientedMoves(at);
    for (const northOrientedMove of northOrientedMoves) {
      const move = northOrientedMove.rotate(tile.orientation.value);
      const [x, y] = tile.proxyCoordinates(move.direction);
      const neighbor = store.getTileByPosition(x, y);
      if (!neighbor) {
        continue;
      }
      this.iter(neighbor, move.spot, visited, store);
      if (this.status) {
        break;
      }
    }
  }
}
