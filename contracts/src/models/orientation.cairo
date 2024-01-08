// Core imports

use debug::PrintTrait;

// Constants

const NORTH: felt252 = 'NORTH';
const SOUTH: felt252 = 'SOUTH';
const EAST: felt252 = 'EAST';
const WEST: felt252 = 'WEST';

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Orientation {
    None,
    North,
    East,
    South,
    West
}

impl IntoOrientationU8 of Into<Orientation, u8> {
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

impl IntoOrientationFelt252 of Into<Orientation, felt252> {
    #[inline(always)]
    fn into(self: Orientation) -> felt252 {
        match self {
            Orientation::None => 0,
            Orientation::North => NORTH,
            Orientation::East => EAST,
            Orientation::South => SOUTH,
            Orientation::West => WEST,
        }
    }
}

impl IntoU8Orientation of Into<u8, Orientation> {
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

impl IntoFelt252Orientation of Into<felt252, Orientation> {
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

    use debug::PrintTrait;

    // Local imports

    use super::{Orientation, NORTH, SOUTH, EAST, WEST};

    #[test]
    fn test_orientation_into_felt() {
        let none: Orientation = Orientation::None;
        let north: Orientation = Orientation::North;
        let east: Orientation = Orientation::East;
        let south: Orientation = Orientation::South;
        let west: Orientation = Orientation::West;

        assert(0 == none.into(), 'Orientation: wrong None');
        assert(NORTH == north.into(), 'Orientation: wrong North');
        assert(EAST == east.into(), 'Orientation: wrong East');
        assert(SOUTH == south.into(), 'Orientation: wrong South');
        assert(WEST == west.into(), 'Orientation: wrong West');
    }

    #[test]
    fn test_orientation_into_u8() {
        let none: Orientation = Orientation::None;
        let north: Orientation = Orientation::North;
        let east: Orientation = Orientation::East;
        let south: Orientation = Orientation::South;
        let west: Orientation = Orientation::West;

        assert(0_u8 == none.into(), 'Orientation: wrong None');
        assert(1_u8 == north.into(), 'Orientation: wrong North');
        assert(2_u8 == east.into(), 'Orientation: wrong East');
        assert(3_u8 == south.into(), 'Orientation: wrong South');
        assert(4_u8 == west.into(), 'Orientation: wrong West');
    }

    #[test]
    fn test_u8_into_orientation() {
        let none: Orientation = Orientation::None;
        let north: Orientation = Orientation::North;
        let east: Orientation = Orientation::East;
        let south: Orientation = Orientation::South;
        let west: Orientation = Orientation::West;

        assert(none == 0_u8.into(), 'Orientation: wrong None');
        assert(north == 1_u8.into(), 'Orientation: wrong North');
        assert(east == 2_u8.into(), 'Orientation: wrong East');
        assert(south == 3_u8.into(), 'Orientation: wrong South');
        assert(west == 4_u8.into(), 'Orientation: wrong West');
    }

    #[test]
    fn test_felt_into_orientation() {
        let none: Orientation = Orientation::None;
        let north: Orientation = Orientation::North;
        let east: Orientation = Orientation::East;
        let south: Orientation = Orientation::South;
        let west: Orientation = Orientation::West;

        assert(none == 0.into(), 'Orientation: wrong None');
        assert(north == NORTH.into(), 'Orientation: wrong North');
        assert(east == EAST.into(), 'Orientation: wrong East');
        assert(south == SOUTH.into(), 'Orientation: wrong South');
        assert(west == WEST.into(), 'Orientation: wrong West');
    }
}
