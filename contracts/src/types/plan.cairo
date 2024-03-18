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
use paved::layouts::cfcfccccc::{LayoutImpl as CfcfcccccImpl};
use paved::layouts::cfcfcfcfc::{LayoutImpl as CfcfcfcfcImpl};
use paved::layouts::cfcfcfffc::{LayoutImpl as CfcfcfffcImpl};
use paved::layouts::cffcfcffc::{LayoutImpl as CffcfcffcImpl};
use paved::layouts::cfffcfffc::{LayoutImpl as CfffcfffcImpl};
use paved::layouts::cfffcfrfc::{LayoutImpl as CfffcfrfcImpl};
use paved::layouts::fccfcccfc::{LayoutImpl as FccfcccfcImpl};
use paved::layouts::fccfcfcfc::{LayoutImpl as FccfcfcfcImpl};
use paved::layouts::ffcfcccff::{LayoutImpl as FfcfcccffImpl};
use paved::layouts::ffcfcfcfc::{LayoutImpl as FfcfcfcfcImpl};
use paved::layouts::ffcfffccc::{LayoutImpl as FfcfffcccImpl};
use paved::layouts::ffcfffcfc::{LayoutImpl as FfcfffcfcImpl};
use paved::layouts::ffcfffcff::{LayoutImpl as FfcfffcffImpl};
use paved::layouts::ffcfffffc::{LayoutImpl as FfcfffffcImpl};
use paved::layouts::ffffcccff::{LayoutImpl as FfffcccffImpl};
use paved::layouts::ffffffcff::{LayoutImpl as FfffffcffImpl};
use paved::layouts::rfffffcfr::{LayoutImpl as RfffffcfrImpl};
use paved::layouts::rfffrfcff::{LayoutImpl as RfffrfcffImpl};
use paved::layouts::rfffrfcfr::{LayoutImpl as RfffrfcfrImpl};
use paved::layouts::rfffrfffr::{LayoutImpl as RfffrfffrImpl};
use paved::layouts::rfrfcccff::{LayoutImpl as RfrfcccffImpl};
use paved::layouts::rfrfcccfr::{LayoutImpl as RfrfcccfrImpl};
use paved::layouts::rfrfffccc::{LayoutImpl as RfrfffcccImpl};
use paved::layouts::rfrfffcff::{LayoutImpl as RfrfffcffImpl};
use paved::layouts::rfrfffcfr::{LayoutImpl as RfrfffcfrImpl};
use paved::layouts::rfrfffffr::{LayoutImpl as RfrfffffrImpl};
use paved::layouts::rfrfrfcff::{LayoutImpl as RfrfrfcffImpl};
use paved::layouts::sfffffffr::{LayoutImpl as SfffffffrImpl};
use paved::layouts::sfrfrfcfr::{LayoutImpl as SfrfrfcfrImpl};
use paved::layouts::sfrfrfffr::{LayoutImpl as SfrfrfffrImpl};
use paved::layouts::sfrfrfrfr::{LayoutImpl as SfrfrfrfrImpl};
use paved::layouts::wcccccccc::{LayoutImpl as WccccccccImpl};
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
    CFCFCCCCC,
    CFCFCFCFC,
    CFCFCFFFC,
    CFFCFCFFC,
    CFFFCFFFC,
    CFFFCFRFC,
    FCCFCCCFC,
    FCCFCFCFC,
    FFCFCCCFF,
    FFCFCFCFC,
    FFCFFFCCC,
    FFCFFFCFC,
    FFCFFFCFF,
    FFCFFFFFC,
    FFFFCCCFF,
    FFFFFFCFF,
    RFFFFFCFR,
    RFFFRFCFF,
    RFFFRFCFR,
    RFFFRFFFR,
    RFRFCCCFF,
    RFRFCCCFR,
    RFRFFFCCC,
    RFRFFFCFF,
    RFRFFFCFR,
    RFRFFFFFR,
    RFRFRFCFF,
    SFFFFFFFR,
    SFRFRFCFR,
    SFRFRFFFR,
    SFRFRFRFR,
    WCCCCCCCC,
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
            Plan::CFCFCCCCC => 'CFCFCCCCC',
            Plan::CFCFCFCFC => 'CFCFCFCFC',
            Plan::CFCFCFFFC => 'CFCFCFFFC',
            Plan::CFFCFCFFC => 'CFFCFCFFC',
            Plan::CFFFCFFFC => 'CFFFCFFFC',
            Plan::CFFFCFRFC => 'CFFFCFRFC',
            Plan::FCCFCCCFC => 'FCCFCCCFC',
            Plan::FCCFCFCFC => 'FCCFCFCFC',
            Plan::FFCFCCCFF => 'FFCFCCCFF',
            Plan::FFCFCFCFC => 'FFCFCFCFC',
            Plan::FFCFFFCCC => 'FFCFFFCCC',
            Plan::FFCFFFCFC => 'FFCFFFCFC',
            Plan::FFCFFFCFF => 'FFCFFFCFF',
            Plan::FFCFFFFFC => 'FFCFFFFFC',
            Plan::FFFFCCCFF => 'FFFFCCCFF',
            Plan::FFFFFFCFF => 'FFFFFFCFF',
            Plan::RFFFFFCFR => 'RFFFFFCFR',
            Plan::RFFFRFCFF => 'RFFFRFCFF',
            Plan::RFFFRFCFR => 'RFFFRFCFR',
            Plan::RFFFRFFFR => 'RFFFRFFFR',
            Plan::RFRFCCCFF => 'RFRFCCCFF',
            Plan::RFRFCCCFR => 'RFRFCCCFR',
            Plan::RFRFFFCCC => 'RFRFFFCCC',
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

