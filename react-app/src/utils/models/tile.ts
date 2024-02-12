// // Constants

// const CENTER: u32 = 0x7fffffff;

// #[derive(Model, Copy, Drop, Serde)]
// struct Tile {
//     #[key]
//     game_id: u32,
//     #[key]
//     id: u32,
//     builder_id: felt252,
//     plan: u8,
//     orientation: u8,
//     x: u32,
//     y: u32,
//     occupied_spot: u8,
// }

// #[derive(Model, Copy, Drop, Serde)]
// struct TilePosition {
//     #[key]
//     game_id: u32,
//     #[key]
//     x: u32,
//     #[key]
//     y: u32,
//     tile_id: u32,
// }

// #[generate_trait]
// impl TileImpl of TileTrait {
//     #[inline(always)]
//     fn new(game_id: u32, id: u32, builder_id: felt252, plan: Plan,) -> Tile {
//         Tile {
//             game_id,
//             id,
//             builder_id,
//             plan: plan.into(),
//             orientation: Orientation::None.into(),
//             x: CENTER,
//             y: CENTER,
//             occupied_spot: Spot::None.into(),
//         }
//     }

//     #[inline(always)]
//     fn get_key(self: Tile, area: Area) -> felt252 {
//         let key: u128 = area.into() + self.id.into() * constants::TWO_POW_8;
//         key.into()
//     }

//     #[inline(always)]
//     fn are_connected(self: Tile, from: Spot, to: Spot) -> bool {
//         let orientation: Orientation = self.orientation.into();
//         let from: Spot = from.antirotate(orientation);
//         let to: Spot = to.antirotate(orientation);
//         let plan: Plan = self.plan.into();
//         plan.area(from) == plan.area(to)
//     }

//     #[inline(always)]
//     fn is_empty(self: Tile) -> bool {
//         self.occupied_spot == Spot::None.into()
//     }

//     #[inline(always)]
//     fn occupe(ref self: Tile, spot: Spot) {
//         assert(spot != Spot::None, errors::INVALID_SPOT);
//         self.occupied_spot = spot.into();
//     }

//     #[inline(always)]
//     fn leave(ref self: Tile) {
//         assert(!self.is_empty(), errors::TILE_ALREADY_EMPTY);
//         self.occupied_spot = Spot::None.into();
//     }

//     fn can_place(self: Tile, ref neighbors: Array<Tile>) -> bool {
//         // [Check] At least one neighbor
//         assert(neighbors.len() > 0, errors::TILE_NO_NEIGHBORS);
//         // [Check] No more than 4 neighbors
//         assert(neighbors.len() <= 4, errors::TILE_TOO_MUCH_NEIGHBORS);
//         // [Check] All neighbors are valid
//         let layout: Layout = self.into();
//         loop {
//             match neighbors.pop_front() {
//                 Option::Some(neighbor) => {
//                     // [Check] Neighbor is a neighbor and direction can be defined
//                     let direction: Direction = self.reference_direction(neighbor);
//                     assert(direction != Direction::None, errors::TILE_INVALID_NEIGHBOR);
//                     // [Compute] Neighbor compatibility
//                     if layout.is_compatible(neighbor.into(), direction) {
//                         continue;
//                     } else {
//                         break false;
//                     }
//                 },
//                 Option::None => { break true; },
//             }
//         }
//     }

//     #[inline(always)]
//     fn place(ref self: Tile, orientation: Orientation, x: u32, y: u32, ref neighbors: Array<Tile>) {
//         // [Check] Tile is not already placed
//         self.assert_not_placed();
//         // [Effect] Update tile orientation and position
//         self.orientation = orientation.into();
//         self.x = x;
//         self.y = y;
//         // [Check] Tile is valid
//         self.assert_can_place(ref neighbors);
//     }

//     #[inline(always)]
//     fn north_oriented_starts(self: Tile) -> Array<Spot> {
//         let plan: Plan = self.plan.into();
//         plan.starts()
//     }

//     #[inline(always)]
//     fn north_oriented_wonder(self: Tile) -> Spot {
//         let plan: Plan = self.plan.into();
//         plan.wonder()
//     }

