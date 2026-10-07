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

// Bonus curve

pub const BASE: u32 = 10235;
pub const MULTIPLIER: u32 = 10000;

// Packing / Unpacking

pub const MASK_8: u128 = 0xff;

// Quests and achievements (docs/architecture/quests.md)

/// Task ids reported at game over: non-zero, distinct, and distinct modulo 128 (the package merges
/// a batch in one pass only then).
pub const TASK_GAME_FINISHED: u32 = 1;
pub const TASK_STRUCTURE_SCORED: u32 = 2;
pub const TASK_POINTS: u32 = 3;
pub const TASK_FOREST_SCORED: u32 = 4;
pub const TASK_WONDER_SCORED: u32 = 5;
pub const TASK_BIG_STRUCTURE: u32 = 6;
pub const TASK_HIGH_SCORE: u32 = 7;
/// Defined for the Podium achievement, credited by the indexer: the contract never reports it.
pub const TASK_PODIUM: u32 = 8;
pub const TASK_WIN: u32 = 9;
pub const TASK_TUTORIAL_FINISHED: u32 = 10;

/// A road or a city of at least this many tiles is a big structure (to calibrate).
pub const BIG_SIZE: u32 = 8;
/// A Daily game of at least this score is a high score (to calibrate).
pub const HIGH_SCORE: u32 = 4000;

/// The counters of `GameState` saturate at the maximum of their bit width (7, 6, 4 and 6 bits).
pub const MAX_STRUCTURES: u8 = 127;
pub const MAX_FORESTS: u8 = 63;
pub const MAX_WONDERS: u8 = 15;
pub const MAX_BIG: u8 = 63;

/// Entries of one report: tasks 1 to 4 for the quests, 1, 4 to 7 and 9 for the achievements (the
/// package bound is 16).
pub const QUEST_ENTRIES: u32 = 4;
pub const ACHIEVEMENT_ENTRIES: u32 = 6;
