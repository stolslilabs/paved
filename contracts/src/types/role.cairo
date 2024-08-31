// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::category::Category;

mod errors {
    const ROLE_NOT_ALLOWED: felt252 = 'Role: not allowed';
}

#[derive(Copy, Drop, Serde, PartialEq)]
enum Role {
    None,
    Lord,
    Lady,
    Adventurer,
    Paladin,
    Pilgrim,
}

#[generate_trait]
impl RoleImpl of RoleTrait {
    #[inline]
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
            Role::Pilgrim => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 2,
            },
        }
    }

    #[inline]
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
            Role::Pilgrim => match category {
                Category::None => 0,
                Category::Forest => 0,
                Category::Road => 1,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 2,
            },
        }
    }

    #[inline]
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
            Role::Pilgrim => match category {
                Category::None => false,
                Category::Forest => false,
                Category::Road => true,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => true,
            },
        }
    }
}

#[generate_trait]
impl RoleAssert of AssertTrait {
    #[inline]
    fn assert_is_allowed(self: Role, category: Category) {
        assert(self.is_allowed(category), errors::ROLE_NOT_ALLOWED);
    }
}

impl RoleIntoU8 of core::Into<Role, u8> {
    #[inline]
    fn into(self: Role) -> u8 {
        match self {
            Role::None => 0,
            Role::Lord => 1,
            Role::Lady => 2,
            Role::Adventurer => 3,
            Role::Paladin => 4,
            Role::Pilgrim => 5,
            _ => 0,
        }
    }
}

impl U8IntoRole of core::Into<u8, Role> {
    #[inline]
    fn into(self: u8) -> Role {
        match self {
            0 => Role::None,
            1 => Role::Lord,
            2 => Role::Lady,
            3 => Role::Adventurer,
            4 => Role::Paladin,
            5 => Role::Pilgrim,
            _ => Role::None,
        }
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Role, RoleImpl, Category};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_role_into_u8() {
        assert(0_u8 == Role::None.into(), 'Role: wrong None');
        assert(1_u8 == Role::Lord.into(), 'Role: wrong Lord');
        assert(2_u8 == Role::Lady.into(), 'Role: wrong Lady');
        assert(3_u8 == Role::Adventurer.into(), 'Role: wrong Adventurer');
        assert(4_u8 == Role::Paladin.into(), 'Role: wrong Paladin');
        assert(5_u8 == Role::Pilgrim.into(), 'Role: wrong Pilgrim');
    }

    #[test]
    fn test_u8_into_role() {
        assert(Role::None == 0_u8.into(), 'Role: wrong None');
        assert(Role::Lord == 1_u8.into(), 'Role: wrong Lord');
        assert(Role::Lady == 2_u8.into(), 'Role: wrong Lady');
        assert(Role::Adventurer == 3_u8.into(), 'Role: wrong Adventurer');
        assert(Role::Paladin == 4_u8.into(), 'Role: wrong Paladin');
        assert(Role::Pilgrim == 5_u8.into(), 'Role: wrong Pilgrim');
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
