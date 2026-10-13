// Core imports

// Internal imports

use paved::types::category::Category;

pub mod errors {
    pub const ROLE_NOT_ALLOWED: felt252 = 'Role: not allowed';
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum Role {
    None,
    Lord,
    Lady,
    Adventurer,
    Paladin,
    Pilgrim,
    Woodsman,
    Herdsman,
}

#[generate_trait]
pub impl RoleImpl of RoleTrait {
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
            Role::Woodsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 1,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
            Role::Herdsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 0,
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
            Role::Woodsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 1,
                Category::City => 0,
                Category::Stop => 0,
                Category::Wonder => 0,
            },
            Role::Herdsman => match category {
                Category::None => 0,
                Category::Forest => 1,
                Category::Road => 0,
                Category::City => 1,
                Category::Stop => 0,
                Category::Wonder => 0,
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
            Role::Woodsman => match category {
                Category::None => false,
                Category::Forest => true,
                Category::Road => true,
                Category::City => false,
                Category::Stop => false,
                Category::Wonder => false,
            },
            Role::Herdsman => match category {
                Category::None => false,
                Category::Forest => true,
                Category::Road => false,
                Category::City => true,
                Category::Stop => false,
                Category::Wonder => false,
            },
        }
    }
}

#[generate_trait]
pub impl RoleAssert of AssertTrait {
    #[inline]
    fn assert_is_allowed(self: Role, category: Category) {
        assert(self.is_allowed(category), errors::ROLE_NOT_ALLOWED);
    }
}

pub impl RoleIntoU8 of Into<Role, u8> {
    #[inline]
    fn into(self: Role) -> u8 {
        match self {
            Role::None => 0,
            Role::Lord => 1,
            Role::Lady => 2,
            Role::Adventurer => 3,
            Role::Paladin => 4,
            Role::Pilgrim => 5,
            Role::Woodsman => 6,
            Role::Herdsman => 7,
            _ => 0,
        }
    }
}

pub impl U8IntoRole of Into<u8, Role> {
    #[inline]
    fn into(self: u8) -> Role {
        match self {
            0 => Role::None,
            1 => Role::Lord,
            2 => Role::Lady,
            3 => Role::Adventurer,
            4 => Role::Paladin,
            5 => Role::Pilgrim,
            6 => Role::Woodsman,
            7 => Role::Herdsman,
            _ => Role::None,
        }
    }
}
