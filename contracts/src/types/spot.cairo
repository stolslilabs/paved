// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::orientation::Orientation;

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

impl IntoSpotU8 of core::Into<Spot, u8> {
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

impl IntoU8Spot of core::Into<u8, Spot> {
    #[inline(always)]
    fn into(self: u8) -> Spot {
        match self {
            0 => Spot::None,
            1 => Spot::Center,
            2 => Spot::NorthWest,
            3 => Spot::North,
            4 => Spot::NorthEast,
            5 => Spot::East,
            6 => Spot::SouthEast,
            7 => Spot::South,
            8 => Spot::SouthWest,
            9 => Spot::West,
            _ => Spot::None,
        }
    }
}

#[generate_trait]
impl SpotImpl of SpotTrait {
    #[inline(always)]
    fn rotate(self: Spot, orientation: Orientation) -> Spot {
        match orientation {
            Orientation::None => Spot::None,
            Orientation::North => self,
            Orientation::East => {
                match self {
                    Spot::None => Spot::None,
                    Spot::Center => Spot::Center,
                    Spot::NorthWest => Spot::NorthEast,
                    Spot::North => Spot::East,
                    Spot::NorthEast => Spot::SouthEast,
                    Spot::East => Spot::South,
                    Spot::SouthEast => Spot::SouthWest,
                    Spot::South => Spot::West,
                    Spot::SouthWest => Spot::NorthWest,
                    Spot::West => Spot::North,
                }
            },
            Orientation::South => {
                match self {
                    Spot::None => Spot::None,
                    Spot::Center => Spot::Center,
                    Spot::NorthWest => Spot::SouthEast,
                    Spot::North => Spot::South,
                    Spot::NorthEast => Spot::SouthWest,
                    Spot::East => Spot::West,
                    Spot::SouthEast => Spot::NorthWest,
                    Spot::South => Spot::North,
                    Spot::SouthWest => Spot::NorthEast,
                    Spot::West => Spot::East,
                }
            },
            Orientation::West => {
                match self {
                    Spot::None => Spot::None,
                    Spot::Center => Spot::Center,
                    Spot::NorthWest => Spot::SouthWest,
                    Spot::North => Spot::West,
                    Spot::NorthEast => Spot::NorthWest,
                    Spot::East => Spot::North,
                    Spot::SouthEast => Spot::NorthEast,
                    Spot::South => Spot::East,
                    Spot::SouthWest => Spot::SouthEast,
                    Spot::West => Spot::South,
                }
            },
        }
    }

    #[inline(always)]
    fn antirotate(self: Spot, orientation: Orientation) -> Spot {
        let anti_orientation = match orientation {
            Orientation::None => Orientation::None,
            Orientation::North => Orientation::North,
            Orientation::East => Orientation::West,
            Orientation::South => Orientation::South,
            Orientation::West => Orientation::East,
        };
        self.rotate(anti_orientation)
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Spot, SpotImpl, Orientation};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

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

    #[test]
    fn test_rotate_from_north_to_north() {
        let spot = Spot::North.rotate(Orientation::North);
        assert(Spot::North == spot, 'Spot: Rotate to north');
    }

    #[test]
    fn test_rotate_from_north_to_east() {
        let spot = Spot::North.rotate(Orientation::East);
        assert(Spot::East == spot, 'Spot: Rotate to east');
    }

    #[test]
    fn test_rotate_from_north_to_south() {
        let spot = Spot::North.rotate(Orientation::South);
        assert(Spot::South == spot, 'Spot: Rotate to south');
    }

    #[test]
    fn test_rotate_from_north_to_west() {
        let spot = Spot::North.rotate(Orientation::West);
        assert(Spot::West == spot, 'Spot: Rotate to west');
    }

    #[test]
    fn test_rotate_from_east_to_north() {
        let spot = Spot::East.rotate(Orientation::North);
        assert(Spot::East == spot, 'Spot: Rotate to north');
    }

    #[test]
    fn test_rotate_from_east_to_east() {
        let spot = Spot::East.rotate(Orientation::East);
        assert(Spot::South == spot, 'Spot: Rotate to east');
    }

