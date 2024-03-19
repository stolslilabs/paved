import { Plan, getPlan, getCategories } from "@/utils/plan";
import { Orientation, getOrientation } from "@/utils/orientation";
import { Direction } from "@/utils/direction";

export type Layout = {
  center: string;
  north_west: string;
  north: string;
  north_east: string;
  east: string;
  south_east: string;
  south: string;
  south_west: string;
  west: string;
};

export const getLayout = (
  planIndex: number,
  orientationIndex: number
): Layout => {
  const plan: Plan = getPlan(planIndex);
  const orientation: Orientation = getOrientation(orientationIndex);
  const [
    center,
    north_west,
    north,
    north_east,
    east,
    south_east,
    south,
    south_west,
    west,
  ] = getCategories(plan);
  switch (orientation) {
    case Orientation.North:
      return {
        center,
        north_west,
        north,
        north_east,
        east,
        south_east,
        south,
        south_west,
        west,
      };
    case Orientation.East:
      return {
        center,
        north_west: south_west,
        north: west,
        north_east: north_west,
        east: north,
        south_east: north_east,
        south: east,
        south_west: south_east,
        west: south,
      };
    case Orientation.South:
      return {
        center,
        north_west: south_east,
        north: south,
        north_east: south_west,
        east: west,
        south_east: north_west,
        south: north,
        south_west: north_east,
        west: east,
      };
    case Orientation.West:
      return {
        center,
        north_west: north_east,
        north: east,
        north_east: south_east,
        east: south,
        south_east: south_west,
        south: west,
        south_west: north_west,
        west: north,
      };
    default:
      throw new Error("Invalid orientation");
  }
};

export const isCompatible = (
  layout: Layout,
  reference: Layout,
  direction: Direction
): boolean => {
  switch (direction) {
    case Direction.North:
      return layout.north === reference.south;
    case Direction.East:
      return layout.east === reference.west;
    case Direction.South:
      return layout.south === reference.north;
    case Direction.West:
      return layout.west === reference.east;
    default:
      return false;
  }
};

export const checkCompatibility = (
  plan: number,
  orientation: number,
  northTile: any,
  eastTile: any,
  southTile: any,
  westTile: any
): boolean => {
  const layout = getLayout(plan, orientation);
  let status = true;
  if (northTile) {
    const northLayout = getLayout(northTile.plan, northTile.orientation);
    status = status && isCompatible(layout, northLayout, Direction.North);
  }
  if (eastTile) {
    const eastLayout = getLayout(eastTile.plan, eastTile.orientation);
    status = status && isCompatible(layout, eastLayout, Direction.East);
  }
  if (southTile) {
    const southLayout = getLayout(southTile.plan, southTile.orientation);
    status = status && isCompatible(layout, southLayout, Direction.South);
  }
  if (westTile) {
    const westLayout = getLayout(westTile.plan, westTile.orientation);
    status = status && isCompatible(layout, westLayout, Direction.West);
  }
  return status;
};
