// Source: contracts/src/types/orientation.cairo

export enum OrientationType {
  None = "None",
  North = "North",
  East = "East",
  South = "South",
  West = "West",
}

export class Orientation {
  value: OrientationType;

  constructor(value: OrientationType) {
    this.value = value;
  }

  public into(): number {
    return Object.values(OrientationType).indexOf(this.value);
  }

  public static from(index: number): Orientation {
    const orientation = Object.values(OrientationType)[index];
    return new Orientation(orientation);
  }
}
