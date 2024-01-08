// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{MASK_8, TWO_POW_8};
use stolsli::models::orientation::Orientation;
use stolsli::models::category::Category;

// Constants

const MAX_TILE_COUNT: u8 = 3;

mod errors {
    const UNPACK_FAILED: felt252 = 'Layout: Unpack failed';
}

// Center, NNW, N, NNE, ENE, E, ESE, SSE, S, SSW, WSW, W, WNW
#[derive(Copy, Drop, Serde, Introspection)]
enum LayoutType {
    SCFRCFRCFRCFR,
    RFFFFFFCFRCFR,
    SCRFCFRFRRCFF,
}

#[derive(Copy, Drop, Serde)]
struct Layout {
    center: Category,
    north_northwest: Category,
    north: Category,
    north_northeast: Category,
    east_northeast: Category,
    east: Category,
    east_southeast: Category,
    south_southeast: Category,
    south: Category,
    south_southwest: Category,
    west_southwest: Category,
    west: Category,
    west_northwest: Category,
}

impl IntoLayoutTypeFelt252 of Into<LayoutType, felt252> {
    #[inline(always)]
    fn into(self: LayoutType) -> felt252 {
        match self {
            LayoutType::SCFRCFRCFRCFR => 'SCFRCFRCFRCFR',
            LayoutType::RFFFFFFCFRCFR => 'RFFFFFFCFRCFR',
            LayoutType::SCRFCFRFRRCFF => 'SCRFCFRFRRCFF',
        }
    }
}

impl LayoutTypePrint of PrintTrait<LayoutType> {
    #[inline(always)]
    fn print(self: LayoutType) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

impl LayoutTypePartialEq of PartialEq<LayoutType> {
    #[inline(always)]
    fn eq(lhs: @LayoutType, rhs: @LayoutType) -> bool {
        let felt: felt252 = (*lhs).into();
        felt == (*rhs).into()
    }

    #[inline(always)]
    fn ne(lhs: @LayoutType, rhs: @LayoutType) -> bool {
        let felt: felt252 = (*lhs).into();
        felt != (*rhs).into()
    }
}

#[generate_trait]
impl LayoutTypeImpl of LayoutTypeTrait {
    fn unpack(self: LayoutType) -> Array<Category> {
        let mut categories: Array<Category> = ArrayTrait::new();
        let packed: felt252 = self.into();
        let mut keys: u256 = packed.into();
        loop {
            if keys == 0 {
                break;
            }
            let key: felt252 = (keys & MASK_8.into()).try_into().unwrap();
            let category: Category = key.into();
            categories.append(category);
            keys /= TWO_POW_8.into();
        };
        categories
    }
}

#[generate_trait]
impl LayoutImpl of LayoutTrait {
    fn new(
        center: Category,
        north_northwest: Category,
        north: Category,
        north_northeast: Category,
        east_northeast: Category,
        east: Category,
        east_southeast: Category,
        south_southeast: Category,
        south: Category,
        south_southwest: Category,
        west_southwest: Category,
        west: Category,
        west_northwest: Category,
    ) -> Layout {
        Layout {
            center: center,
            north_northwest: north_northwest,
            north: north,
            north_northeast: north_northeast,
            east_northeast: east_northeast,
            east: east,
            east_southeast: east_southeast,
            south_southeast: south_southeast,
            south: south,
            south_southwest: south_southwest,
            west_southwest: west_southwest,
            west: west,
            west_northwest: west_northwest,
        }
    }
    fn from(layout_type: LayoutType, orientation: Orientation) -> Layout {
        let mut categories = layout_type.unpack();

        // [Check] Categories length
        assert(categories.len() == 13, errors::UNPACK_FAILED);

        // [Compute] Extract Categories on a north based orientation
        let west_northwest = categories.pop_front().unwrap();
        let west = categories.pop_front().unwrap();
        let west_southwest = categories.pop_front().unwrap();

        let south_southwest = categories.pop_front().unwrap();
        let south = categories.pop_front().unwrap();
        let south_southeast = categories.pop_front().unwrap();

        let east_southeast = categories.pop_front().unwrap();
        let east = categories.pop_front().unwrap();
        let east_northeast = categories.pop_front().unwrap();

        let north_northeast = categories.pop_front().unwrap();
        let north = categories.pop_front().unwrap();
        let north_northwest = categories.pop_front().unwrap();

        let center = categories.pop_front().unwrap();

        // [Compute] Rotate Categories to match orientation
        match orientation {
            Orientation::None => { Default::default() },
            Orientation::North => {
                Layout {
                    center: center,
                    north_northwest: north_northwest,
                    north: north,
                    north_northeast: north_northeast,
                    east_northeast: east_northeast,
                    east: east,
                    east_southeast: east_southeast,
                    south_southeast: south_southeast,
                    south: south,
                    south_southwest: south_southwest,
                    west_southwest: west_southwest,
                    west: west,
                    west_northwest: west_northwest,
                }
            },
            Orientation::East => {
                Layout {
                    center: center,
                    north_northwest: west_southwest,
                    north: west,
                    north_northeast: west_northwest,
                    east_northeast: north_northwest,
                    east: north,
                    east_southeast: north_northeast,
                    south_southeast: east_northeast,
                    south: east,
                    south_southwest: east_southeast,
                    west_southwest: south_southeast,
                    west: south,
                    west_northwest: south_southwest,
                }
            },
            Orientation::South => {
                Layout {
                    center: center,
                    north_northwest: south_southeast,
                    north: south,
                    north_northeast: south_southwest,
                    east_northeast: west_southwest,
                    east: west,
                    east_southeast: west_northwest,
                    south_southeast: north_northwest,
                    south: north,
                    south_southwest: north_northeast,
                    west_southwest: east_northeast,
                    west: east,
                    west_northwest: east_southeast,
                }
            },
            Orientation::West => {
                Layout {
                    center: center,
                    north_northwest: east_northeast,
                    north: east,
                    north_northeast: east_southeast,
                    east_northeast: south_southeast,
                    east: south,
                    east_southeast: south_southwest,
                    south_southeast: west_southwest,
                    south: west,
                    south_southwest: west_northwest,
                    west_southwest: north_northwest,
                    west: north,
                    west_northwest: north_northeast,
                }
            },
        }
    }

