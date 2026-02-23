// Game

pub const ROAD_BASE_POINTS: u32 = 100;
pub const FOREST_BASE_POINTS: u32 = 300;
pub const CITY_BASE_POINTS: u32 = 200;
pub const WONDER_BASE_POINTS: u32 = 900;
pub const DISCARD_POINTS: u32 = 50;
pub const CENTER: u32 = 0x7fffffff;

// Tournament

pub const DAILY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
pub const DAILY_TOURNAMENT_DURATION: u64 = 86400; // 1 day
pub const WEEKLY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
pub const WEEKLY_TOURNAMENT_DURATION: u64 = 604800; // 1 week

// Bonus curve

pub const BASE: u32 = 10235;
pub const MULTIPLIER: u32 = 10000;

// Packing / Unpacking

pub const MASK_8: u128 = 0xff;
