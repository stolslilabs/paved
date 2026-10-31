// Game

pub const ROAD_BASE_POINTS: u32 = 100;
pub const FOREST_BASE_POINTS: u32 = 300;
pub const CITY_BASE_POINTS: u32 = 200;
pub const WONDER_BASE_POINTS: u32 = 900;
pub const DISCARD_POINTS: u32 = 50;
pub const CENTER: u32 = 0x7fffffff;

// Challenge

/// The price of one stake unit of a Challenge game: 2 USDC (6 decimals). The only definition of
/// the price: `Mode::price` (what `Challenge.spawn` pulls) reads it, and `economy::BASE_PRICE`
/// (what `Economy.purchase` checks) is built from it, so the two cannot differ.
pub const CHALLENGE_PRICE: u128 = 2_000_000;
/// The length of a day, which `day::day_id` divides by.
pub const CHALLENGE_DURATION: u64 = 86400; // 1 day
/// How long a Challenge game can be played (S1, the PM's ruling on the client specification): from
/// its start, `build` and `discard` revert with `'Game: expired'` at and after `start_time +
/// GAME_VALIDITY`. Equal to `economy::DAY`, so a game whose last move is accepted is recorded
/// before its economic expiry (`Economy.record`, `>= time + DAY`) and the two deadlines are one.
pub const GAME_VALIDITY: u64 = 86400; // 24 h

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
/// Rank 1 of a day: since D-20 the contract never reports it (no ranking on chain); kept defined
/// so that the id is never given to another task, for an indexer-credited Champion.
pub const TASK_WIN: u32 = 9;
pub const TASK_TUTORIAL_FINISHED: u32 = 10;
/// Task ids 11 to 18 are reserved (docs/architecture/quests-v2.md, "Catalogue additions"; Q-10): no
/// task takes one and the contract reports none of them. They are the ids the v2 proposals name,
/// and only a later ruling gives one a meaning: 11 `ROAD_SCORED`, 12 `CITY_SCORED`, 13
/// `HUGE_STRUCTURE`, 14 `GAME_PAID`, 15 `NO_DISCARD`, 16 `STREAK_DAYS`, 17 `STAKED_GAME`, 18
/// `STAKE_UNITS`. The v2a definitions (quests.md, "v2a") use tasks 1 to 7 only.
pub const TASK_RESERVED_FIRST: u32 = 11;
pub const TASK_RESERVED_LAST: u32 = 18;
/// The PvP tasks (#644, `docs/architecture/leagues.md`, section 7), reported by `Matchmaker` at
/// each settlement for the attacker: an attack settled, its stars, a win (at least one star), three
/// stars. `Setup` sums them by day and week for the PvP missions.
pub const TASK_PVP_ATTACK: u32 = 19;
pub const TASK_PVP_STARS: u32 = 20;
pub const TASK_PVP_WIN: u32 = 21;
pub const TASK_PVP_THREE_STARS: u32 = 22;
/// The lifetime league missions (#917, the owner's ruling of 2026-10-30, in place of the league
/// bonus): the groups a player has reached in a lifetime, 1 (the app's Iron) to 8 (Grand Master),
/// reported by `Matchmaker` when a settlement enters a group (`Setup`'s `report_league`). An
/// achievement on this task with total `g` is "reach group `g`".
pub const TASK_LEAGUE_REACHED: u32 = 23;

/// A road or a city of at least this many tiles is a big structure (to calibrate).
pub const BIG_SIZE: u32 = 8;
/// A Challenge game of at least this score is a high score (to calibrate).
pub const HIGH_SCORE: u32 = 4000;

/// The counters of `GameState` saturate at the maximum of their bit width (7, 6, 4 and 6 bits).
pub const MAX_STRUCTURES: u8 = 127;
pub const MAX_FORESTS: u8 = 63;
pub const MAX_WONDERS: u8 = 15;
pub const MAX_BIG: u8 = 63;

/// Entries of one report: tasks 1 to 4 for the quests, 1 and 4 to 7 for the achievements (the
/// package bound is 16).
pub const QUEST_ENTRIES: u32 = 4;
pub const ACHIEVEMENT_ENTRIES: u32 = 5;
