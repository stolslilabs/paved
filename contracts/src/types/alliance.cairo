// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::types::order::Order;
use stolsli::models::game::Game;

// Constants

const NONE: felt252 = 0;
const LIGHT: felt252 = 'LIGHT';
const DARKNESS: felt252 = 'DARKNESS';
const MULTIPLIER: u32 = 1_000_000;

#[derive(Copy, Drop, Serde, PartialEq)]
enum Alliance {
    None,
    Light,
    Darkness,
}

#[generate_trait]
impl AllianceImpl of AllianceTrait {
    #[inline(always)]
    fn share(rank: u8) -> u32 {
        if rank == 1 {
            292000 // 29.2%
        } else if rank == 2 {
            218000 // 21.8%
        } else if rank == 3 {
            162000 // 16.2%
        } else if rank == 4 {
            121000 // 12.1%
        } else if rank == 5 {
            90000 // 9.0%
        } else if rank == 6 {
            67000 // 6.7%
        } else if rank == 7 {
            50000 // 5.0%
        } else {
            0
        }
    }

    #[inline(always)]
    fn orders(self: Alliance) -> Array<Order> {
        match self {
            Alliance::None => array![],
            Alliance::Light => {
                array![
                    Order::Brillance,
                    Order::Enlightenment,
                    Order::Giants,
                    Order::Perfection,
                    Order::Protection,
                    Order::Reflection,
                    Order::Skill,
                    Order::Twins,
                ]
            },
            Alliance::Darkness => {
                array![
                    Order::Anger,
                    Order::Titans,
                    Order::Vitriol,
                    Order::Detection,
                    Order::Fury,
                    Order::Power,
                    Order::Rage,
                    Order::Fox,
                ]
            },
        }
    }

    fn score(self: Alliance, game: Game, ref store: Store) -> u32 {
        let mut score: u32 = 0;
        let mut orders = self.orders();
        loop {
            match orders.pop_front() {
                Option::Some(order) => {
                    let team = store.team(game, order.into());
                    score += team.score
                },
                Option::None => { break score; },
            }
        }
    }

    #[inline(always)]
    fn winner(game: Game, ref store: Store) -> Alliance {
        let light: u32 = Alliance::Light.score(game, ref store);
        let darkness: u32 = Alliance::Darkness.score(game, ref store);
        if light > darkness {
            Alliance::Light
        } else if light < darkness {
            Alliance::Darkness
        } else {
            Alliance::None
        }
    }
}

impl IntoAllianceFelt252 of Into<Alliance, felt252> {
    #[inline(always)]
    fn into(self: Alliance) -> felt252 {
        match self {
            Alliance::None => NONE,
            Alliance::Light => LIGHT,
            Alliance::Darkness => DARKNESS,
        }
    }
}

impl IntoAllianceU8 of Into<Alliance, u8> {
    #[inline(always)]
    fn into(self: Alliance) -> u8 {
        match self {
            Alliance::None => 0,
            Alliance::Light => 1,
            Alliance::Darkness => 2,
        }
    }
}

impl IntoU8Alliance of Into<u8, Alliance> {
    #[inline(always)]
    fn into(self: u8) -> Alliance {
        if self == 1 {
            Alliance::Light
        } else if self == 2 {
            Alliance::Darkness
        } else {
            Alliance::None
        }
    }
}

impl TryIntoFelt252Alliance of Into<felt252, Alliance> {
    #[inline(always)]
    fn into(self: felt252) -> Alliance {
        if self == LIGHT {
            Alliance::Light
        } else if self == DARKNESS {
            Alliance::Darkness
        } else {
            Alliance::None
        }
    }
}

impl AlliancePrint of PrintTrait<Alliance> {
    #[inline(always)]
    fn print(self: Alliance) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Alliance, NONE, LIGHT, DARKNESS,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_order_into_felt() {
        assert(NONE == Alliance::None.into(), 'Alliance: wrong None');
        assert(LIGHT == Alliance::Light.into(), 'Alliance: wrong Light');
        assert(DARKNESS == Alliance::Darkness.into(), 'Alliance: wrong Darkness');
    }

    #[test]
    fn test_felt_into_order() {
        assert(Alliance::None == NONE.into(), 'Alliance: wrong None');
        assert(Alliance::Light == LIGHT.into(), 'Alliance: wrong Light');
        assert(Alliance::Darkness == DARKNESS.into(), 'Alliance: wrong Darkness');
    }

    #[test]
    fn test_unknown_felt_into_order() {
        assert(Alliance::None == UNKNOWN_FELT.into(), 'Alliance: wrong Unknown');
    }

    #[test]
    fn test_order_into_u8() {
        assert(0_u8 == Alliance::None.into(), 'Alliance: wrong None');
        assert(1_u8 == Alliance::Light.into(), 'Alliance: wrong Light');
        assert(2_u8 == Alliance::Darkness.into(), 'Alliance: wrong Darkness');
    }

    #[test]
    fn test_u8_into_order() {
        assert(Alliance::None == 0_u8.into(), 'Alliance: wrong None');
        assert(Alliance::Light == 1_u8.into(), 'Alliance: wrong Light');
        assert(Alliance::Darkness == 2_u8.into(), 'Alliance: wrong Darkness');
    }

    #[test]
    fn test_unknown_u8_into_order() {
        assert(Alliance::None == UNKNOWN_U8.into(), 'Alliance: wrong Unknown');
    }
}

