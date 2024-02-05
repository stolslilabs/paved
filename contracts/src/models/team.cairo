// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreImpl};
use stolsli::types::alliance::{Alliance, AllianceImpl};
use stolsli::types::order::{Order, OrderImpl};

mod errors {
    const INVALID_ORDER: felt252 = 'Team: Invalid order';
}

#[derive(Model, Copy, Drop, Serde)]
struct Team {
    #[key]
    game_id: u32,
    #[key]
    order: u8,
    score: u32,
    alliance: u8,
}

#[generate_trait]
impl TeamImpl of TeamTrait {
    #[inline(always)]
    fn new(game_id: u32, order: u8) -> Team {
        // [Check] Order is valid
        let order: Order = order.into();
        assert(Order::None != order, errors::INVALID_ORDER);

        // [Return] Order
        let alliance: Alliance = order.get_alliance();
        Team { game_id, order: order.into(), score: 0, alliance: alliance.into() }
    }

    fn rank(self: Team, ref store: Store) -> u8 {
        // [Compute] Loop over teams and count those with a higher score
        let mut rank = 1;
        let team_order: Order = self.order.into();
        let alliance: Alliance = team_order.get_alliance();
        let mut orders = AllianceImpl::orders(alliance);
        let game = store.game(self.game_id);
        loop {
            match orders.pop_front() {
                Option::Some(order) => {
                    // [Skip] If the order is the same as the team's order
                    if order == team_order {
                        continue;
                    };
                    let team: Team = store.team(game, order.into());
                    if team.score > self.score {
                        rank += 1;
                    }
                },
                Option::None => { break rank; },
            }
        }
    }
}

impl ZeroableTeam of Zeroable<Team> {
    #[inline(always)]
    fn zero() -> Team {
        Team { game_id: 0, order: 0, score: 0, alliance: 0 }
    }

    #[inline(always)]
    fn is_zero(self: Team) -> bool {
        self.alliance == 0
    }

    #[inline(always)]
    fn is_non_zero(self: Team) -> bool {
        !self.is_zero()
    }
}
