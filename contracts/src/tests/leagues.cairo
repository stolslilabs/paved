//! The leagues' pieces (#644, `docs/architecture/leagues.md`) on their own: the league table and
//! its amounts pinned (section 4), the reset and the season of a time, the packings, and each
//! component over its own storage (`component_state_for_testing`): the season clock and the league
//! records. The system that composes them with the crowns is `paved::tests::matchmaker_system`.

use paved::components::leagueable::LeagueableComponent::InternalTrait as LeagueableInternal;
use paved::components::leagueable::{
    ILeagueable, LeagueRecord, LeagueRecordPacking, LeagueableComponent, Reach, Roll, roll_of,
};
use paved::components::seasonable::SeasonableComponent::InternalTrait as SeasonableInternal;
use paved::components::seasonable::{ISeasonable, SeasonableComponent};
use paved::matchmaker::leagues::{
    LEAGUE_COUNT, LEAGUE_GROUPS, LEGEND, MIN_SEASON_ATTACKS, MISSIONS_COUNT_NPC, POOL_CROWNS_CAP,
    RESET_CROWNS, SEASONS_PER_YEAR, SEASON_STARTS, SEASON_TABLE_FIRST_YEAR, SEASON_TABLE_LENGTH,
    TROPICAL_YEAR, UNRANKED, calendar_season, floor_of, groups_of, is_season_start, league_of,
    reset, reward_of, season_boundary, season_of, season_start,
};
use paved::systems::matchmaker::Matchmaker;
use snforge_std::start_cheat_block_timestamp_global;
use starknet::ContractAddress;
use starknet::storage::StorageMapWriteAccess;

const START: u64 = 1_800_000_000;
const DAY: u64 = 86400;
// The equinoxes and solstices of 2027 and the March equinox of 2028, UTC (DE440s): 20 March
// 20:24:41, 21 June 14:10:50, 23 September 06:01:43, 22 December 02:42:09, 20 March 2028 02:17:08
const MAR_2027: u64 = 1805574281;
const JUN_2027: u64 = 1813587050;
const SEP_2027: u64 = 1821679303;
const DEC_2027: u64 = 1829443330;
const MAR_2028: u64 = 1837131428;

type Seasons = SeasonableComponent::ComponentState<Matchmaker::ContractState>;
type Leagues = LeagueableComponent::ComponentState<Matchmaker::ContractState>;

fn seasons() -> Seasons {
    SeasonableComponent::component_state_for_testing()
}

fn leagues() -> Leagues {
    LeagueableComponent::component_state_for_testing()
}

fn village(id: u32) -> ContractAddress {
    let address: felt252 = 0x1000 + id.into();
    address.try_into().unwrap()
}

// The table (section 4)

#[test]
fn test_league_table_pins_floors_groups_and_rewards() {
    // (league, floor, groups reached, reward)
    let rows: Array<(u8, u32, u8, u8)> = array![
        (0, 0, 0, 0), (1, 400, 1, 10), (2, 500, 1, 10), (3, 600, 1, 10), (4, 800, 2, 20),
        (5, 1000, 2, 20), (6, 1200, 2, 20), (7, 1400, 3, 35), (8, 1600, 3, 35), (9, 1800, 3, 35),
        (10, 2000, 4, 50), (11, 2200, 4, 50), (12, 2400, 4, 50), (13, 2600, 5, 75),
        (14, 2800, 5, 75), (15, 3000, 5, 75), (16, 3200, 6, 100), (17, 3500, 6, 100),
        (18, 3800, 6, 100), (19, 4100, 7, 150), (20, 4400, 7, 150), (21, 4700, 7, 150),
        (22, 5000, 8, 250),
    ];
    assert_eq!(rows.len(), LEAGUE_COUNT.into());
    for (league, floor, groups, reward) in rows {
        assert_eq!(floor_of(league), floor);
        assert_eq!(groups_of(league), groups);
        assert_eq!(reward_of(league), reward);
        // The floor is in the league, the crown below it in the one under
        assert_eq!(league_of(floor), league);
        if floor != 0 {
            assert_eq!(league_of(floor - 1), league - 1);
        }
    }
    assert_eq!(UNRANKED, 0);
    assert_eq!(LEGEND, LEAGUE_COUNT - 1);
    assert_eq!(groups_of(LEGEND), LEAGUE_GROUPS);
    assert_eq!(floor_of(LEGEND), RESET_CROWNS);
    assert_eq!(league_of(core::num::traits::Bounded::<u32>::MAX), LEGEND);
}

