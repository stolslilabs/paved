// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::types::category::Category;

// Constants

const NONE: felt252 = 0;
const LORD: felt252 = 'LORD';
const LADY: felt252 = 'LADY';
const ADVENTURER: felt252 = 'ADVENTURER';
const PALADIN: felt252 = 'PALADIN';
const ALGRIM: felt252 = 'ALGRIM';
const WOODSMAN: felt252 = 'WOODSMAN';
const HERDSMAN: felt252 = 'HERDSMAN';

mod errors {
    const ROLE_NOT_ALLOWED: felt252 = 'Role: not allowed';
}

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Role {
    None,
    Lord,
    Lady,
    Adventurer,
    Paladin,
    Algrim,
    Woodsman,
    Herdsman,
}

#[generate_trait]
impl RoleImpl of RoleTrait {
    #[inline(always)]
    fn weight(self: Role, category: Category) -> u8 {
        match self {
            Role::None => 0,
            Role::Lord => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Lady => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Adventurer => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 2,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Paladin => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 0,
                Category::City => 2,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Algrim => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 2,
            },
            Role::Woodsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
            Role::Herdsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
        }
    }

    #[inline(always)]
    fn power(self: Role, category: Category) -> u8 {
        match self {
            Role::None => 0,
            Role::Lord => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Lady => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Adventurer => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 2,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Paladin => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 0,
                Category::City => 2,
                Category::Stop => 0,
                Category::Wonder => 1,
            },
            Role::Algrim => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 2,
            },
            Role::Woodsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
            Role::Herdsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
        }
    }

    #[inline(always)]
    fn is_allowed(self: Role, category: Category) -> bool {
        match self {
            Role::None => false,
            Role::Lord => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => true,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => true,
            },
            Role::Lady => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => true,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => true,
            },
            Role::Adventurer => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => true,
                Category::City => false,
                Category::Stop => false,
                Category::Wonder => true,
            },
            Role::Paladin => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => false,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => true,
            },
            Role::Algrim => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => true,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => true,
            },
            Role::Woodsman => match category {
                Category::None => false,
                Category::Forest => true,
                Category::Road => false,
                Category::City => false,
                Category::Stop => false,
                Category::Wonder => false,
            },
            Role::Herdsman => match category {
                Category::None => false,
                Category::Forest => true,
                Category::Road => false,
                Category::City => false,
                Category::Stop => false,
                Category::Wonder => false,
            },
        }
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_is_allowed(self: Role, category: Category) {
        assert(self.is_allowed(category), errors::ROLE_NOT_ALLOWED);
    }
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
            Role::Herdsman => HERDSMAN,
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
            Role::Herdsman => 7,
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
        } else if self == HERDSMAN {
            Role::Herdsman
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
        } else if self == 7 {
            Role::Herdsman
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

    use super::{
        Role, RoleImpl, Category, NONE, LORD, LADY, ADVENTURER, PALADIN, ALGRIM, WOODSMAN, HERDSMAN
    };

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
        assert(HERDSMAN == Role::Herdsman.into(), 'Role: wrong Herdsman');
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
        assert(Role::Herdsman == HERDSMAN.into(), 'Role: wrong Herdsman');
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
        assert(7_u8 == Role::Herdsman.into(), 'Role: wrong Herdsman');
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
        assert(Role::Herdsman == 7_u8.into(), 'Role: wrong Herdsman');
    }

    #[test]
    fn test_unknown_u8_into_role() {
        assert(Role::None == UNKNOWN_U8.into(), 'Role: wrong None');
    }

    #[test]
    fn test_weight_paladin_forest() {
        assert(Role::Paladin.weight(Category::Forest) == 0, 'Role: wrong weight');
    }

    #[test]
    fn test_weight_paladin_city() {
        assert(Role::Paladin.weight(Category::City) == 2, 'Role: wrong weight');
    }

    #[test]
    fn test_weight_paladin_road() {
        assert(Role::Paladin.weight(Category::Road) == 0, 'Role: wrong weight');
    }

    #[test]
    fn test_power_paladin_forest() {
        assert(Role::Paladin.power(Category::Forest) == 0, 'Role: wrong power');
    }

    #[test]
    fn test_power_paladin_city() {
        assert(Role::Paladin.power(Category::City) == 2, 'Role: wrong power');
    }

    #[test]
    fn test_power_paladin_road() {
        assert(Role::Paladin.power(Category::Road) == 0, 'Role: wrong power');
    }

    #[test]
    fn test_is_allowed_paladin_forest() {
        assert(!Role::Paladin.is_allowed(Category::Forest), 'Role: wrong is_allowed');
    }

    #[test]
    fn test_is_allowed_paladin_city() {
        assert(Role::Paladin.is_allowed(Category::City), 'Role: wrong is_allowed');
    }

    #[test]
    fn test_is_allowed_paladin_road() {
        assert(!Role::Paladin.is_allowed(Category::Road), 'Role: wrong is_allowed');
    }
}
