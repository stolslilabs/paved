// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::types::orientation::Orientation;

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
enum Area {
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

impl IntoAreaU8 of Into<Area, u8> {
    #[inline(always)]
    fn into(self: Area) -> u8 {
        match self {
            Area::None => 0,
            Area::Center => 1,
            Area::NorthWest => 2,
            Area::North => 3,
            Area::NorthEast => 4,
            Area::East => 5,
            Area::SouthEast => 6,
            Area::South => 7,
            Area::SouthWest => 8,
            Area::West => 9,
        }
    }
}

impl IntoAreaFelt252 of Into<Area, felt252> {
    #[inline(always)]
    fn into(self: Area) -> felt252 {
        match self {
            Area::None => NONE,
            Area::Center => CENTER,
            Area::NorthWest => NORTH_WEST,
            Area::North => NORTH,
            Area::NorthEast => NORTH_EAST,
            Area::East => EAST,
            Area::SouthEast => SOUTH_EAST,
            Area::South => SOUTH,
            Area::SouthWest => SOUTH_WEST,
            Area::West => WEST,
        }
    }
}

impl IntoU8Area of Into<u8, Area> {
    #[inline(always)]
    fn into(self: u8) -> Area {
        if self == 1 {
            Area::Center
        } else if self == 2 {
            Area::NorthWest
        } else if self == 3 {
            Area::North
        } else if self == 4 {
            Area::NorthEast
        } else if self == 5 {
            Area::East
        } else if self == 6 {
            Area::SouthEast
        } else if self == 7 {
            Area::South
        } else if self == 8 {
            Area::SouthWest
        } else if self == 9 {
            Area::West
        } else {
            Area::None
        }
    }
}

impl IntoFelt252Area of Into<felt252, Area> {
    #[inline(always)]
    fn into(self: felt252) -> Area {
        if self == CENTER {
            Area::Center
        } else if self == NORTH_WEST {
            Area::NorthWest
        } else if self == NORTH {
            Area::North
        } else if self == NORTH_EAST {
            Area::NorthEast
        } else if self == EAST {
            Area::East
        } else if self == SOUTH_EAST {
            Area::SouthEast
        } else if self == SOUTH {
            Area::South
        } else if self == SOUTH_WEST {
            Area::SouthWest
        } else if self == WEST {
            Area::West
        } else {
            Area::None
        }
    }
}

impl AreaPrint of PrintTrait<Area> {
    #[inline(always)]
    fn print(self: Area) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[generate_trait]
impl AreaImpl of AreaTrait {
    #[inline(always)]
    fn rotate(self: Area, orientation: Orientation) -> Area {
        match orientation {
            Orientation::None => Area::None,
            Orientation::North => self,
            Orientation::East => {
                match self {
                    Area::None => Area::None,
                    Area::Center => Area::Center,
                    Area::NorthWest => Area::NorthEast,
                    Area::North => Area::East,
                    Area::NorthEast => Area::SouthEast,
                    Area::East => Area::South,
                    Area::SouthEast => Area::SouthWest,
                    Area::South => Area::West,
                    Area::SouthWest => Area::NorthWest,
                    Area::West => Area::North,
                }
            },
            Orientation::South => {
                match self {
                    Area::None => Area::None,
                    Area::Center => Area::Center,
                    Area::NorthWest => Area::SouthEast,
                    Area::North => Area::South,
                    Area::NorthEast => Area::SouthWest,
                    Area::East => Area::West,
                    Area::SouthEast => Area::NorthWest,
                    Area::South => Area::North,
                    Area::SouthWest => Area::NorthEast,
                    Area::West => Area::East,
                }
            },
            Orientation::West => {
                match self {
                    Area::None => Area::None,
                    Area::Center => Area::Center,
                    Area::NorthWest => Area::SouthWest,
                    Area::North => Area::West,
                    Area::NorthEast => Area::NorthWest,
                    Area::East => Area::North,
                    Area::SouthEast => Area::NorthEast,
                    Area::South => Area::East,
                    Area::SouthWest => Area::SouthEast,
                    Area::West => Area::South,
                }
            },
        }
    }