#[test]
fn test_proposal_defaults_are_pinned() {
    // The owner's ruling on the "LEAGUES proposal for the owner" (docs/architecture/leagues.md,
    // section 9, #644): A on every point, the four real seasons from the equinoxes and solstices
    assert_eq!(SEASONS_PER_YEAR, 4);
    assert_eq!(SEASON_TABLE_FIRST_YEAR, 2026);
    assert_eq!(SEASON_TABLE_LENGTH, 200);
    assert_eq!(TROPICAL_YEAR, 31556925);
    assert_eq!(RESET_CROWNS, 5000);
    assert_eq!(MIN_SEASON_ATTACKS, 5);
    assert!(!MISSIONS_COUNT_NPC);
    assert_eq!(POOL_CROWNS_CAP, RESET_CROWNS);
}

#[test]
#[should_panic(expected: 'Leagues: invalid league')]
fn test_groups_of_a_league_past_legend_fails() {
    groups_of(LEAGUE_COUNT);
}

#[test]
#[fuzzer(runs: 64, seed: 644)]
fn test_fuzz_league_of_is_the_highest_floor_at_or_below(crowns: u32) {
    let league = league_of(crowns);
    assert(floor_of(league) <= crowns, 'floor above the crowns');
    if league != LEGEND {
        assert(floor_of(league + 1) > crowns, 'next floor at or below');
    }
}

#[test]
#[fuzzer(runs: 64, seed: 644)]
fn test_fuzz_reset_never_raises_and_keeps_low_counts(crowns: u32) {
    let after = reset(crowns);
    assert(after <= crowns, 'reset raised');
    assert(after <= RESET_CROWNS, 'reset above the threshold');
    if crowns <= RESET_CROWNS {
        assert_eq!(after, crowns);
    }
    assert_eq!(reset(after), after);
}

#[test]
fn test_season_table_is_pinned() {
    // The table's ends and every year's spring, from DE440s: 20 March 2026 14:45:57 UTC, ...,
    // 21 December 2075 18:28:03 UTC
    let table = SEASON_STARTS.span();
    assert_eq!(table.len().into(), SEASON_TABLE_LENGTH);
    assert_eq!(*table.at(0), 1774017957);
    assert_eq!(*table.at(1), 1782030270);
    assert_eq!(*table.at(2), 1790121913);
    assert_eq!(*table.at(3), 1797886214);
    assert_eq!(*table.at(196), 3320308052);
    assert_eq!(*table.at(199), 3344178484);
    // In order, each season 88 to 94 days (winter is the shortest, 88.96 days at least), each year
    // one tropical year within half a day
    let mut i: u32 = 1;
    while i < table.len() {
        let length = *table.at(i) - *table.at(i - 1);
        assert(length >= 88 * DAY && length <= 94 * DAY, 'season length');
        if i >= 4 {
            let year = *table.at(i) - *table.at(i - 4);
            assert(year > TROPICAL_YEAR - DAY / 2 && year < TROPICAL_YEAR + DAY / 2, 'year length');
        }
        i += 1;
    }
}