impl IntoPlanU8 of core::Into<Plan, u8> {
    #[inline(always)]
    fn into(self: Plan) -> u8 {
        match self {
            Plan::None => 0,
            Plan::CCCCCCCCC => 1,
            Plan::CCCCCFFFC => 2,
            Plan::CCCCCFRFC => 3,
            Plan::CFCFCCCCC => 4,
            Plan::CFCFCFCFC => 5,
            Plan::CFCFCFFFC => 6,
            Plan::CFFCFCFFC => 7,
            Plan::CFFFCFFFC => 8,
            Plan::CFFFCFRFC => 9,
            Plan::FCCFCCCFC => 10,
            Plan::FCCFCFCFC => 11,
            Plan::FFCFCCCFF => 12,
            Plan::FFCFCFCFC => 13,
            Plan::FFCFFFCCC => 14,
            Plan::FFCFFFCFC => 15,
            Plan::FFCFFFCFF => 16,
            Plan::FFCFFFFFC => 17,
            Plan::FFFFCCCFF => 18,
            Plan::FFFFFFCFF => 19,
            Plan::RFFFFFCFR => 20,
            Plan::RFFFRFCFF => 21,
            Plan::RFFFRFCFR => 22,
            Plan::RFFFRFFFR => 23,
            Plan::RFRFCCCFF => 24,
            Plan::RFRFCCCFR => 25,
            Plan::RFRFFFCCC => 26,
            Plan::RFRFFFCFF => 27,
            Plan::RFRFFFCFR => 28,
            Plan::RFRFFFFFR => 29,
            Plan::RFRFRFCFF => 30,
            Plan::SFFFFFFFR => 31,
            Plan::SFRFRFCFR => 32,
            Plan::SFRFRFFFR => 33,
            Plan::SFRFRFRFR => 34,
            Plan::WCCCCCCCC => 35,
            Plan::WFFFFFFFF => 36,
            Plan::WFFFFFFFR => 37,
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
            4 => Plan::CFCFCCCCC,
            5 => Plan::CFCFCFCFC,
            6 => Plan::CFCFCFFFC,
            7 => Plan::CFFCFCFFC,
            8 => Plan::CFFFCFFFC,
            9 => Plan::CFFFCFRFC,
            10 => Plan::FCCFCCCFC,
            11 => Plan::FCCFCFCFC,
            12 => Plan::FFCFCCCFF,
            13 => Plan::FFCFCFCFC,
            14 => Plan::FFCFFFCCC,
            15 => Plan::FFCFFFCFC,
            16 => Plan::FFCFFFCFF,
            17 => Plan::FFCFFFFFC,
            18 => Plan::FFFFCCCFF,
            19 => Plan::FFFFFFCFF,
            20 => Plan::RFFFFFCFR,
            21 => Plan::RFFFRFCFF,
            22 => Plan::RFFFRFCFR,
            23 => Plan::RFFFRFFFR,
            24 => Plan::RFRFCCCFF,
            25 => Plan::RFRFCCCFR,
            26 => Plan::RFRFFFCCC,
            27 => Plan::RFRFFFCFF,
            28 => Plan::RFRFFFCFR,
            29 => Plan::RFRFFFFFR,
            30 => Plan::RFRFRFCFF,
            31 => Plan::SFFFFFFFR,
            32 => Plan::SFRFRFCFR,
            33 => Plan::SFRFRFFFR,
            34 => Plan::SFRFRFRFR,
            35 => Plan::WCCCCCCCC,
            36 => Plan::WFFFFFFFF,
            37 => Plan::WFFFFFFFR,
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
            Plan::CFCFCCCCC => CfcfcccccImpl::starts(),
            Plan::CFCFCFCFC => CfcfcfcfcImpl::starts(),
            Plan::CFCFCFFFC => CfcfcfffcImpl::starts(),
            Plan::CFFCFCFFC => CffcfcffcImpl::starts(),
            Plan::CFFFCFFFC => CfffcfffcImpl::starts(),
            Plan::CFFFCFRFC => CfffcfrfcImpl::starts(),
            Plan::FCCFCCCFC => FccfcccfcImpl::starts(),
            Plan::FCCFCFCFC => FccfcfcfcImpl::starts(),
            Plan::FFCFCCCFF => FfcfcccffImpl::starts(),
            Plan::FFCFCFCFC => FfcfcfcfcImpl::starts(),
            Plan::FFCFFFCCC => FfcfffcccImpl::starts(),
            Plan::FFCFFFCFC => FfcfffcfcImpl::starts(),
            Plan::FFCFFFCFF => FfcfffcffImpl::starts(),
            Plan::FFCFFFFFC => FfcfffffcImpl::starts(),
            Plan::FFFFCCCFF => FfffcccffImpl::starts(),
            Plan::FFFFFFCFF => FfffffcffImpl::starts(),
            Plan::RFFFFFCFR => RfffffcfrImpl::starts(),
            Plan::RFFFRFCFF => RfffrfcffImpl::starts(),
            Plan::RFFFRFCFR => RfffrfcfrImpl::starts(),
            Plan::RFFFRFFFR => RfffrfffrImpl::starts(),
            Plan::RFRFCCCFF => RfrfcccffImpl::starts(),
            Plan::RFRFCCCFR => RfrfcccfrImpl::starts(),
            Plan::RFRFFFCCC => RfrfffcccImpl::starts(),
            Plan::RFRFFFCFF => RfrfffcffImpl::starts(),
            Plan::RFRFFFCFR => RfrfffcfrImpl::starts(),
            Plan::RFRFFFFFR => RfrfffffrImpl::starts(),
            Plan::RFRFRFCFF => RfrfrfcffImpl::starts(),
            Plan::SFFFFFFFR => SfffffffrImpl::starts(),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::starts(),
            Plan::SFRFRFFFR => SfrfrfffrImpl::starts(),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::starts(),
            Plan::WCCCCCCCC => WccccccccImpl::starts(),
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
            Plan::CFCFCCCCC => Spot::None,
            Plan::CFCFCFCFC => Spot::None,
            Plan::CFCFCFFFC => Spot::None,
            Plan::CFFCFCFFC => Spot::None,
            Plan::CFFFCFFFC => Spot::None,
            Plan::CFFFCFRFC => Spot::None,
            Plan::FCCFCCCFC => Spot::None,
            Plan::FCCFCFCFC => Spot::None,
            Plan::FFCFCCCFF => Spot::None,
            Plan::FFCFCFCFC => Spot::None,
            Plan::FFCFFFCCC => Spot::None,
            Plan::FFCFFFCFC => Spot::None,
            Plan::FFCFFFCFF => Spot::None,
            Plan::FFCFFFFFC => Spot::None,
            Plan::FFFFCCCFF => Spot::None,
            Plan::FFFFFFCFF => Spot::None,
            Plan::RFFFFFCFR => Spot::None,
            Plan::RFFFRFCFF => Spot::None,
            Plan::RFFFRFCFR => Spot::None,
            Plan::RFFFRFFFR => Spot::None,
            Plan::RFRFCCCFF => Spot::None,
            Plan::RFRFCCCFR => Spot::None,
            Plan::RFRFFFCCC => Spot::None,
            Plan::RFRFFFCFF => Spot::None,
            Plan::RFRFFFCFR => Spot::None,
            Plan::RFRFFFFFR => Spot::None,
            Plan::RFRFRFCFF => Spot::None,
            Plan::SFFFFFFFR => Spot::None,
            Plan::SFRFRFCFR => Spot::None,
            Plan::SFRFRFFFR => Spot::None,
            Plan::SFRFRFRFR => Spot::None,
            Plan::WCCCCCCCC => Spot::Center,
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
            Plan::CFCFCCCCC => CfcfcccccImpl::moves(from),
            Plan::CFCFCFCFC => CfcfcfcfcImpl::moves(from),
            Plan::CFCFCFFFC => CfcfcfffcImpl::moves(from),
            Plan::CFFCFCFFC => CffcfcffcImpl::moves(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::moves(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::moves(from),
            Plan::FCCFCCCFC => FccfcccfcImpl::moves(from),
            Plan::FCCFCFCFC => FccfcfcfcImpl::moves(from),
            Plan::FFCFCCCFF => FfcfcccffImpl::moves(from),
            Plan::FFCFCFCFC => FfcfcfcfcImpl::moves(from),
            Plan::FFCFFFCCC => FfcfffcccImpl::moves(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::moves(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::moves(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::moves(from),
            Plan::FFFFCCCFF => FfffcccffImpl::moves(from),
            Plan::FFFFFFCFF => FfffffcffImpl::moves(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::moves(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::moves(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::moves(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::moves(from),
            Plan::RFRFCCCFF => RfrfcccffImpl::moves(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::moves(from),
            Plan::RFRFFFCCC => RfrfffcccImpl::moves(from),
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

    #[inline(always)]
    fn area(self: Plan, from: Spot) -> Area {
        match self {
            Plan::None => Area::None,
            Plan::CCCCCCCCC => CccccccccImpl::area(from),
            Plan::CCCCCFFFC => CccccfffcImpl::area(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::area(from),
            Plan::CFCFCCCCC => CfcfcccccImpl::area(from),
            Plan::CFCFCFCFC => CfcfcfcfcImpl::area(from),
            Plan::CFCFCFFFC => CfcfcfffcImpl::area(from),
            Plan::CFFCFCFFC => CffcfcffcImpl::area(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::area(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::area(from),
            Plan::FCCFCCCFC => FccfcccfcImpl::area(from),
            Plan::FCCFCFCFC => FccfcfcfcImpl::area(from),
            Plan::FFCFCCCFF => FfcfcccffImpl::area(from),
            Plan::FFCFCFCFC => FfcfcfcfcImpl::area(from),
            Plan::FFCFFFCCC => FfcfffcccImpl::area(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::area(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::area(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::area(from),
            Plan::FFFFCCCFF => FfffcccffImpl::area(from),
            Plan::FFFFFFCFF => FfffffcffImpl::area(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::area(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::area(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::area(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::area(from),
            Plan::RFRFCCCFF => RfrfcccffImpl::area(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::area(from),
            Plan::RFRFFFCCC => RfrfffcccImpl::area(from),
            Plan::RFRFFFCFF => RfrfffcffImpl::area(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::area(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::area(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::area(from),
            Plan::SFFFFFFFR => SfffffffrImpl::area(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::area(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::area(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::area(from),
            Plan::WCCCCCCCC => WccccccccImpl::area(from),
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
            Plan::CFCFCCCCC => CfcfcccccImpl::adjacent_roads(from),
            Plan::CFCFCFCFC => CfcfcfcfcImpl::adjacent_roads(from),
            Plan::CFCFCFFFC => CfcfcfffcImpl::adjacent_roads(from),
            Plan::CFFCFCFFC => CffcfcffcImpl::adjacent_roads(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::adjacent_roads(from),
            Plan::FCCFCCCFC => FccfcccfcImpl::adjacent_roads(from),
            Plan::FCCFCFCFC => FccfcfcfcImpl::adjacent_roads(from),
            Plan::FFCFCCCFF => FfcfcccffImpl::adjacent_roads(from),
            Plan::FFCFCFCFC => FfcfcfcfcImpl::adjacent_roads(from),
            Plan::FFCFFFCCC => FfcfffcccImpl::adjacent_roads(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::adjacent_roads(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_roads(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_roads(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_roads(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_roads(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::adjacent_roads(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::adjacent_roads(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_roads(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_roads(from),
            Plan::RFRFCCCFF => RfrfcccffImpl::adjacent_roads(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_roads(from),
            Plan::RFRFFFCCC => RfrfffcccImpl::adjacent_roads(from),
            Plan::RFRFFFCFF => RfrfffcffImpl::adjacent_roads(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::adjacent_roads(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::adjacent_roads(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::adjacent_roads(from),
            Plan::SFFFFFFFR => SfffffffrImpl::adjacent_roads(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::adjacent_roads(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::adjacent_roads(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::adjacent_roads(from),
            Plan::WCCCCCCCC => WccccccccImpl::adjacent_roads(from),
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
            Plan::CFCFCCCCC => CfcfcccccImpl::adjacent_cities(from),
            Plan::CFCFCFCFC => CfcfcfcfcImpl::adjacent_cities(from),
            Plan::CFCFCFFFC => CfcfcfffcImpl::adjacent_cities(from),
            Plan::CFFCFCFFC => CffcfcffcImpl::adjacent_cities(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::adjacent_cities(from),
            Plan::FCCFCCCFC => FccfcccfcImpl::adjacent_cities(from),
            Plan::FCCFCFCFC => FccfcfcfcImpl::adjacent_cities(from),
            Plan::FFCFCCCFF => FfcfcccffImpl::adjacent_cities(from),
            Plan::FFCFCFCFC => FfcfcfcfcImpl::adjacent_cities(from),
            Plan::FFCFFFCCC => FfcfffcccImpl::adjacent_cities(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::adjacent_cities(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_cities(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_cities(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_cities(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_cities(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::adjacent_cities(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::adjacent_cities(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_cities(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_cities(from),
            Plan::RFRFCCCFF => RfrfcccffImpl::adjacent_cities(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_cities(from),
            Plan::RFRFFFCCC => RfrfffcccImpl::adjacent_cities(from),
            Plan::RFRFFFCFF => RfrfffcffImpl::adjacent_cities(from),
            Plan::RFRFFFCFR => RfrfffcfrImpl::adjacent_cities(from),
            Plan::RFRFFFFFR => RfrfffffrImpl::adjacent_cities(from),
            Plan::RFRFRFCFF => RfrfrfcffImpl::adjacent_cities(from),
            Plan::SFFFFFFFR => SfffffffrImpl::adjacent_cities(from),
            Plan::SFRFRFCFR => SfrfrfcfrImpl::adjacent_cities(from),
            Plan::SFRFRFFFR => SfrfrfffrImpl::adjacent_cities(from),
            Plan::SFRFRFRFR => SfrfrfrfrImpl::adjacent_cities(from),
            Plan::WCCCCCCCC => WccccccccImpl::adjacent_cities(from),
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

