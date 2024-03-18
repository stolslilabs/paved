// Core imports

use core::debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const NORTH: felt252 = 'NORTH';
const SOUTH: felt252 = 'SOUTH';
const EAST: felt252 = 'EAST';
const WEST: felt252 = 'WEST';

#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
enum Orientation {
    None,
    North,
    East,
    South,
    West
}

impl IntoOrientationU8 of core::Into<Orientation, u8> {
    #[inline(always)]
    fn into(self: Orientation) -> u8 {
        match self {
            Orientation::None => 0,
            Orientation::North => 1,
            Orientation::East => 2,
            Orientation::South => 3,
            Orientation::West => 4,
        }
    }
}

impl IntoOrientationFelt252 of core::Into<Orientation, felt252> {
    #[inline(always)]
    fn into(self: Orientation) -> felt252 {
        match self {
            Orientation::None => NONE,
            Orientation::North => NORTH,
            Orientation::East => EAST,
            Orientation::South => SOUTH,
            Orientation::West => WEST,
        }
    }
}

impl IntoU8Orientation of core::Into<u8, Orientation> {
    #[inline(always)]
    fn into(self: u8) -> Orientation {
        if self == 1 {
            Orientation::North
        } else if self == 2 {
            Orientation::East
        } else if self == 3 {
            Orientation::South
        } else if self == 4 {
            Orientation::West
        } else {
            Orientation::None
        }
    }
}

impl IntoFelt252Orientation of core::Into<felt252, Orientation> {
    #[inline(always)]
    fn into(self: felt252) -> Orientation {
        if self == NORTH {
            Orientation::North
        } else if self == EAST {
            Orientation::East
        } else if self == SOUTH {
            Orientation::South
        } else if self == WEST {
            Orientation::West
        } else {
            Orientation::None
        }
    }
}

impl OrientationPrint of PrintTrait<Orientation> {
    #[inline(always)]
    fn print(self: Orientation) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Orientation, NORTH, SOUTH, EAST, WEST};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_orientation_into_felt() {
        assert(0 == Orientation::None.into(), 'Orientation: None');
        assert(NORTH == Orientation::North.into(), 'Orientation: North');
        assert(EAST == Orientation::East.into(), 'Orientation: East');
        assert(SOUTH == Orientation::South.into(), 'Orientation: South');
        assert(WEST == Orientation::West.into(), 'Orientation: West');
    }

    #[test]
    fn test_felt_into_orientation() {
        assert(Orientation::None == 0.into(), 'Orientation: None');
        assert(Orientation::North == NORTH.into(), 'Orientation: North');
        assert(Orientation::East == EAST.into(), 'Orientation: East');
        assert(Orientation::South == SOUTH.into(), 'Orientation: South');
        assert(Orientation::West == WEST.into(), 'Orientation: West');
    }

    #[test]
    fn test_unknown_felt_into_orientation() {
        assert(Orientation::None == UNKNOWN_FELT.into(), 'Orientation: Unknown');
    }

    #[test]
    fn test_orientation_into_u8() {
        assert(0_u8 == Orientation::None.into(), 'Orientation: None');
        assert(1_u8 == Orientation::North.into(), 'Orientation: North');
        assert(2_u8 == Orientation::East.into(), 'Orientation: East');
        assert(3_u8 == Orientation::South.into(), 'Orientation: South');
        assert(4_u8 == Orientation::West.into(), 'Orientation: West');
    }

    #[test]
    fn test_u8_into_orientation() {
        assert(Orientation::None == 0_u8.into(), 'Orientation: None');
        assert(Orientation::North == 1_u8.into(), 'Orientation: North');
        assert(Orientation::East == 2_u8.into(), 'Orientation: East');
        assert(Orientation::South == 3_u8.into(), 'Orientation: South');
        assert(Orientation::West == 4_u8.into(), 'Orientation: West');
    }

    #[test]
    fn test_unknown_u8_into_orientation() {
        assert(Orientation::None == UNKNOWN_U8.into(), 'Orientation: Unknown');
    }
}
