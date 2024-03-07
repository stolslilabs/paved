// Source: contracts/src/layouts/ffcfcccff.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [SpotType.Center, SpotType.North, SpotType.South];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [
          new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
        ];
      case SpotType.North:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South)
          ),
        ];
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.South:
        return [
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
          new Move(
            new Direction(DirectionType.South),
            new Spot(SpotType.North)
          ),
        ];
      default:
        return [];
    }
  }

  public static area(from: SpotType): AreaType {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return AreaType.A;
      case SpotType.North:
        return AreaType.B;
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.South:
        return AreaType.C;
      default:
        return AreaType.None;
    }
  }

  public static adjacentRoads(from: SpotType): Array<SpotType> {
    switch (from) {
      default:
        return [];
    }
  }

  public static adjacentCities(from: SpotType): Array<SpotType> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [SpotType.North, SpotType.South];
      default:
        return [];
    }
  }
}
