//! The leagues' pieces (#644, `docs/architecture/leagues.md`) on their own: the league table and
//! its amounts pinned (section 4), the reset and the season of a time, the packings, and each
//! component over its own storage (`component_state_for_testing`): the season clock and the league
//! records. The system that composes them with the crowns is `paved::tests::matchmaker_system`.

use paved::components::leagueable::LeagueableComponent::InternalTrait as LeagueableInternal;
use paved::components::leagueable::{
    ILeagueable, LeagueRecord, LeagueRecordPacking, LeagueableComponent, Reach, Roll, roll_of,
};
use paved::components::seasonable::SeasonableComponent::InternalTrait as SeasonableInternal;
use paved::components::seasonable::{
    ISeasonable, SeasonClock, SeasonClockPacking, SeasonableComponent,
};
use paved::matchmaker::leagues::{
    LEAGUE_COUNT, LEGEND, MIN_SEASON_ATTACKS, MIN_SEASON_LENGTH, RESET_CROWNS, UNRANKED, bonus_of,
    floor_of, league_of, reset, reward_of, season_of, season_start,
};
use paved::systems::matchmaker::Matchmaker;
use snforge_std::start_cheat_block_timestamp_global;
use starknet::ContractAddress;
use starknet::storage::StorageMapWriteAccess;

const START: u64 = 1_800_000_000;
const DAY: u64 = 86400;
const LENGTH: u64 = 28 * 86400;

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
fn test_league_table_pins_floors_bonuses_and_rewards() {
    // (league, floor, bonus, reward)
    let rows: Array<(u8, u32, u8, u8)> = array![
        (0, 0, 0, 0), (1, 400, 5, 10), (2, 500, 5, 10), (3, 600, 5, 10), (4, 800, 10, 20),
        (5, 1000, 10, 20), (6, 1200, 10, 20), (7, 1400, 15, 35), (8, 1600, 15, 35),
        (9, 1800, 15, 35), (10, 2000, 20, 50), (11, 2200, 20, 50), (12, 2400, 20, 50),
        (13, 2600, 25, 75), (14, 2800, 25, 75), (15, 3000, 25, 75), (16, 3200, 30, 100),
        (17, 3500, 30, 100), (18, 3800, 30, 100), (19, 4100, 40, 150), (20, 4400, 40, 150),
        (21, 4700, 40, 150), (22, 5000, 50, 250),
    ];
    assert_eq!(rows.len(), LEAGUE_COUNT.into());
    for (league, floor, bonus, reward) in rows {
        assert_eq!(floor_of(league), floor);
        assert_eq!(bonus_of(league), bonus);
        assert_eq!(reward_of(league), reward);
        // The floor is in the league, the crown below it in the one under
        assert_eq!(league_of(floor), league);
        if floor != 0 {
            assert_eq!(league_of(floor - 1), league - 1);
        }
    }
    assert_eq!(UNRANKED, 0);
    assert_eq!(LEGEND, LEAGUE_COUNT - 1);
    assert_eq!(floor_of(LEGEND), RESET_CROWNS);
    assert_eq!(league_of(core::num::traits::Bounded::<u32>::MAX), LEGEND);
}

#[test]
fn test_a_full_climb_pays_485_in_bonuses() {
    let mut total: u32 = 0;
    let mut league: u8 = 0;
    while league < LEAGUE_COUNT {
        total += bonus_of(league).into();
        league += 1;
    }
    assert_eq!(total, 485);
}