#[test]
fn test_calendar_seasons_start_at_the_equinoxes_and_solstices() {
    // Spring, summer, autumn, winter of 2027, then spring 2028: the seasons 4, 5, 6, 7 and 8 of
    // the table, counted from spring 2026
    let starts = array![MAR_2027, JUN_2027, SEP_2027, DEC_2027, MAR_2028];
    let mut index: u64 = 4;
    for start in starts {
        assert_eq!(season_boundary(index), start);
        assert_eq!(calendar_season(start), index + 1);
        assert_eq!(calendar_season(start - 1), index);
        assert!(is_season_start(start));
        assert!(!is_season_start(start + 1));
        index += 1;
    }
    // Before spring 2026, no calendar season
    assert_eq!(calendar_season(START - 400 * DAY), 0);
    assert!(!is_season_start(0));
}

#[test]
fn test_past_the_table_seasons_step_by_tropical_years() {
    // 2076: the 2075 events plus one tropical year, within 30 minutes of DE440s (20 March
    // 2076 16:59:50, 20 June 10:37:47, 22 September 02:51:16, 21 December 00:14:24 UTC)
    let ephemeris = array![3351865190, 3359875067, 3367968676, 3375735264];
    let mut index = SEASON_TABLE_LENGTH;
    for event in ephemeris {
        let boundary = season_boundary(index);
        assert_eq!(
            boundary, *SEASON_STARTS.span().at((index - 4).try_into().unwrap()) + TROPICAL_YEAR,
        );
        let gap = if boundary > event {
            boundary - event
        } else {
            event - boundary
        };
        assert(gap < 1800, 'drift over 30 minutes');
        assert_eq!(calendar_season(boundary), index + 1);
        assert_eq!(calendar_season(boundary - 1), index);
        index += 1;
    }
    // Far past it, the count still brackets the time
    let far = season_boundary(SEASON_TABLE_LENGTH + 4000);
    assert_eq!(calendar_season(far), SEASON_TABLE_LENGTH + 4001);
}

#[test]
fn test_season_of_a_time() {
    // Unset or before the start: season 0
    assert_eq!(season_of(0, START), 0);
    assert_eq!(season_of(MAR_2027, MAR_2027 - 1), 0);
    // Season 1 from the start, then one per calendar season: about three months each
    assert_eq!(season_of(MAR_2027, MAR_2027), 1);
    assert_eq!(season_of(MAR_2027, JUN_2027 - 1), 1);
    assert_eq!(season_of(MAR_2027, JUN_2027), 2);
    assert_eq!(season_of(MAR_2027, DEC_2027 + 5), 4);
    assert_eq!(season_of(MAR_2027, MAR_2028), 5);
    assert_eq!(season_start(MAR_2027, 1), MAR_2027);
    assert_eq!(season_start(MAR_2027, 4), DEC_2027);
    assert_eq!(season_start(MAR_2027, 5), MAR_2028);
    // About 13 weeks a season: the weekly missions still fit
    assert!((JUN_2027 - MAR_2027) / (7 * DAY) == 13);
    // A clock off an event is refused (`is_season_start`): the March equinox's second only
    assert!(!is_season_start(MAR_2027 - 1));
}

#[test]
#[fuzzer(runs: 64, seed: 644)]
fn test_fuzz_calendar_season_brackets_the_time(time: u64) {
    // Any time from spring 2026 to about the year 30,000: the boundary before it and the next one
    let time = *SEASON_STARTS.span().at(0) + time % 884541340800;
    let count = calendar_season(time);
    assert(count >= 1, 'no season');
    let start = season_boundary(count - 1);
    assert(start <= time, 'season starts after');
    assert(season_boundary(count) > time, 'next season not after');
    assert(is_season_start(start), 'start not a start');
    let length = season_boundary(count) - start;
    assert(length >= 88 * DAY && length <= 94 * DAY, 'not a season');
}

// The packings

