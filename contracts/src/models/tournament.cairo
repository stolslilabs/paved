use core::traits::TryInto;

// Internal imports

use paved::constants;
// Core imports

// External imports

use paved::helpers::random_deck::{Deck as OrigamiDeck, DeckTrait};
use paved::leaderboard::{Top3, Top3Impl};
pub use paved::models::index::Tournament;

// Errors

pub mod errors {
    pub const REWARD_ALREADY_CLAIMED: felt252 = 'Tournament: already claimed';
    pub const INVALID_PLAYER: felt252 = 'Tournament: invalid player';
    pub const TOURNAMENT_NOT_OVER: felt252 = 'Tournament: not over';
    pub const PRIZE_OVERFLOW: felt252 = 'Tournament: prize overflow';
    pub const TOURNAMENT_NOT_FOUND: felt252 = 'Tournament: not found';
    pub const NOTHING_TO_CLAIM: felt252 = 'Tournament: nothing to claim';
}

#[generate_trait]
pub impl TournamentImpl of TournamentTrait {
    #[inline]
    fn compute_id(time: u64, duration: u64) -> u64 {
        time / duration
    }

    /// The player who holds `rank` in `top`, the ranking read from the leaderboard.
    #[inline]
    fn player(self: Tournament, top: Top3, rank: u8) -> felt252 {
        top.player(rank)
    }

    fn reward(self: Tournament, top: Top3, rank: u8) -> u256 {
        match rank {
            0 => 0_u256,
            1 => {
                // [Compute] Remove the other prize to avoid remaining dust due to rounding
                let second_prize = self.reward(top, 2);
                let third_prize = self.reward(top, 3);
                self.prize.into() - second_prize - third_prize
            },
            2 => {
                if top.second.player_id == 0 {
                    return 0_u256;
                }
                let third_reward = self.reward(top, 3);
                (self.prize.into() - third_reward) / 3_u256
            },
            3 => {
                if top.third.player_id == 0 {
                    return 0_u256;
                }
                self.prize.into() / 6_u256
            },
            _ => 0_u256,
        }
    }

    #[inline]
    fn buyin(ref self: Tournament, amount: felt252) {
        // [Check] Overflow
        let current: u256 = self.prize.into();
        let next: u256 = (self.prize + amount).into();
        assert(next >= current, errors::PRIZE_OVERFLOW);
        // [Effect] Payout
        self.prize += amount;
    }

    #[inline]
    fn claim(
        ref self: Tournament, top: Top3, player_id: felt252, rank: u8, time: u64, duration: u64,
    ) -> u256 {
        // [Check] Tournament is over
        self.assert_is_over(time, duration);
        // [Check] Reward not already claimed
        self.assert_not_claimed(rank);
        // [Check] Player is caller
        let player = self.player(top, rank);
        assert(player == player_id, errors::INVALID_PLAYER);
        // [Check] Something to claim
        let reward = self.reward(top, rank);
        assert(reward != 0, errors::NOTHING_TO_CLAIM);
        // [Effect] Claim and return the corresponding reward
        if rank == 1 {
            self.top1_claimed = true;
        } else if rank == 2 {
            self.top2_claimed = true;
        } else if rank == 3 {
            self.top3_claimed = true;
        }
        reward
    }
}

#[generate_trait]
pub impl TournamentAssert of AssertTrait {
    #[inline]
    fn assert_exists(self: Tournament) {
        assert(self.is_non_zero(), errors::TOURNAMENT_NOT_FOUND);
    }

    #[inline]
    fn assert_not_claimed(self: Tournament, rank: u8) {
        // assert(!self.claimed, errors::REWARD_ALREADY_CLAIMED);
        if rank == 1 {
            assert(!self.top1_claimed, errors::REWARD_ALREADY_CLAIMED);
        } else if rank == 2 {
            assert(!self.top2_claimed, errors::REWARD_ALREADY_CLAIMED);
        } else if rank == 3 {
            assert(!self.top3_claimed, errors::REWARD_ALREADY_CLAIMED);
        }
    }

    #[inline]
    fn assert_is_over(self: Tournament, time: u64, duration: u64) {
        let id = TournamentImpl::compute_id(time, duration);
        assert(id > self.id, errors::TOURNAMENT_NOT_OVER);
    }
}

