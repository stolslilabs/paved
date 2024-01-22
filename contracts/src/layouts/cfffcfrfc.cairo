// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::layouts::interface::LayoutTrait;
use stolsli::types::direction::Direction;
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::move::{Move, MoveImpl};
use stolsli::types::area::Area;

impl LayoutImpl of LayoutTrait {
    #[inline(always)]
    fn moves(from: Spot) -> Array<Move> {
        let mut moves: Array<Move> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::NorthWest => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
            },
            Spot::North => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
            },
            Spot::NorthEast => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
            },
            Spot::East => {
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::SouthEast => {
                moves.append(Move { direction: Direction::South, spot: Spot::NorthEast });
            },
            Spot::South => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
            },
            Spot::SouthWest => {
                moves.append(Move { direction: Direction::South, spot: Spot::NorthWest });
            },
            Spot::West => {
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
        };
        moves
    }

    #[inline(always)]
    fn area(from: Spot) -> Area {
        match from {
            Spot::None => Area::None,
            Spot::Center => Area::A,
            Spot::NorthWest => Area::B,
            Spot::North => Area::B,
            Spot::NorthEast => Area::B,
            Spot::East => Area::A,
            Spot::SouthEast => Area::C,
            Spot::South => Area::D,
            Spot::SouthWest => Area::E,
            Spot::West => Area::A,
        }
    }

    #[inline(always)]
    fn adjacent_roads(from: Spot) -> Array<Spot> {
        let mut roads: Array<Spot> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {},
            Spot::NorthWest => {},
            Spot::North => {},
            Spot::NorthEast => {},
            Spot::East => {},
            Spot::SouthEast => roads.append(Spot::South),
            Spot::South => {},
            Spot::SouthWest => roads.append(Spot::South),
            Spot::West => {},
        };
        roads
    }

    #[inline(always)]
    fn adjacent_cities(from: Spot) -> Array<Spot> {
        let mut cities: Array<Spot> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {},
            Spot::NorthWest => cities.append(Spot::Center),
            Spot::North => cities.append(Spot::Center),
            Spot::NorthEast => cities.append(Spot::Center),
            Spot::East => {},
            Spot::SouthEast => cities.append(Spot::Center),
            Spot::South => {},
            Spot::SouthWest => cities.append(Spot::Center),
            Spot::West => {},
        };
        cities
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

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
