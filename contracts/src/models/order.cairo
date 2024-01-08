// Core imports

use debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
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
    None,
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
            Order::None => NONE,
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
            Order::None => 0,
            Order::Anger => 1,
            Order::Titans => 2,
            Order::Vitriol => 3,
            Order::Brillance => 4,
            Order::Detection => 5,
            Order::Enlightenment => 6,
            Order::Fury => 7,
            Order::Giants => 8,
            Order::Perfection => 9,
            Order::Rage => 10,
            Order::Reflection => 11,
            Order::Skill => 12,
            Order::Fox => 13,
            Order::Twins => 14,
        }
    }
}

impl IntoU8Order of Into<u8, Order> {
    #[inline(always)]
    fn into(self: u8) -> Order {
        if self == 1 {
            Order::Anger
        } else if self == 2 {
            Order::Titans
        } else if self == 3 {
            Order::Vitriol
        } else if self == 4 {
            Order::Brillance
        } else if self == 5 {
            Order::Detection
        } else if self == 6 {
            Order::Enlightenment
        } else if self == 7 {
            Order::Fury
        } else if self == 8 {
            Order::Giants
        } else if self == 9 {
            Order::Perfection
        } else if self == 10 {
            Order::Rage
        } else if self == 11 {
            Order::Reflection
        } else if self == 12 {
            Order::Skill
        } else if self == 13 {
            Order::Fox
        } else if self == 14 {
            Order::Twins
        } else {
            Order::None
        }
    }
}