#[test]
fn test_record_packs_bit_for_bit() {
    let record = LeagueRecord { season: 0xfedcba98, peak: 22, attacks: 0xffff };
    let word = LeagueRecordPacking::pack(record);
    assert_eq!(word, 0xfedcba98 + 22 * 0x100000000 + 0xffff * 0x10000000000);
    assert_eq!(LeagueRecordPacking::unpack(word), record);
    assert_eq!(LeagueRecordPacking::unpack(0), Default::default());
}

// The season clock (section 3)

#[test]
fn test_clock_unset_is_season_zero_then_set_once() {
    start_cheat_block_timestamp_global(START);
    let mut state = seasons();
    assert_eq!(state.current_season(), 0);
    state.set_clock(MAR_2027);
    assert_eq!(state.season_clock(), MAR_2027);
    assert_eq!(state.current_season(), 0);
    // Changed again before it starts
    state.set_clock(JUN_2027);
    start_cheat_block_timestamp_global(JUN_2027);
    assert_eq!(state.current_season(), 1);
    assert_eq!(state.season_start(2), SEP_2027);
    start_cheat_block_timestamp_global(SEP_2027);
    assert_eq!(state.current_season(), 2);
}

#[test]
#[should_panic(expected: 'Seasons: clock started')]
fn test_clock_cannot_change_once_started() {
    start_cheat_block_timestamp_global(START);
    let mut state = seasons();
    state.set_clock(MAR_2027);
    start_cheat_block_timestamp_global(MAR_2027);
    state.set_clock(JUN_2027);
}

#[test]
#[should_panic(expected: 'Seasons: invalid clock')]
fn test_clock_in_the_past_fails() {
    start_cheat_block_timestamp_global(JUN_2027);
    seasons().set_clock(MAR_2027);
}

#[test]
#[should_panic(expected: 'Seasons: invalid clock')]
fn test_clock_off_a_season_start_fails() {
    start_cheat_block_timestamp_global(START);
    seasons().set_clock(MAR_2027 + DAY);
}

#[test]
#[should_panic(expected: 'Seasons: invalid season')]
fn test_season_start_of_an_unset_clock_fails() {
    seasons().season_start(1);
}

// The league records (section 5)

#[test]
fn test_roll_from_season_zero_closes_nothing_and_resets_nothing() {
    let mut state = leagues();
    let roll = state.roll(village(1), 7000, 1);
    assert_eq!(roll, Roll { closed: 0, league: 0, reward: 0, crowns: 7000 });
    assert_eq!(
        state.league_record(village(1)), LeagueRecord { season: 1, peak: LEGEND, attacks: 0 },
    );
    // Already there: a no-op
    assert_eq!(
        state.roll(village(1), 7000, 1), Roll { closed: 0, league: 0, reward: 0, crowns: 7000 },
    );
}

#[test]
fn test_roll_from_season_zero_past_a_season_end_resets_without_paying() {
    // A village untouched since before the clock, first touched in season 2: season 1 ended while
    // it held 7,000, so it is reset to 5,000; it settled no attack in a real season, so no reward
    let mut state = leagues();
    let roll = state.roll(village(1), 7000, 2);
    assert_eq!(roll, Roll { closed: 0, league: 0, reward: 0, crowns: RESET_CROWNS });
    assert_eq!(
        state.league_record(village(1)), LeagueRecord { season: 2, peak: LEGEND, attacks: 0 },
    );
    // Under the threshold the crowns stay
    assert_eq!(state.roll(village(2), 4200, 9).crowns, 4200);
}

#[test]
#[fuzzer(runs: 64, seed: 644)]
fn test_fuzz_roll_from_season_zero(crowns: u32, target: u32) {
    // Season 0 into season 1 keeps the crowns; into any later season resets them; never pays
    let target = 1 + target % 1000;
    let (next, roll) = roll_of(Default::default(), crowns, target);
    assert_eq!(roll.closed, 0);
    assert_eq!(roll.reward, 0);
    let expected = if target > 1 {
        reset(crowns)
    } else {
        crowns
    };
    assert_eq!(roll.crowns, expected);
    assert_eq!(next, LeagueRecord { season: target, peak: league_of(expected), attacks: 0 });
}

