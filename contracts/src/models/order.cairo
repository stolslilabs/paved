// Core imports

use debug::PrintTrait;

// Constants

const ANGER: felt252 = 'ANGER';
const TITANS: felt252 = 'TITANS';
const VITRIOL: felt252 = 'VITRIOL';
const BRILLANCE: felt252 = 'BRILLANCE';
const DETECTION: felt252 = 'DETECTION';
const ENLIGHTENMENT: felt252 = 'ENLIGHTENMENT';
const FURY: felt252 = 'FURY';
const GIANTS: felt252 = 'GIANTS';
const PERFECTION: felt252 = 'PERFECTION';
const RAGE: felt252 = 'RAGE';
const REFLECTION: felt252 = 'REFLECTION';
const SKILL: felt252 = 'SKILL';
const FOX: felt252 = 'FOX';
const TWINS: felt252 = 'TWINS';

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Order {
    Anger,
    Titans,
    Vitriol,
    Brillance,
    Detection,
    Enlightenment,
    Fury,
    Giants,
    Perfection,
    Rage,
    Reflection,
    Skill,
    Fox,
    Twins,
}

impl IntoOrderFelt252 of Into<Order, felt252> {
    #[inline(always)]
    fn into(self: Order) -> felt252 {
        match self {
            Order::Anger => ANGER,
            Order::Titans => TITANS,
            Order::Vitriol => VITRIOL,
            Order::Brillance => BRILLANCE,
            Order::Detection => DETECTION,
            Order::Enlightenment => ENLIGHTENMENT,
            Order::Fury => FURY,
            Order::Giants => GIANTS,
            Order::Perfection => PERFECTION,
            Order::Rage => RAGE,
            Order::Reflection => REFLECTION,
            Order::Skill => SKILL,
            Order::Fox => FOX,
            Order::Twins => TWINS,
        }
    }
}

impl IntoOrderU8 of Into<Order, u8> {
    #[inline(always)]
    fn into(self: Order) -> u8 {
        match self {
            Order::Anger => 0,
            Order::Titans => 1,
            Order::Vitriol => 2,
            Order::Brillance => 3,
            Order::Detection => 4,
            Order::Enlightenment => 5,
            Order::Fury => 6,
            Order::Giants => 7,
            Order::Perfection => 8,
            Order::Rage => 9,
            Order::Reflection => 10,
            Order::Skill => 11,
            Order::Fox => 12,
            Order::Twins => 13,
        }
    }
}

impl TryIntoU8Order of TryInto<u8, Order> {
    #[inline(always)]
    fn try_into(self: u8) -> Option<Order> {
        if self == 0 {
            Option::Some(Order::Anger)
        } else if self == 1 {
            Option::Some(Order::Titans)
        } else if self == 2 {
            Option::Some(Order::Vitriol)
        } else if self == 3 {
            Option::Some(Order::Brillance)
        } else if self == 4 {
            Option::Some(Order::Detection)
        } else if self == 5 {
            Option::Some(Order::Enlightenment)
        } else if self == 6 {
            Option::Some(Order::Fury)
        } else if self == 7 {
            Option::Some(Order::Giants)
        } else if self == 8 {
            Option::Some(Order::Perfection)
        } else if self == 9 {
            Option::Some(Order::Rage)
        } else if self == 10 {
            Option::Some(Order::Reflection)
        } else if self == 11 {
            Option::Some(Order::Skill)
        } else if self == 12 {
            Option::Some(Order::Fox)
        } else if self == 13 {
            Option::Some(Order::Twins)
        } else {
            Option::None
        }
    }
}

impl TryIntoFelt252Order of TryInto<felt252, Order> {
    #[inline(always)]
    fn try_into(self: felt252) -> Option<Order> {
        if self == ANGER {
            Option::Some(Order::Anger)
        } else if self == TITANS {
            Option::Some(Order::Titans)
        } else if self == VITRIOL {
            Option::Some(Order::Vitriol)
        } else if self == BRILLANCE {
            Option::Some(Order::Brillance)
        } else if self == DETECTION {
            Option::Some(Order::Detection)
        } else if self == ENLIGHTENMENT {
            Option::Some(Order::Enlightenment)
        } else if self == FURY {
            Option::Some(Order::Fury)
        } else if self == GIANTS {
            Option::Some(Order::Giants)
        } else if self == PERFECTION {
            Option::Some(Order::Perfection)
        } else if self == RAGE {
            Option::Some(Order::Rage)
        } else if self == REFLECTION {
            Option::Some(Order::Reflection)
        } else if self == SKILL {
            Option::Some(Order::Skill)
        } else if self == FOX {
            Option::Some(Order::Fox)
        } else if self == TWINS {
            Option::Some(Order::Twins)
        } else {
            Option::None
        }
    }
}

impl OrderPrint of PrintTrait<Order> {
    #[inline(always)]
    fn print(self: Order) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

