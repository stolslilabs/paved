// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{MASK_8, TWO_POW_8, TOTAL_TILE_COUNT};
use stolsli::types::category::Category;
use stolsli::types::spot::Spot;
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::move::Move;

use stolsli::layouts::ccccccccc::{LayoutImpl as CccccccccImpl};
use stolsli::layouts::cccccfffc::{LayoutImpl as CccccfffcImpl};
use stolsli::layouts::cccccfrfc::{LayoutImpl as CccccfrfcImpl};
use stolsli::layouts::cfffcfffc::{LayoutImpl as CfffcfffcImpl};
use stolsli::layouts::cfffcfrfc::{LayoutImpl as CfffcfrfcImpl};
use stolsli::layouts::ffcfffcfc::{LayoutImpl as FfcfffcfcImpl};
use stolsli::layouts::ffcfffcff::{LayoutImpl as FfcfffcffImpl};
use stolsli::layouts::ffcfffffc::{LayoutImpl as FfcfffffcImpl};
use stolsli::layouts::ffffcccff::{LayoutImpl as FfffcccffImpl};
use stolsli::layouts::ffffffcff::{LayoutImpl as FfffffcffImpl};
use stolsli::layouts::rfffrfcfr::{LayoutImpl as RfffrfcfrImpl};
use stolsli::layouts::rfffrfffr::{LayoutImpl as RfffrfffrImpl};
use stolsli::layouts::rfrfcccfr::{LayoutImpl as RfrfcccfrImpl};
use stolsli::layouts::rfrfffcff::{LayoutImpl as RfrfffcffImpl};
use stolsli::layouts::rfrfffcfr::{LayoutImpl as RfrfffcfrImpl};
use stolsli::layouts::rfrfffffr::{LayoutImpl as RfrfffffrImpl};
use stolsli::layouts::rfrfrfcff::{LayoutImpl as RfrfrfcffImpl};
use stolsli::layouts::sfffffffr::{LayoutImpl as SfffffffrImpl};
use stolsli::layouts::sfrfrfcfr::{LayoutImpl as SfrfrfcfrImpl};
use stolsli::layouts::sfrfrfffr::{LayoutImpl as SfrfrfffrImpl};
use stolsli::layouts::sfrfrfrfr::{LayoutImpl as SfrfrfrfrImpl};
use stolsli::layouts::wcccccccc::{LayoutImpl as WccccccccImpl};
use stolsli::layouts::wffffffff::{LayoutImpl as WffffffffImpl};
use stolsli::layouts::wfffffffr::{LayoutImpl as WfffffffrImpl};

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
    CCCCCCCCC, // 0 pieces
    CCCCCFFFC, // 4 pieces
    CCCCCFRFC, // 3 pieces
    CFFFCFFFC, // 3 pieces
    CFFFCFRFC, // 0 pieces
    FFCFFFCFC, // 0 pieces
    FFCFFFCFF, // 3 pieces
    FFCFFFFFC, // 2 pieces
    FFFFCCCFF, // 5 pieces
    FFFFFFCFF, // 5 pieces
    RFFFRFCFR, // 4 pieces
    RFFFRFFFR, // 8 pieces
    RFRFCCCFR, // 5 pieces
    RFRFFFCFF, // 0 pieces
    RFRFFFCFR, // 3 pieces
    RFRFFFFFR, // 9 pieces
    RFRFRFCFF, // 3 pieces
    SFFFFFFFR, // 0 pieces
    SFRFRFCFR, // 3 pieces
    SFRFRFFFR, // 4 pieces
    SFRFRFRFR, // 1 pieces
    WCCCCCCCC, // 1 pieces
    WFFFFFFFF, // 4 pieces
    WFFFFFFFR, // 2 pieces
}

