// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::constants::{MASK_8, TWO_POW_8, TOTAL_TILE_COUNT};
use paved::types::category::Category;
use paved::types::spot::Spot;
use paved::types::direction::{Direction, DirectionImpl};
use paved::types::orientation::Orientation;
use paved::types::move::Move;
use paved::types::area::Area;

use paved::layouts::ccccccccc::{LayoutImpl as CccccccccImpl};
use paved::layouts::cccccfffc::{LayoutImpl as CccccfffcImpl};
use paved::layouts::cccccfrfc::{LayoutImpl as CccccfrfcImpl};
use paved::layouts::cfffcfffc::{LayoutImpl as CfffcfffcImpl};
use paved::layouts::ffcfffcff::{LayoutImpl as FfcfffcffImpl};
use paved::layouts::ffcfffffc::{LayoutImpl as FfcfffffcImpl};
use paved::layouts::ffffcccff::{LayoutImpl as FfffcccffImpl};
use paved::layouts::ffffffcff::{LayoutImpl as FfffffcffImpl};
use paved::layouts::rfffrfcfr::{LayoutImpl as RfffrfcfrImpl};
use paved::layouts::rfffrfffr::{LayoutImpl as RfffrfffrImpl};
use paved::layouts::rfrfcccfr::{LayoutImpl as RfrfcccfrImpl};
use paved::layouts::rfrfffcfr::{LayoutImpl as RfrfffcfrImpl};
use paved::layouts::rfrfffffr::{LayoutImpl as RfrfffffrImpl};
use paved::layouts::rfrfrfcff::{LayoutImpl as RfrfrfcffImpl};
use paved::layouts::sfrfrfcfr::{LayoutImpl as SfrfrfcfrImpl};
use paved::layouts::sfrfrfffr::{LayoutImpl as SfrfrfffrImpl};
use paved::layouts::sfrfrfrfr::{LayoutImpl as SfrfrfrfrImpl};
use paved::layouts::wffffffff::{LayoutImpl as WffffffffImpl};
use paved::layouts::wfffffffr::{LayoutImpl as WfffffffrImpl};

// Constants

const NONE: felt252 = 0;

mod errors {
    const UNPACK_FAILED: felt252 = 'Layout: Unpack failed';
}

// Center, NW, N, NE, E, SE, S, SW, W
#[derive(Copy, Drop, Serde, Introspect)]
enum Plan {
    None,
    CCCCCCCCC,
    CCCCCFFFC,
    CCCCCFRFC,
    CFFFCFFFC,
    FFCFFFCFF,
    FFCFFFFFC,
    FFFFCCCFF,
    FFFFFFCFF,
    RFFFRFCFR,
    RFFFRFFFR,
    RFRFCCCFR,
    RFRFFFCFR,
    RFRFFFFFR,
    RFRFRFCFF,
    SFRFRFCFR,
    SFRFRFFFR,
    SFRFRFRFR,
    WFFFFFFFF,
    WFFFFFFFR,
}

impl IntoPlanFelt252 of core::Into<Plan, felt252> {
    #[inline(always)]
    fn into(self: Plan) -> felt252 {
        match self {
            Plan::None => NONE,
            Plan::CCCCCCCCC => 'CCCCCCCCC',
            Plan::CCCCCFFFC => 'CCCCCFFFC',
            Plan::CCCCCFRFC => 'CCCCCFRFC',
            Plan::CFFFCFFFC => 'CFFFCFFFC',
            Plan::FFCFFFCFF => 'FFCFFFCFF',
            Plan::FFCFFFFFC => 'FFCFFFFFC',
            Plan::FFFFCCCFF => 'FFFFCCCFF',
            Plan::FFFFFFCFF => 'FFFFFFCFF',
            Plan::RFFFRFCFR => 'RFFFRFCFR',
            Plan::RFFFRFFFR => 'RFFFRFFFR',
            Plan::RFRFCCCFR => 'RFRFCCCFR',
            Plan::RFRFFFCFR => 'RFRFFFCFR',
            Plan::RFRFFFFFR => 'RFRFFFFFR',
            Plan::RFRFRFCFF => 'RFRFRFCFF',
            Plan::SFRFRFCFR => 'SFRFRFCFR',
            Plan::SFRFRFFFR => 'SFRFRFFFR',
            Plan::SFRFRFRFR => 'SFRFRFRFR',
            Plan::WFFFFFFFF => 'WFFFFFFFF',
            Plan::WFFFFFFFR => 'WFFFFFFFR',
        }
    }
}

