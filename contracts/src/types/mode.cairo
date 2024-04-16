// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::deck::{Deck, DeckImpl};

// Constants

const NONE: felt252 = 0;
const RANKED: felt252 = 'RANKED';
const SINGLE: felt252 = 'SINGLE';
const MULTI: felt252 = 'MULTI';

#[derive(Copy, Drop, Serde, PartialEq)]
enum Mode {
    None,
    Ranked,
    Single,
    Multi,
}

#[generate_trait]
impl ModeImpl of ModeTrait {
    #[inline(always)]
    fn deck(self: Mode) -> Deck {
        match self {
            Mode::Ranked => Deck::Base,
            Mode::Single => Deck::Base,
            Mode::Multi => Deck::Enhanced,
            _ => Deck::None,
        }
    }
}

impl IntoModeFelt252 of core::Into<Mode, felt252> {
    #[inline(always)]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::None => NONE,
            Mode::Ranked => RANKED,
            Mode::Single => SINGLE,
            Mode::Multi => MULTI,
        }
    }
}

impl IntoModeU8 of core::Into<Mode, u8> {
    #[inline(always)]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::None => 0,
            Mode::Ranked => 1,
            Mode::Single => 2,
            Mode::Multi => 3,
        }
    }
}

impl IntoU8Mode of core::Into<u8, Mode> {
    #[inline(always)]
    fn into(self: u8) -> Mode {
        match self {
            0 => Mode::None,
            1 => Mode::Ranked,
            2 => Mode::Single,
            3 => Mode::Multi,
            _ => Mode::None,
        }
    }
}

impl TryIntoFelt252Mode of core::Into<felt252, Mode> {
    #[inline(always)]
    fn into(self: felt252) -> Mode {
        if self == RANKED {
            Mode::Ranked
        } else if self == SINGLE {
            Mode::Single
        } else if self == MULTI {
            Mode::Multi
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

    use super::{Mode, NONE, RANKED, SINGLE, MULTI,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(RANKED == Mode::Ranked.into(), 'Mode: wrong Ranked');
        assert(SINGLE == Mode::Single.into(), 'Mode: wrong Single');
        assert(MULTI == Mode::Multi.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(Mode::None == NONE.into(), 'Mode: wrong None');
        assert(Mode::Ranked == RANKED.into(), 'Mode: wrong Ranked');
        assert(Mode::Single == SINGLE.into(), 'Mode: wrong Single');
        assert(Mode::Multi == MULTI.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_unknown_felt_into_mode() {
        assert(Mode::None == UNKNOWN_FELT.into(), 'Mode: wrong Unknown');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Ranked.into(), 'Mode: wrong Ranked');
        assert(2_u8 == Mode::Single.into(), 'Mode: wrong Single');
        assert(3_u8 == Mode::Multi.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Ranked == 1_u8.into(), 'Mode: wrong Ranked');
        assert(Mode::Single == 2_u8.into(), 'Mode: wrong Single');
        assert(Mode::Multi == 3_u8.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong Unknown');
    }
}

