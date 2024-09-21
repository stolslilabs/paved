// Game

const ROAD_BASE_POINTS: u32 = 100;
const FOREST_BASE_POINTS: u32 = 300;
const CITY_BASE_POINTS: u32 = 200;
const WONDER_BASE_POINTS: u32 = 900;
const DISCARD_POINTS: u32 = 50;
const CENTER: u32 = 0x7fffffff;

// Tournament

const DAILY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
const DAILY_TOURNAMENT_DURATION: u64 = 86400; // 1 day
const WEEKLY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
const WEEKLY_TOURNAMENT_DURATION: u64 = 604800; // 1 week

// Bonus curve

const BASE: u32 = 10235;
const MULTIPLIER: u32 = 10000;

// Packing / Unpacking

const MASK_8: u128 = 0xff;
