// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::plan::{Plan, PlanImpl};
use paved::types::orientation::Orientation;
use paved::types::direction::{Direction, DirectionImpl};
use paved::types::category::Category;
use paved::types::spot::{Spot, SpotImpl};
use paved::types::move::Move;

// Constants

const TILE_DATA_COUNT: u32 = 9;

mod errors {
    const UNPACK_FAILED: felt252 = 'Layout: unpack failed';
}

#[derive(Copy, Drop, Serde)]
struct Layout {
    center: Category,
    north_west: Category,
    north: Category,
    north_east: Category,
    east: Category,
    south_east: Category,
    south: Category,
    south_west: Category,
    west: Category,
}

#[generate_trait]
impl LayoutImpl of LayoutTrait {
    #[inline(always)]
    fn new(
        center: Category,
        north_west: Category,
        north: Category,
        north_east: Category,
        east: Category,
        south_east: Category,
        south: Category,
        south_west: Category,
        west: Category,
    ) -> Layout {
        Layout {
            center: center,
            north_west: north_west,
            north: north,
            north_east: north_east,
            east: east,
            south_east: south_east,
            south: south,
            south_west: south_west,
            west: west,
        }
    }

    #[inline(always)]
    fn from(plan: Plan, orientation: Orientation) -> Layout {
        let mut categories = plan.unpack();

        // [Check] Categories length
        assert(categories.len() == TILE_DATA_COUNT, errors::UNPACK_FAILED);

        // [Compute] Extract Categories on a north based orientation
        let west = categories.pop_front().unwrap();
        let south_west = categories.pop_front().unwrap();
        let south = categories.pop_front().unwrap();
        let south_east = categories.pop_front().unwrap();
        let east = categories.pop_front().unwrap();
        let north_east = categories.pop_front().unwrap();
        let north = categories.pop_front().unwrap();
        let north_west = categories.pop_front().unwrap();
        let center = categories.pop_front().unwrap();

        // [Compute] Rotate Categories to match orientation
        match orientation {
            Orientation::None => { core::Zeroable::zero() },
            Orientation::North => {
                Layout {
                    center: center,
                    north_west: north_west,
                    north: north,
                    north_east: north_east,
                    east: east,
                    south_east: south_east,
                    south: south,
                    south_west: south_west,
                    west: west,
                }
            },
            Orientation::East => {
                Layout {
                    center: center,
                    north_west: south_west,
                    north: west,
                    north_east: north_west,
                    east: north,
                    south_east: north_east,
                    south: east,
                    south_west: south_east,
                    west: south,
                }
            },
            Orientation::South => {
                Layout {
                    center: center,
                    north_west: south_east,
                    north: south,
                    north_east: south_west,
                    east: west,
                    south_east: north_west,
                    south: north,
                    south_west: north_east,
                    west: east,
                }
            },
            Orientation::West => {
                Layout {
                    center: center,
                    north_west: north_east,
                    north: east,
                    north_east: south_east,
                    east: south,
                    south_east: south_west,
                    south: west,
                    south_west: north_west,
                    west: north,
                }
            },
        }
    }

    #[inline(always)]
    fn is_compatible(self: Layout, reference: Layout, direction: Direction) -> bool {
        match direction {
            Direction::None => { false },
            Direction::NorthWest => { false },
            Direction::North => { self.north == reference.south },
            Direction::NorthEast => { false },
            Direction::East => { self.east == reference.west },
            Direction::SouthEast => { false },
            Direction::South => { self.south == reference.north },
            Direction::SouthWest => { false },
            Direction::West => { self.west == reference.east },
        }
    }

    #[inline(always)]
    fn get_category(self: Layout, spot: Spot) -> Category {
        match spot {
            Spot::None => { Category::None },
            Spot::Center => { self.center },
            Spot::NorthWest => { self.north_west },
            Spot::North => { self.north },
            Spot::NorthEast => { self.north_east },
            Spot::East => { self.east },
            Spot::SouthEast => { self.south_east },
            Spot::South => { self.south },
            Spot::SouthWest => { self.south_west },
            Spot::West => { self.west },
        }
    }
}

impl ZeroableLayoutImpl of core::Zeroable<Layout> {
    #[inline(always)]
    fn zero() -> Layout {
        Layout {
            center: Category::None,
            north_west: Category::None,
            north: Category::None,
            north_east: Category::None,
            east: Category::None,
            south_east: Category::None,
            south: Category::None,
            south_west: Category::None,
            west: Category::None,
        }
    }