    #[test]
    fn test_rotate_from_east_to_south() {
        let spot = Spot::East.rotate(Orientation::South);
        assert(Spot::West == spot, 'Spot: Rotate to south');
    }

    #[test]
    fn test_rotate_from_east_to_west() {
        let spot = Spot::East.rotate(Orientation::West);
        assert(Spot::North == spot, 'Spot: Rotate to west');
    }

    #[test]
    fn test_rotate_from_south_to_north() {
        let spot = Spot::South.rotate(Orientation::North);
        assert(Spot::South == spot, 'Spot: Rotate to north');
    }

    #[test]
    fn test_rotate_from_south_to_east() {
        let spot = Spot::South.rotate(Orientation::East);
        assert(Spot::West == spot, 'Spot: Rotate to east');
    }

    #[test]
    fn test_rotate_from_south_to_south() {
        let spot = Spot::South.rotate(Orientation::South);
        assert(Spot::North == spot, 'Spot: Rotate to south');
    }

    #[test]
    fn test_rotate_from_south_to_west() {
        let spot = Spot::South.rotate(Orientation::West);
        assert(Spot::East == spot, 'Spot: Rotate to west');
    }

    #[test]
    fn test_rotate_from_west_to_north() {
        let spot = Spot::West.rotate(Orientation::North);
        assert(Spot::West == spot, 'Spot: Rotate to north');
    }

    #[test]
    fn test_rotate_from_west_to_east() {
        let spot = Spot::West.rotate(Orientation::East);
        assert(Spot::North == spot, 'Spot: Rotate to east');
    }

    #[test]
    fn test_rotate_from_west_to_south() {
        let spot = Spot::West.rotate(Orientation::South);
        assert(Spot::East == spot, 'Spot: Rotate to south');
    }

    #[test]
    fn test_rotate_from_west_to_west() {
        let spot = Spot::West.rotate(Orientation::West);
        assert(Spot::South == spot, 'Spot: Rotate to west');
    }

    #[test]
    fn test_antirotate_from_north_to_north() {
        let spot = Spot::North.antirotate(Orientation::North);
        assert(Spot::North == spot, 'Spot: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_north_to_east() {
        let spot = Spot::North.antirotate(Orientation::East);
        assert(Spot::West == spot, 'Spot: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_north_to_south() {
        let spot = Spot::North.antirotate(Orientation::South);
        assert(Spot::South == spot, 'Spot: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_north_to_west() {
        let spot = Spot::North.antirotate(Orientation::West);
        assert(Spot::East == spot, 'Spot: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_east_to_north() {
        let spot = Spot::East.antirotate(Orientation::North);
        assert(Spot::East == spot, 'Spot: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_east_to_east() {
        let spot = Spot::East.antirotate(Orientation::East);
        assert(Spot::North == spot, 'Spot: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_east_to_south() {
        let spot = Spot::East.antirotate(Orientation::South);
        assert(Spot::West == spot, 'Spot: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_east_to_west() {
        let spot = Spot::East.antirotate(Orientation::West);
        assert(Spot::South == spot, 'Spot: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_south_to_north() {
        let spot = Spot::South.antirotate(Orientation::North);
        assert(Spot::South == spot, 'Spot: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_south_to_east() {
        let spot = Spot::South.antirotate(Orientation::East);
        assert(Spot::East == spot, 'Spot: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_south_to_south() {
        let spot = Spot::South.antirotate(Orientation::South);
        assert(Spot::North == spot, 'Spot: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_south_to_west() {
        let spot = Spot::South.antirotate(Orientation::West);
        assert(Spot::West == spot, 'Spot: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_west_to_north() {
        let spot = Spot::West.antirotate(Orientation::North);
        assert(Spot::West == spot, 'Spot: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_west_to_east() {
        let spot = Spot::West.antirotate(Orientation::East);
        assert(Spot::South == spot, 'Spot: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_west_to_south() {
        let spot = Spot::West.antirotate(Orientation::South);
        assert(Spot::East == spot, 'Spot: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_west_to_west() {
        let spot = Spot::West.antirotate(Orientation::West);
        assert(Spot::North == spot, 'Spot: Antirotate to west');
    }
}