    fn is_compatible(self: Layout, reference: Layout, direction: Orientation) -> bool {
        match direction {
            Orientation::None => { false },
            Orientation::North => { self.north == reference.south },
            Orientation::East => { self.east == reference.west },
            Orientation::South => { self.south == reference.north },
            Orientation::West => { self.west == reference.east },
        }
    }
}

impl DefaultLayoutImpl of Default<Layout> {
    #[inline(always)]
    fn default() -> Layout {
        Layout {
            center: Category::None,
            north_northwest: Category::None,
            north: Category::None,
            north_northeast: Category::None,
            east_northeast: Category::None,
            east: Category::None,
            east_southeast: Category::None,
            south_southeast: Category::None,
            south: Category::None,
            south_southwest: Category::None,
            west_southwest: Category::None,
            west: Category::None,
            west_northwest: Category::None,
        }
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Layout, LayoutImpl};
    use super::{LayoutType, Category, Orientation};

    #[test]
    fn test_layout_from_north() {
        let orientation = Orientation::North;
        let layout_type = LayoutType::RFFFFFFCFRCFR;
        let layout: Layout = LayoutImpl::from(layout_type, orientation);
        // Center
        assert(layout.center == Category::Road, 'Layout: wrong center');
        // North
        assert(layout.north_northwest == Category::Farm, 'Layout: wrong NNW');
        assert(layout.north == Category::Farm, 'Layout: wrong N');
        assert(layout.north_northeast == Category::Farm, 'Layout: wrong NNE');
        // East
        assert(layout.east_northeast == Category::Farm, 'Layout: wrong ENE');
        assert(layout.east == Category::Farm, 'Layout: wrong E');
        assert(layout.east_southeast == Category::Farm, 'Layout: wrong ESE');
        // South
        assert(layout.south_southeast == Category::City, 'Layout: wrong SSE');
        assert(layout.south == Category::Farm, 'Layout: wrong S');
        assert(layout.south_southwest == Category::Road, 'Layout: wrong SSW');
        // West
        assert(layout.west_southwest == Category::City, 'Layout: wrong WSW');
        assert(layout.west == Category::Farm, 'Layout: wrong W');
        assert(layout.west_northwest == Category::Road, 'Layout: wrong WNW');
    }

