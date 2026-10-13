use core::hash::HashStateTrait;
// Core imports

use core::poseidon::{HashState, PoseidonTrait};

// Internal imports

use paved::constants;

// External imports

use paved::day::day_id;
use paved::helpers::bitmap::Bitmap;
use paved::types::deck::{Deck, DeckImpl, DeckTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::PlanImpl;

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
            Mode::Daily => constants::DAILY_PRICE,
            Mode::Tutorial => 0,
            _ => 0,
        }
    }

    #[inline]
    fn duration(self: Mode) -> u64 {
        match self {
            Mode::Daily => constants::DAILY_DURATION,
            Mode::Tutorial => 1,
            _ => 0,
        }
    }

    #[inline]
    fn seed(self: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match self {
            Mode::Daily => {
                let day = day_id(time, self.duration());
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(day.into());
                state.finalize()
            },
            Mode::Tutorial => 0,
            _ => 0,
        }
    }

    /// Whether a game of the mode has one player (D-19): every tile is seat 0, the game's player,
    /// so its structures score for that player with no count of their tiles' seats. Daily and
    /// Tutorial do. Every mode is named, with no fallthrough: a multiplayer mode adds its own arm,
    /// false, which turns the majority count on. `None` is no game (`Game::new` refuses it): false.
    #[inline]
    fn solo(self: Mode) -> bool {
        match self {
            Mode::None => false,
            Mode::Daily => true,
            Mode::Tutorial => true,
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
    fn parameters(self: Mode, tiles: u128) -> (Orientation, u32, u32) {
        let deck: Deck = self.deck();
        let index = Bitmap::most_significant_bit(tiles).unwrap();
        deck.parameters(index.into())
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
