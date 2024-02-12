// // Core imports

// use debug::PrintTrait;

// // Internal imports

// use stolsli::layouts::interface::LayoutTrait;
// use stolsli::types::direction::Direction;
// use stolsli::types::spot::{Spot, SpotImpl};
// use stolsli::types::move::{Move, MoveImpl};
// use stolsli::types::area::Area;

// impl LayoutImpl of LayoutTrait {
//     #[inline(always)]
//     fn starts() -> Array<Spot> {
//         let mut starts: Array<Spot> = ArrayTrait::new();
//         starts.append(Spot::Center);
//         starts.append(Spot::North);
//         starts.append(Spot::South);
//         starts
//     }

//     #[inline(always)]
//     fn moves(from: Spot) -> Array<Move> {
//         let mut moves: Array<Move> = ArrayTrait::new();
//         match from {
//             Spot::None => {},
//             Spot::Center => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::NorthWest => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::North => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//             },
//             Spot::NorthEast => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::East => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::SouthEast => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::South => {
//                 moves.append(Move { direction: Direction::South, spot: Spot::North });
//             },
//             Spot::SouthWest => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::West => {
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//         };
//         moves
//     }

//     #[inline(always)]
//     fn area(from: Spot) -> Area {
//         match from {
//             Spot::None => Area::None,
//             Spot::Center => Area::A,
//             Spot::NorthWest => Area::A,
//             Spot::North => Area::B,
//             Spot::NorthEast => Area::A,
//             Spot::East => Area::A,
//             Spot::SouthEast => Area::A,
//             Spot::South => Area::C,
//             Spot::SouthWest => Area::A,
//             Spot::West => Area::A,
//         }
//     }

//     #[inline(always)]
//     fn adjacent_roads(from: Spot) -> Array<Spot> {
//         let mut roads: Array<Spot> = ArrayTrait::new();
//         roads
//     }

//     #[inline(always)]
//     fn adjacent_cities(from: Spot) -> Array<Spot> {
//         let mut cities: Array<Spot> = ArrayTrait::new();
//         match from {
//             Spot::None => {},
//             Spot::Center => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::NorthWest => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::North => {},
//             Spot::NorthEast => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::East => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::SouthEast => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::South => {},
//             Spot::SouthWest => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//             Spot::West => {
//                 cities.append(Spot::North);
//                 cities.append(Spot::South);
//             },
//         };
//         cities
//     }
// }

// #[cfg(test)]
// mod tests {
//     // Core imports

//     use debug::PrintTrait;

//     // Local imports

//     use super::{LayoutImpl, Direction, Spot, Move};

//     #[test]
//     fn test_layouts_moves_from_north() {
//         let mut moves = LayoutImpl::moves(Spot::North);
//         assert(moves.len() == 1, 'Layout: wrong moves len');

//         let move = moves.pop_front().unwrap();
//         let expected = Move { direction: Direction::North, spot: Spot::South };
//         assert(move.direction == expected.direction, 'Layout: wrong move direction');
//         assert(move.spot == expected.spot, 'Layout: wrong move spot');
//     }
// }

// Source: contracts/src/layouts/ffcfffcff.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [SpotType.Center, SpotType.North, SpotType.South];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
          new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
        ];
      case SpotType.North:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South)
          ),
        ];
      case SpotType.South:
        return [
          new Move(
            new Direction(DirectionType.South),
            new Spot(SpotType.North)
          ),
        ];
      default:
        return [];
    }
  }

  public static area(from: SpotType): AreaType {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return AreaType.A;
      case SpotType.North:
        return AreaType.B;
      case SpotType.South:
        return AreaType.C;
      default:
        return AreaType.None;
    }
  }

  public static adjacentRoads(_from: SpotType): Array<SpotType> {
    return [];
  }

  public static adjacentCities(from: SpotType): Array<SpotType> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [SpotType.North, SpotType.South];
      default:
        return [];
    }
  }
}
