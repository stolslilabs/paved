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
                moves.append(Move { direction: Direction::East, spot: Spot::NorthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::NorthEast });
            },
            Spot::North => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
                moves.append(Move { direction: Direction::East, spot: Spot::NorthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::NorthEast });
            },
            Spot::NorthEast => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
                moves.append(Move { direction: Direction::East, spot: Spot::NorthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::NorthEast });
            },
            Spot::East => {
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::SouthEast => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
                moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
            },
            Spot::South => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
                moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
            },
            Spot::SouthWest => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
                moves.append(Move { direction: Direction::East, spot: Spot::SouthWest });
                moves.append(Move { direction: Direction::West, spot: Spot::SouthEast });
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
            Spot::South => Area::C,
            Spot::SouthWest => Area::C,
            Spot::West => Area::A,
        }
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
        assert(moves.len() == 3, 'Layout: wrong moves len');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::North, spot: Spot::South };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::East, spot: Spot::NorthWest };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');

        let move = moves.pop_front().unwrap();
        let expected = Move { direction: Direction::West, spot: Spot::NorthEast };
        assert(move.direction == expected.direction, 'Layout: wrong move direction');
        assert(move.spot == expected.spot, 'Layout: wrong move spot');
    }
}
