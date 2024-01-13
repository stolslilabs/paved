// Core imports

use debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const CENTER: felt252 = 'CENTER';
const NORTH: felt252 = 'NORTH';
const NORTH_EAST: felt252 = 'NORTH_EAST';
const NORTH_WEST: felt252 = 'NORTH_WEST';
const SOUTH: felt252 = 'SOUTH';
const SOUTH_EAST: felt252 = 'SOUTH_EAST';
const SOUTH_WEST: felt252 = 'SOUTH_WEST';
const EAST: felt252 = 'EAST';
const WEST: felt252 = 'WEST';

#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
enum Spot {
    None,
    Center,
    NorthWest,
    North,
    NorthEast,
    East,
    SouthEast,
    South,
    SouthWest,
    West,
}

impl IntoSpotU8 of Into<Spot, u8> {
    #[inline(always)]
    fn into(self: Spot) -> u8 {
        match self {
            Spot::None => 0,
            Spot::Center => 1,
            Spot::NorthWest => 2,
            Spot::North => 3,
            Spot::NorthEast => 4,
            Spot::East => 5,
            Spot::SouthEast => 6,
            Spot::South => 7,
            Spot::SouthWest => 8,
            Spot::West => 9,
        }
    }
}

impl IntoSpotFelt252 of Into<Spot, felt252> {
    #[inline(always)]
    fn into(self: Spot) -> felt252 {
        match self {
            Spot::None => NONE,
            Spot::Center => CENTER,
            Spot::NorthWest => NORTH_WEST,
            Spot::North => NORTH,
            Spot::NorthEast => NORTH_EAST,
            Spot::East => EAST,
            Spot::SouthEast => SOUTH_EAST,
            Spot::South => SOUTH,
            Spot::SouthWest => SOUTH_WEST,
            Spot::West => WEST,
        }
    }
}

impl IntoU8Spot of Into<u8, Spot> {
    #[inline(always)]
    fn into(self: u8) -> Spot {
        if self == 1 {
            Spot::Center
        } else if self == 2 {
            Spot::NorthWest
        } else if self == 3 {
            Spot::North
        } else if self == 4 {
            Spot::NorthEast
        } else if self == 5 {
            Spot::East
        } else if self == 6 {
            Spot::SouthEast
        } else if self == 7 {
            Spot::South
        } else if self == 8 {
            Spot::SouthWest
        } else if self == 9 {
            Spot::West
        } else {
            Spot::None
        }
    }
}

impl IntoFelt252Spot of Into<felt252, Spot> {
    #[inline(always)]
    fn into(self: felt252) -> Spot {
        if self == CENTER {
            Spot::Center
        } else if self == NORTH_WEST {
            Spot::NorthWest
        } else if self == NORTH {
            Spot::North
        } else if self == NORTH_EAST {
            Spot::NorthEast
        } else if self == EAST {
            Spot::East
        } else if self == SOUTH_EAST {
            Spot::SouthEast
        } else if self == SOUTH {
            Spot::South
        } else if self == SOUTH_WEST {
            Spot::SouthWest
        } else if self == WEST {
            Spot::West
        } else {
            Spot::None
        }
    }
}

impl SpotPrint of PrintTrait<Spot> {
    #[inline(always)]
    fn print(self: Spot) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{
        Spot, CENTER, NORTH_WEST, NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST
    };

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_spot_into_felt() {
        assert(0 == Spot::None.into(), 'Spot: None');
        assert(CENTER == Spot::Center.into(), 'Spot: Center');
        assert(NORTH_WEST == Spot::NorthWest.into(), 'Spot: NorthWest');
        assert(NORTH == Spot::North.into(), 'Spot: North');
        assert(NORTH_EAST == Spot::NorthEast.into(), 'Spot: NorthEast');
        assert(EAST == Spot::East.into(), 'Spot: East');
        assert(SOUTH_EAST == Spot::SouthEast.into(), 'Spot: SouthEast');
        assert(SOUTH == Spot::South.into(), 'Spot: South');
        assert(SOUTH_WEST == Spot::SouthWest.into(), 'Spot: SouthWest');
        assert(WEST == Spot::West.into(), 'Spot: West');
    }

    #[test]
    fn test_felt_into_spot() {
        assert(Spot::None == 0.into(), 'Spot: None');
        assert(Spot::Center == CENTER.into(), 'Spot: Center');
        assert(Spot::NorthWest == NORTH_WEST.into(), 'Spot: NorthWest');
        assert(Spot::North == NORTH.into(), 'Spot: North');
        assert(Spot::NorthEast == NORTH_EAST.into(), 'Spot: NorthEast');
        assert(Spot::East == EAST.into(), 'Spot: East');
        assert(Spot::SouthEast == SOUTH_EAST.into(), 'Spot: SouthEast');
        assert(Spot::South == SOUTH.into(), 'Spot: South');
        assert(Spot::SouthWest == SOUTH_WEST.into(), 'Spot: SouthWest');
        assert(Spot::West == WEST.into(), 'Spot: West');
    }

    #[test]
    fn test_unknown_felt_into_spot() {
        assert(Spot::None == UNKNOWN_FELT.into(), 'Spot: Unknown');
    }

    #[test]
    fn test_spot_into_u8() {
        assert(0_u8 == Spot::None.into(), 'Spot: None');
        assert(1_u8 == Spot::Center.into(), 'Spot: Center');
        assert(2_u8 == Spot::NorthWest.into(), 'Spot: NorthWest');
        assert(3_u8 == Spot::North.into(), 'Spot: North');
        assert(4_u8 == Spot::NorthEast.into(), 'Spot: NorthEast');
        assert(5_u8 == Spot::East.into(), 'Spot: East');
        assert(6_u8 == Spot::SouthEast.into(), 'Spot: SouthEast');
        assert(7_u8 == Spot::South.into(), 'Spot: South');
        assert(8_u8 == Spot::SouthWest.into(), 'Spot: SouthWest');
        assert(9_u8 == Spot::West.into(), 'Spot: West');
    }

    #[test]
    fn test_u8_into_spot() {
        assert(Spot::None == 0_u8.into(), 'Spot: None');
        assert(Spot::Center == 1_u8.into(), 'Spot: Center');
        assert(Spot::NorthWest == 2_u8.into(), 'Spot: NorthWest');
        assert(Spot::North == 3_u8.into(), 'Spot: North');
        assert(Spot::NorthEast == 4_u8.into(), 'Spot: NorthEast');
        assert(Spot::East == 5_u8.into(), 'Spot: East');
        assert(Spot::SouthEast == 6_u8.into(), 'Spot: SouthEast');
        assert(Spot::South == 7_u8.into(), 'Spot: South');
        assert(Spot::SouthWest == 8_u8.into(), 'Spot: SouthWest');
        assert(Spot::West == 9_u8.into(), 'Spot: West');
    }

    #[test]
    fn test_unknown_u8_into_spot() {
        assert(Spot::None == UNKNOWN_U8.into(), 'Spot: Unknown');
    }
}
