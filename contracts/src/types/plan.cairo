// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{MASK_8, TWO_POW_8, TOTAL_TILE_COUNT};
use stolsli::types::category::Category;

// Constants

const NONE: felt252 = 0;
const MAX_LAYOUT_COUNT: u8 = 20;

mod errors {
    const UNPACK_FAILED: felt252 = 'Layout: Unpack failed';
}

// Center, NW, N, NE, E, SE, S, SW, W
#[derive(Copy, Drop, Serde, Introspect)]
enum Plan {
    None,
    // Row #1
    RFFFRFFFR,
    RFRFFFFFR,
    WFFFFFFFR,
    SFRFRFFFR,
    SFRFRFRFR,
    RFRFCCCFR,
    // Row #2
    RFRFFFCFR,
    RFRFRFCFF,
    RFFFRFCFR, // Starter tile
    RFRFFFCFF,
    SFRFRFCFR,
    CCCCCFFFC,
    // Row #3
    FFFFFFCFF,
    FFCFFFCFF,
    FFCFFFFFC,
    // FFCFFFCFC, // Not in the original game
    WFFFFFFFF, // Forgotten one
    FFFFCCCFF,
    CFFFCFFFC,
    // Row #4
    CCCCCCCCC,
    CCCCCFRFC,
}

impl IntoPlanFelt252 of Into<Plan, felt252> {
    #[inline(always)]
    fn into(self: Plan) -> felt252 {
        match self {
            Plan::None => NONE,
            Plan::RFFFRFFFR => 'RFFFRFFFR',
            Plan::RFRFFFFFR => 'RFRFFFFFR',
            Plan::WFFFFFFFR => 'WFFFFFFFR',
            Plan::SFRFRFFFR => 'SFRFRFFFR',
            Plan::SFRFRFRFR => 'SFRFRFRFR',
            Plan::RFRFCCCFR => 'RFRFCCCFR',
            Plan::RFRFFFCFR => 'RFRFFFCFR',
            Plan::RFRFRFCFF => 'RFRFRFCFF',
            Plan::RFFFRFCFR => 'RFFFRFCFR',
            Plan::RFRFFFCFF => 'RFRFFFCFF',
            Plan::SFRFRFCFR => 'SFRFRFCFR',
            Plan::CCCCCFFFC => 'CCCCCFFFC',
            Plan::FFFFFFCFF => 'FFFFFFCFF',
            Plan::FFCFFFCFF => 'FFCFFFCFF',
            Plan::FFCFFFFFC => 'FFCFFFFFC',
            // Plan::FFCFFFCFC => 'FFCFFFCFC',
            Plan::WFFFFFFFF => 'WFFFFFFFF',
            Plan::FFFFCCCFF => 'FFFFCCCFF',
            Plan::CFFFCFFFC => 'CFFFCFFFC',
            Plan::CCCCCCCCC => 'CCCCCCCCC',
            Plan::CCCCCFRFC => 'CCCCCFRFC',
        }
    }
}

impl IntoPlanU8 of Into<Plan, u8> {
    #[inline(always)]
    fn into(self: Plan) -> u8 {
        match self {
            Plan::None => 0,
            Plan::RFFFRFFFR => 1,
            Plan::RFRFFFFFR => 2,
            Plan::WFFFFFFFR => 3,
            Plan::SFRFRFFFR => 4,
            Plan::SFRFRFRFR => 5,
            Plan::RFRFCCCFR => 6,
            Plan::RFRFFFCFR => 7,
            Plan::RFRFRFCFF => 8,
            Plan::RFFFRFCFR => 9,
            Plan::RFRFFFCFF => 10,
            Plan::SFRFRFCFR => 11,
            Plan::CCCCCFFFC => 12,
            Plan::FFFFFFCFF => 13,
            Plan::FFCFFFCFF => 14,
            Plan::FFCFFFFFC => 15,
            // Plan::FFCFFFCFC => 16,
            Plan::WFFFFFFFF => 16,
            Plan::FFFFCCCFF => 17,
            Plan::CFFFCFFFC => 18,
            Plan::CCCCCCCCC => 19,
            Plan::CCCCCFRFC => 20,
        }
    }
}