#[generate_trait]
pub impl ZeroableTournament of ZeroableTournamentTrait {
    #[inline]
    fn zero() -> Tournament {
        Tournament {
            id: 0,
            prize: 0,
            top1_claimed: false,
            top2_claimed: false,
            top3_claimed: false,
        }
    }

    #[inline]
    fn is_zero(self: Tournament) -> bool {
        self.prize == 0
    }

    #[inline]
    fn is_non_zero(self: Tournament) -> bool {
        !self.is_zero()
    }
}

#[cfg(test)]
pub mod tests {
    // Local imports

    use paved::leaderboard::{Ranked, Top3};
    use super::{Tournament, TournamentImpl};

    // Constants

    pub const TIME: u64 = 1710347593;

    // Implementations

    impl DefaultTournament of Default<Tournament> {
        #[inline]
        fn default() -> Tournament {
            Tournament {
                id: 0, prize: 0, top1_claimed: false, top2_claimed: false, top3_claimed: false,
            }
        }
    }

    /// The ranking of three players, as the leaderboard would give it. A player of 0 is an empty
    /// rank.
    fn top(p1: felt252, s1: u32, p2: felt252, s2: u32, p3: felt252, s3: u32) -> Top3 {
        Top3 {
            first: Ranked { player_id: p1, score: s1 },
            second: Ranked { player_id: p2, score: s2 },
            third: Ranked { player_id: p3, score: s3 },
        }
    }

    #[test]
    fn test_compute_id_zero() {
        let id = TournamentImpl::compute_id(0, 604800);
        assert(0 == id, 'Tournament: wrong id');
    }

    #[test]
    fn test_compute_id_today() {
        let time = 1710347593;
        let id = TournamentImpl::compute_id(time, 604800);
        assert(2827 == id, 'Tournament: wrong id');
    }

    #[test]
    fn test_claim_three_players() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 3, 15, 1, 10);

        // First claims the reward
        let reward = tournament.claim(top, 2, 1, TIME, 604800);
        assert(56 == reward, 'Tournament: wrong reward');
        assert(tournament.top1_claimed, 'Tournament: not claimed');

        // Second claims the reward
        let reward = tournament.claim(top, 3, 2, TIME, 604800);
        assert(28 == reward, 'Tournament: wrong reward');
        assert(tournament.top2_claimed, 'Tournament: not claimed');

        // Third claims the reward
        let reward = tournament.claim(top, 1, 3, TIME, 604800);
        assert(16 == reward, 'Tournament: wrong reward');
        assert(tournament.top3_claimed, 'Tournament: not claimed');
    }

    #[test]
    fn test_claim_two_players() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 3, 15, 0, 0);

        // First claims the reward
        let reward = tournament.claim(top, 2, 1, TIME, 604800);
        assert(67 == reward, 'Tournament: wrong reward');
        assert(tournament.top1_claimed, 'Tournament: not claimed');

        // Second claims the reward
        let reward = tournament.claim(top, 3, 2, TIME, 604800);
        assert(33 == reward, 'Tournament: wrong reward');
        assert(tournament.top2_claimed, 'Tournament: not claimed');
    }

    #[test]
    fn test_claim_one_player() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 0, 0, 0, 0);

        // First claims the reward
        let reward = tournament.claim(top, 2, 1, TIME, 604800);
        assert(100 == reward, 'Tournament: wrong reward');
        assert(tournament.top1_claimed, 'Tournament: not claimed');
    }

    #[test]
    #[should_panic(expected: ('Tournament: invalid player',))]
    fn test_claim_revert_invalid_player() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 3, 15, 0, 0);

        // First claims the reward
        tournament.claim(top, 3, 1, TIME, 604800);
    }

    #[test]
    #[should_panic(expected: ('Tournament: not over',))]
    fn test_claim_revert_not_over() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 3, 15, 1, 10);

        // First claims the reward
        tournament.claim(top, 1, 3, 0, 604800);
    }

    #[test]
    #[should_panic(expected: ('Tournament: already claimed',))]
    fn test_claim_revert_already_claimed() {
        let mut tournament: Tournament = Default::default();
        tournament.prize = 100;
        let top = top(2, 20, 3, 15, 1, 10);

        // First claims the reward
        tournament.claim(top, 1, 3, TIME, 604800);
        tournament.claim(top, 1, 3, TIME, 604800);
    }
}
