// Source: contracts/src/types/category.cairo

import * as constants from "../constants";

export enum CategoryType {
  None = "None",
  Forest = "Forest",
  Road = "Road",
  City = "City",
  Stop = "Stop",
  Wonder = "Wonder",
}

export class Category {
  value: CategoryType;

  constructor(category: CategoryType) {
    this.value = category;
  }

  public into(): number {
    return Object.values(CategoryType).indexOf(this.value);
  }

  public static from(index: number): Category {
    const category = Object.values(CategoryType)[index];
    return new Category(category);
  }

  public static fromChar(category: string): Category {
    switch (category) {
      case "C":
        return new Category(CategoryType.City);
      case "F":
        return new Category(CategoryType.Forest);
      case "R":
        return new Category(CategoryType.Road);
      case "S":
        return new Category(CategoryType.Stop);
      case "W":
        return new Category(CategoryType.Wonder);
      default:
        return new Category(CategoryType.None);
    }
  }

  public basePoints(): number {
    switch (this.value) {
      case CategoryType.None:
        return 0;
      case CategoryType.Forest:
        return constants.FOREST_BASE_POINTS;
      case CategoryType.Road:
        return constants.ROAD_BASE_POINTS;
      case CategoryType.City:
        return constants.CITY_BASE_POINTS;
      case CategoryType.Stop:
        return 0;
      case CategoryType.Wonder:
        return constants.WONDER_BASE_POINTS;
    }
  }
}
