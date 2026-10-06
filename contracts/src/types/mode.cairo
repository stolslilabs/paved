use core::hash::HashStateTrait;
// Core imports

use core::poseidon::{HashState, PoseidonTrait};

// Internal imports

use paved::constants;
use paved::helpers::bitmap::Bitmap;

// External imports

use paved::helpers::random_deck::{Deck as OrigamiDeck, DeckTrait as OrigamiDeckTrait};
use paved::models::tournament::TournamentTrait;
use paved::types::deck::{Deck, DeckImpl, DeckTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::{Plan, PlanImpl};
use paved::types::role::Role;
use paved::types::spot::Spot;

// Constants

pub const NONE: felt252 = 0;
pub const DAILY: felt252 = 'DAILY';
pub const TUTORIAL: felt252 = 'TUTORIAL';

// The u8 codes of the modes are persisted in `Game.mode`: Tutorial keeps 3 (2 was Weekly).

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum Mode {
    None,
    Daily,
    Tutorial,
}

#[generate_trait]
pub impl ModeImpl of ModeTrait {
    #[inline]
    fn price(self: Mode) -> felt252 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_PRICE,
            Mode::Tutorial => 0,
            _ => 0,
        }
    }

    #[inline]
    fn duration(self: Mode) -> u64 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_DURATION,
            Mode::Tutorial => 1,
            _ => 0,
        }
    }

    #[inline]
    fn seed(self: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match self {
            Mode::Daily => {
                let tournament_id = TournamentTrait::compute_id(time, self.duration());
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(tournament_id.into());
                state.finalize()
            },
            Mode::Tutorial => 0,
            _ => 0,
        }
    }

    #[inline]
    fn deck(self: Mode) -> Deck {
        match self {
            Mode::Daily => Deck::Simple,
            Mode::Tutorial => Deck::Tutorial,
            _ => Deck::None,
        }
    }

    #[inline]
    fn draw(self: Mode, seed: felt252, tiles: u128) -> (Plan, u128) {
        match self {
            Mode::Daily => self._draw(seed, tiles),
            Mode::Tutorial => {
                let deck: Deck = self.deck();
                if tiles == 0 {
                    return (deck.plan(0), 1);
                }
                let index: u8 = 1 + Bitmap::most_significant_bit(tiles).unwrap();
                let plan: Plan = deck.plan(index.into());
                let tiles = Bitmap::set_bit_at(tiles, index.into(), true);
                (plan, tiles)
            },
            _ => (Plan::None, tiles),
        }
    }

    #[inline]
    fn parameters(self: Mode, tiles: u128) -> (Orientation, u32, u32, Role, Spot) {
        let deck: Deck = self.deck();
        let index = Bitmap::most_significant_bit(tiles).unwrap();
        deck.parameters(index.into())
    }
}

#[generate_trait]
pub impl Private of PrivateTrait {
    #[inline]
    fn _draw(self: Mode, seed: felt252, tiles: u128) -> (Plan, u128) {
        let game_deck: Deck = self.deck();
        let number: u32 = game_deck.total_count().into();
        let mut deck: OrigamiDeck = OrigamiDeckTrait::from_bitmap(seed, number, tiles);
        let plan_id: u8 = deck.draw().into();
        // Update bitmap if deck is not empty, otherwise reset
        let tiles = if deck.remaining == 0 {
            0
        } else {
            let index = plan_id - 1;
            Bitmap::set_bit_at(tiles, index.into(), true)
        };
        (game_deck.plan(plan_id.into()), tiles)
    }
}

pub impl IntoModeFelt252 of Into<Mode, felt252> {
    #[inline]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::Daily => DAILY,
            Mode::Tutorial => TUTORIAL,
            _ => NONE,
        }
    }
}

pub impl IntoModeU8 of Into<Mode, u8> {
    #[inline]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::Daily => 1,
            Mode::Tutorial => 3,
            _ => 0,
        }
    }
}

pub impl IntoU8Mode of Into<u8, Mode> {
    #[inline]
    fn into(self: u8) -> Mode {
        match self {
            0 => Mode::None,
            1 => Mode::Daily,
            3 => Mode::Tutorial,
            _ => Mode::None,
        }
    }
}

#[cfg(test)]
pub mod tests {
    // Core imports

    // Local imports

    use super::{DAILY, Mode, NONE, TUTORIAL};

    // Constants

    pub const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    pub const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(DAILY == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(TUTORIAL == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(DAILY == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(TUTORIAL == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(3_u8 == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Daily == 1_u8.into(), 'Mode: wrong Daily');
        assert(Mode::Tutorial == 3_u8.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong Unknown');
    }
}
