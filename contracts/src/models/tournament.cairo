use core::traits::TryInto;
// Core imports

use core::debug::PrintTrait;
use core::Default;
use core::Zeroable;

// External imports

use origami::random::deck::{Deck as OrigamiDeck, DeckTrait};

// Internal imports

use paved::constants;

// Errors

mod errors {
    const REWARD_ALREADY_CLAIMED: felt252 = 'Tournament: reward claimed';
    const TOURNAMENT_NOT_OVER: felt252 = 'Tournament: not over';
    const PRIZE_OVERFLOW: felt252 = 'Tournament: prize overflow';
    const TOURNAMENT_NOT_FOUND: felt252 = 'Tournament: not found';
    const NOTHING_TO_CLAIM: felt252 = 'Tournament: nothing to claim';
}

#[derive(Model, Copy, Drop, Serde)]
struct Tournament {
    #[key]
    id: u64,
    prize: felt252,
    top1_player_id: felt252,
    top2_player_id: felt252,
    top3_player_id: felt252,
    top1_score: u32,
    top2_score: u32,
    top3_score: u32,
}

#[derive(Model, Copy, Drop, Serde)]
struct TournamentClaim {
    #[key]
    tournament_id: u64,
    #[key]
    player_id: felt252,
    claimed: bool,
}

#[generate_trait]
impl TournamentImpl of TournamentTrait {
    #[inline(always)]
    fn compute_id(time: u64) -> u64 {
        time / constants::TOURNAMENT_DURATION
    }

    #[inline(always)]
    fn rank(self: Tournament, player_id: felt252) -> u8 {
        if player_id == self.top1_player_id {
            1
        } else if player_id == self.top2_player_id {
            2
        } else if player_id == self.top3_player_id {
            3
        } else {
            0
        }
    }

    fn reward(self: Tournament, rank: u8) -> u256 {
        match rank {
            0 => 0_u256,
            1 => {
                // [Compute] Remove the other prize to avoid remaining dust due to rounding
                let second_prize = self.reward(2);
                let third_prize = self.reward(3);
                self.prize.into() - second_prize - third_prize
            },
            2 => {
                if self.top2_player_id == 0 {
                    return 0_u256;
                }
                let third_reward = self.reward(3);
                (self.prize.into() - third_reward) / 3_u256
            },
            3 => {
                if self.top3_player_id == 0 {
                    return 0_u256;
                }
                self.prize.into() / 6_u256
            },
            _ => 0_u256,
        }
    }

    #[inline(always)]
    fn score(ref self: Tournament, player_id: felt252, score: u32) {
        if score <= self.top3_score {
            return;
        }

        if score <= self.top2_score {
            self.top3_score = score;
            self.top3_player_id = player_id;
            return;
        }

        if score <= self.top1_score {
            self.top3_score = self.top2_score;
            self.top3_player_id = self.top2_player_id;
            self.top2_score = score;
            self.top2_player_id = player_id;
            return;
        }

        self.top3_score = self.top2_score;
        self.top3_player_id = self.top2_player_id;
        self.top2_score = self.top1_score;
        self.top2_player_id = self.top1_player_id;
        self.top1_score = score;
        self.top1_player_id = player_id;
    }

    #[inline(always)]
    fn buyin(ref self: Tournament, amount: felt252) {
        // [Check] Overflow
        let current: u256 = self.prize.into();
        let next: u256 = (self.prize + amount).into();
        assert(next > current, errors::PRIZE_OVERFLOW);
        // [Effect] Payout
        self.prize += amount;
    }
}

#[generate_trait]
impl TournamentClaimImpl of TournamentClaimTrait {
    #[inline(always)]
    fn claim(
        ref self: TournamentClaim, tournament: Tournament, player_id: felt252, time: u64
    ) -> u256 {
        // [Check] Tournament is over
        tournament.assert_is_over(time);
        // [Check] Reward not already claimed
        self.assert_not_claimed();
        // [Check] Something to claim
        let reward = tournament.reward(tournament.rank(player_id));
        assert(reward != 0, errors::NOTHING_TO_CLAIM);
        // [Effect] Claim and return the corresponding reward
        self.claimed = true;
        reward
    }
}

#[generate_trait]
impl TournamentAssert of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Tournament) {
        assert(self.is_non_zero(), errors::TOURNAMENT_NOT_FOUND);
    }

    #[inline(always)]
    fn assert_not_claimed(self: TournamentClaim) {
        assert(!self.claimed, errors::REWARD_ALREADY_CLAIMED);
    }

    #[inline(always)]
    fn assert_is_over(self: Tournament, time: u64) {
        let id = TournamentImpl::compute_id(time);
        assert(id > self.id, errors::TOURNAMENT_NOT_OVER);
    }
}

