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
        starts.append(Spot::Center);
        starts.append(Spot::North);
        starts.append(Spot::East);
        starts.append(Spot::South);
        starts
    }

    #[inline(always)]
    fn moves(from: Spot) -> Array<Move> {
        let mut moves: Array<Move> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::NorthWest => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
            },
            Spot::North => {
                moves.append(Move { direction: Direction::North, spot: Spot::South });
            },
            Spot::NorthEast => {
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::East => { moves.append(Move { direction: Direction::East, spot: Spot::West }); },
            Spot::SouthEast => {
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Spot::South => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
            },
            Spot::SouthWest => {
                moves.append(Move { direction: Direction::South, spot: Spot::North });
            },
            Spot::West => { moves.append(Move { direction: Direction::West, spot: Spot::East }); },
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
            Spot::NorthEast => Area::A,
            Spot::East => Area::C,
            Spot::SouthEast => Area::A,
            Spot::South => Area::D,
            Spot::SouthWest => Area::D,
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
            Spot::SouthEast => {},
            Spot::South => {},
            Spot::SouthWest => {},
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
            Spot::NorthEast => {},
            Spot::East => cities.append(Spot::Center),
            Spot::SouthEast => {},
            Spot::South => cities.append(Spot::Center),
            Spot::SouthWest => cities.append(Spot::Center),
            Spot::West => {},
        };
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
