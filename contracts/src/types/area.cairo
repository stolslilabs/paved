// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::orientation::Orientation;

#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
enum Area {
    None,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
}

impl IntoAreaU8 of core::Into<Area, u8> {
    #[inline(always)]
    fn into(self: Area) -> u8 {
        match self {
            Area::None => 0,
            Area::A => 1,
            Area::B => 2,
            Area::C => 3,
            Area::D => 4,
            Area::E => 5,
            Area::F => 6,
            Area::G => 7,
            Area::H => 8,
            Area::I => 9,
        }
    }
}

impl IntoAreaU128 of core::Into<Area, u128> {
    #[inline(always)]
    fn into(self: Area) -> u128 {
        let self_u8: u8 = self.into();
        self_u8.into()
    }
}

impl IntoU8Area of core::Into<u8, Area> {
    #[inline(always)]
    fn into(self: u8) -> Area {
        if self == 1 {
            Area::A
        } else if self == 2 {
            Area::B
        } else if self == 3 {
            Area::C
        } else if self == 4 {
            Area::D
        } else if self == 5 {
            Area::E
        } else if self == 6 {
            Area::F
        } else if self == 7 {
            Area::G
        } else if self == 8 {
            Area::H
        } else if self == 9 {
            Area::I
        } else {
            Area::None
        }
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
                    Area::A => Area::A,
                    Area::B => Area::D,
                    Area::C => Area::E,
                    Area::D => Area::F,
                    Area::E => Area::G,
                    Area::F => Area::H,
                    Area::G => Area::I,
                    Area::H => Area::B,
                    Area::I => Area::C,
                }
            },
            Orientation::South => {
                match self {
                    Area::None => Area::None,
                    Area::A => Area::A,
                    Area::B => Area::F,
                    Area::C => Area::G,
                    Area::D => Area::H,
                    Area::E => Area::I,
                    Area::F => Area::B,
                    Area::G => Area::C,
                    Area::H => Area::D,
                    Area::I => Area::E,
                }
            },
            Orientation::West => {
                match self {
                    Area::None => Area::None,
                    Area::A => Area::A,
                    Area::B => Area::H,
                    Area::C => Area::I,
                    Area::D => Area::B,
                    Area::E => Area::C,
                    Area::F => Area::D,
                    Area::G => Area::E,
                    Area::H => Area::F,
                    Area::I => Area::G,
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

    use core::debug::PrintTrait;

    // Local imports

    use super::{Area, AreaImpl, Orientation};

    // Constants

    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_area_into_u8() {
        assert(0_u8 == Area::None.into(), 'Area: None');
        assert(1_u8 == Area::A.into(), 'Area: A');
        assert(2_u8 == Area::B.into(), 'Area: B');
        assert(3_u8 == Area::C.into(), 'Area: C');
        assert(4_u8 == Area::D.into(), 'Area: D');
        assert(5_u8 == Area::E.into(), 'Area: E');
        assert(6_u8 == Area::F.into(), 'Area: F');
        assert(7_u8 == Area::G.into(), 'Area: G');
        assert(8_u8 == Area::H.into(), 'Area: H');
        assert(9_u8 == Area::I.into(), 'Area: I');
    }

    #[test]
    fn test_u8_into_area() {
        assert(Area::None == 0_u8.into(), 'Area: None');
        assert(Area::A == 1_u8.into(), 'Area: A');
        assert(Area::B == 2_u8.into(), 'Area: B');
        assert(Area::C == 3_u8.into(), 'Area: C');
        assert(Area::D == 4_u8.into(), 'Area: D');
        assert(Area::E == 5_u8.into(), 'Area: E');
        assert(Area::F == 6_u8.into(), 'Area: F');
        assert(Area::G == 7_u8.into(), 'Area: G');
        assert(Area::H == 8_u8.into(), 'Area: H');
        assert(Area::I == 9_u8.into(), 'Area: I');
    }

    #[test]
    fn test_unknown_u8_into_area() {
        assert(Area::None == UNKNOWN_U8.into(), 'Area: Unknown');
    }

    #[test]
    fn test_rotate_from_north_to_north() {
        let area = Area::C.rotate(Orientation::North);
        assert(Area::C == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_north_to_east() {
        let area = Area::C.rotate(Orientation::East);
        assert(Area::E == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_north_to_south() {
        let area = Area::C.rotate(Orientation::South);
        assert(Area::G == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_north_to_west() {
        let area = Area::C.rotate(Orientation::West);
        assert(Area::I == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_east_to_north() {
        let area = Area::E.rotate(Orientation::North);
        assert(Area::E == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_east_to_east() {
        let area = Area::E.rotate(Orientation::East);
        assert(Area::G == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_east_to_south() {
        let area = Area::E.rotate(Orientation::South);
        assert(Area::I == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_east_to_west() {
        let area = Area::E.rotate(Orientation::West);
        assert(Area::C == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_south_to_north() {
        let area = Area::G.rotate(Orientation::North);
        assert(Area::G == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_south_to_east() {
        let area = Area::G.rotate(Orientation::East);
        assert(Area::I == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_south_to_south() {
        let area = Area::G.rotate(Orientation::South);
        assert(Area::C == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_south_to_west() {
        let area = Area::G.rotate(Orientation::West);
        assert(Area::E == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_rotate_from_west_to_north() {
        let area = Area::I.rotate(Orientation::North);
        assert(Area::I == area, 'Area: Rotate to north');
    }

    #[test]
    fn test_rotate_from_west_to_east() {
        let area = Area::I.rotate(Orientation::East);
        assert(Area::C == area, 'Area: Rotate to east');
    }

    #[test]
    fn test_rotate_from_west_to_south() {
        let area = Area::I.rotate(Orientation::South);
        assert(Area::E == area, 'Area: Rotate to south');
    }

    #[test]
    fn test_rotate_from_west_to_west() {
        let area = Area::I.rotate(Orientation::West);
        assert(Area::G == area, 'Area: Rotate to west');
    }

    #[test]
    fn test_antirotate_from_north_to_north() {
        let area = Area::C.antirotate(Orientation::North);
        assert(Area::C == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_north_to_east() {
        let area = Area::C.antirotate(Orientation::East);
        assert(Area::I == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_north_to_south() {
        let area = Area::C.antirotate(Orientation::South);
        assert(Area::G == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_north_to_west() {
        let area = Area::C.antirotate(Orientation::West);
        assert(Area::E == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_east_to_north() {
        let area = Area::E.antirotate(Orientation::North);
        assert(Area::E == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_east_to_east() {
        let area = Area::E.antirotate(Orientation::East);
        assert(Area::C == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_east_to_south() {
        let area = Area::E.antirotate(Orientation::South);
        assert(Area::I == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_east_to_west() {
        let area = Area::E.antirotate(Orientation::West);
        assert(Area::G == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_south_to_north() {
        let area = Area::G.antirotate(Orientation::North);
        assert(Area::G == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_south_to_east() {
        let area = Area::G.antirotate(Orientation::East);
        assert(Area::E == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_south_to_south() {
        let area = Area::G.antirotate(Orientation::South);
        assert(Area::C == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_south_to_west() {
        let area = Area::G.antirotate(Orientation::West);
        assert(Area::I == area, 'Area: Antirotate to west');
    }

    #[test]
    fn test_antirotate_from_west_to_north() {
        let area = Area::I.antirotate(Orientation::North);
        assert(Area::I == area, 'Area: Antirotate to north');
    }

    #[test]
    fn test_antirotate_from_west_to_east() {
        let area = Area::I.antirotate(Orientation::East);
        assert(Area::G == area, 'Area: Antirotate to east');
    }

    #[test]
    fn test_antirotate_from_west_to_south() {
        let area = Area::I.antirotate(Orientation::South);
        assert(Area::E == area, 'Area: Antirotate to south');
    }

    #[test]
    fn test_antirotate_from_west_to_west() {
        let area = Area::I.antirotate(Orientation::West);
        assert(Area::C == area, 'Area: Antirotate to west');
    }
}