impl IntoU8Plan of Into<u8, Plan> {
    #[inline(always)]
    fn into(self: u8) -> Plan {
        if 1 == self.into() {
            Plan::RFFFRFFFR
        } else if 2 == self.into() {
            Plan::RFRFFFFFR
        } else if 3 == self.into() {
            Plan::WFFFFFFFR
        } else if 4 == self.into() {
            Plan::SFRFRFFFR
        } else if 5 == self.into() {
            Plan::SFRFRFRFR
        } else if 6 == self.into() {
            Plan::RFRFCCCFR
        } else if 7 == self.into() {
            Plan::RFRFFFCFR
        } else if 8 == self.into() {
            Plan::RFRFRFCFF
        } else if 9 == self.into() {
            Plan::RFFFRFCFR
        } else if 10 == self.into() {
            Plan::RFRFFFCFF
        } else if 11 == self.into() {
            Plan::SFRFRFCFR
        } else if 12 == self.into() {
            Plan::CCCCCFFFC
        } else if 13 == self.into() {
            Plan::FFFFFFCFF
        } else if 14 == self.into() {
            Plan::FFCFFFCFF
        } else if 15 == self.into() {
            Plan::FFCFFFFFC
        } else if 16 == self.into() {
            Plan::WFFFFFFFF
        } else if 17 == self.into() {
            Plan::FFFFCCCFF
        } else if 18 == self.into() {
            Plan::CFFFCFFFC
        } else if 19 == self.into() {
            Plan::CCCCCCCCC
        } else if 20 == self.into() {
            Plan::CCCCCFRFC
        } else {
            Plan::None
        }
    }
}

impl IntoU32Plan of Into<u32, Plan> {
    #[inline(always)]
    fn into(self: u32) -> Plan {
        let id = self % TOTAL_TILE_COUNT.into();
        if id < 2 {
            Plan::WFFFFFFFR
        } else if id < 6 {
            Plan::WFFFFFFFF
        } else if id < 7 {
            Plan::CCCCCCCCC
        } else if id < 11 {
            Plan::RFFFRFCFR
        } else if id < 16 {
            Plan::FFFFFFCFF
        } else if id < 19 {
            Plan::CFFFCFFFC
        } else if id < 22 {
            Plan::FFCFFFCFF
        } else if id < 24 {
            Plan::FFCFFFFFC
        } else if id < 27 {
            Plan::RFRFFFCFR
        } else if id < 30 {
            Plan::RFRFRFCFF
        } else if id < 33 {
            Plan::SFRFRFCFR
        } else if id < 38 {
            Plan::FFFFCCCFF
        } else if id < 43 {
            Plan::RFRFCCCFR
        } else if id < 47 {
            Plan::CCCCCFFFC
        } else if id < 50 {
            Plan::CCCCCFRFC
        } else if id < 58 {
            Plan::RFFFRFFFR
        } else if id < 67 {
            Plan::RFRFFFFFR
        } else if id < 71 {
            Plan::SFRFRFFFR
        } else if id < 72 {
            Plan::SFRFRFRFR
        } else {
            Plan::None
        }
    }
}

impl PlanPrint of PrintTrait<Plan> {
    #[inline(always)]
    fn print(self: Plan) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

impl PlanPartialEq of PartialEq<Plan> {
    #[inline(always)]
    fn eq(lhs: @Plan, rhs: @Plan) -> bool {
        let felt: felt252 = (*lhs).into();
        felt == (*rhs).into()
    }

    #[inline(always)]
    fn ne(lhs: @Plan, rhs: @Plan) -> bool {
        let felt: felt252 = (*lhs).into();
        felt != (*rhs).into()
    }
}

#[generate_trait]
impl PlanImpl of PlanTrait {
    fn unpack(self: Plan) -> Array<Category> {
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

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Plan, Category, NONE};

    // Constants

    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_plan_into_felt() {
        let plan: Plan = Plan::RFFFRFFFR;
        assert('RFFFRFFFR' == Plan::RFFFRFFFR.into(), 'Plan: into felt RFFFRFFFR');
    }

    #[test]
    fn test_plan_into_u8() {
        assert(1_u8 == Plan::RFFFRFFFR.into(), 'Plan: into u8 RFFFRFFFR');
    }

    #[test]
    fn test_u8_into_plan() {
        assert(Plan::RFFFRFFFR == 1_u8.into(), 'Plan: into plan RFFFRFFFR');
    }

    #[test]
    fn test_unknown_u8_into_plan() {
        assert(Plan::None == UNKNOWN_U8.into(), 'Plan: into plan None');
    }
}