//     #[inline(always)]
//     fn north_oriented_moves(self: Tile, at: Spot) -> Array<Move> {
//         let orientation: Orientation = self.orientation.into();
//         let spot: Spot = at.antirotate(orientation);
//         let plan: Plan = self.plan.into();
//         plan.moves(spot)
//     }

//     #[inline(always)]
//     fn area(self: Tile, at: Spot) -> Area {
//         let orientation: Orientation = self.orientation.into();
//         let spot: Spot = at.antirotate(orientation);
//         let plan: Plan = self.plan.into();
//         plan.area(spot)
//     }

//     #[inline(always)]
//     fn north_oriented_adjacent_roads(self: Tile, at: Spot) -> Array<Spot> {
//         let orientation: Orientation = self.orientation.into();
//         let spot: Spot = at.antirotate(orientation);
//         let plan: Plan = self.plan.into();
//         plan.adjacent_roads(spot)
//     }

//     #[inline(always)]
//     fn north_oriented_adjacent_cities(self: Tile, at: Spot) -> Array<Spot> {
//         let orientation: Orientation = self.orientation.into();
//         let spot: Spot = at.antirotate(orientation);
//         let plan: Plan = self.plan.into();
//         plan.adjacent_cities(spot)
//     }

//     #[inline(always)]
//     fn proxy_coordinates(self: Tile, direction: Direction) -> (u32, u32) {
//         match direction {
//             Direction::None => (self.x, self.y),
//             Direction::NorthWest => (self.x - 1, self.y + 1),
//             Direction::North => (self.x, self.y + 1),
//             Direction::NorthEast => (self.x + 1, self.y + 1),
//             Direction::East => (self.x + 1, self.y),
//             Direction::SouthEast => (self.x + 1, self.y - 1),
//             Direction::South => (self.x, self.y - 1),
//             Direction::SouthWest => (self.x - 1, self.y - 1),
//             Direction::West => (self.x - 1, self.y),
//         }
//     }
// }

// impl TileIntoLayout of Into<Tile, Layout> {
//     #[inline(always)]
//     fn into(self: Tile) -> Layout {
//         self.assert_is_placed();
//         LayoutImpl::from(self.plan.into(), self.orientation.into())
//     }
// }

// #[generate_trait]
// impl AssertImpl of AssertTrait {
//     #[inline(always)]
//     fn assert_is_placed(self: Tile) {
//         assert(Orientation::None != self.orientation.into(), errors::TILE_NOT_PLACED);
//     }

//     #[inline(always)]
//     fn assert_not_placed(self: Tile) {
//         assert(Orientation::None == self.orientation.into(), errors::TILE_ALREADY_PLACED);
//     }

//     #[inline(always)]
//     fn assert_can_place(self: Tile, ref neighbors: Array<Tile>) {
//         assert(self.can_place(ref neighbors), errors::TILE_CANNOT_PLACE);
//     }
// }

// #[generate_trait]
// impl InternalImpl of InternalTrait {
//     #[inline(always)]
//     fn reference_direction(self: Tile, reference: Tile) -> Direction {
//         if self.x == reference.x {
//             if self.y + 1 == reference.y {
//                 return Direction::North;
//             } else if self.y == reference.y + 1 {
//                 return Direction::South;
//             } else {
//                 return Direction::None;
//             }
//         } else if self.y == reference.y {
//             if self.x + 1 == reference.x {
//                 return Direction::East;
//             } else if self.x == reference.x + 1 {
//                 return Direction::West;
//             } else {
//                 return Direction::None;
//             }
//         } else {
//             return Direction::None;
//         }
//     }

//     #[inline(always)]
//     fn is_neighbor(self: Tile, reference: Tile) -> bool {
//         if self.x == reference.x {
//             self.y + 1 == reference.y || self.y == reference.y + 1
//         } else if self.y == reference.y {
//             self.x + 1 == reference.x || self.x == reference.x + 1
//         } else {
//             false
//         }
//     }
// }

import { Direction, DirectionType } from "../types/direction";
import { Layout } from "../types/layout";
import { Spot, SpotType } from "../types/spot";
import { Plan } from "../types/plan";
import { Orientation, OrientationType } from "../types/orientation";
import { Area } from "../types/area";
import { Move } from "../types/move";

