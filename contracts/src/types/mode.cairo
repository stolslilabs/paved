// Core imports

use debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const SOLO: felt252 = 'SOLO';
const MULTI: felt252 = 'MULTI';

#[derive(Copy, Drop, Serde, PartialEq)]
enum Mode {
    None,
    Solo,
    Multi,
}

impl IntoModeFelt252 of Into<Mode, felt252> {
    #[inline(always)]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::None => NONE,
            Mode::Solo => SOLO,
            Mode::Multi => MULTI,
        }
    }
}

impl IntoModeU8 of Into<Mode, u8> {
    #[inline(always)]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::None => 0,
            Mode::Solo => 1,
            Mode::Multi => 2,
        }
    }
}

impl IntoU8Mode of Into<u8, Mode> {
    #[inline(always)]
    fn into(self: u8) -> Mode {
        if self == 1 {
            Mode::Solo
        } else if self == 2 {
            Mode::Multi
        } else {
            Mode::None
        }
    }
}

impl TryIntoFelt252Mode of Into<felt252, Mode> {
    #[inline(always)]
    fn into(self: felt252) -> Mode {
        if self == SOLO {
            Mode::Solo
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

    use debug::PrintTrait;

    // Local imports

    use super::{Mode, NONE, SOLO, MULTI,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(SOLO == Mode::Solo.into(), 'Mode: wrong Solo');
        assert(MULTI == Mode::Multi.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(Mode::None == NONE.into(), 'Mode: wrong None');
        assert(Mode::Solo == SOLO.into(), 'Mode: wrong Solo');
        assert(Mode::Multi == MULTI.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_unknown_felt_into_mode() {
        assert(Mode::None == UNKNOWN_FELT.into(), 'Mode: wrong Unknown');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Solo.into(), 'Mode: wrong Solo');
        assert(2_u8 == Mode::Multi.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Solo == 1_u8.into(), 'Mode: wrong Solo');
        assert(Mode::Multi == 2_u8.into(), 'Mode: wrong Multi');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong Unknown');
    }
}

