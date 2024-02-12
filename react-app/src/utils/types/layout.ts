// Source: contracts/src/types/layout.cairo

import { Category, CategoryType } from "./category";
import { Plan } from "./plan";
import { OrientationType } from "./orientation";
import { SpotType } from "./spot";
import { Direction, DirectionType } from "./direction";

export class Layout {
  center: Category;
  northWest: Category;
  north: Category;
  northEast: Category;
  east: Category;
  southEast: Category;
  south: Category;
  southWest: Category;
  west: Category;

  constructor(
    center: Category,
    northWest: Category,
    north: Category,
    northEast: Category,
    east: Category,
    southEast: Category,
    south: Category,
    southWest: Category,
    west: Category
  ) {
    this.center = center;
    this.northWest = northWest;
    this.north = north;
    this.northEast = northEast;
    this.east = east;
    this.southEast = southEast;
    this.south = south;
    this.southWest = southWest;
    this.west = west;
  }

  public static from(plan: Plan, orientation: OrientationType): Layout {
    const [
      center,
      northWest,
      north,
      northEast,
      east,
      southEast,
      south,
      southWest,
      west,
    ] = plan.unpack();
    switch (orientation) {
      case OrientationType.North:
        return new Layout(
          center,
          northWest,
          north,
          northEast,
          east,
          southEast,
          south,
          southWest,
          west
        );
      case OrientationType.East:
        return new Layout(
          center,
          southWest,
          west,
          northWest,
          north,
          northEast,
          east,
          southEast,
          south
        );
      case OrientationType.South:
        return new Layout(
          center,
          southEast,
          south,
          southWest,
          west,
          northWest,
          north,
          northEast,
          east
        );
      case OrientationType.West:
        return new Layout(
          center,
          northEast,
          east,
          southEast,
          south,
          southWest,
          west,
          northWest,
          north
        );
      default:
        throw new Error("Invalid orientation");
    }
  }

  public isCompatible(reference: Layout, direction: Direction): boolean {
    switch (direction.value) {
      case DirectionType.North:
        return this.north === reference.south;
      case DirectionType.East:
        return this.east === reference.west;
      case DirectionType.South:
        return this.south === reference.north;
      case DirectionType.West:
        return this.west === reference.east;
      default:
        return false;
    }
  }

  public getCategory(spot: SpotType): Category {
    switch (spot) {
      case SpotType.None:
        return new Category(CategoryType.None);
      case SpotType.Center:
        return this.center;
      case SpotType.NorthWest:
        return this.northWest;
      case SpotType.North:
        return this.north;
      case SpotType.NorthEast:
        return this.northEast;
      case SpotType.East:
        return this.east;
      case SpotType.SouthEast:
        return this.southEast;
      case SpotType.South:
        return this.south;
      case SpotType.SouthWest:
        return this.southWest;
      case SpotType.West:
        return this.west;
    }
  }
}
