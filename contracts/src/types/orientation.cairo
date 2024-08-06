// Core imports

use core::debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const NORTH: felt252 = 'NORTH';
const EAST: felt252 = 'EAST';
const SOUTH: felt252 = 'SOUTH';
const WEST: felt252 = 'WEST';

// Errors

mod errors {
    const ORIENTATION_NOT_VALID: felt252 = 'Orientation: not valid';
    const ORIENTATION_IS_VALID: felt252 = 'Orientation: is valid';
}

#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
enum Orientation {
    None,
    North,
    East,
    South,
    West
}

#[generate_trait]
impl OrientationAssert of AssertTrait {
    #[inline]
    fn assert_is_valid(self: Orientation) {
        assert(self != Orientation::None, errors::ORIENTATION_NOT_VALID);
    }

    #[inline]
    fn assert_not_valid(self: Orientation) {
        assert(self == Orientation::None, errors::ORIENTATION_IS_VALID);
    }
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

impl IntoOrientationFelt252 of core::Into<Orientation, felt252> {
    #[inline(always)]
    fn into(self: Orientation) -> felt252 {
        match self {
            Orientation::North => NORTH,
            Orientation::East => EAST,
            Orientation::South => SOUTH,
            Orientation::West => WEST,
            _ => NONE,
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

    use super::Orientation;

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

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
