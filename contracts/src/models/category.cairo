// Core imports

use debug::PrintTrait;

// Constants

const FARM: felt252 = 'FARM';
const ROAD: felt252 = 'ROAD';
const CITY: felt252 = 'CITY';
const STOP: felt252 = 'STOP';
const WONDER: felt252 = 'WNDR';
const FARM_KEY: felt252 = 'F';
const ROAD_KEY: felt252 = 'R';
const CITY_KEY: felt252 = 'C';
const STOP_KEY: felt252 = 'S';
const WONDER_KEY: felt252 = 'W';

#[derive(Copy, Drop, Serde, PartialEq, Introspection)]
enum Category {
    Farm,
    Road,
    City,
    Stop,
    Wonder,
}

impl CategoryIntoFelt252 of Into<Category, felt252> {
    #[inline(always)]
    fn into(self: Category) -> felt252 {
        match self {
            Category::Farm => FARM,
            Category::Road => ROAD,
            Category::City => CITY,
            Category::Stop => STOP,
            Category::Wonder => WONDER,
        }
    }
}

impl CategoryIntoU8 of Into<Category, u8> {
    #[inline(always)]
    fn into(self: Category) -> u8 {
        match self {
            Category::Farm => 1,
            Category::Road => 2,
            Category::City => 3,
            Category::Stop => 4,
            Category::Wonder => 5,
        }
    }
}

impl Felt252TryIntoCategory of TryInto<felt252, Category> {
    #[inline(always)]
    fn try_into(self: felt252) -> Option<Category> {
        if self == FARM || self == FARM_KEY {
            Option::Some(Category::Farm)
        } else if self == ROAD || self == ROAD_KEY {
            Option::Some(Category::Road)
        } else if self == CITY || self == CITY_KEY {
            Option::Some(Category::City)
        } else if self == STOP || self == STOP_KEY {
            Option::Some(Category::Stop)
        } else if self == WONDER || self == WONDER_KEY {
            Option::Some(Category::Wonder)
        } else {
            Option::None
        }
    }
}

impl U8TryIntoCategory of TryInto<u8, Category> {
    #[inline(always)]
    fn try_into(self: u8) -> Option<Category> {
        if self == 1 {
            Option::Some(Category::Farm)
        } else if self == 2 {
            Option::Some(Category::Road)
        } else if self == 3 {
            Option::Some(Category::City)
        } else if self == 4 {
            Option::Some(Category::Stop)
        } else if self == 5 {
            Option::Some(Category::Wonder)
        } else {
            Option::None
        }
    }
}

impl CategoryPrint of PrintTrait<Category> {
    #[inline(always)]
    fn print(self: Category) {
        let felt: felt252 = self.into();
        felt.print();
    }
}
