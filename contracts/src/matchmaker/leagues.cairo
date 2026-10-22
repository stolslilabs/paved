//! The leagues and seasons of PvP (#644, `docs/architecture/leagues.md`): as in Clash of Clans,
//! a league is a range of crowns, the rating of the matchmaker (owner decision of 2026-10-20).
//! Pure functions: the league of a crown count, the Cobbles of a league (its bonus, the first time
//! it is reached in a season, and its season reward), the reset at a season's end, and the season
//! of a time.
//!
//! The table is Clash of Clans' leagues before the 2025 update, one crown per trophy, the scale of
//! the matchmaker's crown curves (`paved::matchmaker::crowns`). The amounts are the note's
//! proposals (section 9), each at most 255 so a credit fits `Setup`'s `CobblesClaimed`.

/// The leagues: 0 Unranked, 1 to 21 Bronze III to Titan I (seven groups of three), 22 Legend.
pub const LEAGUE_COUNT: u8 = 23;
pub const UNRANKED: u8 = 0;
pub const LEGEND: u8 = 22;
/// At a season's end, crowns above this come back to it (Clash of Clans' Legend League reset).
pub const RESET_CROWNS: u32 = 5000;
/// The attacks a village settles in a season to earn that season's reward.
pub const MIN_SEASON_ATTACKS: u16 = 5;
/// The shortest season the owner may set: one day.
pub const MIN_SEASON_LENGTH: u64 = 86400;

/// The floor of leagues 1 to 22, in crowns (section 4).
const LEAGUE_FLOORS: [u32; 22] = [
    400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200,
    3500, 3800, 4100, 4400, 4700, 5000,
];

/// The bonus of each league of a group (Bronze to Titan), then Legend's.
const GROUP_BONUSES: [u8; 8] = [5, 10, 15, 20, 25, 30, 40, 50];

/// The season reward of a group (Bronze to Titan), then Legend's; Unranked earns nothing.
const GROUP_REWARDS: [u8; 8] = [10, 20, 35, 50, 75, 100, 150, 250];

pub mod errors {
    pub const INVALID_LEAGUE: felt252 = 'Leagues: invalid league';
}

/// The league of `crowns`: the highest whose floor is at or below them, by binary search.
pub fn league_of(crowns: u32) -> u8 {
    let floors = LEAGUE_FLOORS.span();
    let mut low: u32 = 0;
    let mut high: u32 = floors.len();
    while low < high {
        let middle = (low + high) / 2;
        if *floors.at(middle) <= crowns {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low.try_into().unwrap()
}

/// The first crown count of `league` (0 for Unranked).
pub fn floor_of(league: u8) -> u32 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        *LEAGUE_FLOORS.span().at((league - 1).into())
    }
}

/// The Cobbles of reaching `league` for the first time in a season (0 for Unranked).
pub fn bonus_of(league: u8) -> u8 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        *GROUP_BONUSES.span().at(group_of(league))
    }
}

/// The Cobbles of ending a season in `league` (0 for Unranked).
pub fn reward_of(league: u8) -> u8 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        *GROUP_REWARDS.span().at(group_of(league))
    }
}

/// The crowns after a season's end: at most `RESET_CROWNS`.
pub fn reset(crowns: u32) -> u32 {
    if crowns > RESET_CROWNS {
        RESET_CROWNS
    } else {
        crowns
    }
}

/// The season of `time` on a clock of `start` and `length`: 0 before `start` or on an unset clock
/// (`length` 0), else `(time - start) / length + 1`, saturating at `u32`'s bound.
pub fn season_of(start: u64, length: u64, time: u64) -> u32 {
    if length == 0 || time < start {
        return 0;
    }
    let season: u128 = ((time - start) / length).into() + 1;
    match season.try_into() {
        Option::Some(value) => value,
        Option::None => core::num::traits::Bounded::<u32>::MAX,
    }
}

/// The first second of season `season` (at least 1) on a clock of `start` and `length`.
pub fn season_start(start: u64, length: u64, season: u32) -> u64 {
    start + (season.into() - 1) * length
}

/// The group of a ranked league: 0 to 6 for Bronze to Titan, 7 for Legend.
fn group_of(league: u8) -> u32 {
    if league == LEGEND {
        7
    } else {
        ((league - 1) / 3).into()
    }
}
