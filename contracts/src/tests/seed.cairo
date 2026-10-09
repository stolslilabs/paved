//! `SeedSource`: the initial seed of a game comes only through the source given to `spawn`.

use paved::models::game::{Game, GameImpl, GameTrait};
use paved::seed::{DailySeed, SeedSource};
use paved::types::mode::{Mode, ModeTrait};
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

const TIME: u64 = 1_000_000;
const GAME_ID: u32 = 7;
const PLAYER: felt252 = 'PLAYER';

fn started(mode: Mode, seed: felt252) -> Game {
    let mut game = GameImpl::new(GAME_ID, TIME, mode, PLAYER);
    game.start(TIME, seed);
    game
}

#[test]
fn test_daily_seed_is_the_mode_seed() {
    for mode in array![Mode::Daily, Mode::Tutorial] {
        let expected = mode.seed(TIME, GAME_ID, 0);
        assert_eq!(DailySeed {}.seed(mode, TIME, GAME_ID, 0), expected);
    }
}

#[test]
fn test_daily_seed_tutorial_is_zero_and_daily_is_not() {
    assert_eq!(DailySeed {}.seed(Mode::Tutorial, TIME, GAME_ID, 0), 0);
    assert!(DailySeed {}.seed(Mode::Daily, TIME, GAME_ID, 0) != 0);
}

#[test]
fn test_start_default_source_reproduces_the_daily_game() {
    let seed = DailySeed {}.seed(Mode::Daily, TIME, GAME_ID, 0);
    let game = started(Mode::Daily, seed);
    assert_eq!(game.seed, Mode::Daily.seed(TIME, GAME_ID, 0));
}

#[test]
fn test_start_stub_source_changes_the_draw() {
    let default = started(Mode::Daily, DailySeed {}.seed(Mode::Daily, TIME, GAME_ID, 0));
    let stub = StubSeed { value: 12345 };
    let other = started(Mode::Daily, stub.seed(Mode::Daily, TIME, GAME_ID, 0));
    assert_eq!(other.seed, 12345);
    assert!(other.seed != default.seed);
    // [Assert] The seed decides the first tile drawn: some stub seed draws another plan
    let mut a = default;
    let (_, plan_a) = a.draw_plan();
    let mut value: felt252 = 1;
    let mut found = false;
    while value != 64 {
        let mut c = started(Mode::Daily, StubSeed { value }.seed(Mode::Daily, TIME, GAME_ID, 0));
        let (_, plan_c) = c.draw_plan();
        if plan_c != plan_a {
            found = true;
            break;
        }
        value += 1;
    }
    assert!(found);
}
