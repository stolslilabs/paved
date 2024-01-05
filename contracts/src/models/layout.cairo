// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{MASK_8, TWO_POW_8};
use stolsli::models::category::Category;
use stolsli::models::edge::Edge;

// Na-Nb-Nc-Sa-Sb-Sc-Ea-Eb-Ec-Wa-Wb-Wc
#[derive(Copy, Drop, Serde, Introspection)]
enum LayoutType {
    SCFRCFRCFRCFR,
    RFFFFFFCFRCFR,
    SCRFCFRFRRCFF,
}

#[derive(Copy, Drop, Serde)]
struct Layout {
    center: Category,
    north: Edge,
    east: Edge,
    south: Edge,
    west: Edge,
}

mod errors {
    const UNPACK_FAILED: felt252 = 'Layout: Unpack failed';
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

impl IntoLayoutTypeLayout of Into<LayoutType, Layout> {
    #[inline(always)]
    fn into(self: LayoutType) -> Layout {
        let mut categories = self.unpack();

        // [Check] Categories length
        assert(categories.len() == 13, errors::UNPACK_FAILED);

        let wnw = categories.pop_front().unwrap();
        let west = categories.pop_front().unwrap();
        let wsw = categories.pop_front().unwrap();

        let ssw = categories.pop_front().unwrap();
        let south = categories.pop_front().unwrap();
        let sse = categories.pop_front().unwrap();

        let ese = categories.pop_front().unwrap();
        let east = categories.pop_front().unwrap();
        let ene = categories.pop_front().unwrap();

        let nne = categories.pop_front().unwrap();
        let north = categories.pop_front().unwrap();
        let nnw = categories.pop_front().unwrap();

        let center = categories.pop_front().unwrap();

        Layout {
            center: center,
            north: Edge { A: nnw, B: north, C: nne },
            east: Edge { A: ese, B: east, C: ene },
            south: Edge { A: sse, B: south, C: ssw },
            west: Edge { A: wsw, B: west, C: wnw },
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
            let category: Category = key.try_into().unwrap();
            categories.append(category);
            keys /= TWO_POW_8.into();
        };
        categories
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{LayoutType, Layout, Category, Edge};

    #[test]
    fn test_layout_type_into_layout() {
        let layout_type = LayoutType::RFFFFFFCFRCFR;
        let layout: Layout = layout_type.into();
        // Center
        assert(layout.center == Category::Road, 'Layout: wrong center');
        // North
        assert(layout.north.A == Category::Farm, 'Layout: wrong north A');
        assert(layout.north.B == Category::Farm, 'Layout: wrong north B');
        assert(layout.north.C == Category::Farm, 'Layout: wrong north C');
        // East
        assert(layout.east.A == Category::Farm, 'Layout: wrong east A');
        assert(layout.east.B == Category::Farm, 'Layout: wrong east B');
        assert(layout.east.C == Category::Farm, 'Layout: wrong east C');
        // South
        assert(layout.south.A == Category::City, 'Layout: wrong south A');
        assert(layout.south.B == Category::Farm, 'Layout: wrong south B');
        assert(layout.south.C == Category::Road, 'Layout: wrong south C');
        // West
        assert(layout.west.A == Category::City, 'Layout: wrong west A');
        assert(layout.west.B == Category::Farm, 'Layout: wrong west B');
        assert(layout.west.C == Category::Road, 'Layout: wrong west C');
    }
}