    #[test]
    fn test_layout_from_east() {
        let orientation = Orientation::East;
        let layout_type = LayoutType::RFFFFFFCFRCFR;
        let layout: Layout = LayoutImpl::from(layout_type, orientation);
        // Center
        assert(layout.center == Category::Road, 'Layout: wrong center');
        // North
        assert(layout.north_northwest == Category::City, 'Layout: wrong NNW');
        assert(layout.north == Category::Farm, 'Layout: wrong N');
        assert(layout.north_northeast == Category::Road, 'Layout: wrong NNE');
        // East
        assert(layout.east_northeast == Category::Farm, 'Layout: wrong ENE');
        assert(layout.east == Category::Farm, 'Layout: wrong E');
        assert(layout.east_southeast == Category::Farm, 'Layout: wrong ESE');
        // South
        assert(layout.south_southeast == Category::Farm, 'Layout: wrong SSE');
        assert(layout.south == Category::Farm, 'Layout: wrong S');
        assert(layout.south_southwest == Category::Farm, 'Layout: wrong SSW');
        // West
        assert(layout.west_southwest == Category::City, 'Layout: wrong WSW');
        assert(layout.west == Category::Farm, 'Layout: wrong W');
        assert(layout.west_northwest == Category::Road, 'Layout: wrong WNW');
    }

    #[test]
    fn test_layout_from_south() {
        let orientation = Orientation::South;
        let layout_type = LayoutType::RFFFFFFCFRCFR;
        let layout: Layout = LayoutImpl::from(layout_type, orientation);
        // Center
        assert(layout.center == Category::Road, 'Layout: wrong center');
        // North
        assert(layout.north_northwest == Category::City, 'Layout: wrong NNW');
        assert(layout.north == Category::Farm, 'Layout: wrong N');
        assert(layout.north_northeast == Category::Road, 'Layout: wrong NNE');
        // East
        assert(layout.east_northeast == Category::City, 'Layout: wrong ENE');
        assert(layout.east == Category::Farm, 'Layout: wrong E');
        assert(layout.east_southeast == Category::Road, 'Layout: wrong ESE');
        // South
        assert(layout.south_southeast == Category::Farm, 'Layout: wrong SSE');
        assert(layout.south == Category::Farm, 'Layout: wrong S');
        assert(layout.south_southwest == Category::Farm, 'Layout: wrong SSW');
        // West
        assert(layout.west_southwest == Category::Farm, 'Layout: wrong WSW');
        assert(layout.west == Category::Farm, 'Layout: wrong W');
        assert(layout.west_northwest == Category::Farm, 'Layout: wrong WNW');
    }

    #[test]
    fn test_layout_from_west() {
        let orientation = Orientation::West;
        let layout_type = LayoutType::RFFFFFFCFRCFR;
        let layout: Layout = LayoutImpl::from(layout_type, orientation);
        // Center
        assert(layout.center == Category::Road, 'Layout: wrong center');
        // North
        assert(layout.north_northwest == Category::Farm, 'Layout: wrong NNW');
        assert(layout.north == Category::Farm, 'Layout: wrong N');
        assert(layout.north_northeast == Category::Farm, 'Layout: wrong NNE');
        // East
        assert(layout.east_northeast == Category::City, 'Layout: wrong ENE');
        assert(layout.east == Category::Farm, 'Layout: wrong E');
        assert(layout.east_southeast == Category::Road, 'Layout: wrong ESE');
        // South
        assert(layout.south_southeast == Category::City, 'Layout: wrong SSE');
        assert(layout.south == Category::Farm, 'Layout: wrong S');
        assert(layout.south_southwest == Category::Road, 'Layout: wrong SSW');
        // West
        assert(layout.west_southwest == Category::Farm, 'Layout: wrong WSW');
        assert(layout.west == Category::Farm, 'Layout: wrong W');
        assert(layout.west_northwest == Category::Farm, 'Layout: wrong WNW');
    }

    #[test]
    fn test_layout_is_compatible() {
        let layout_type = LayoutType::SCRFCFRFRRCFF;
        let layout: Layout = LayoutImpl::from(layout_type, Orientation::North);
        let reference: Layout = LayoutImpl::from(layout_type, Orientation::South);
        let compatibility = LayoutImpl::is_compatible(layout, reference, Orientation::North);
        assert(compatibility, 'Layout: wrong compatibility');
    }

    #[test]
    fn test_layout_is_not_compatible() {
        let layout_type = LayoutType::SCRFCFRFRRCFF;
        let layout: Layout = LayoutImpl::from(layout_type, Orientation::North);
        let reference: Layout = LayoutImpl::from(layout_type, Orientation::West);
        let compatibility = LayoutImpl::is_compatible(layout, reference, Orientation::North);
        assert(!compatibility, 'Layout: wrong compatibility');
    }
}

