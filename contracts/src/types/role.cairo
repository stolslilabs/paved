// Core imports

use debug::PrintTrait;

// Constants

const NONE: felt252 = 0;
const LORD: felt252 = 'LORD';
const LADY: felt252 = 'LADY';
const ADVENTURER: felt252 = 'ADVENTURER';
const PALADIN: felt252 = 'PALADIN';
const ALGRIM: felt252 = 'ALGRIM';
const WOODSMAN: felt252 = 'WOODSMAN';

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Role {
    None,
    Lord,
    Lady,
    Adventurer,
    Paladin,
    Algrim,
    Woodsman,
}

impl RoleIntoFelt252 of Into<Role, felt252> {
    #[inline(always)]
    fn into(self: Role) -> felt252 {
        match self {
            Role::None => NONE,
            Role::Lord => LORD,
            Role::Lady => LADY,
            Role::Adventurer => ADVENTURER,
            Role::Paladin => PALADIN,
            Role::Algrim => ALGRIM,
            Role::Woodsman => WOODSMAN,
        }
    }
}

impl RoleIntoU8 of Into<Role, u8> {
    #[inline(always)]
    fn into(self: Role) -> u8 {
        match self {
            Role::None => 0,
            Role::Lord => 1,
            Role::Lady => 2,
            Role::Adventurer => 3,
            Role::Paladin => 4,
            Role::Algrim => 5,
            Role::Woodsman => 6,
        }
    }
}

impl Felt252IntoRole of Into<felt252, Role> {
    #[inline(always)]
    fn into(self: felt252) -> Role {
        if self == LORD {
            Role::Lord
        } else if self == LADY {
            Role::Lady
        } else if self == ADVENTURER {
            Role::Adventurer
        } else if self == PALADIN {
            Role::Paladin
        } else if self == ALGRIM {
            Role::Algrim
        } else if self == WOODSMAN {
            Role::Woodsman
        } else {
            Role::None
        }
    }
}

impl U8IntoRole of Into<u8, Role> {
    #[inline(always)]
    fn into(self: u8) -> Role {
        if self == 1 {
            Role::Lord
        } else if self == 2 {
            Role::Lady
        } else if self == 3 {
            Role::Adventurer
        } else if self == 4 {
            Role::Paladin
        } else if self == 5 {
            Role::Algrim
        } else if self == 6 {
            Role::Woodsman
        } else {
            Role::None
        }
    }
}

impl RolePrint of PrintTrait<Role> {
    #[inline(always)]
    fn print(self: Role) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Role, NONE, LORD, LADY, ADVENTURER, PALADIN, ALGRIM, WOODSMAN,};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_role_into_felt() {
        assert(NONE == Role::None.into(), 'Role: wrong None');
        assert(LORD == Role::Lord.into(), 'Role: wrong Lord');
        assert(LADY == Role::Lady.into(), 'Role: wrong Lady');
        assert(ADVENTURER == Role::Adventurer.into(), 'Role: wrong Adventurer');
        assert(PALADIN == Role::Paladin.into(), 'Role: wrong Paladin');
        assert(ALGRIM == Role::Algrim.into(), 'Role: wrong Algrim');
        assert(WOODSMAN == Role::Woodsman.into(), 'Role: wrong Woodsman');
    }

    #[test]
    fn test_felt_into_role() {
        assert(Role::None == NONE.into(), 'Role: wrong None');
        assert(Role::Lord == LORD.into(), 'Role: wrong Lord');
        assert(Role::Lady == LADY.into(), 'Role: wrong Lady');
        assert(Role::Adventurer == ADVENTURER.into(), 'Role: wrong Adventurer');
        assert(Role::Paladin == PALADIN.into(), 'Role: wrong Paladin');
        assert(Role::Algrim == ALGRIM.into(), 'Role: wrong Algrim');
        assert(Role::Woodsman == WOODSMAN.into(), 'Role: wrong Woodsman');
    }

    #[test]
    fn test_unknown_felt_into_role() {
        assert(Role::None == 'X'.into(), 'Role: wrong None');
    }

    #[test]
    fn test_role_into_u8() {
        assert(0_u8 == Role::None.into(), 'Role: wrong None');
        assert(1_u8 == Role::Lord.into(), 'Role: wrong Lord');
        assert(2_u8 == Role::Lady.into(), 'Role: wrong Lady');
        assert(3_u8 == Role::Adventurer.into(), 'Role: wrong Adventurer');
        assert(4_u8 == Role::Paladin.into(), 'Role: wrong Paladin');
        assert(5_u8 == Role::Algrim.into(), 'Role: wrong Algrim');
        assert(6_u8 == Role::Woodsman.into(), 'Role: wrong Woodsman');
    }

    #[test]
    fn test_u8_into_role() {
        assert(Role::None == 0_u8.into(), 'Role: wrong None');
        assert(Role::Lord == 1_u8.into(), 'Role: wrong Lord');
        assert(Role::Lady == 2_u8.into(), 'Role: wrong Lady');
        assert(Role::Adventurer == 3_u8.into(), 'Role: wrong Adventurer');
        assert(Role::Paladin == 4_u8.into(), 'Role: wrong Paladin');
        assert(Role::Algrim == 5_u8.into(), 'Role: wrong Algrim');
        assert(Role::Woodsman == 6_u8.into(), 'Role: wrong Woodsman');
    }

    #[test]
    fn test_unknown_u8_into_role() {
        assert(Role::None == UNKNOWN_U8.into(), 'Role: wrong None');
    }
}
