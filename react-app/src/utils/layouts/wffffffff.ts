// Source: https://github.com/stolslilabs/stolsli/blob/main/contracts/src/layouts/wffffffff.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [SpotType.Center, SpotType.North];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.Center:
        return [
          new Move(
            new Direction(DirectionType.NorthWest),
            new Spot(SpotType.None)
          ),
          new Move(new Direction(DirectionType.North), new Spot(SpotType.None)),
          new Move(
            new Direction(DirectionType.NorthEast),
            new Spot(SpotType.None)
          ),
          new Move(new Direction(DirectionType.East), new Spot(SpotType.None)),
          new Move(
            new Direction(DirectionType.SouthEast),
            new Spot(SpotType.None)
          ),
          new Move(new Direction(DirectionType.South), new Spot(SpotType.None)),
          new Move(
            new Direction(DirectionType.SouthWest),
            new Spot(SpotType.None)
          ),
          new Move(new Direction(DirectionType.West), new Spot(SpotType.None)),
        ];
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.South:
      case SpotType.SouthWest:
      case SpotType.West:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South)
          ),
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
          new Move(
            new Direction(DirectionType.South),
            new Spot(SpotType.North)
          ),
          new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
        ];
      default:
        return [];
    }
  }

  public static area(from: SpotType): AreaType {
    switch (from) {
      case SpotType.Center:
        return AreaType.A;
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.South:
      case SpotType.SouthWest:
      case SpotType.West:
        return AreaType.B;
      default:
        return AreaType.None;
    }
  }

  public static adjacentRoads(_from: SpotType): Array<SpotType> {
    return [];
  }

  public static adjacentCities(_from: SpotType): Array<SpotType> {
    return [];
  }
}
