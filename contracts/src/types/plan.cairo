// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{MASK_8, TWO_POW_8, TOTAL_TILE_COUNT};
use stolsli::types::category::Category;
use stolsli::types::spot::Spot;
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::move::Move;
use stolsli::types::area::Area;

use stolsli::layouts::ccccccccc::{LayoutImpl as CccccccccImpl};
use stolsli::layouts::cccccfffc::{LayoutImpl as CccccfffcImpl};
use stolsli::layouts::cccccfrfc::{LayoutImpl as CccccfrfcImpl};
use stolsli::layouts::cfcfccccc::{LayoutImpl as CfcfcccccImpl};
use stolsli::layouts::cfcfcfcfc::{LayoutImpl as CfcfcfcfcImpl};
use stolsli::layouts::cfcfcfffc::{LayoutImpl as CfcfcfffcImpl};
use stolsli::layouts::cffcfcffc::{LayoutImpl as CffcfcffcImpl};
use stolsli::layouts::cfffcfffc::{LayoutImpl as CfffcfffcImpl};
use stolsli::layouts::cfffcfrfc::{LayoutImpl as CfffcfrfcImpl};
use stolsli::layouts::fccfcccfc::{LayoutImpl as FccfcccfcImpl};
use stolsli::layouts::fccfcfcfc::{LayoutImpl as FccfcfcfcImpl};
use stolsli::layouts::ffcfcccff::{LayoutImpl as FfcfcccffImpl};
use stolsli::layouts::ffcfcfcfc::{LayoutImpl as FfcfcfcfcImpl};
use stolsli::layouts::ffcfffccc::{LayoutImpl as FfcfffcccImpl};
use stolsli::layouts::ffcfffcfc::{LayoutImpl as FfcfffcfcImpl};
use stolsli::layouts::ffcfffcff::{LayoutImpl as FfcfffcffImpl};
use stolsli::layouts::ffcfffffc::{LayoutImpl as FfcfffffcImpl};
use stolsli::layouts::ffffcccff::{LayoutImpl as FfffcccffImpl};
use stolsli::layouts::ffffffcff::{LayoutImpl as FfffffcffImpl};
use stolsli::layouts::rfffffcfr::{LayoutImpl as RfffffcfrImpl};
use stolsli::layouts::rfffrfcff::{LayoutImpl as RfffrfcffImpl};
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
    CCCCCCCCC, // 1 pieces update
    CCCCCFFFC, // 4 pieces
    CCCCCFRFC, // 3 pieces
    CFCFCCCCC, // 1 pieces new
    CFCFCFCFC, // 1 pieces new
    CFCFCFFFC, // 1 pieces new
    CFFCFCFFC, // 1 pieces new
    CFFFCFFFC, // 3 pieces
    CFFFCFRFC, // 3 pieces update
    FCCFCCCFC, // 1 pieces new
    FCCFCFCFC, // 1 pieces new
    FFCFCCCFF, // 1 pieces new
    FFCFCFCFC, // 1 pieces new
    FFCFFFCCC, // 1 pieces new
    FFCFFFCFC, // 1 pieces update
    FFCFFFCFF, // 3 pieces
    FFCFFFFFC, // 2 pieces
    FFFFCCCFF, // 5 pieces
    FFFFFFCFF, // 5 pieces
    RFFFFFCFR, // 2 pieces new
    RFFFRFCFF, // 2 pieces new
    RFFFRFCFR, // 4 pieces
    RFFFRFFFR, // 9 pieces update
    RFRFCCCFR, // 5 pieces
    RFRFFFCFF, // 2 pieces update
    RFRFFFCFR, // 3 pieces
    RFRFFFFFR, // 10 pieces update
    RFRFRFCFF, // 3 pieces
    SFFFFFFFR, // 2 pieces update
    SFRFRFCFR, // 3 pieces
    SFRFRFFFR, // 5 pieces update
    SFRFRFRFR, // 2 pieces update
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
            Plan::RFRFCCCFR => 24,
            Plan::RFRFFFCFF => 25,
            Plan::RFRFFFCFR => 26,
            Plan::RFRFFFFFR => 27,
            Plan::RFRFRFCFF => 28,
            Plan::SFFFFFFFR => 29,
            Plan::SFRFRFCFR => 30,
            Plan::SFRFRFFFR => 31,
            Plan::SFRFRFRFR => 32,
            Plan::WCCCCCCCC => 33,
            Plan::WFFFFFFFF => 34,
            Plan::WFFFFFFFR => 35,
        }
    }
}