#[test]
fn test_roll_closes_the_season_pays_its_league_and_resets() {
    let mut state = leagues();
    state.league_records.write(village(1), LeagueRecord { season: 3, peak: LEGEND, attacks: 5 });
    let roll = state.roll(village(1), 5321, 5);
    assert_eq!(roll, Roll { closed: 3, league: LEGEND, reward: 250, crowns: RESET_CROWNS });
    // The new season starts at the reset crowns' league, no attack
    assert_eq!(
        state.league_record(village(1)), LeagueRecord { season: 5, peak: LEGEND, attacks: 0 },
    );
}

#[test]
fn test_roll_without_enough_attacks_pays_nothing() {
    let mut state = leagues();
    let attacks = MIN_SEASON_ATTACKS - 1;
    state.league_records.write(village(1), LeagueRecord { season: 1, peak: 9, attacks });
    let roll = state.roll(village(1), 1850, 2);
    assert_eq!(roll, Roll { closed: 1, league: 9, reward: 0, crowns: 1850 });
    assert_eq!(state.league_record(village(1)), LeagueRecord { season: 2, peak: 9, attacks: 0 });
}

#[test]
fn test_climb_reaches_each_league_once() {
    let mut state = leagues();
    state.roll(village(1), 450, 1);
    assert_eq!(state.league_record(village(1)).peak, 1);
    // From Bronze III to Silver III: Bronze II, Bronze I, Silver III
    let reached = state.climb(village(1), 800, true);
    assert_eq!(
        reached,
        array![
            Reach { season: 1, league: 2 }, Reach { season: 1, league: 3 },
            Reach { season: 1, league: 4 },
        ],
    );
    // Down and back up: nothing new; one more attack each time
    assert_eq!(state.climb(village(1), 420, true).len(), 0);
    assert_eq!(state.climb(village(1), 810, false).len(), 0);
    assert_eq!(state.league_record(village(1)), LeagueRecord { season: 1, peak: 4, attacks: 2 });
    assert_eq!(state.climb(village(1), 1000, false), array![Reach { season: 1, league: 5 }]);
}

#[test]
fn test_climb_in_season_zero_reaches_nothing() {
    let mut state = leagues();
    assert_eq!(state.climb(village(1), 5000, true).len(), 0);
    assert_eq!(state.league_record(village(1)), Default::default());
}

#[test]
fn test_attacks_saturate() {
    let mut state = leagues();
    state.league_records.write(village(1), LeagueRecord { season: 1, peak: 0, attacks: 0xffff });
    state.climb(village(1), 0, true);
    assert_eq!(state.league_record(village(1)).attacks, 0xffff);
}

#[test]
#[fuzzer(runs: 64, seed: 644)]
fn test_fuzz_roll_pays_at_most_once_per_season(
    season: u32, crowns: u32, attacks: u16, peak: u8, later: u32,
) {
    // Any record of a real season, rolled into a later one, then again into the same
    let season = 1 + season % 1000;
    let target = season + 1 + later % 1000;
    let record = LeagueRecord { season, peak: peak % LEAGUE_COUNT, attacks };
    let (next, roll) = roll_of(record, crowns, target);
    assert_eq!(roll.closed, season);
    assert_eq!(roll.league, league_of(crowns));
    assert(roll.reward <= reward_of(roll.league), 'reward above its league');
    assert_eq!(roll.reward != 0, attacks >= MIN_SEASON_ATTACKS && roll.league != UNRANKED);
    assert_eq!(roll.crowns, reset(crowns));
    assert_eq!(next, LeagueRecord { season: target, peak: league_of(reset(crowns)), attacks: 0 });
    let (again, second) = roll_of(next, roll.crowns, target);
    assert_eq!(again, next);
    assert_eq!(second, Roll { closed: 0, league: 0, reward: 0, crowns: roll.crowns });
}