impl IntoPlanU8 of core::Into<Plan, u8> {
    #[inline(always)]
    fn into(self: Plan) -> u8 {
        match self {
            Plan::None => 0,
            Plan::CCCCCCCCC => 1,
            Plan::CCCCCFFFC => 2,
            Plan::CCCCCFRFC => 3,
            Plan::CFFFCFFFC => 4,
            Plan::FFCFFFCFF => 5,
            Plan::FFCFFFFFC => 6,
            Plan::FFFFCCCFF => 7,
            Plan::FFFFFFCFF => 8,
            Plan::RFFFRFCFR => 9,
            Plan::RFFFRFFFR => 10,
            Plan::RFRFCCCFR => 11,
            Plan::RFRFFFCFR => 12,
            Plan::RFRFFFFFR => 13,
            Plan::RFRFRFCFF => 14,
            Plan::SFRFRFCFR => 15,
            Plan::SFRFRFFFR => 16,
            Plan::SFRFRFRFR => 17,
            Plan::WFFFFFFFF => 18,
            Plan::WFFFFFFFR => 19,
        }
    }
}

impl IntoPlan of core::Into<u8, Plan> {
    #[inline(always)]
    fn into(self: u8) -> Plan {
        let plan: felt252 = self.into();
        match plan {
            0 => Plan::None,
            1 => Plan::CCCCCCCCC,
            2 => Plan::CCCCCFFFC,
            3 => Plan::CCCCCFRFC,
            4 => Plan::CFFFCFFFC,
            5 => Plan::FFCFFFCFF,
            6 => Plan::FFCFFFFFC,
            7 => Plan::FFFFCCCFF,
            8 => Plan::FFFFFFCFF,
            9 => Plan::RFFFRFCFR,
            10 => Plan::RFFFRFFFR,
            11 => Plan::RFRFCCCFR,
            12 => Plan::RFRFFFCFR,
            13 => Plan::RFRFFFFFR,
            14 => Plan::RFRFRFCFF,
            15 => Plan::SFRFRFCFR,
            16 => Plan::SFRFRFFFR,
            17 => Plan::SFRFRFRFR,
            18 => Plan::WFFFFFFFF,
            19 => Plan::WFFFFFFFR,
            _ => Plan::None,
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
    fn starts(self: Plan) -> Array<Spot> {
        match self {
            Plan::None => array![],
            Plan::CCCCCCCCC => CccccccccImpl::starts(),
            Plan::CCCCCFFFC => CccccfffcImpl::starts(),
            Plan::CCCCCFRFC => CccccfrfcImpl::starts(),
            Plan::CFFFCFFFC => CfffcfffcImpl::starts(),
            Plan::FFCFFFCFF => FfcfffcffImpl::starts(),
            Plan::FFCFFFFFC => FfcfffffcImpl::starts(),
            Plan::FFFFCCCFF => FfffcccffImpl::starts(),
            Plan::FFFFFFCFF => FfffffcffImpl::starts(),
            Plan::RFFFRFCFR => RfffrfcfrImpl::starts(),
            Plan::RFFFRFFFR => RfffrfffrImpl::starts(),
            Plan::RFRFCCCFR => RfrfcccfrImpl::starts(),
            Plan::RFRFFFCFR => RfrfffcfrImpl::starts(),
            Plan::RFRFFFFFR => RfrfffffrImpl::starts(),
            Plan::RFRFRFCFF => RfrfrfcffImpl::starts(),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::starts(),
            Plan::SFRFRFFFR => SfrfrfffrImpl::starts(),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::starts(),
            Plan::WFFFFFFFF => WffffffffImpl::starts(),
            Plan::WFFFFFFFR => WfffffffrImpl::starts(),
        }
    }

    #[inline(always)]
    fn wonder(self: Plan) -> Spot {
        match self {
            Plan::None => Spot::None,
            Plan::CCCCCCCCC => Spot::None,
            Plan::CCCCCFFFC => Spot::None,
            Plan::CCCCCFRFC => Spot::None,
            Plan::CFFFCFFFC => Spot::None,
            Plan::FFCFFFCFF => Spot::None,
            Plan::FFCFFFFFC => Spot::None,
            Plan::FFFFCCCFF => Spot::None,
            Plan::FFFFFFCFF => Spot::None,
            Plan::RFFFRFCFR => Spot::None,
            Plan::RFFFRFFFR => Spot::None,
            Plan::RFRFCCCFR => Spot::None,
            Plan::RFRFFFCFR => Spot::None,
            Plan::RFRFFFFFR => Spot::None,
            Plan::RFRFRFCFF => Spot::None,
            Plan::SFRFRFCFR => Spot::None,
            Plan::SFRFRFFFR => Spot::None,
            Plan::SFRFRFRFR => Spot::None,
            Plan::WFFFFFFFF => Spot::Center,
            Plan::WFFFFFFFR => Spot::Center,
        }
    }

    #[inline(always)]
    fn moves(self: Plan, from: Spot) -> Array<Move> {
        match self {
            Plan::None => array![],
            Plan::CCCCCCCCC => CccccccccImpl::moves(from),
            Plan::CCCCCFFFC => CccccfffcImpl::moves(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::moves(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::moves(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::moves(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::moves(from),
            Plan::FFFFCCCFF => FfffcccffImpl::moves(from),
            Plan::FFFFFFCFF => FfffffcffImpl::moves(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::moves(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::moves(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::moves(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::moves(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::moves(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::moves(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::moves(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::moves(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::moves(from),
            Plan::WFFFFFFFF => WffffffffImpl::moves(from),
            Plan::WFFFFFFFR => WfffffffrImpl::moves(from),
        }
    }

    #[inline(always)]
    fn area(self: Plan, from: Spot) -> Area {
        match self {
            Plan::None => Area::None,
            Plan::CCCCCCCCC => CccccccccImpl::area(from),
            Plan::CCCCCFFFC => CccccfffcImpl::area(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::area(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::area(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::area(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::area(from),
            Plan::FFFFCCCFF => FfffcccffImpl::area(from),
            Plan::FFFFFFCFF => FfffffcffImpl::area(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::area(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::area(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::area(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::area(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::area(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::area(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::area(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::area(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::area(from),
            Plan::WFFFFFFFF => WffffffffImpl::area(from),
            Plan::WFFFFFFFR => WfffffffrImpl::area(from),
        }
    }

    #[inline(always)]
    fn adjacent_roads(self: Plan, from: Spot) -> Array<Spot> {
        match self {
            Plan::None => ArrayTrait::new(),
            Plan::CCCCCCCCC => CccccccccImpl::adjacent_roads(from),
            Plan::CCCCCFFFC => CccccfffcImpl::adjacent_roads(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::adjacent_roads(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_roads(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_roads(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_roads(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_roads(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_roads(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_roads(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_roads(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::adjacent_roads(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::adjacent_roads(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::adjacent_roads(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::adjacent_roads(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::adjacent_roads(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::adjacent_roads(from),
            Plan::WFFFFFFFF => WffffffffImpl::adjacent_roads(from),
            Plan::WFFFFFFFR => WfffffffrImpl::adjacent_roads(from),
        }
    }

    #[inline(always)]
    fn adjacent_cities(self: Plan, from: Spot) -> Array<Spot> {
        match self {
            Plan::None => ArrayTrait::new(),
            Plan::CCCCCCCCC => CccccccccImpl::adjacent_cities(from),
            Plan::CCCCCFFFC => CccccfffcImpl::adjacent_cities(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::adjacent_cities(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_cities(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_cities(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_cities(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_cities(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_cities(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_cities(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_cities(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::adjacent_cities(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::adjacent_cities(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::adjacent_cities(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::adjacent_cities(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::adjacent_cities(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::adjacent_cities(from),
            Plan::WFFFFFFFF => WffffffffImpl::adjacent_cities(from),
            Plan::WFFFFFFFR => WfffffffrImpl::adjacent_cities(from),
        }
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Plan, Category, NONE};

    // Constants

    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_plan_into_felt() {
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

