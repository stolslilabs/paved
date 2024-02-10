export enum Orientation {
    None = "None",
    North = "North",
    East = "East",
    South = "South",
    West = "West",
  }
  
  export const getOrientation = (index: number): Orientation => {
    const orientations = Object.values(Orientation);
    return orientations[index];
  };
  
  export const getIndex = (orientation: Orientation): number => {
    return Object.values(Orientation).indexOf(orientation);
  };