#[test]
#[should_panic(expected: 'Leagues: invalid league')]
fn test_bonus_of_a_league_past_legend_fails() {
    bonus_of(LEAGUE_COUNT);
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
fn test_season_of_a_time() {
    // Unset or before the start: season 0
    assert_eq!(season_of(0, 0, START), 0);
    assert_eq!(season_of(START, LENGTH, START - 1), 0);
    // Season 1 from the start, 2 from one length on
    assert_eq!(season_of(START, LENGTH, START), 1);
    assert_eq!(season_of(START, LENGTH, START + LENGTH - 1), 1);
    assert_eq!(season_of(START, LENGTH, START + LENGTH), 2);
    assert_eq!(season_of(START, LENGTH, START + 10 * LENGTH + 5), 11);
    assert_eq!(season_start(START, LENGTH, 1), START);
    assert_eq!(season_start(START, LENGTH, 11), START + 10 * LENGTH);
    // Saturates at `u32`'s bound
    assert_eq!(season_of(0, 1, core::num::traits::Bounded::<u64>::MAX), 0xffffffff);
}

// The packings

#[test]
fn test_record_and_clock_pack_bit_for_bit() {
    let record = LeagueRecord { season: 0xfedcba98, peak: 22, attacks: 0xffff };
    let word = LeagueRecordPacking::pack(record);
    assert_eq!(word, 0xfedcba98 + 22 * 0x100000000 + 0xffff * 0x10000000000);
    assert_eq!(LeagueRecordPacking::unpack(word), record);
    let clock = SeasonClock { start: START, length: LENGTH };
    let word = SeasonClockPacking::pack(clock);
    assert_eq!(word, START.into() + LENGTH.into() * 0x10000000000000000);
    assert_eq!(SeasonClockPacking::unpack(word), clock);
    assert_eq!(LeagueRecordPacking::unpack(0), Default::default());
}

// The season clock (section 3)

#[test]
fn test_clock_unset_is_season_zero_then_set_once() {
    start_cheat_block_timestamp_global(START);
    let mut state = seasons();
    assert_eq!(state.current_season(), 0);
    state.set_clock(START + DAY, LENGTH);
    assert_eq!(state.season_clock(), SeasonClock { start: START + DAY, length: LENGTH });
    assert_eq!(state.current_season(), 0);
    // Changed again before it starts
    state.set_clock(START + 2 * DAY, LENGTH);
    start_cheat_block_timestamp_global(START + 2 * DAY);
    assert_eq!(state.current_season(), 1);
    start_cheat_block_timestamp_global(START + 2 * DAY + LENGTH);
    assert_eq!(state.current_season(), 2);
}

#[test]
#[should_panic(expected: 'Seasons: clock started')]
fn test_clock_cannot_change_once_started() {
    start_cheat_block_timestamp_global(START);
    let mut state = seasons();
    state.set_clock(START + DAY, LENGTH);
    start_cheat_block_timestamp_global(START + DAY);
    state.set_clock(START + 2 * DAY, LENGTH);
}

#[test]
#[should_panic(expected: 'Seasons: invalid clock')]
fn test_clock_in_the_past_fails() {
    start_cheat_block_timestamp_global(START);
    seasons().set_clock(START, LENGTH);
}

#[test]
#[should_panic(expected: 'Seasons: invalid clock')]
fn test_clock_shorter_than_a_day_fails() {
    start_cheat_block_timestamp_global(START);
    seasons().set_clock(START + 1, MIN_SEASON_LENGTH - 1);
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
fn test_climb_reaches_each_league_once_with_its_bonus() {
    let mut state = leagues();
    state.roll(village(1), 450, 1);
    assert_eq!(state.league_record(village(1)).peak, 1);
    // From Bronze III to Silver III: Bronze II, Bronze I, Silver III
    let reached = state.climb(village(1), 800, true, true);
    assert_eq!(
        reached,
        array![
            Reach { season: 1, league: 2, bonus: 5 }, Reach { season: 1, league: 3, bonus: 5 },
            Reach { season: 1, league: 4, bonus: 10 },
        ],
    );
    // Down and back up: nothing new; one more attack each time
    assert_eq!(state.climb(village(1), 420, true, true).len(), 0);
    assert_eq!(state.climb(village(1), 810, false, true).len(), 0);
    assert_eq!(state.league_record(village(1)), LeagueRecord { season: 1, peak: 4, attacks: 2 });
    // Unpaid (a crown set): reached, bonus 0
    assert_eq!(
        state.climb(village(1), 1000, false, false),
        array![Reach { season: 1, league: 5, bonus: 0 }],
    );
}

#[test]
fn test_climb_in_season_zero_reaches_nothing() {
    let mut state = leagues();
    assert_eq!(state.climb(village(1), 5000, true, true).len(), 0);
    assert_eq!(state.league_record(village(1)), Default::default());
}

#[test]
fn test_attacks_saturate() {
    let mut state = leagues();
    state.league_records.write(village(1), LeagueRecord { season: 1, peak: 0, attacks: 0xffff });
    state.climb(village(1), 0, true, true);
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
