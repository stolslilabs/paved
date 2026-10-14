//! `SeedSource`: the initial seed of a game comes only through the source given to `spawn`.
//! `TokenSeed` (D-23) is the source of every spawn; `DaySeed` is the source that was replaced (the
//! seed of the day, D-13), kept here for the golden games recorded with it.

use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use paved::day::day_id;
use paved::models::game::{Game, GameImpl, GameTrait};
use paved::seed::{SeedSource, TokenSeed};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::plan::Plan;

/// A source that ignores the mode, the time and the salt.
#[derive(Copy, Drop)]
struct StubSeed {
    value: felt252,
}

impl StubSeedImpl of SeedSource<StubSeed> {
    fn seed(self: @StubSeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        *self.value
    }
}

/// Test only: the seed of a Challenge game before D-23, Poseidon of the salt and the day id, the
/// same for every game of a day. The golden games were recorded with it and still spawn with it
/// (`golden::harness`), so their expected draws and scores stay those of P0.
#[derive(Copy, Drop)]
pub struct DaySeed {}

pub impl DaySeedImpl of SeedSource<DaySeed> {
    fn seed(self: @DaySeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match mode {
            Mode::Challenge => PoseidonTrait::new()
                .update(salt)
                .update(day_id(time, 86400).into())
                .finalize(),
            _ => 0,
        }
    }
}

const TIME: u64 = 1_000_000;
const GAME_ID: u32 = 7;
const PLAYER_ID: felt252 = 'PLAYER';

fn started(mode: Mode, seed: felt252) -> Game {
    let mut game = GameImpl::new(GAME_ID, TIME, mode, PLAYER_ID);
    game.start(TIME, seed);
    game
}

fn poseidon(salt: felt252, id: felt252) -> felt252 {
    PoseidonTrait::new().update(salt).update(id).finalize()
}

#[test]
fn test_token_seed_is_poseidon_of_the_salt_and_the_token_id() {
    assert_eq!(TokenSeed {}.seed(Mode::Challenge, TIME, GAME_ID, 0), poseidon(0, 7));
    assert_eq!(TokenSeed {}.seed(Mode::Challenge, TIME, GAME_ID, 'SALT'), poseidon('SALT', 7));
    // [Assert] Neither the mode nor the time is read
    assert_eq!(TokenSeed {}.seed(Mode::None, TIME + 86400, GAME_ID, 0), poseidon(0, 7));
}

/// Two games of one day: the same day id, two token ids, two seeds (the day seed gave one).
#[test]
fn test_token_seed_two_games_of_one_day_differ() {
    let first = TokenSeed {}.seed(Mode::Challenge, TIME, 1, 0);
    let second = TokenSeed {}.seed(Mode::Challenge, TIME + 60, 2, 0);
    assert_eq!(day_id(TIME, 86400), day_id(TIME + 60, 86400));
    assert_eq!(first, poseidon(0, 1));
    assert_eq!(second, poseidon(0, 2));
    assert!(first != second);
    let day = DaySeed {}.seed(Mode::Challenge, TIME, 1, 0);
    assert_eq!(DaySeed {}.seed(Mode::Challenge, TIME + 60, 2, 0), day);
}

/// `Challenge.spawn` seeds each game with `TokenSeed`: Poseidon(0, game id), the salt being 0
/// (`Game::new`) and the token id the game id. Two spawns of one day draw two seeds.
#[test]
#[available_gas(l2_gas: 400000000)]
fn test_token_seed_is_the_seed_of_a_challenge_spawn() {
    snforge_std::start_cheat_block_timestamp_global(TIME);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let first = store.game(context.game_id);
    assert_eq!(first.seed, poseidon(0, context.game_id.into()));
    let second_id = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    let second = store.game(second_id);
    assert_eq!(second.seed, poseidon(0, second_id.into()));
    assert!(first.seed != second.seed);
    assert_eq!(first.day_id, second.day_id);
    assert_eq!(first.player_id, PLAYER().into());
}

#[test]
fn test_day_seed_none_is_zero_and_challenge_is_not() {
    assert_eq!(DaySeed {}.seed(Mode::None, TIME, GAME_ID, 0), 0);
    assert_eq!(
        DaySeed {}.seed(Mode::Challenge, TIME, GAME_ID, 0), poseidon(0, day_id(TIME, 86400).into()),
    );
}

#[test]
fn test_start_keeps_the_seed_of_the_source() {
    let seed = TokenSeed {}.seed(Mode::Challenge, TIME, GAME_ID, 0);
    let game = started(Mode::Challenge, seed);
    assert_eq!(game.seed, poseidon(0, GAME_ID.into()));
}

#[test]
fn test_start_stub_source_changes_the_draw() {
    let default = started(Mode::Challenge, TokenSeed {}.seed(Mode::Challenge, TIME, GAME_ID, 0));
    let stub = StubSeed { value: 12345 };
    let other = started(Mode::Challenge, stub.seed(Mode::Challenge, TIME, GAME_ID, 0));
    assert_eq!(other.seed, 12345);
    assert!(other.seed != default.seed);
    // [Assert] The seed decides the first tile drawn: some stub seed draws another plan
    let mut a = default;
    let (_, plan_a) = a.draw_plan();
    let mut value: felt252 = 1;
    let mut found = false;
    while value != 64 {
        let mut c = started(
            Mode::Challenge, StubSeed { value }.seed(Mode::Challenge, TIME, GAME_ID, 0),
        );
        let (_, plan_c) = c.draw_plan();
        if plan_c != plan_a {
            found = true;
            break;
        }
        value += 1;
    }
    assert!(found);
}

