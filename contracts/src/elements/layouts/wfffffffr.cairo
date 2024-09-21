// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::elements::layouts::interface::LayoutTrait;
use paved::types::direction::Direction;
use paved::types::spot::{Spot, SpotImpl};
use paved::types::move::{Move, MoveImpl};
use paved::types::area::Area;

impl LayoutImpl of LayoutTrait {
    #[inline]
    fn starts() -> Array<Spot> {
        let mut starts: Array<Spot> = ArrayTrait::new();
        starts.append(Spot::Center);
        // starts.append(Spot::North);
        starts.append(Spot::West);
        starts
    }

    #[inline]
    fn moves(from: Spot) -> Array<Move> {
        let area: Area = Self::area(from);
        let mut moves: Array<Move> = ArrayTrait::new();
        match area {
            Area::A => {
                moves.append(Move { direction: Direction::NorthWest, spot: Spot::None });
                moves.append(Move { direction: Direction::North, spot: Spot::None });
                moves.append(Move { direction: Direction::NorthEast, spot: Spot::None });
                moves.append(Move { direction: Direction::East, spot: Spot::None });
                moves.append(Move { direction: Direction::SouthEast, spot: Spot::None });
                moves.append(Move { direction: Direction::South, spot: Spot::None });
                moves.append(Move { direction: Direction::SouthWest, spot: Spot::None });
                moves.append(Move { direction: Direction::West, spot: Spot::None });
            },
            Area::B => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::South, spot: Spot::North });
                moves.append(Move { direction: Direction::West, spot: Spot::NorthEast });
                moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
            },
            Area::C => { moves.append(Move { direction: Direction::West, spot: Spot::East }); },
            _ => {},
        };
        moves
    }

    #[inline]
    fn area(from: Spot) -> Area {
        match from {
            Spot::None => Area::None,
            Spot::Center => Area::A,
            Spot::NorthWest => Area::B,
            Spot::North => Area::B,
            Spot::NorthEast => Area::B,
            Spot::East => Area::B,
            Spot::SouthEast => Area::B,
            Spot::South => Area::B,
            Spot::SouthWest => Area::B,
            Spot::West => Area::C,
        }
    }

    #[inline]
    fn adjacent_roads(from: Spot) -> Array<Spot> {
        let mut roads: Array<Spot> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {},
            Spot::NorthWest => roads.append(Spot::West),
            Spot::North => roads.append(Spot::West),
            Spot::NorthEast => roads.append(Spot::West),
            Spot::East => roads.append(Spot::West),
            Spot::SouthEast => roads.append(Spot::West),
            Spot::South => roads.append(Spot::West),
            Spot::SouthWest => roads.append(Spot::West),
            Spot::West => {},
        };
        roads
    }

    #[inline]
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
        assert(moves.len() == 5, 'Layout: wrong moves len');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::North, spot: Spot::South };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::East, spot: Spot::West };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::South, spot: Spot::North };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::West, spot: Spot::NorthEast };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::West, spot: Spot::SouthEast };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');
    }
}
