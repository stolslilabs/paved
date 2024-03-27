// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/layouts/sfrfrfcfr.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [
      SpotType.NorthWest,
      SpotType.North,
      SpotType.NorthEast,
      SpotType.East,
      SpotType.SouthEast,
      SpotType.South,
      SpotType.West,
    ];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.NorthWest:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.SouthWest),
          ),
          new Move(
            new Direction(DirectionType.West),
            new Spot(SpotType.NorthEast),
          ),
        ];
      case SpotType.North:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South),
          ),
        ];
      case SpotType.NorthEast:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.SouthEast),
          ),
          new Move(
            new Direction(DirectionType.East),
            new Spot(SpotType.NorthWest),
          ),
        ];
      case SpotType.East:
        return [
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
        ];
      case SpotType.SouthEast:
        return [
          new Move(
            new Direction(DirectionType.East),
            new Spot(SpotType.SouthWest),
          ),
          new Move(
            new Direction(DirectionType.West),
            new Spot(SpotType.SouthEast),
          ),
        ];
      case SpotType.South:
        return [
          new Move(
            new Direction(DirectionType.South),
            new Spot(SpotType.North),
          ),
        ];
      case SpotType.SouthWest:
        return [
          new Move(
            new Direction(DirectionType.East),
            new Spot(SpotType.SouthWest),
          ),
          new Move(
            new Direction(DirectionType.West),
            new Spot(SpotType.SouthEast),
          ),
        ];
      case SpotType.West:
        return [
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
        return AreaType.B;
      case SpotType.North:
        return AreaType.C;
      case SpotType.NorthEast:
        return AreaType.D;
      case SpotType.East:
        return AreaType.E;
      case SpotType.SouthEast:
      case SpotType.SouthWest:
        return AreaType.F;
      case SpotType.South:
        return AreaType.G;
      case SpotType.West:
        return AreaType.H;
      default:
        return AreaType.None;
    }
  }

  public static adjacentRoads(from: SpotType): Array<SpotType> {
    switch (from) {
      case SpotType.NorthWest:
        return [SpotType.North, SpotType.West];
      case SpotType.NorthEast:
        return [SpotType.North, SpotType.East];
      case SpotType.SouthEast:
        return [SpotType.East, SpotType.West];
      case SpotType.SouthWest:
        return [SpotType.East, SpotType.West];
      default:
        return [];
    }
  }

  public static adjacentCities(from: SpotType): Array<SpotType> {
    switch (from) {
      case SpotType.SouthEast:
      case SpotType.SouthWest:
        return [SpotType.South];
      default:
        return [];
    }
  }
}
