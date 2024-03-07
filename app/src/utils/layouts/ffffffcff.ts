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
//         starts.append(Spot::South);
//         starts
//     }

//     #[inline(always)]
//     fn moves(from: Spot) -> Array<Move> {
//         let mut moves: Array<Move> = ArrayTrait::new();
//         match from {
//             Spot::None => {},
//             Spot::Center => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::NorthWest => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::North => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::NorthEast => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::East => {
//                 moves.append(Move { direction: Direction::North, spot: Spot::South });
//                 moves.append(Move { direction: Direction::East, spot: Spot::West });
//                 moves.append(Move { direction: Direction::West, spot: Spot::East });
//             },
//             Spot::SouthEast => {
//                 moves.append(Move { direction: Direction::South, spot: Spot::NorthEast });
//                 moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
//                 moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
//             },
//             Spot::South => {
//                 moves.append(Move { direction: Direction::South, spot: Spot::North });
//             },
//             Spot::SouthWest => {
//                 moves.append(Move { direction: Direction::South, spot: Spot::NorthEast });
//                 moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
//                 moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
//             },
//             Spot::West => {
//                 moves.append(Move { direction: Direction::South, spot: Spot::NorthEast });
//                 moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
//                 moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
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
//             Spot::North => Area::A,
//             Spot::NorthEast => Area::A,
//             Spot::East => Area::A,
//             Spot::SouthEast => Area::A,
//             Spot::South => Area::B,
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
//             Spot::Center => cities.append(Spot::South),
//             Spot::NorthWest => cities.append(Spot::South),
//             Spot::North => cities.append(Spot::South),
//             Spot::NorthEast => cities.append(Spot::South),
//             Spot::East => cities.append(Spot::South),
//             Spot::SouthEast => cities.append(Spot::South),
//             Spot::South => {},
//             Spot::SouthWest => cities.append(Spot::South),
//             Spot::West => cities.append(Spot::South),
//         };
//         cities
//     }
// }

// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/layouts/ffffffcff.cairo

import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";

export class Configuration {
  public static starts(): Array<SpotType> {
    return [SpotType.Center, SpotType.South];
  }

  public static moves(from: SpotType): Array<Move> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [
          new Move(
            new Direction(DirectionType.North),
            new Spot(SpotType.South)
          ),
          new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
          new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
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
      case SpotType.North:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return AreaType.A;
      case SpotType.South:
        return AreaType.B;
      default:
        return AreaType.None;
    }
  }

  public static adjacentRoads(from: SpotType): Array<SpotType> {
    return [];
  }

  public static adjacentCities(from: SpotType): Array<SpotType> {
    switch (from) {
      case SpotType.Center:
      case SpotType.NorthWest:
      case SpotType.North:
      case SpotType.NorthEast:
      case SpotType.East:
      case SpotType.SouthEast:
      case SpotType.SouthWest:
      case SpotType.West:
        return [SpotType.South];
      default:
        return [];
    }
  }
}
