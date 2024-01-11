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

// Center, NNW, N, NNE, ENE, E, ESE, SSE, S, SSW, WSW, W, WNW
#[derive(Copy, Drop, Serde, Introspect)]
enum Plan {
    None,
    // Row #1
    RFFFFRFFFFFRF,
    RFRFFFFFFFFRF,
    WFFFFFFFFFFRF,
    SFRFFRFFFFFRF,
    SFRFFRFFRFFRF,
    RFRFFCCCCFFRF,
    // Row #2
    RFRFFFFFCFFRF,
    RFRFFRFFCFFFF,
    RFFFFRFFCFFRF, // Starter tile
    RFRFFFFFCFFFF,
    SFRFFRFFCFFRF,
    CCCCCCFFFFFCC,
    // Row #3
    FFFFFFFFCFFFF,
    FFCFFFFFCFFFF,
    FFCFFFFFFFFCF,
    // FFCFFFFFCFFCF, // Not in the original game
    WFFFFFFFFFFFF, // Forgotten one
    FFFFFCCCCFFFF,
    CFFFFCFFFFFCF,
    // Row #4
    CCCCCCCCCCCCC,
    CCCCCCFFRFFCC,
}

impl IntoPlanFelt252 of Into<Plan, felt252> {
    #[inline(always)]
    fn into(self: Plan) -> felt252 {
        match self {
            Plan::None => NONE,
            Plan::RFFFFRFFFFFRF => 'RFFFFRFFFFFRF',
            Plan::RFRFFFFFFFFRF => 'RFRFFFFFFFFRF',
            Plan::WFFFFFFFFFFRF => 'WFFFFFFFFFFRF',
            Plan::SFRFFRFFFFFRF => 'SFRFFRFFFFFRF',
            Plan::SFRFFRFFRFFRF => 'SFRFFRFFRFFRF',
            Plan::RFRFFCCCCFFRF => 'RFRFFCCCCFFRF',
            Plan::RFRFFFFFCFFRF => 'RFRFFFFFCFFRF',
            Plan::RFRFFRFFCFFFF => 'RFRFFRFFCFFFF',
            Plan::RFFFFRFFCFFRF => 'RFFFFRFFCFFRF',
            Plan::RFRFFFFFCFFFF => 'RFRFFFFFCFFFF',
            Plan::SFRFFRFFCFFRF => 'SFRFFRFFCFFRF',
            Plan::CCCCCCFFFFFCC => 'CCCCCCFFFFFCC',
            Plan::FFFFFFFFCFFFF => 'FFFFFFFFCFFFF',
            Plan::FFCFFFFFCFFFF => 'FFCFFFFFCFFFF',
            Plan::FFCFFFFFFFFCF => 'FFCFFFFFFFFCF',
            // Plan::FFCFFFFFCFFCF => 'FFCFFFFFCFFCF',
            Plan::WFFFFFFFFFFFF => 'WFFFFFFFFFFFF',
            Plan::FFFFFCCCCFFFF => 'FFFFFCCCCFFFF',
            Plan::CFFFFCFFFFFCF => 'CFFFFCFFFFFCF',
            Plan::CCCCCCCCCCCCC => 'CCCCCCCCCCCCC',
            Plan::CCCCCCFFRFFCC => 'CCCCCCFFRFFCC',
        }
    }
}

impl IntoPlanU8 of Into<Plan, u8> {
    #[inline(always)]
    fn into(self: Plan) -> u8 {
        match self {
            Plan::None => 0,
            Plan::RFFFFRFFFFFRF => 1,
            Plan::RFRFFFFFFFFRF => 2,
            Plan::WFFFFFFFFFFRF => 3,
            Plan::SFRFFRFFFFFRF => 4,
            Plan::SFRFFRFFRFFRF => 5,
            Plan::RFRFFCCCCFFRF => 6,
            Plan::RFRFFFFFCFFRF => 7,
            Plan::RFRFFRFFCFFFF => 8,
            Plan::RFFFFRFFCFFRF => 9,
            Plan::RFRFFFFFCFFFF => 10,
            Plan::SFRFFRFFCFFRF => 11,
            Plan::CCCCCCFFFFFCC => 12,
            Plan::FFFFFFFFCFFFF => 13,
            Plan::FFCFFFFFCFFFF => 14,
            Plan::FFCFFFFFFFFCF => 15,
            // Plan::FFCFFFFFCFFCF => 16,
            Plan::WFFFFFFFFFFFF => 16,
            Plan::FFFFFCCCCFFFF => 17,
            Plan::CFFFFCFFFFFCF => 18,
            Plan::CCCCCCCCCCCCC => 19,
            Plan::CCCCCCFFRFFCC => 20,
        }
    }
}

