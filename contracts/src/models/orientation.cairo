// Core imports

use debug::PrintTrait;

// Constants

const NORTH: felt252 = 'NORTH';
const SOUTH: felt252 = 'SOUTH';
const EAST: felt252 = 'EAST';
const WEST: felt252 = 'WEST';

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Orientation {
    north,
    south,
    east,
    west
}

impl IntoOrientationU8 of Into<Orientation, u8> {
    #[inline(always)]
    fn into(self: Orientation) -> u8 {
        match self {
            Orientation::north => 0,
            Orientation::south => 1,
            Orientation::east => 2,
            Orientation::west => 3,
        }
    }
}

impl IntoOrientationFelt252 of Into<Orientation, felt252> {
    #[inline(always)]
    fn into(self: Orientation) -> felt252 {
        match self {
            Orientation::north => NORTH,
            Orientation::south => SOUTH,
            Orientation::east => EAST,
            Orientation::west => WEST,
        }
    }
}

impl TryIntoU8Orientation of TryInto<u8, Orientation> {
    #[inline(always)]
    fn try_into(self: u8) -> Option<Orientation> {
        if self == 0 {
            Option::Some(Orientation::north)
        } else if self == 1 {
            Option::Some(Orientation::south)
        } else if self == 2 {
            Option::Some(Orientation::east)
        } else if self == 3 {
            Option::Some(Orientation::west)
        } else {
            Option::None
        }
    }
}

impl TryIntoFelt252Orientation of TryInto<felt252, Orientation> {
    #[inline(always)]
    fn try_into(self: felt252) -> Option<Orientation> {
        if self == NORTH {
            Option::Some(Orientation::north)
        } else if self == SOUTH {
            Option::Some(Orientation::south)
        } else if self == EAST {
            Option::Some(Orientation::east)
        } else if self == WEST {
            Option::Some(Orientation::west)
        } else {
            Option::None
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
