// Source: contracts/src/types/spot.cairo

import { OrientationType } from "./orientation";

export enum SpotType {
  None = "None",
  Center = "Center",
  NorthWest = "NorthWest",
  North = "North",
  NorthEast = "NorthEast",
  East = "East",
  SouthEast = "SouthEast",
  South = "South",
  SouthWest = "SouthWest",
  West = "West",
}

export class Spot {
  value: SpotType;

  constructor(spot: SpotType) {
    this.value = spot;
  }

  public into(): number {
    return Object.values(SpotType).indexOf(this.value);
  }

  public static from(index: number): Spot {
    const spot = Object.values(SpotType)[index];
    return new Spot(spot);
  }

  public rotate(orientation: OrientationType): Spot {
    switch (orientation) {
      case OrientationType.None:
        return new Spot(SpotType.None);
      case OrientationType.North:
        return new Spot(this.value);
      case OrientationType.East:
        switch (this.value) {
          case SpotType.None:
            return new Spot(SpotType.None);
          case SpotType.Center:
            return new Spot(SpotType.Center);
          case SpotType.NorthWest:
            return new Spot(SpotType.NorthEast);
          case SpotType.North:
            return new Spot(SpotType.East);
          case SpotType.NorthEast:
            return new Spot(SpotType.SouthEast);
          case SpotType.East:
            return new Spot(SpotType.South);
          case SpotType.SouthEast:
            return new Spot(SpotType.SouthWest);
          case SpotType.South:
            return new Spot(SpotType.West);
          case SpotType.SouthWest:
            return new Spot(SpotType.NorthWest);
          case SpotType.West:
            return new Spot(SpotType.North);
        }
      case OrientationType.South:
        switch (this.value) {
          case SpotType.None:
            return new Spot(SpotType.None);
          case SpotType.Center:
            return new Spot(SpotType.Center);
          case SpotType.NorthWest:
            return new Spot(SpotType.SouthEast);
          case SpotType.North:
            return new Spot(SpotType.South);
          case SpotType.NorthEast:
            return new Spot(SpotType.SouthWest);
          case SpotType.East:
            return new Spot(SpotType.West);
          case SpotType.SouthEast:
            return new Spot(SpotType.NorthWest);
          case SpotType.South:
            return new Spot(SpotType.North);
          case SpotType.SouthWest:
            return new Spot(SpotType.NorthEast);
          case SpotType.West:
            return new Spot(SpotType.East);
        }
      case OrientationType.West:
        switch (this.value) {
          case SpotType.None:
            return new Spot(SpotType.None);
          case SpotType.Center:
            return new Spot(SpotType.Center);
          case SpotType.NorthWest:
            return new Spot(SpotType.SouthWest);
          case SpotType.North:
            return new Spot(SpotType.West);
          case SpotType.NorthEast:
            return new Spot(SpotType.NorthWest);
          case SpotType.East:
            return new Spot(SpotType.North);
          case SpotType.SouthEast:
            return new Spot(SpotType.NorthEast);
          case SpotType.South:
            return new Spot(SpotType.East);
          case SpotType.SouthWest:
            return new Spot(SpotType.SouthEast);
          case SpotType.West:
            return new Spot(SpotType.South);
        }
    }
  }

  public antirotate(orientation: OrientationType): Spot {
    switch (orientation) {
      case OrientationType.None:
        return this.rotate(OrientationType.None);
      case OrientationType.North:
        return this.rotate(OrientationType.North);
      case OrientationType.East:
        return this.rotate(OrientationType.West);
      case OrientationType.South:
        return this.rotate(OrientationType.South);
      case OrientationType.West:
        return this.rotate(OrientationType.East);
      default:
        return this.rotate(OrientationType.None);
    }
  }
}