impl IntoU8Plan of Into<u8, Plan> {
    #[inline(always)]
    fn into(self: u8) -> Plan {
        if 1 == self.into() {
            Plan::RFFFFRFFFFFRF
        } else if 2 == self.into() {
            Plan::RFRFFFFFFFFRF
        } else if 3 == self.into() {
            Plan::WFFFFFFFFFFRF
        } else if 4 == self.into() {
            Plan::SFRFFRFFFFFRF
        } else if 5 == self.into() {
            Plan::SFRFFRFFRFFRF
        } else if 6 == self.into() {
            Plan::RFRFFCCCCFFRF
        } else if 7 == self.into() {
            Plan::RFRFFFFFCFFRF
        } else if 8 == self.into() {
            Plan::RFRFFRFFCFFFF
        } else if 9 == self.into() {
            Plan::RFFFFRFFCFFRF
        } else if 10 == self.into() {
            Plan::RFRFFFFFCFFFF
        } else if 11 == self.into() {
            Plan::SFRFFRFFCFFRF
        } else if 12 == self.into() {
            Plan::CCCCCCFFFFFCC
        } else if 13 == self.into() {
            Plan::FFFFFFFFCFFFF
        } else if 14 == self.into() {
            Plan::FFCFFFFFCFFFF
        } else if 15 == self.into() {
            Plan::FFCFFFFFFFFCF
        } else if 16 == self.into() {
            Plan::WFFFFFFFFFFFF
        } else if 17 == self.into() {
            Plan::FFFFFCCCCFFFF
        } else if 18 == self.into() {
            Plan::CFFFFCFFFFFCF
        } else if 19 == self.into() {
            Plan::CCCCCCCCCCCCC
        } else if 20 == self.into() {
            Plan::CCCCCCFFRFFCC
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
            Plan::WFFFFFFFFFFRF
        } else if id < 6 {
            Plan::WFFFFFFFFFFFF
        } else if id < 7 {
            Plan::CCCCCCCCCCCCC
        } else if id < 11 {
            Plan::RFFFFRFFCFFRF
        } else if id < 16 {
            Plan::FFFFFFFFCFFFF
        } else if id < 19 {
            Plan::CFFFFCFFFFFCF
        } else if id < 22 {
            Plan::FFCFFFFFCFFFF
        } else if id < 24 {
            Plan::FFCFFFFFFFFCF
        } else if id < 27 {
            Plan::RFRFFFFFCFFRF
        } else if id < 30 {
            Plan::RFRFFRFFCFFFF
        } else if id < 33 {
            Plan::SFRFFRFFCFFRF
        } else if id < 38 {
            Plan::FFFFFCCCCFFFF
        } else if id < 43 {
            Plan::RFRFFCCCCFFRF
        } else if id < 47 {
            Plan::CCCCCCFFFFFCC
        } else if id < 50 {
            Plan::CCCCCCFFRFFCC
        } else if id < 58 {
            Plan::RFFFFRFFFFFRF
        } else if id < 67 {
            Plan::RFRFFFFFFFFRF
        } else if id < 71 {
            Plan::SFRFFRFFFFFRF
        } else if id < 72 {
            Plan::SFRFFRFFRFFRF
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
        let plan: Plan = Plan::RFFFFRFFFFFRF;
        assert('RFFFFRFFFFFRF' == Plan::RFFFFRFFFFFRF.into(), 'Plan: into felt RFFFFRFFFFFRF');
    }

    #[test]
    fn test_plan_into_u8() {
        assert(1_u8 == Plan::RFFFFRFFFFFRF.into(), 'Plan: into u8 RFFFFRFFFFFRF');
    }

    #[test]
    fn test_u8_into_plan() {
        assert(Plan::RFFFFRFFFFFRF == 1_u8.into(), 'Plan: into plan RFFFFRFFFFFRF');
    }

    #[test]
    fn test_unknown_u8_into_plan() {
        assert(Plan::None == UNKNOWN_U8.into(), 'Plan: into plan None');
    }
}