impl IntoPlanFelt252 of Into<Plan, felt252> {
    #[inline(always)]
    fn into(self: Plan) -> felt252 {
        match self {
            Plan::None => NONE,
            Plan::CCCCCCCCC => 'CCCCCCCCC',
            Plan::CCCCCFFFC => 'CCCCCFFFC',
            Plan::CCCCCFRFC => 'CCCCCFRFC',
            Plan::CFFFCFFFC => 'CFFFCFFFC',
            Plan::CFFFCFRFC => 'CFFFCFRFC',
            Plan::FFCFFFCFC => 'FFCFFFCFC',
            Plan::FFCFFFCFF => 'FFCFFFCFF',
            Plan::FFCFFFFFC => 'FFCFFFFFC',
            Plan::FFFFCCCFF => 'FFFFCCCFF',
            Plan::FFFFFFCFF => 'FFFFFFCFF',
            Plan::RFFFRFCFR => 'RFFFRFCFR',
            Plan::RFFFRFFFR => 'RFFFRFFFR',
            Plan::RFRFCCCFR => 'RFRFCCCFR',
            Plan::RFRFFFCFF => 'RFRFFFCFF',
            Plan::RFRFFFCFR => 'RFRFFFCFR',
            Plan::RFRFFFFFR => 'RFRFFFFFR',
            Plan::RFRFRFCFF => 'RFRFRFCFF',
            Plan::SFFFFFFFR => 'SFFFFFFFR',
            Plan::SFRFRFCFR => 'SFRFRFCFR',
            Plan::SFRFRFFFR => 'SFRFRFFFR',
            Plan::SFRFRFRFR => 'SFRFRFRFR',
            Plan::WCCCCCCCC => 'WCCCCCCCC',
            Plan::WFFFFFFFF => 'WFFFFFFFF',
            Plan::WFFFFFFFR => 'WFFFFFFFR',
        }
    }
}

impl IntoPlanU8 of Into<Plan, u8> {
    #[inline(always)]
    fn into(self: Plan) -> u8 {
        match self {
            Plan::None => 0,
            Plan::CCCCCCCCC => 1,
            Plan::CCCCCFFFC => 2,
            Plan::CCCCCFRFC => 3,
            Plan::CFFFCFFFC => 4,
            Plan::CFFFCFRFC => 5,
            Plan::FFCFFFCFC => 6,
            Plan::FFCFFFCFF => 7,
            Plan::FFCFFFFFC => 8,
            Plan::FFFFCCCFF => 9,
            Plan::FFFFFFCFF => 10,
            Plan::RFFFRFCFR => 11,
            Plan::RFFFRFFFR => 12,
            Plan::RFRFCCCFR => 13,
            Plan::RFRFFFCFF => 14,
            Plan::RFRFFFCFR => 15,
            Plan::RFRFFFFFR => 16,
            Plan::RFRFRFCFF => 17,
            Plan::SFFFFFFFR => 18,
            Plan::SFRFRFCFR => 19,
            Plan::SFRFRFFFR => 20,
            Plan::SFRFRFRFR => 21,
            Plan::WCCCCCCCC => 22,
            Plan::WFFFFFFFF => 23,
            Plan::WFFFFFFFR => 24,
        }
    }
}

