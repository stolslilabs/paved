// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::layouts::interface::LayoutTrait;
use paved::types::direction::Direction;
use paved::types::spot::{Spot, SpotImpl};
use paved::types::move::{Move, MoveImpl};
use paved::types::area::Area;

impl LayoutImpl of LayoutTrait {
    #[inline(always)]
    fn starts() -> Array<Spot> {
        let mut starts: Array<Spot> = ArrayTrait::new();
        // starts.append(Spot::NorthWest);
        starts.append(Spot::North);
        // starts.append(Spot::NorthEast);
        starts.append(Spot::East);
        // starts.append(Spot::South);
        starts.append(Spot::West);
        starts
    }

    #[inline(always)]
    fn moves(from: Spot) -> Array<Move> {
        let area: Area = LayoutImpl::area(from);
        let mut moves: Array<Move> = ArrayTrait::new();
        match area {
            Area::B => {
                moves.append(Move { direction: Direction::North, spot: Spot::SouthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::NorthEast });
            },
            Area::C => { moves.append(Move { direction: Direction::North, spot: Spot::South }); },
            Area::D => {
                moves.append(Move { direction: Direction::North, spot: Spot::SouthEast });
                moves.append(Move { direction: Direction::East, spot: Spot::NorthWest });
            },
            Area::E => { moves.append(Move { direction: Direction::East, spot: Spot::West }); },
            Area::F => {
                moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
                moves.append(Move { direction: Direction::South, spot: Spot::North });
                moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
            },
            Area::G => { moves.append(Move { direction: Direction::West, spot: Spot::East }); },
            _ => {},
        };
        moves
    }

    #[inline(always)]
    fn area(from: Spot) -> Area {
        match from {
            Spot::None => Area::None,
            Spot::Center => Area::A,
            Spot::NorthWest => Area::B,
            Spot::North => Area::C,
            Spot::NorthEast => Area::D,
            Spot::East => Area::E,
            Spot::SouthEast => Area::F,
            Spot::South => Area::F,
            Spot::SouthWest => Area::F,
            Spot::West => Area::G,
        }
    }

    #[inline(always)]
    fn adjacent_roads(from: Spot) -> Array<Spot> {
        let mut roads: Array<Spot> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {},
            Spot::NorthWest => {
                roads.append(Spot::North);
                roads.append(Spot::West);
            },
            Spot::North => {},
            Spot::NorthEast => {
                roads.append(Spot::North);
                roads.append(Spot::East);
            },
            Spot::East => {},
            Spot::SouthEast => {
                roads.append(Spot::East);
                roads.append(Spot::West);
            },
            Spot::South => {
                roads.append(Spot::East);
                roads.append(Spot::West);
            },
            Spot::SouthWest => {
                roads.append(Spot::East);
                roads.append(Spot::West);
            },
            Spot::West => {},
        };
        roads
    }

    #[inline(always)]
    fn adjacent_cities(from: Spot) -> Array<Spot> {
        let mut cities: Array<Spot> = ArrayTrait::new();
        cities
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{LayoutImpl, Direction, Spot, Move};

    #[test]
    fn test_layouts_moves_from_north() {
        let mut moves = LayoutImpl::moves(Spot::North);
        assert(moves.len() == 1, 'Layout: wrong moves len');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::North, spot: Spot::South };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');
    }
}
