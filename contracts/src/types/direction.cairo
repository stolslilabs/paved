// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::orientation::Orientation;

#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
enum Direction {
    None,
    NorthWest,
    North,
    NorthEast,
    East,
    SouthEast,
    South,
    SouthWest,
    West,
}

impl IntoDirectionU8 of core::Into<Direction, u8> {
    #[inline(always)]
    fn into(self: Direction) -> u8 {
        match self {
            Direction::None => 0,
            Direction::NorthWest => 1,
            Direction::North => 2,
            Direction::NorthEast => 3,
            Direction::East => 4,
            Direction::SouthEast => 5,
            Direction::South => 6,
            Direction::SouthWest => 7,
            Direction::West => 8,
        }
    }
}

impl IntoU8Direction of core::Into<u8, Direction> {
    #[inline(always)]
    fn into(self: u8) -> Direction {
        match self {
            0 => Direction::None,
            1 => Direction::NorthWest,
            2 => Direction::North,
            3 => Direction::NorthEast,
            4 => Direction::East,
            5 => Direction::SouthEast,
            6 => Direction::South,
            7 => Direction::SouthWest,
            8 => Direction::West,
            _ => Direction::None,
        }
    }
}

#[generate_trait]
impl DirectionImpl of DirectionTrait {
    #[inline(always)]
    fn rotate(self: Direction, orientation: Orientation) -> Direction {
        match orientation {
            Orientation::None => Direction::None,
            Orientation::North => self,
            Orientation::East => {
                match self {
                    Direction::None => Direction::None,
                    Direction::NorthWest => Direction::NorthEast,
                    Direction::North => Direction::East,
                    Direction::NorthEast => Direction::SouthEast,
                    Direction::East => Direction::South,
                    Direction::SouthEast => Direction::SouthWest,
                    Direction::South => Direction::West,
                    Direction::SouthWest => Direction::NorthWest,
                    Direction::West => Direction::North,
                }
            },
            Orientation::South => {
                match self {
                    Direction::None => Direction::None,
                    Direction::NorthWest => Direction::SouthEast,
                    Direction::North => Direction::South,
                    Direction::NorthEast => Direction::SouthWest,
                    Direction::East => Direction::West,
                    Direction::SouthEast => Direction::NorthWest,
                    Direction::South => Direction::North,
                    Direction::SouthWest => Direction::NorthEast,
                    Direction::West => Direction::East,
                }
            },
            Orientation::West => {
                match self {
                    Direction::None => Direction::None,
                    Direction::NorthWest => Direction::SouthWest,
                    Direction::North => Direction::West,
                    Direction::NorthEast => Direction::NorthWest,
                    Direction::East => Direction::North,
                    Direction::SouthEast => Direction::NorthEast,
                    Direction::South => Direction::East,
                    Direction::SouthWest => Direction::SouthEast,
                    Direction::West => Direction::South,
                }
            },
        }
    }

    #[inline(always)]
    fn antirotate(self: Direction, orientation: Orientation) -> Direction {
        let anti_orientation = match orientation {
            Orientation::None => Orientation::None,
            Orientation::North => Orientation::North,
            Orientation::East => Orientation::West,
            Orientation::South => Orientation::South,
            Orientation::West => Orientation::East,
        };
        self.rotate(anti_orientation)
    }

    #[inline(always)]
    fn source(self: Direction) -> Direction {
        self.rotate(Orientation::South)
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Direction};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_direction_into_u8() {
        assert(0_u8 == Direction::None.into(), 'Direction: None');
        assert(1_u8 == Direction::NorthWest.into(), 'Direction: NorthWest');
        assert(2_u8 == Direction::North.into(), 'Direction: North');
        assert(3_u8 == Direction::NorthEast.into(), 'Direction: NorthEast');
        assert(4_u8 == Direction::East.into(), 'Direction: East');
        assert(5_u8 == Direction::SouthEast.into(), 'Direction: SouthEast');
        assert(6_u8 == Direction::South.into(), 'Direction: South');
        assert(7_u8 == Direction::SouthWest.into(), 'Direction: SouthWest');
        assert(8_u8 == Direction::West.into(), 'Direction: West');
    }

    #[test]
    fn test_u8_into_direction() {
        assert(Direction::None == 0_u8.into(), 'Direction: None');
        assert(Direction::NorthWest == 1_u8.into(), 'Direction: NorthWest');
        assert(Direction::North == 2_u8.into(), 'Direction: North');
        assert(Direction::NorthEast == 3_u8.into(), 'Direction: NorthEast');
        assert(Direction::East == 4_u8.into(), 'Direction: East');
        assert(Direction::SouthEast == 5_u8.into(), 'Direction: SouthEast');
        assert(Direction::South == 6_u8.into(), 'Direction: South');
        assert(Direction::SouthWest == 7_u8.into(), 'Direction: SouthWest');
        assert(Direction::West == 8_u8.into(), 'Direction: West');
    }

    #[test]
    fn test_unknown_u8_into_direction() {
        assert(Direction::None == UNKNOWN_U8.into(), 'Direction: Unknown');
    }
}
