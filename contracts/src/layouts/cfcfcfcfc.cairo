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
        starts.append(Spot::NorthWest);
        starts.append(Spot::North);
        starts.append(Spot::SouthEast);
        starts.append(Spot::South);
        starts
    }

    #[inline(always)]
    fn moves(from: Spot) -> Array<Move> {
        let area: Area = LayoutImpl::area(from);
        let mut moves: Array<Move> = ArrayTrait::new();
        match area {
            Area::A => {
                moves.append(Move { direction: Direction::East, spot: Spot::West });
                moves.append(Move { direction: Direction::West, spot: Spot::East });
            },
            Area::C => { moves.append(Move { direction: Direction::North, spot: Spot::South }); },
            Area::E => { moves.append(Move { direction: Direction::South, spot: Spot::North }); },
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
            Spot::NorthEast => Area::B,
            Spot::East => Area::A,
            Spot::SouthEast => Area::D,
            Spot::South => Area::E,
            Spot::SouthWest => Area::D,
            Spot::West => Area::A,
        }
    }

    #[inline(always)]
    fn adjacent_roads(from: Spot) -> Array<Spot> {
        let mut roads: Array<Spot> = ArrayTrait::new();
        roads
    }

    #[inline(always)]
    fn adjacent_cities(from: Spot) -> Array<Spot> {
        let mut cities: Array<Spot> = ArrayTrait::new();
        match from {
            Spot::None => {},
            Spot::Center => {},
            Spot::NorthWest => {
                cities.append(Spot::Center);
                cities.append(Spot::North);
            },
            Spot::North => {},
            Spot::NorthEast => {
                cities.append(Spot::Center);
                cities.append(Spot::North);
            },
            Spot::East => {},
            Spot::SouthEast => {
                cities.append(Spot::Center);
                cities.append(Spot::South);
            },
            Spot::South => {},
            Spot::SouthWest => {
                cities.append(Spot::Center);
                cities.append(Spot::South);
            },
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
