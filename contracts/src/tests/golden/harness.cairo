//! Shared harness of the golden games.
//!
//! A golden game is a list of `GoldenMove`: the tile that must have been drawn, what the player
//! does with it, and the game score expected once the move is played. The harness replays the list
//! against the real systems and checks every step, so any change of a rule, of the deck draw or of
//! the scoring shows up at the first move that diverges.

use paved::models::game::{Game, GameTrait};
use paved::models::tile::Tile;
use paved::models::tournament::TournamentTrait;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::leaderboard;
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, TestStore, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use starknet::ContractAddress;

/// One step of a golden game.
/// `orientation == Orientation::None` means that the drawn tile is discarded.
#[derive(Copy, Drop)]
pub struct GoldenMove {
    /// Plan that the real deck draws for the builder before the move.
    pub drawn: Plan,
    /// Plan played: the drawn one, or the one that replaces it in forced games.
    pub plan: Plan,
    pub orientation: Orientation,
    pub x: u32,
    pub y: u32,
    pub role: Role,
    pub spot: Spot,
    /// Game score once the move is played.
    pub score: u32,
}

/// Final state of a golden game.
#[derive(Copy, Drop)]
pub struct GoldenOutcome {
    pub score: u32,
    pub built: u8,
    pub discarded: u8,
    /// Tile count, the starter tile included.
    pub tile_count: u32,
    pub over: bool,
    /// Characters bitmap of the builder at the end (bit set = still placed).
    pub characters: u8,
    /// Top score written to the tournament of the game (0 if the game is not over).
    pub top1_score: u32,
}

/// Seconds of the first tournament day used by the Daily golden games, plus a day offset.
pub fn day(index: u64) -> u64 {
    86400 * (1000 + index) + 3600
}

/// A move on a tile of the real deck.
pub fn mv(
    plan: Plan, orientation: Orientation, x: u32, y: u32, role: Role, spot: Spot, score: u32,
) -> GoldenMove {
    GoldenMove { drawn: plan, plan, orientation, x, y, role, spot, score }
}

/// A move on a forced tile: `drawn` is what the deck gives, `plan` what is played instead.
pub fn forced(
    drawn: Plan,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
    role: Role,
    spot: Spot,
    score: u32,
) -> GoldenMove {
    GoldenMove { drawn, plan, orientation, x, y, role, spot, score }
}

pub fn discard(plan: Plan, score: u32) -> GoldenMove {
    GoldenMove {
        drawn: plan,
        plan,
        orientation: Orientation::None,
        x: 0,
        y: 0,
        role: Role::None,
        spot: Spot::None,
        score,
    }
}

pub fn assert_outcome(
    store: TestStore, name: felt252, game: Game, player_id: felt252, outcome: GoldenOutcome,
) {
    assert_eq!(game.score, outcome.score, "Golden {}: final score", name);
    assert_eq!(game.built, outcome.built, "Golden {}: built count", name);
    assert_eq!(game.discarded, outcome.discarded, "Golden {}: discard count", name);
    assert_eq!(game.tile_count, outcome.tile_count, "Golden {}: tile count", name);
    assert_eq!(game.is_over(), outcome.over, "Golden {}: game over", name);
    let builder = store.builder(game, player_id);
    assert_eq!(
        builder.characters, outcome.characters.into(), "Golden {}: builder characters", name,
    );
    let first = leaderboard::ranked(
        store.contract, TournamentTrait::compute_id(game.start_time, game.duration()), 1,
    );
    assert_eq!(first.score, outcome.top1_score, "Golden {}: tournament top score", name);
    if outcome.top1_score != 0 {
        assert_eq!(first.player_id, player_id, "Golden {}: tournament top player", name);
    }
}

/// Set to true to print the observed values instead of asserting them (used to record a new case).
const RECORD: bool = false;

/// Spawns a Daily game for `caller` at `timestamp` and replays `moves` on it.
/// - `forced`: the drawn tile is replaced by the plan of the move (the deck draw is not under
/// test),
///   otherwise the plan drawn by the real deck must be the one of the move.
/// - `tile_limit`: when not zero, shortens the deck so that the game ends in a few moves.
/// Returns the final game.
pub fn play_daily(
    name: felt252,
    timestamp: u64,
    caller: ContractAddress,
    forced: bool,
    tile_limit: u16,
    moves: Span<GoldenMove>,
    outcome: GoldenOutcome,
) -> Game {
    replay_daily(name, timestamp, caller, forced, tile_limit, moves, outcome, Check::None)
}

/// `play_daily`, with the differential check of P5-4 (`oracle::check`) on the built tile after
/// every build. A separate run, so that the golden's gas budget measures the game alone.
pub fn play_daily_checked(
    name: felt252,
    timestamp: u64,
    caller: ContractAddress,
    forced: bool,
    tile_limit: u16,
    moves: Span<GoldenMove>,
    outcome: GoldenOutcome,
) -> Game {
    replay_daily(name, timestamp, caller, forced, tile_limit, moves, outcome, Check::Full)
}

/// `play_daily_checked` with the lighter check (`oracle::check::assert_tile_agrees_lite`): the
/// full-deck game, whose test is at the gas cap already.
pub fn play_daily_checked_lite(
    name: felt252,
    timestamp: u64,
    caller: ContractAddress,
    forced: bool,
    tile_limit: u16,
    moves: Span<GoldenMove>,
    outcome: GoldenOutcome,
) -> Game {
    replay_daily(name, timestamp, caller, forced, tile_limit, moves, outcome, Check::Lite)
}