impl IntoU8Plan of Into<u8, Plan> {
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
            24 => Plan::RFRFCCCFR,
            25 => Plan::RFRFFFCFF,
            26 => Plan::RFRFFFCFR,
            27 => Plan::RFRFFFFFR,
            28 => Plan::RFRFRFCFF,
            29 => Plan::SFFFFFFFR,
            30 => Plan::SFRFRFCFR,
            31 => Plan::SFRFRFFFR,
            32 => Plan::SFRFRFRFR,
            33 => Plan::WCCCCCCCC,
            34 => Plan::WFFFFFFFF,
            35 => Plan::WFFFFFFFR,
            _ => Plan::None,
        }
    }
}

impl IntoU32Plan of Into<u32, Plan> {
    #[inline(always)]
    fn into(self: u32) -> Plan {
        let id = self % TOTAL_TILE_COUNT.into();
        if id < 1 {
            Plan::CCCCCCCCC
        } else if id < 5 {
            Plan::CCCCCFFFC
        } else if id < 8 {
            Plan::CCCCCFRFC
        } else if id < 9 {
            Plan::CFCFCCCCC
        } else if id < 10 {
            Plan::CFCFCFCFC
        } else if id < 11 {
            Plan::CFCFCFFFC
        } else if id < 12 {
            Plan::CFFCFCFFC
        } else if id < 15 {
            Plan::CFFFCFFFC
        } else if id < 18 {
            Plan::CFFFCFRFC
        } else if id < 19 {
            Plan::FCCFCCCFC
        } else if id < 20 {
            Plan::FCCFCFCFC
        } else if id < 21 {
            Plan::FFCFCCCFF
        } else if id < 22 {
            Plan::FFCFCFCFC
        } else if id < 23 {
            Plan::FFCFFFCCC
        } else if id < 24 {
            Plan::FFCFFFCFC
        } else if id < 27 {
            Plan::FFCFFFCFF
        } else if id < 29 {
            Plan::FFCFFFFFC
        } else if id < 34 {
            Plan::FFFFCCCFF
        } else if id < 39 {
            Plan::FFFFFFCFF
        } else if id < 41 {
            Plan::RFFFFFCFR
        } else if id < 43 {
            Plan::RFFFRFCFF
        } else if id < 47 {
            Plan::RFFFRFCFR
        } else if id < 56 {
            Plan::RFFFRFFFR
        } else if id < 61 {
            Plan::RFRFCCCFR
        } else if id < 63 {
            Plan::RFRFFFCFF
        } else if id < 66 {
            Plan::RFRFFFCFR
        } else if id < 76 {
            Plan::RFRFFFFFR
        } else if id < 79 {
            Plan::RFRFRFCFF
        } else if id < 81 {
            Plan::SFFFFFFFR
        } else if id < 84 {
            Plan::SFRFRFCFR
        } else if id < 89 {
            Plan::SFRFRFFFR
        } else if id < 91 {
            Plan::SFRFRFRFR
        } else if id < 92 {
            Plan::WCCCCCCCC
        } else if id < 96 {
            Plan::WFFFFFFFF
        } else if id < 98 {
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
    fn starts(self: Plan) -> Array<Spot> {
        match self {
            Plan::None => array![],
            Plan::CCCCCCCCC => CccccccccImpl::starts(),
            Plan::CCCCCFFFC => CccccfffcImpl::starts(),
            Plan::CCCCCFRFC => CccccfrfcImpl::starts(),
            Plan::CFCFCCCCC => CfffcfffcImpl::starts(),
            Plan::CFCFCFCFC => CfffcfffcImpl::starts(),
            Plan::CFCFCFFFC => CfffcfffcImpl::starts(),
            Plan::CFFCFCFFC => CfffcfffcImpl::starts(),
            Plan::CFFFCFFFC => CfffcfffcImpl::starts(),
            Plan::CFFFCFRFC => CfffcfrfcImpl::starts(),
            Plan::FCCFCCCFC => FfffcccffImpl::starts(),
            Plan::FCCFCFCFC => FfffcccffImpl::starts(),
            Plan::FFCFCCCFF => FfffffcffImpl::starts(),
            Plan::FFCFCFCFC => FfffffcffImpl::starts(),
            Plan::FFCFFFCCC => FfffffcffImpl::starts(),
            Plan::FFCFFFCFC => FfcfffcfcImpl::starts(),
            Plan::FFCFFFCFF => FfcfffcffImpl::starts(),
            Plan::FFCFFFFFC => FfcfffffcImpl::starts(),
            Plan::FFFFCCCFF => FfffcccffImpl::starts(),
            Plan::FFFFFFCFF => FfffffcffImpl::starts(),
            Plan::RFFFFFCFR => RfffffcfrImpl::starts(),
            Plan::RFFFRFCFF => RfffrfcffImpl::starts(),
            Plan::RFFFRFCFR => RfffrfcfrImpl::starts(),
            Plan::RFFFRFFFR => RfffrfffrImpl::starts(),
            Plan::RFRFCCCFR => RfrfcccfrImpl::starts(),
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
            Plan::RFRFCCCFR => Spot::None,
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
            Plan::CFCFCCCCC => CfffcfffcImpl::moves(from),
            Plan::CFCFCFCFC => CfffcfffcImpl::moves(from),
            Plan::CFCFCFFFC => CfffcfffcImpl::moves(from),
            Plan::CFFCFCFFC => CfffcfffcImpl::moves(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::moves(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::moves(from),
            Plan::FCCFCCCFC => FfffcccffImpl::moves(from),
            Plan::FCCFCFCFC => FfffcccffImpl::moves(from),
            Plan::FFCFCCCFF => FfffffcffImpl::moves(from),
            Plan::FFCFCFCFC => FfffffcffImpl::moves(from),
            Plan::FFCFFFCCC => FfffffcffImpl::moves(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::moves(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::moves(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::moves(from),
            Plan::FFFFCCCFF => FfffcccffImpl::moves(from),
            Plan::FFFFFFCFF => FfffffcffImpl::moves(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::moves(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::moves(from),
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

    #[inline(always)]
    fn area(self: Plan, from: Spot) -> Area {
        match self {
            Plan::None => Area::None,
            Plan::CCCCCCCCC => CccccccccImpl::area(from),
            Plan::CCCCCFFFC => CccccfffcImpl::area(from),
            Plan::CCCCCFRFC => CccccfrfcImpl::area(from),
            Plan::CFCFCCCCC => CfffcfffcImpl::area(from),
            Plan::CFCFCFCFC => CfffcfffcImpl::area(from),
            Plan::CFCFCFFFC => CfffcfffcImpl::area(from),
            Plan::CFFCFCFFC => CfffcfffcImpl::area(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::area(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::area(from),
            Plan::FCCFCCCFC => FfffcccffImpl::area(from),
            Plan::FCCFCFCFC => FfffcccffImpl::area(from),
            Plan::FFCFCCCFF => FfffffcffImpl::area(from),
            Plan::FFCFCFCFC => FfffffcffImpl::area(from),
            Plan::FFCFFFCCC => FfffffcffImpl::area(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::area(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::area(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::area(from),
            Plan::FFFFCCCFF => FfffcccffImpl::area(from),
            Plan::FFFFFFCFF => FfffffcffImpl::area(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::area(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::area(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::area(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::area(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::area(from),
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
            Plan::CFCFCCCCC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFCFCFCFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFCFCFFFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFFCFCFFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_roads(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::adjacent_roads(from),
            Plan::FCCFCCCFC => FfffcccffImpl::adjacent_roads(from),
            Plan::FCCFCFCFC => FfffcccffImpl::adjacent_roads(from),
            Plan::FFCFCCCFF => FfffffcffImpl::adjacent_roads(from),
            Plan::FFCFCFCFC => FfffffcffImpl::adjacent_roads(from),
            Plan::FFCFFFCCC => FfffffcffImpl::adjacent_roads(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::adjacent_roads(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_roads(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_roads(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_roads(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_roads(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::adjacent_roads(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::adjacent_roads(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_roads(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_roads(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_roads(from),
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
            Plan::CFCFCCCCC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFCFCFCFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFCFCFFFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFFCFCFFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFFFCFFFC => CfffcfffcImpl::adjacent_cities(from),
            Plan::CFFFCFRFC => CfffcfrfcImpl::adjacent_cities(from),
            Plan::FCCFCCCFC => FfffcccffImpl::adjacent_cities(from),
            Plan::FCCFCFCFC => FfffcccffImpl::adjacent_cities(from),
            Plan::FFCFCCCFF => FfffffcffImpl::adjacent_cities(from),
            Plan::FFCFCFCFC => FfffffcffImpl::adjacent_cities(from),
            Plan::FFCFFFCCC => FfffffcffImpl::adjacent_cities(from),
            Plan::FFCFFFCFC => FfcfffcfcImpl::adjacent_cities(from),
            Plan::FFCFFFCFF => FfcfffcffImpl::adjacent_cities(from),
            Plan::FFCFFFFFC => FfcfffffcImpl::adjacent_cities(from),
            Plan::FFFFCCCFF => FfffcccffImpl::adjacent_cities(from),
            Plan::FFFFFFCFF => FfffffcffImpl::adjacent_cities(from),
            Plan::RFFFFFCFR => RfffffcfrImpl::adjacent_cities(from),
            Plan::RFFFRFCFF => RfffrfcffImpl::adjacent_cities(from),
            Plan::RFFFRFCFR => RfffrfcfrImpl::adjacent_cities(from),
            Plan::RFFFRFFFR => RfffrfffrImpl::adjacent_cities(from),
            Plan::RFRFCCCFR => RfrfcccfrImpl::adjacent_cities(from),
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

    use debug::PrintTrait;

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