impl DefaultTournament of Default<Tournament> {
    #[inline(always)]
    fn default() -> Tournament {
        Tournament {
            id: 0,
            prize: 0,
            top1_player_id: 0,
            top2_player_id: 0,
            top3_player_id: 0,
            top1_score: 0,
            top2_score: 0,
            top3_score: 0,
        }
    }
}

impl ZeroableTournament of Zeroable<Tournament> {
    #[inline(always)]
    fn zero() -> Tournament {
        Tournament {
            id: 0,
            prize: 0,
            top1_player_id: 0,
            top2_player_id: 0,
            top3_player_id: 0,
            top1_score: 0,
            top2_score: 0,
            top3_score: 0,
        }
    }

    #[inline(always)]
    fn is_zero(self: Tournament) -> bool {
        self.prize == 0
    }

    #[inline(always)]
    fn is_non_zero(self: Tournament) -> bool {
        !self.is_zero()
    }
}

impl DefaultTournamentClaim of Default<TournamentClaim> {
    #[inline(always)]
    fn default() -> TournamentClaim {
        TournamentClaim { tournament_id: 0, player_id: 0, claimed: false, }
    }
}

impl ZeroableTournamentClaim of Zeroable<TournamentClaim> {
    #[inline(always)]
    fn zero() -> TournamentClaim {
        TournamentClaim { tournament_id: 0, player_id: 0, claimed: false, }
    }

    #[inline(always)]
    fn is_zero(self: TournamentClaim) -> bool {
        !self.is_non_zero()
    }

    #[inline(always)]
    fn is_non_zero(self: TournamentClaim) -> bool {
        self.claimed
    }
}


#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;
    use core::Default;

    // Local imports

    use super::{Tournament, TournamentImpl};
    use super::{TournamentClaim, TournamentClaimImpl};

    // Constants

    const TIME: u64 = 1710347593;

    #[test]
    fn test_compute_id_zero() {
        let id = TournamentImpl::compute_id(0);
        assert(0 == id, 'Tournament: wrong id');
    }

    #[test]
    fn test_compute_id_today() {
        let time = 1710347593;
        let id = TournamentImpl::compute_id(time);
        assert(2827 == id, 'Tournament: wrong id');
    }

    #[test]
    fn test_score() {
        let mut tournament: Tournament = Default::default();
        tournament.score(1, 10);
        tournament.score(2, 20);
        tournament.score(3, 15);
        tournament.score(4, 5);
        tournament.score(5, 25);
        assert(5 == tournament.top1_player_id, 'Tournament: wrong top1 player');
        assert(2 == tournament.top2_player_id, 'Tournament: wrong top2 player');
        assert(3 == tournament.top3_player_id, 'Tournament: wrong top3 player');
        assert(25 == tournament.top1_score, 'Tournament: wrong top1 score');
        assert(20 == tournament.top2_score, 'Tournament: wrong top2 score');
        assert(15 == tournament.top3_score, 'Tournament: wrong top3 score');
    }

    #[test]
    fn test_claim_three_players() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        tournament.score(1, 10);
        tournament.score(2, 20);
        tournament.score(3, 15);

        // First claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 2, TIME);
        assert(56 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');

        // Second claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 3, TIME);
        assert(28 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');

        // Third claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 1, TIME);
        assert(16 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');
    }

    #[test]
    fn test_claim_two_players() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        tournament.score(2, 20);
        tournament.score(3, 15);

        // First claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 2, TIME);
        assert(67 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');

        // Second claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 3, TIME);
        assert(33 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');
    }

    #[test]
    fn test_claim_one_player() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        tournament.score(2, 20);

        // First claims the reward
        let mut claim: TournamentClaim = Default::default();
        let reward = claim.claim(tournament, 2, TIME);
        assert(100 == reward, 'Tournament: wrong reward');
        assert(claim.claimed, 'Tournament: not claimed');
    }

    #[test]
    #[should_panic(expected: ('Tournament: not over',))]
    fn test_claim_revert_not_over() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        tournament.score(1, 10);
        tournament.score(2, 20);
        tournament.score(3, 15);

        // First claims the reward
        let mut claim: TournamentClaim = Default::default();
        claim.claim(tournament, 1, 0);
    }

    #[test]
    #[should_panic(expected: ('Tournament: reward claimed',))]
    fn test_claim_revert_already_claimed() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        tournament.score(1, 10);
        tournament.score(2, 20);
        tournament.score(3, 15);

        // First claims the reward
        let mut claim: TournamentClaim = Default::default();
        claim.claim(tournament, 1, TIME);
        claim.claim(tournament, 1, TIME);
    }
}