#[derive(Copy, Drop, PartialEq)]
enum Check {
    None,
    Full,
    Lite,
}

fn run_check(store: TestStore, game_id: u32, tile_id: u32, checked: Check) {
    if checked == Check::Lite {
        check::assert_tile_agrees_lite(store, game_id, tile_id);
    } else {
        check::assert_tile_agrees(store, game_id, tile_id);
    }
}

fn replay_daily(
    name: felt252,
    timestamp: u64,
    caller: ContractAddress,
    forced: bool,
    tile_limit: u16,
    moves: Span<GoldenMove>,
    outcome: GoldenOutcome,
    checked: Check,
) -> Game {
    snforge_std::start_cheat_block_timestamp_global(timestamp);
    let (store, systems, _) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.daily.contract_address, caller);
    let game_id = systems.daily.spawn();
    if checked != Check::None {
        // The starter tile is placed by the spawn: its records agree with the walks too
        run_check(store, game_id, 1, checked);
    }
    if tile_limit != 0 {
        let mut game = store.game(game_id);
        game.tile_limit = tile_limit;
        store.set_game(game);
    }

    let mut step: u32 = 0;
    for golden in moves {
        let game = store.game(game_id);
        let builder = store.builder(game, caller.into());
        let mut tile: Tile = store.tile(game, builder.tile_id);
        let before: u8 = tile.plan;
        if RECORD {
            println!("GOLDEN {} step={} plan_before={}", name, step, before);
        } else {
            let expected: u8 = (*golden.drawn).into();
            assert_eq!(before, expected, "Golden {}: drawn plan at step {}", name, step);
        }
        if forced {
            tile.plan = (*golden.plan).into();
            store.set_tile(tile);
        }
        if *golden.orientation == Orientation::None {
            systems.daily.discard(game_id);
        } else {
            systems
                .daily
                .build(
                    game_id, *golden.orientation, *golden.x, *golden.y, *golden.role, *golden.spot,
                );
            if checked != Check::None {
                run_check(store, game_id, builder.tile_id, checked);
            }
        }
        let game = store.game(game_id);
        if RECORD {
            let drawn: felt252 = store
                .tile(game, store.builder(game, caller.into()).tile_id)
                .plan
                .into();
            println!("GOLDEN {} step={} score={} next_plan={}", name, step, game.score, drawn);
        } else {
            assert_eq!(game.score, *golden.score, "Golden {}: score at step {}", name, step);
        }
        step += 1;
    }

    let game = store.game(game_id);
    if RECORD {
        println!(
            "GOLDEN {} end score={} built={} discarded={} tile_count={} over={}",
            name,
            game.score,
            game.built,
            game.discarded,
            game.tile_count,
            game.is_over(),
        );
        let builder = store.builder(game, caller.into());
        let first = leaderboard::ranked(
            store.contract, TournamentTrait::compute_id(game.start_time, game.duration()), 1,
        );
        println!(
            "GOLDEN {} end characters={} top1_score={}",
            name,
            builder.characters,
            first.score,
        );
        assert(false, 'Golden: record run');
    } else {
        assert_outcome(store, name, game, caller.into(), outcome);
    }
    game
}

/// One step of a golden Tutorial game: the tutorial places the tile by itself, the player only
/// builds or discards.
#[derive(Copy, Drop)]
pub struct TutorialStep {
    /// Plan of the tile that the builder must hold before the step.
    pub plan: Plan,
    pub discard: bool,
    /// Game score once the step is played.
    pub score: u32,
}

/// Spawns a Tutorial game and replays `steps` on it. Returns the final game.
pub fn play_tutorial(name: felt252, steps: Span<TutorialStep>, outcome: GoldenOutcome) -> Game {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let game_id = context.game_id;

    let mut step: u32 = 0;
    for golden in steps {
        let game = store.game(game_id);
        let builder = store.builder(game, context.player_id);
        let tile: Tile = store.tile(game, builder.tile_id);
        let before: u8 = tile.plan;
        if RECORD {
            println!("GOLDEN {} step={} plan_before={}", name, step, before);
        } else {
            let expected: u8 = (*golden.plan).into();
            assert_eq!(before, expected, "Golden {}: drawn plan at step {}", name, step);
        }
        if *golden.discard {
            systems.tutorial.discard(game_id);
        } else {
            systems.tutorial.build(game_id);
        }
        let game = store.game(game_id);
        if RECORD {
            println!("GOLDEN {} step={} score={}", name, step, game.score);
        } else {
            assert_eq!(game.score, *golden.score, "Golden {}: score at step {}", name, step);
        }
        step += 1;
    }

    let game = store.game(game_id);
    if RECORD {
        println!(
            "GOLDEN {} end score={} built={} discarded={} tile_count={} over={}",
            name,
            game.score,
            game.built,
            game.discarded,
            game.tile_count,
            game.is_over(),
        );
        let builder = store.builder(game, context.player_id);
        let first = leaderboard::ranked(
            store.contract, TournamentTrait::compute_id(game.start_time, game.duration()), 1,
        );
        println!(
            "GOLDEN {} end characters={} top1_score={}",
            name,
            builder.characters,
            first.score,
        );
        assert(false, 'Golden: record run');
    } else {
        assert_outcome(store, name, game, context.player_id, outcome);
    }
    game
}
