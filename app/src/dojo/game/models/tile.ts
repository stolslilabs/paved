import { Direction, DirectionType } from "../types/direction";
import { Layout } from "../types/layout";
import { Spot, SpotType } from "../types/spot";
import { Plan } from "../types/plan";
import { Orientation } from "../types/orientation";
import { Area } from "../types/area";
import { Move } from "../types/move";
import { ComponentValue } from "@dojoengine/recs";
import { getImage, getModelVariations } from "@/dojo/game";

export class Tile {
  public gameId: number;
  public id: number;
  public playerId: string;
  public plan: Plan;
  public orientation: Orientation;
  public x: number;
  public y: number;
  public occupiedSpot: Spot;

  constructor(tile: ComponentValue) {
    this.gameId = tile.game_id;
    this.id = tile.id;
    this.playerId = tile.player_id.toString(16);
    this.plan = Plan.from(tile.plan);
    this.orientation = Orientation.from(tile.orientation);
    this.x = tile.x;
    this.y = tile.y;
    this.occupiedSpot = Spot.from(tile.occupied_spot);
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

  public getImage(): string {
    const index = this.plan.into();
    return getImage({ plan: index });
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

  getVarietyModelPath(x: number = this.x, y: number = this.y): string {
    const input = `${this.plan.value}${x}${y}${this.gameId}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
      hash = (hash << 13) | (hash >>> 19);
    }
    const index = this.plan.into();

    const name = this.plan.value.toLowerCase();
    const density = Math.abs(hash) % 2 === 0 ? "LF" : "HF";
    const variation = (Math.abs(hash) % getModelVariations({ plan: index })) + 1;

    return `${name}_${density}_${variation}`;
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
