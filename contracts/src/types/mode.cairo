// Core imports

use core::poseidon::{PoseidonTrait, HashState};
use core::hash::HashStateTrait;
use core::debug::PrintTrait;

// Internal imports

use paved::constants;
use paved::models::tournament::TournamentTrait;
use paved::types::deck::{Deck, DeckImpl};

// Constants

const NONE: felt252 = 0;
const DAILY: felt252 = 'DAILY';
const WEEKLY: felt252 = 'WEEKLY';

#[derive(Copy, Drop, Serde, PartialEq)]
enum Mode {
    None,
    Daily,
    Weekly,
}

#[generate_trait]
impl ModeImpl of ModeTrait {
    #[inline(always)]
    fn price(self: Mode) -> felt252 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_PRICE,
            Mode::Weekly => constants::WEEKLY_TOURNAMENT_PRICE,
            _ => 0,
        }
    }

    #[inline(always)]
    fn duration(self: Mode) -> u64 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_DURATION,
            Mode::Weekly => constants::WEEKLY_TOURNAMENT_DURATION,
            _ => 0,
        }
    }

    #[inline(always)]
    fn seed(self: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match self {
            Mode::Daily => {
                let tournament_id = TournamentTrait::compute_id(time, self.duration());
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(tournament_id.into());
                state.finalize()
            },
            Mode::Weekly => {
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(game_id.into());
                let state = state.update(time.into());
                state.finalize()
            },
            _ => 0,
        }
    }

    #[inline(always)]
    fn deck(self: Mode) -> Deck {
        match self {
            Mode::Daily => Deck::Simple,
            Mode::Weekly => Deck::Base,
            _ => Deck::None,
        }
    }
}

impl IntoModeFelt252 of core::Into<Mode, felt252> {
    #[inline(always)]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::Daily => DAILY,
            Mode::Weekly => WEEKLY,
            _ => NONE,
        }
    }
}

impl IntoModeU8 of core::Into<Mode, u8> {
    #[inline(always)]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::Daily => 1,
            Mode::Weekly => 2,
            _ => 0,
        }
    }
}

impl IntoU8Mode of core::Into<u8, Mode> {
    #[inline(always)]
    fn into(self: u8) -> Mode {
        match self {
            0 => Mode::None,
            1 => Mode::Daily,
            2 => Mode::Weekly,
            _ => Mode::None,
        }
    }
}

impl TryIntoFelt252Mode of core::Into<felt252, Mode> {
    #[inline(always)]
    fn into(self: felt252) -> Mode {
        if self == DAILY {
            Mode::Daily
        } else if self == WEEKLY {
            Mode::Weekly
        } else {
            Mode::None
        }
    }
}

impl ModePrint of PrintTrait<Mode> {
    #[inline(always)]
    fn print(self: Mode) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Mode, NONE, DAILY, WEEKLY,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(DAILY == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(WEEKLY == Mode::Weekly.into(), 'Mode: wrong Weekly');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(Mode::None == NONE.into(), 'Mode: wrong None');
        assert(Mode::Daily == DAILY.into(), 'Mode: wrong Daily');
        assert(Mode::Weekly == WEEKLY.into(), 'Mode: wrong Weekly');
    }

    #[test]
    fn test_unknown_felt_into_mode() {
        assert(Mode::None == UNKNOWN_FELT.into(), 'Mode: wrong Unknown');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(2_u8 == Mode::Weekly.into(), 'Mode: wrong Weekly');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Daily == 1_u8.into(), 'Mode: wrong Daily');
        assert(Mode::Weekly == 2_u8.into(), 'Mode: wrong Weekly');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong Unknown');
    }
}