export type RawTile = {
  id: number;
  builder_id: string;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  occupied_spot: number;
};

export class Tile {
  public id: number;
  public builderId: string;
  public plan: Plan;
  public orientation: Orientation;
  public x: number;
  public y: number;
  public occupiedSpot: Spot;

  constructor(
    id: number,
    builderId: string,
    plan: number,
    orientation: number,
    x: number,
    y: number,
    spot: number
  ) {
    this.id = id;
    this.builderId = builderId;
    this.plan = Plan.from(plan);
    this.orientation = Orientation.from(orientation);
    this.x = x;
    this.y = y;
    this.occupiedSpot = Spot.from(spot);
  }

  public static from(tile: RawTile): Tile {
    return new Tile(
      tile.id,
      tile.builder_id,
      tile.plan,
      tile.orientation,
      tile.x,
      tile.y,
      tile.occupied_spot
    );
  }

  public getKey(area: Area): string {
    return (area.into() + this.id * 2 ** 8).toString();
  }

  public referenceDirection(reference: Tile): Direction {
    if (this.x === reference.x) {
      if (this.y + 1 === reference.y) {
        return new Direction(DirectionType.North);
      } else if (this.y === reference.y + 1) {
        return new Direction(DirectionType.South);
      } else {
        return new Direction(DirectionType.None);
      }
    } else if (this.y === reference.y) {
      if (this.x + 1 === reference.x) {
        return new Direction(DirectionType.East);
      } else if (this.x === reference.x + 1) {
        return new Direction(DirectionType.West);
      } else {
        return new Direction(DirectionType.None);
      }
    } else {
      return new Direction(DirectionType.None);
    }
  }

  public getLayout(): Layout {
    return Layout.from(this.plan, this.orientation.value);
  }

  public areConnected(from: Spot, to: Spot): boolean {
    const noFrom: Spot = from.antirotate(this.orientation.value);
    const noTo = to.antirotate(this.orientation.value);
    return this.plan.area(noFrom.value) === this.plan.area(noTo.value);
  }

  public isEmpty(): boolean {
    return this.occupiedSpot.value === SpotType.None;
  }

  public canPlace(neighbors: Array<Tile>): boolean {
    if (neighbors.length === 0) return false;
    if (neighbors.length >= 4) return false;
    const layout: Layout = this.getLayout();
    for (const neighbor of neighbors) {
      const direction: Direction = this.referenceDirection(neighbor);
      if (layout.isCompatible(neighbor.getLayout(), direction)) {
        return false;
      }
    }
    return true;
  }

  public northOrientedStarts(): Array<SpotType> {
    return this.plan.starts();
  }

  public northOrientedWonder(): SpotType {
    return this.plan.wonder();
  }

  public northOrientedMoves(at: Spot): Array<Move> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.moves(spot.value);
  }

  public area(at: Spot): Area {
    let spot: Spot = at.antirotate(this.orientation.value);
    return new Area(this.plan.area(spot.value));
  }

  public northOrientedAdjacentRoads(at: Spot): Array<SpotType> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.adjacentRoads(spot.value);
  }

  public northOrientedAdjacentCities(at: Spot): Array<SpotType> {
    let spot: Spot = at.antirotate(this.orientation.value);
    return this.plan.adjacentCities(spot.value);
  }

  public proxyCoordinates(direction: Direction): [number, number] {
    switch (direction.value) {
      case DirectionType.None:
        return [this.x, this.y];
      case DirectionType.NorthWest:
        return [this.x - 1, this.y + 1];
      case DirectionType.North:
        return [this.x, this.y + 1];
      case DirectionType.NorthEast:
        return [this.x + 1, this.y + 1];
      case DirectionType.East:
        return [this.x + 1, this.y];
      case DirectionType.SouthEast:
        return [this.x + 1, this.y - 1];
      case DirectionType.South:
        return [this.x, this.y - 1];
      case DirectionType.SouthWest:
        return [this.x - 1, this.y - 1];
      case DirectionType.West:
        return [this.x - 1, this.y];
    }
  }
}