impl TryIntoFelt252Order of Into<felt252, Order> {
    #[inline(always)]
    fn into(self: felt252) -> Order {
        if self == ANGER {
            Order::Anger
        } else if self == TITANS {
            Order::Titans
        } else if self == VITRIOL {
            Order::Vitriol
        } else if self == BRILLANCE {
            Order::Brillance
        } else if self == DETECTION {
            Order::Detection
        } else if self == ENLIGHTENMENT {
            Order::Enlightenment
        } else if self == FURY {
            Order::Fury
        } else if self == GIANTS {
            Order::Giants
        } else if self == PERFECTION {
            Order::Perfection
        } else if self == RAGE {
            Order::Rage
        } else if self == REFLECTION {
            Order::Reflection
        } else if self == SKILL {
            Order::Skill
        } else if self == FOX {
            Order::Fox
        } else if self == TWINS {
            Order::Twins
        } else {
            Order::None
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

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{
        Order, NONE, ANGER, TITANS, VITRIOL, BRILLANCE, DETECTION, ENLIGHTENMENT, FURY, GIANTS,
        PERFECTION, RAGE, REFLECTION, SKILL, FOX, TWINS
    };

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_order_into_felt() {
        assert(NONE == Order::None.into(), 'Order: wrong None');
        assert(ANGER == Order::Anger.into(), 'Order: wrong Anger');
        assert(TITANS == Order::Titans.into(), 'Order: wrong Titans');
        assert(VITRIOL == Order::Vitriol.into(), 'Order: wrong Vitriol');
        assert(BRILLANCE == Order::Brillance.into(), 'Order: wrong Brillance');
        assert(DETECTION == Order::Detection.into(), 'Order: wrong Detection');
        assert(ENLIGHTENMENT == Order::Enlightenment.into(), 'Order: wrong Enlightenment');
        assert(FURY == Order::Fury.into(), 'Order: wrong Fury');
        assert(GIANTS == Order::Giants.into(), 'Order: wrong Giants');
        assert(PERFECTION == Order::Perfection.into(), 'Order: wrong Perfection');
        assert(RAGE == Order::Rage.into(), 'Order: wrong Rage');
        assert(REFLECTION == Order::Reflection.into(), 'Order: wrong Reflection');
        assert(SKILL == Order::Skill.into(), 'Order: wrong Skill');
        assert(FOX == Order::Fox.into(), 'Order: wrong Fox');
        assert(TWINS == Order::Twins.into(), 'Order: wrong Twins');
    }

    #[test]
    fn test_felt_into_order() {
        assert(Order::None == NONE.into(), 'Order: wrong None');
        assert(Order::Anger == ANGER.into(), 'Order: wrong Anger');
        assert(Order::Titans == TITANS.into(), 'Order: wrong Titans');
        assert(Order::Vitriol == VITRIOL.into(), 'Order: wrong Vitriol');
        assert(Order::Brillance == BRILLANCE.into(), 'Order: wrong Brillance');
        assert(Order::Detection == DETECTION.into(), 'Order: wrong Detection');
        assert(Order::Enlightenment == ENLIGHTENMENT.into(), 'Order: wrong Enlightenment');
        assert(Order::Fury == FURY.into(), 'Order: wrong Fury');
        assert(Order::Giants == GIANTS.into(), 'Order: wrong Giants');
        assert(Order::Perfection == PERFECTION.into(), 'Order: wrong Perfection');
        assert(Order::Rage == RAGE.into(), 'Order: wrong Rage');
        assert(Order::Reflection == REFLECTION.into(), 'Order: wrong Reflection');
        assert(Order::Skill == SKILL.into(), 'Order: wrong Skill');
        assert(Order::Fox == FOX.into(), 'Order: wrong Fox');
        assert(Order::Twins == TWINS.into(), 'Order: wrong Twins');
    }

    #[test]
    fn test_unknown_felt_into_order() {
        assert(Order::None == UNKNOWN_FELT.into(), 'Order: wrong Unknown');
    }

    #[test]
    fn test_order_into_u8() {
        assert(0_u8 == Order::None.into(), 'Order: wrong None');
        assert(1_u8 == Order::Anger.into(), 'Order: wrong Anger');
        assert(2_u8 == Order::Titans.into(), 'Order: wrong Titans');
        assert(3_u8 == Order::Vitriol.into(), 'Order: wrong Vitriol');
        assert(4_u8 == Order::Brillance.into(), 'Order: wrong Brillance');
        assert(5_u8 == Order::Detection.into(), 'Order: wrong Detection');
        assert(6_u8 == Order::Enlightenment.into(), 'Order: wrong Enlightenment');
        assert(7_u8 == Order::Fury.into(), 'Order: wrong Fury');
        assert(8_u8 == Order::Giants.into(), 'Order: wrong Giants');
        assert(9_u8 == Order::Perfection.into(), 'Order: wrong Perfection');
        assert(10_u8 == Order::Rage.into(), 'Order: wrong Rage');
        assert(11_u8 == Order::Reflection.into(), 'Order: wrong Reflection');
        assert(12_u8 == Order::Skill.into(), 'Order: wrong Skill');
        assert(13_u8 == Order::Fox.into(), 'Order: wrong Fox');
        assert(14_u8 == Order::Twins.into(), 'Order: wrong Twins');
    }

    #[test]
    fn test_u8_into_order() {
        assert(Order::None == 0_u8.into(), 'Order: wrong None');
        assert(Order::Anger == 1_u8.into(), 'Order: wrong Anger');
        assert(Order::Titans == 2_u8.into(), 'Order: wrong Titans');
        assert(Order::Vitriol == 3_u8.into(), 'Order: wrong Vitriol');
        assert(Order::Brillance == 4_u8.into(), 'Order: wrong Brillance');
        assert(Order::Detection == 5_u8.into(), 'Order: wrong Detection');
        assert(Order::Enlightenment == 6_u8.into(), 'Order: wrong Enlightenment');
        assert(Order::Fury == 7_u8.into(), 'Order: wrong Fury');
        assert(Order::Giants == 8_u8.into(), 'Order: wrong Giants');
        assert(Order::Perfection == 9_u8.into(), 'Order: wrong Perfection');
        assert(Order::Rage == 10_u8.into(), 'Order: wrong Rage');
        assert(Order::Reflection == 11_u8.into(), 'Order: wrong Reflection');
        assert(Order::Skill == 12_u8.into(), 'Order: wrong Skill');
        assert(Order::Fox == 13_u8.into(), 'Order: wrong Fox');
        assert(Order::Twins == 14_u8.into(), 'Order: wrong Twins');
    }

    #[test]
    fn test_unknown_u8_into_order() {
        assert(Order::None == UNKNOWN_U8.into(), 'Order: wrong Unknown');
    }
}

