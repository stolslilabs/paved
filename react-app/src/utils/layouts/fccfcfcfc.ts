// Source: contracts/src/layouts/fccfcfcfc.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [SpotType.Center, SpotType.North, SpotType.East, SpotType.South];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.West:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South)
          ),
          new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
        ];
      case SpotType.East:
        return [
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
        ];
      case SpotType.South:
        return [
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
      case SpotType.NorthEast:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
        return AreaType.A;
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.West:
        return AreaType.B;
      case SpotType.East:
        return AreaType.C;
      case SpotType.South:
        return AreaType.D;
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
      case SpotType.NorthEast:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
        return [SpotType.North, SpotType.East, SpotType.South];
      default:
        return [];
    }
  }
}
