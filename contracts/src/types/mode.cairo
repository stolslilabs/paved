// Core imports

use debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const STANDARD: felt252 = 'STANDARD';
const ARCHITECT: felt252 = 'ARCHITECT';
const CONQUEST: felt252 = 'CONQUEST';
const RACE: felt252 = 'RACE';
const OPEN: felt252 = 'OPEN';

#[derive(Copy, Drop, Serde, PartialEq)]
enum Mode {
    None,
    Standard, // Time limited and point limited
    Architect, // Tile limited
    Conquest, // Point limited
    Race, // Time limited
    Open, // Unlimited
}

impl ModeIntoFelt252 of Into<Mode, felt252> {
    #[inline(always)]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::None => NONE,
            Mode::Standard => STANDARD,
            Mode::Architect => ARCHITECT,
            Mode::Conquest => CONQUEST,
            Mode::Race => RACE,
            Mode::Open => OPEN,
        }
    }
}

impl ModeIntoU8 of Into<Mode, u8> {
    #[inline(always)]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::None => 0,
            Mode::Standard => 1,
            Mode::Architect => 2,
            Mode::Conquest => 3,
            Mode::Race => 4,
            Mode::Open => 5,
        }
    }
}

impl Felt252IntoMode of Into<felt252, Mode> {
    #[inline(always)]
    fn into(self: felt252) -> Mode {
        if self == STANDARD {
            Mode::Standard
        } else if self == ARCHITECT {
            Mode::Architect
        } else if self == CONQUEST {
            Mode::Conquest
        } else if self == RACE {
            Mode::Race
        } else if self == OPEN {
            Mode::Open
        } else {
            Mode::None
        }
    }
}

impl U8IntoMode of Into<u8, Mode> {
    #[inline(always)]
    fn into(self: u8) -> Mode {
        if self == 1 {
            Mode::Standard
        } else if self == 2 {
            Mode::Architect
        } else if self == 3 {
            Mode::Conquest
        } else if self == 4 {
            Mode::Race
        } else if self == 5 {
            Mode::Open
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

    use debug::PrintTrait;

    // Local imports

    use super::{Mode, NONE, STANDARD, ARCHITECT, CONQUEST, RACE, OPEN,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(STANDARD == Mode::Standard.into(), 'Mode: wrong Standard');
        assert(ARCHITECT == Mode::Architect.into(), 'Mode: wrong Architect');
        assert(CONQUEST == Mode::Conquest.into(), 'Mode: wrong Conquest');
        assert(RACE == Mode::Race.into(), 'Mode: wrong Race');
        assert(OPEN == Mode::Open.into(), 'Mode: wrong Open');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(Mode::None == NONE.into(), 'Mode: wrong None');
        assert(Mode::Standard == STANDARD.into(), 'Mode: wrong Standard');
        assert(Mode::Architect == ARCHITECT.into(), 'Mode: wrong Architect');
        assert(Mode::Conquest == CONQUEST.into(), 'Mode: wrong Conquest');
        assert(Mode::Race == RACE.into(), 'Mode: wrong Race');
        assert(Mode::Open == OPEN.into(), 'Mode: wrong Open');
    }

    #[test]
    fn test_unknown_felt_into_mode() {
        assert(Mode::None == 'X'.into(), 'Mode: wrong None');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Standard.into(), 'Mode: wrong Standard');
        assert(2_u8 == Mode::Architect.into(), 'Mode: wrong Architect');
        assert(3_u8 == Mode::Conquest.into(), 'Mode: wrong Conquest');
        assert(4_u8 == Mode::Race.into(), 'Mode: wrong Race');
        assert(5_u8 == Mode::Open.into(), 'Mode: wrong Open');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Standard == 1_u8.into(), 'Mode: wrong Standard');
        assert(Mode::Architect == 2_u8.into(), 'Mode: wrong Architect');
        assert(Mode::Conquest == 3_u8.into(), 'Mode: wrong Conquest');
        assert(Mode::Race == 4_u8.into(), 'Mode: wrong Race');
        assert(Mode::Open == 5_u8.into(), 'Mode: wrong Open');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong None');
    }
}
