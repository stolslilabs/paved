// Source: contracts/src/types/direction.cairo

import { OrientationType } from "./orientation";

export enum DirectionType {
  None = "None",
  NorthWest = "NorthWest",
  North = "North",
  NorthEast = "NorthEast",
  East = "East",
  SouthEast = "SouthEast",
  South = "South",
  SouthWest = "SouthWest",
  West = "West",
}

export class Direction {
  value: DirectionType;

  constructor(direction: DirectionType) {
    this.value = direction;
  }

  public into(): number {
    return Object.values(DirectionType).indexOf(this.value);
  }

  public from(index: number): Direction {
    const direction = Object.values(DirectionType)[index];
    return new Direction(direction);
  }

  public rotate(orientation: OrientationType): Direction {
    switch (orientation) {
      case OrientationType.North:
        return new Direction(this.value);
      case OrientationType.East:
        switch (this.value) {
          case DirectionType.NorthWest:
            return new Direction(DirectionType.NorthEast);
          case DirectionType.North:
            return new Direction(DirectionType.East);
          case DirectionType.NorthEast:
            return new Direction(DirectionType.SouthEast);
          case DirectionType.East:
            return new Direction(DirectionType.South);
          case DirectionType.SouthEast:
            return new Direction(DirectionType.SouthWest);
          case DirectionType.South:
            return new Direction(DirectionType.West);
          case DirectionType.SouthWest:
            return new Direction(DirectionType.NorthWest);
          case DirectionType.West:
            return new Direction(DirectionType.North);
          default:
            return new Direction(DirectionType.None);
        }
      case OrientationType.South:
        switch (this.value) {
          case DirectionType.NorthWest:
            return new Direction(DirectionType.SouthEast);
          case DirectionType.North:
            return new Direction(DirectionType.South);
          case DirectionType.NorthEast:
            return new Direction(DirectionType.SouthWest);
          case DirectionType.East:
            return new Direction(DirectionType.West);
          case DirectionType.SouthEast:
            return new Direction(DirectionType.NorthWest);
          case DirectionType.South:
            return new Direction(DirectionType.North);
          case DirectionType.SouthWest:
            return new Direction(DirectionType.NorthEast);
          case DirectionType.West:
            return new Direction(DirectionType.East);
          default:
            return new Direction(DirectionType.None);
        }
      case OrientationType.West:
        switch (this.value) {
          case DirectionType.NorthWest:
            return new Direction(DirectionType.SouthWest);
          case DirectionType.North:
            return new Direction(DirectionType.West);
          case DirectionType.NorthEast:
            return new Direction(DirectionType.NorthWest);
          case DirectionType.East:
            return new Direction(DirectionType.North);
          case DirectionType.SouthEast:
            return new Direction(DirectionType.NorthEast);
          case DirectionType.South:
            return new Direction(DirectionType.East);
          case DirectionType.SouthWest:
            return new Direction(DirectionType.SouthEast);
          case DirectionType.West:
            return new Direction(DirectionType.South);
          default:
            return new Direction(DirectionType.None);
        }
      default:
        return new Direction(DirectionType.None);
    }
  }

  public antirotate(orientation: OrientationType): Direction {
    switch (orientation) {
      case OrientationType.North:
        return this.rotate(OrientationType.North);
      case OrientationType.East:
        return this.rotate(OrientationType.West);
      case OrientationType.South:
        return this.rotate(OrientationType.South);
      case OrientationType.West:
        return this.rotate(OrientationType.East);
      default:
        return new Direction(DirectionType.None);
    }
  }

  public source(): Direction {
    switch (this.value) {
      case DirectionType.NorthWest:
        return new Direction(DirectionType.SouthEast);
      case DirectionType.North:
        return new Direction(DirectionType.South);
      case DirectionType.NorthEast:
        return new Direction(DirectionType.SouthWest);
      case DirectionType.East:
        return new Direction(DirectionType.West);
      case DirectionType.SouthEast:
        return new Direction(DirectionType.NorthWest);
      case DirectionType.South:
        return new Direction(DirectionType.North);
      case DirectionType.SouthWest:
        return new Direction(DirectionType.NorthEast);
      case DirectionType.West:
        return new Direction(DirectionType.East);
      default:
        return new Direction(DirectionType.None);
    }
  }
}
