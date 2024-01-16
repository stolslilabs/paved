// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::types::orientation::Orientation;

// Constants

const NONE: felt252 = 0;
const NORTH: felt252 = 'NORTH';
const NORTH_EAST: felt252 = 'NORTH_EAST';
const NORTH_WEST: felt252 = 'NORTH_WEST';
const SOUTH: felt252 = 'SOUTH';
const SOUTH_EAST: felt252 = 'SOUTH_EAST';
const SOUTH_WEST: felt252 = 'SOUTH_WEST';
const EAST: felt252 = 'EAST';
const WEST: felt252 = 'WEST';

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

impl IntoDirectionU8 of Into<Direction, u8> {
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

impl IntoDirectionFelt252 of Into<Direction, felt252> {
    #[inline(always)]
    fn into(self: Direction) -> felt252 {
        match self {
            Direction::None => NONE,
            Direction::NorthWest => NORTH_WEST,
            Direction::North => NORTH,
            Direction::NorthEast => NORTH_EAST,
            Direction::East => EAST,
            Direction::SouthEast => SOUTH_EAST,
            Direction::South => SOUTH,
            Direction::SouthWest => SOUTH_WEST,
            Direction::West => WEST,
        }
    }
}

impl IntoU8Direction of Into<u8, Direction> {
    #[inline(always)]
    fn into(self: u8) -> Direction {
        if self == 1 {
            Direction::NorthWest
        } else if self == 2 {
            Direction::North
        } else if self == 3 {
            Direction::NorthEast
        } else if self == 4 {
            Direction::East
        } else if self == 5 {
            Direction::SouthEast
        } else if self == 6 {
            Direction::South
        } else if self == 7 {
            Direction::SouthWest
        } else if self == 8 {
            Direction::West
        } else {
            Direction::None
        }
    }
}

impl IntoFelt252Direction of Into<felt252, Direction> {
    #[inline(always)]
    fn into(self: felt252) -> Direction {
        if self == NORTH_WEST {
            Direction::NorthWest
        } else if self == NORTH {
            Direction::North
        } else if self == NORTH_EAST {
            Direction::NorthEast
        } else if self == EAST {
            Direction::East
        } else if self == SOUTH_EAST {
            Direction::SouthEast
        } else if self == SOUTH {
            Direction::South
        } else if self == SOUTH_WEST {
            Direction::SouthWest
        } else if self == WEST {
            Direction::West
        } else {
            Direction::None
        }
    }
}

impl DirectionPrint of PrintTrait<Direction> {
    #[inline(always)]
    fn print(self: Direction) {
        let felt: felt252 = self.into();
        felt.print();
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
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{
        Direction, NORTH_WEST, NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST
    };

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_direction_into_felt() {
        assert(0 == Direction::None.into(), 'Direction: None');
        assert(NORTH_WEST == Direction::NorthWest.into(), 'Direction: NorthWest');
        assert(NORTH == Direction::North.into(), 'Direction: North');
        assert(NORTH_EAST == Direction::NorthEast.into(), 'Direction: NorthEast');
        assert(EAST == Direction::East.into(), 'Direction: East');
        assert(SOUTH_EAST == Direction::SouthEast.into(), 'Direction: SouthEast');
        assert(SOUTH == Direction::South.into(), 'Direction: South');
        assert(SOUTH_WEST == Direction::SouthWest.into(), 'Direction: SouthWest');
        assert(WEST == Direction::West.into(), 'Direction: West');
    }

    #[test]
    fn test_felt_into_direction() {
        assert(Direction::None == 0.into(), 'Direction: None');
        assert(Direction::NorthWest == NORTH_WEST.into(), 'Direction: NorthWest');
        assert(Direction::North == NORTH.into(), 'Direction: North');
        assert(Direction::NorthEast == NORTH_EAST.into(), 'Direction: NorthEast');
        assert(Direction::East == EAST.into(), 'Direction: East');
        assert(Direction::SouthEast == SOUTH_EAST.into(), 'Direction: SouthEast');
        assert(Direction::South == SOUTH.into(), 'Direction: South');
        assert(Direction::SouthWest == SOUTH_WEST.into(), 'Direction: SouthWest');
        assert(Direction::West == WEST.into(), 'Direction: West');
    }

    #[test]
    fn test_unknown_felt_into_direction() {
        assert(Direction::None == UNKNOWN_FELT.into(), 'Direction: Unknown');
    }

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
