import { Direction, DirectionType } from "../types/direction";
import { Layout } from "../types/layout";
import { Spot, SpotType } from "../types/spot";
import { Plan } from "../types/plan";
import { Orientation, OrientationType } from "../types/orientation";
import { Area } from "../types/area";
import { Move } from "../types/move";

export type RawTile = {
  id: number;
  player_id: string;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  occupied_spot: number;
};

export class Tile {
  public id: number;
  public builderId: string;
  public plan: Plan;
  public orientation: Orientation;
  public x: number;
  public y: number;
  public occupiedSpot: Spot;

  constructor(
    id: number,
    builderId: string,
    plan: number,
    orientation: number,
    x: number,
    y: number,
    spot: number
  ) {
    this.id = id;
    this.builderId = builderId;
    this.plan = Plan.from(plan);
    this.orientation = Orientation.from(orientation);
    this.x = x;
    this.y = y;
    this.occupiedSpot = Spot.from(spot);
  }

  public static from(tile: RawTile): Tile {
    return new Tile(
      tile.id,
      tile.player_id,
      tile.plan,
      tile.orientation,
      tile.x,
      tile.y,
      tile.occupied_spot
    );
  }

  public getKey(area: Area): string {
    return (area.into() + this.id * 2 ** 8).toString();
  }

  public referenceDirection(reference: Tile): Direction {
    if (this.x === reference.x) {
      if (this.y + 1 === reference.y) {
        return new Direction(DirectionType.North);
      } else if (this.y === reference.y + 1) {
        return new Direction(DirectionType.South);
      } else {
        return new Direction(DirectionType.None);
      }
    } else if (this.y === reference.y) {
      if (this.x + 1 === reference.x) {
        return new Direction(DirectionType.East);
      } else if (this.x === reference.x + 1) {
        return new Direction(DirectionType.West);
      } else {
        return new Direction(DirectionType.None);
      }
    } else {
      return new Direction(DirectionType.None);
    }
  }

  public getLayout(): Layout {
    return Layout.from(this.plan, this.orientation.value);
  }

  public areConnected(from: Spot, to: Spot): boolean {
    const noFrom: Spot = from.antirotate(this.orientation.value);
    const noTo = to.antirotate(this.orientation.value);
    return this.plan.area(noFrom.value) === this.plan.area(noTo.value);
  }

  public isEmpty(): boolean {
    return this.occupiedSpot.value === SpotType.None;
  }

  public canPlace(neighbors: Array<Tile>): boolean {
    if (neighbors.length === 0) return false;
    if (neighbors.length >= 4) return false;
    const layout: Layout = this.getLayout();
    for (const neighbor of neighbors) {
      const direction: Direction = this.referenceDirection(neighbor);
      if (layout.isCompatible(neighbor.getLayout(), direction)) {
        return false;
      }
    }
    return true;
  }

  public northOrientedStarts(): Array<SpotType> {
    return this.plan.starts();
  }

  public northOrientedWonder(): SpotType {
    return this.plan.wonder();
  }

  public northOrientedMoves(at: Spot): Array<Move> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.moves(spot.value);
  }

  public area(at: Spot): Area {
    let spot: Spot = at.antirotate(this.orientation.value);
    return new Area(this.plan.area(spot.value));
  }

  public northOrientedAdjacentRoads(at: Spot): Array<SpotType> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.adjacentRoads(spot.value);
  }

  public northOrientedAdjacentCities(at: Spot): Array<SpotType> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.adjacentCities(spot.value);
  }

  public proxyCoordinates(direction: Direction): [number, number] {
    switch (direction.value) {
      case DirectionType.None:
        return [this.x, this.y];
      case DirectionType.NorthWest:
        return [this.x - 1, this.y + 1];
      case DirectionType.North:
        return [this.x, this.y + 1];
      case DirectionType.NorthEast:
        return [this.x + 1, this.y + 1];
      case DirectionType.East:
        return [this.x + 1, this.y];
      case DirectionType.SouthEast:
        return [this.x + 1, this.y - 1];
      case DirectionType.South:
        return [this.x, this.y - 1];
      case DirectionType.SouthWest:
        return [this.x - 1, this.y - 1];
      case DirectionType.West:
        return [this.x - 1, this.y];
    }
  }
}