    #[inline(always)]
    fn antirotate(self: Area, orientation: Orientation) -> Area {
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

    use debug::PrintTrait;

    // Local imports

    use super::{
        Area, AreaImpl, Orientation, CENTER, NORTH_WEST, NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH,
        SOUTH_WEST, WEST
    };

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_area_into_felt() {
        assert(0 == Area::None.into(), 'Area: None');
        assert(CENTER == Area::Center.into(), 'Area: Center');
        assert(NORTH_WEST == Area::NorthWest.into(), 'Area: NorthWest');
        assert(NORTH == Area::North.into(), 'Area: North');
        assert(NORTH_EAST == Area::NorthEast.into(), 'Area: NorthEast');
        assert(EAST == Area::East.into(), 'Area: East');
        assert(SOUTH_EAST == Area::SouthEast.into(), 'Area: SouthEast');
        assert(SOUTH == Area::South.into(), 'Area: South');
        assert(SOUTH_WEST == Area::SouthWest.into(), 'Area: SouthWest');
        assert(WEST == Area::West.into(), 'Area: West');
    }

    #[test]
    fn test_felt_into_area() {
        assert(Area::None == 0.into(), 'Area: None');
        assert(Area::Center == CENTER.into(), 'Area: Center');
        assert(Area::NorthWest == NORTH_WEST.into(), 'Area: NorthWest');
        assert(Area::North == NORTH.into(), 'Area: North');
        assert(Area::NorthEast == NORTH_EAST.into(), 'Area: NorthEast');
        assert(Area::East == EAST.into(), 'Area: East');
        assert(Area::SouthEast == SOUTH_EAST.into(), 'Area: SouthEast');
        assert(Area::South == SOUTH.into(), 'Area: South');
        assert(Area::SouthWest == SOUTH_WEST.into(), 'Area: SouthWest');
        assert(Area::West == WEST.into(), 'Area: West');
    }

    #[test]
    fn test_unknown_felt_into_area() {
        assert(Area::None == UNKNOWN_FELT.into(), 'Area: Unknown');
    }

    #[test]
    fn test_area_into_u8() {
        assert(0_u8 == Area::None.into(), 'Area: None');
        assert(1_u8 == Area::Center.into(), 'Area: Center');
        assert(2_u8 == Area::NorthWest.into(), 'Area: NorthWest');
        assert(3_u8 == Area::North.into(), 'Area: North');
        assert(4_u8 == Area::NorthEast.into(), 'Area: NorthEast');
        assert(5_u8 == Area::East.into(), 'Area: East');
        assert(6_u8 == Area::SouthEast.into(), 'Area: SouthEast');
        assert(7_u8 == Area::South.into(), 'Area: South');
        assert(8_u8 == Area::SouthWest.into(), 'Area: SouthWest');
        assert(9_u8 == Area::West.into(), 'Area: West');
    }

    #[test]
    fn test_u8_into_area() {
        assert(Area::None == 0_u8.into(), 'Area: None');
        assert(Area::Center == 1_u8.into(), 'Area: Center');
        assert(Area::NorthWest == 2_u8.into(), 'Area: NorthWest');
        assert(Area::North == 3_u8.into(), 'Area: North');
        assert(Area::NorthEast == 4_u8.into(), 'Area: NorthEast');
        assert(Area::East == 5_u8.into(), 'Area: East');
        assert(Area::SouthEast == 6_u8.into(), 'Area: SouthEast');
        assert(Area::South == 7_u8.into(), 'Area: South');
        assert(Area::SouthWest == 8_u8.into(), 'Area: SouthWest');
        assert(Area::West == 9_u8.into(), 'Area: West');
    }

    #[test]
    fn test_unknown_u8_into_area() {
        assert(Area::None == UNKNOWN_U8.into(), 'Area: Unknown');
    }

    #[test]
    fn test_rotate_from_north_to_north() {
        let area = Area::North.rotate(Orientation::North);
        assert(Area::North == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_north_to_east() {
        let area = Area::North.rotate(Orientation::East);
        assert(Area::East == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_north_to_south() {
        let area = Area::North.rotate(Orientation::South);
        assert(Area::South == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_north_to_west() {
        let area = Area::North.rotate(Orientation::West);
        assert(Area::West == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_east_to_north() {
        let area = Area::East.rotate(Orientation::North);
        assert(Area::East == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_east_to_east() {
        let area = Area::East.rotate(Orientation::East);
        assert(Area::South == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_east_to_south() {
        let area = Area::East.rotate(Orientation::South);
        assert(Area::West == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_east_to_west() {
        let area = Area::East.rotate(Orientation::West);
        assert(Area::North == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_south_to_north() {
        let area = Area::South.rotate(Orientation::North);
        assert(Area::South == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_south_to_east() {
        let area = Area::South.rotate(Orientation::East);
        assert(Area::West == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_south_to_south() {
        let area = Area::South.rotate(Orientation::South);
        assert(Area::North == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_south_to_west() {
        let area = Area::South.rotate(Orientation::West);
        assert(Area::East == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_west_to_north() {
        let area = Area::West.rotate(Orientation::North);
        assert(Area::West == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_west_to_east() {
        let area = Area::West.rotate(Orientation::East);
        assert(Area::North == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_west_to_south() {
        let area = Area::West.rotate(Orientation::South);
        assert(Area::East == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_west_to_west() {
        let area = Area::West.rotate(Orientation::West);
        assert(Area::South == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_antirotate_from_north_to_north() {
        let area = Area::North.antirotate(Orientation::North);
        assert(Area::North == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_north_to_east() {
        let area = Area::North.antirotate(Orientation::East);
        assert(Area::West == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_north_to_south() {
        let area = Area::North.antirotate(Orientation::South);
        assert(Area::South == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_north_to_west() {
        let area = Area::North.antirotate(Orientation::West);
        assert(Area::East == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_east_to_north() {
        let area = Area::East.antirotate(Orientation::North);
        assert(Area::East == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_east_to_east() {
        let area = Area::East.antirotate(Orientation::East);
        assert(Area::North == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_east_to_south() {
        let area = Area::East.antirotate(Orientation::South);
        assert(Area::West == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_east_to_west() {
        let area = Area::East.antirotate(Orientation::West);
        assert(Area::South == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_south_to_north() {
        let area = Area::South.antirotate(Orientation::North);
        assert(Area::South == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_south_to_east() {
        let area = Area::South.antirotate(Orientation::East);
        assert(Area::East == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_south_to_south() {
        let area = Area::South.antirotate(Orientation::South);
        assert(Area::North == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_south_to_west() {
        let area = Area::South.antirotate(Orientation::West);
        assert(Area::West == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_west_to_north() {
        let area = Area::West.antirotate(Orientation::North);
        assert(Area::West == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_west_to_east() {
        let area = Area::West.antirotate(Orientation::East);
        assert(Area::South == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_west_to_south() {
        let area = Area::West.antirotate(Orientation::South);
        assert(Area::East == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_west_to_west() {
        let area = Area::West.antirotate(Orientation::West);
        assert(Area::North == area, 'Area: Antirotate to west');
    }
}