impl IntoU8Plan of Into<u8, Plan> {
    #[inline(always)]
    fn into(self: u8) -> Plan {
        if 1 == self.into() {
            Plan::CCCCCCCCC
        } else if 2 == self.into() {
            Plan::CCCCCFFFC
        } else if 3 == self.into() {
            Plan::CCCCCFRFC
        } else if 4 == self.into() {
            Plan::CFFFCFFFC
        } else if 5 == self.into() {
            Plan::CFFFCFRFC
        } else if 6 == self.into() {
            Plan::FFCFFFCFC
        } else if 7 == self.into() {
            Plan::FFCFFFCFF
        } else if 8 == self.into() {
            Plan::FFCFFFFFC
        } else if 9 == self.into() {
            Plan::FFFFCCCFF
        } else if 10 == self.into() {
            Plan::FFFFFFCFF
        } else if 11 == self.into() {
            Plan::RFFFRFCFR
        } else if 12 == self.into() {
            Plan::RFFFRFFFR
        } else if 13 == self.into() {
            Plan::RFRFCCCFR
        } else if 14 == self.into() {
            Plan::RFRFFFCFF
        } else if 15 == self.into() {
            Plan::RFRFFFCFR
        } else if 16 == self.into() {
            Plan::RFRFFFFFR
        } else if 17 == self.into() {
            Plan::RFRFRFCFF
        } else if 18 == self.into() {
            Plan::SFFFFFFFR
        } else if 19 == self.into() {
            Plan::SFRFRFCFR
        } else if 20 == self.into() {
            Plan::SFRFRFFFR
        } else if 21 == self.into() {
            Plan::SFRFRFRFR
        } else if 22 == self.into() {
            Plan::WCCCCCCCC
        } else if 23 == self.into() {
            Plan::WFFFFFFFF
        } else if 24 == self.into() {
            Plan::WFFFFFFFR
        } else {
            Plan::None
        }
    }
}

impl IntoU32Plan of Into<u32, Plan> {
    #[inline(always)]
    fn into(self: u32) -> Plan {
        let id = self % TOTAL_TILE_COUNT.into();
        if id < 4 {
            Plan::CCCCCFFFC
        } else if id < 7 {
            Plan::CCCCCFRFC
        } else if id < 10 {
            Plan::CFFFCFFFC
        } else if id < 13 {
            Plan::FFCFFFCFF
        } else if id < 15 {
            Plan::FFCFFFFFC
        } else if id < 20 {
            Plan::FFFFCCCFF
        } else if id < 25 {
            Plan::FFFFFFCFF
        } else if id < 29 {
            Plan::RFFFRFCFR
        } else if id < 37 {
            Plan::RFFFRFFFR
        } else if id < 42 {
            Plan::RFRFCCCFR
        } else if id < 45 {
            Plan::RFRFFFCFR
        } else if id < 54 {
            Plan::RFRFFFFFR
        } else if id < 57 {
            Plan::RFRFRFCFF
        } else if id < 60 {
            Plan::SFRFRFCFR
        } else if id < 64 {
            Plan::SFRFRFFFR
        } else if id < 65 {
            Plan::SFRFRFRFR
        } else if id < 66 {
            Plan::WCCCCCCCC
        } else if id < 70 {
            Plan::WFFFFFFFF
        } else if id < 72 {
            Plan::WFFFFFFFR
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

    #[inline(always)]
    fn moves(self: Plan, from: Spot) -> Array<Move> {
        let mut moves: Array<Move> = ArrayTrait::new();
        match self {
            Plan::None => moves,
            Plan::CCCCCCCCC => CccccccccImpl::moves(from),
            Plan::CCCCCFFFC => CccccfffcImpl::moves(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::moves(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::moves(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::moves(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::moves(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::moves(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::moves(from),
            Plan::FFFFCCCFF => FfffcccffImpl::moves(from),
            Plan::FFFFFFCFF => FfffffcffImpl::moves(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::moves(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::moves(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::moves(from),
            Plan::RFRFFFCFF => RfrfffcffImpl::moves(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::moves(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::moves(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::moves(from),
            Plan::SFFFFFFFR => SfffffffrImpl::moves(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::moves(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::moves(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::moves(from),
            Plan::WCCCCCCCC => WccccccccImpl::moves(from),
            Plan::WFFFFFFFF => WffffffffImpl::moves(from),
            Plan::WFFFFFFFR => WfffffffrImpl::moves(from),
        }
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
        assert(1_u8 == Plan::CCCCCCCCC.into(), 'Plan: into u8 RFFFRFFFR');
    }

    #[test]
    fn test_u8_into_plan() {
        assert(Plan::CCCCCCCCC == 1_u8.into(), 'Plan: into plan RFFFRFFFR');
    }

    #[test]
    fn test_unknown_u8_into_plan() {
        assert(Plan::None == UNKNOWN_U8.into(), 'Plan: into plan None');
    }
}