    #[inline(always)]
    fn is_zero(self: Layout) -> bool {
        self.center == Category::None
            && self.north_west == Category::None
            && self.north == Category::None
            && self.north_east == Category::None
            && self.east == Category::None
            && self.south_east == Category::None
            && self.south == Category::None
            && self.south_west == Category::None
            && self.west == Category::None
    }

    #[inline(always)]
    fn is_non_zero(self: Layout) -> bool {
        !self.is_zero()
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Layout, LayoutImpl};
    use super::{Plan, Category, Orientation, Direction};

    #[test]
    fn test_layout_from_north() {
        let orientation = Orientation::North;
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, orientation);
        assert(layout.center == Category::Road, 'Layout: wrong center');
        assert(layout.north_west == Category::Forest, 'Layout: wrong NNW');
        assert(layout.north == Category::Road, 'Layout: wrong N');
        assert(layout.north_east == Category::Forest, 'Layout: wrong NNE');
        assert(layout.east == Category::City, 'Layout: wrong E');
        assert(layout.south_east == Category::City, 'Layout: wrong SSE');
        assert(layout.south == Category::City, 'Layout: wrong S');
        assert(layout.south_west == Category::Forest, 'Layout: wrong SSW');
        assert(layout.west == Category::Road, 'Layout: wrong W');
    }

    #[test]
    fn test_layout_from_east() {
        let orientation = Orientation::East;
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, orientation);
        assert(layout.center == Category::Road, 'Layout: wrong center');
        assert(layout.north_west == Category::Forest, 'Layout: wrong NNW');
        assert(layout.north == Category::Road, 'Layout: wrong N');
        assert(layout.north_east == Category::Forest, 'Layout: wrong NNE');
        assert(layout.east == Category::Road, 'Layout: wrong E');
        assert(layout.south_east == Category::Forest, 'Layout: wrong SSE');
        assert(layout.south == Category::City, 'Layout: wrong S');
        assert(layout.south_west == Category::City, 'Layout: wrong SSW');
        assert(layout.west == Category::City, 'Layout: wrong W');
    }

    #[test]
    fn test_layout_from_south() {
        let orientation = Orientation::South;
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, orientation);
        assert(layout.center == Category::Road, 'Layout: wrong center');
        assert(layout.north_west == Category::City, 'Layout: wrong NNW');
        assert(layout.north == Category::City, 'Layout: wrong N');
        assert(layout.north_east == Category::Forest, 'Layout: wrong NNE');
        assert(layout.east == Category::Road, 'Layout: wrong E');
        assert(layout.south_east == Category::Forest, 'Layout: wrong SSE');
        assert(layout.south == Category::Road, 'Layout: wrong S');
        assert(layout.south_west == Category::Forest, 'Layout: wrong SSW');
        assert(layout.west == Category::City, 'Layout: wrong W');
    }

    #[test]
    fn test_layout_from_west() {
        let orientation = Orientation::West;
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, orientation);
        assert(layout.center == Category::Road, 'Layout: wrong center');
        assert(layout.north_west == Category::Forest, 'Layout: wrong NNW');
        assert(layout.north == Category::City, 'Layout: wrong N');
        assert(layout.north_east == Category::City, 'Layout: wrong NNE');
        assert(layout.east == Category::City, 'Layout: wrong E');
        assert(layout.south_east == Category::Forest, 'Layout: wrong SSE');
        assert(layout.south == Category::Road, 'Layout: wrong S');
        assert(layout.south_west == Category::Forest, 'Layout: wrong SSW');
        assert(layout.west == Category::Road, 'Layout: wrong W');
    }

    #[test]
    fn test_layout_is_compatible() {
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, Orientation::North);
        let reference: Layout = LayoutImpl::from(plan, Orientation::South);
        let compatibility = LayoutImpl::is_compatible(layout, reference, Direction::North);
        assert(compatibility, 'Layout: wrong compatibility');
    }

    #[test]
    fn test_layout_is_not_compatible() {
        let plan = Plan::RFRFCCCFR;
        let layout: Layout = LayoutImpl::from(plan, Orientation::North);
        let reference: Layout = LayoutImpl::from(plan, Orientation::East);
        let compatibility = LayoutImpl::is_compatible(layout, reference, Direction::North);
        assert(!compatibility, 'Layout: wrong compatibility');
    }
}

