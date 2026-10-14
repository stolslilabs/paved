//! Shared harness of the golden games.
//!
//! A golden game is a list of `GoldenMove`: the tile that must have been drawn, what the player
//! does with it, and the game score expected once the move is played. The harness replays the list
//! against the real systems and checks every step, so any change of a rule, of the deck draw or of
//! the scoring shows up at the first move that diverges.
//!
//! D-18b: the expected scores come from the oracle's walks (`oracle::score`), not from the
//! structure state. A record run (`RECORD`) prints, step by step, the score the oracle gives: the
//! score before plus `score::move_points` for a build, minus the discard penalty for a discard. The
//! checked replays (`*_structures_agree`) assert, on every build, that the move scored exactly what
//! the walks give, and at the end that the board's finished structures all scored.

use paved::constants::DISCARD_POINTS;
use paved::models::game::{Game, GameTrait};
use paved::models::tile::Tile;
use paved::systems::challenge::Challenge;
use paved::systems::challenge::Challenge::InternalTrait;
use paved::tests::oracle::check;
use paved::tests::seed::DaySeed;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, Systems, TestStore, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
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
}

/// Seconds of the first day used by the Daily golden games, plus a day offset.
pub fn day(index: u64) -> u64 {
    86400 * (1000 + index) + 3600
}

/// Spawns a paid Challenge game (stake 1, no referrer) for `player`,
/// through `Challenge.spawn`'s own path (`spawn_from`: the wiring, the purchase, the mint), with
/// the seed of the day the goldens were recorded with (`seed::DaySeed`) instead of the token's
/// (D-23). Every expected draw and score of the goldens stays that of P0. The path runs in
/// Challenge's state (`interact_with_state`), where the caller is the test's own: it is cheated to
/// `player`, and USDC, `Economy` and `Collection` are told that Challenge calls them, as on chain.
pub fn spawn_on_the_day_seed(
    systems: @Systems, token: ContractAddress, player: ContractAddress,
) -> u32 {
    let challenge = *systems.challenge.contract_address;
    snforge_std::start_cheat_caller_address(snforge_std::test_address(), player);
    let callees = array![
        token, *systems.economy.contract_address, *systems.collection.contract_address,
    ];
    // [Info] One call each, Challenge's own: the purchase's `transferFrom`, `Economy.purchase` and
    // `Collection.mint` (the calls `Economy` then makes are its own)
    for callee in callees {
        snforge_std::cheat_caller_address(callee, challenge, snforge_std::CheatSpan::TargetCalls(1));
    }
    let game_id = snforge_std::interact_with_state(
        challenge,
        || {
            let mut state = Challenge::contract_state_for_testing();
            state.spawn_from(@DaySeed {}, 1, core::num::traits::Zero::zero(), 0)
        },
    );
    snforge_std::stop_cheat_caller_address(snforge_std::test_address());
    game_id
}

/// A move on a tile of the real deck.
pub fn mv(plan: Plan, orientation: Orientation, x: u32, y: u32, score: u32) -> GoldenMove {
    GoldenMove { drawn: plan, plan, orientation, x, y, score }
}

/// A move on a forced tile: `drawn` is what the deck gives, `plan` what is played instead.
pub fn forced(
    drawn: Plan, plan: Plan, orientation: Orientation, x: u32, y: u32, score: u32,
) -> GoldenMove {
    GoldenMove { drawn, plan, orientation, x, y, score }
}

pub fn discard(plan: Plan, score: u32) -> GoldenMove {
    GoldenMove { drawn: plan, plan, orientation: Orientation::None, x: 0, y: 0, score }
}

pub fn assert_outcome(name: felt252, game: Game, outcome: GoldenOutcome) {
    assert_eq!(game.score, outcome.score, "Golden {}: final score", name);
    assert_eq!(game.built, outcome.built, "Golden {}: built count", name);
    assert_eq!(game.discarded, outcome.discarded, "Golden {}: discard count", name);
    assert_eq!(game.tile_count, outcome.tile_count, "Golden {}: tile count", name);
    assert_eq!(game.is_over(), outcome.over, "Golden {}: game over", name);
}

/// Set to true to print the scores the oracle gives instead of asserting them (to record the
/// expected values of a case: run its `*_structures_agree` test, which has the oracle).
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

/// `play_daily_checked` with the lighter check (`oracle::check::assert_tile_agrees_lite`), and the
/// points of the moves checked once, on the whole board at the end (`assert_board_scored`): the
/// full-deck game, whose test is at the step limit of the VM with more. Its record run checks every
/// move (`snforge test --max-n-steps`, by hand).
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
    let (store, systems, context) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.challenge.contract_address, caller);
    let game_id = spawn_on_the_day_seed(@systems, context.token.contract_address, caller);
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
    // [Info] The score the oracle gives, and what the discards took from it
    let mut oracle: u32 = 0;
    let mut penalties: u32 = 0;
    for golden in moves {
        let game = store.game(game_id);
        let score_before = game.score;
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
            systems.challenge.discard(game_id);
            let taken = if oracle < DISCARD_POINTS {
                oracle
            } else {
                DISCARD_POINTS
            };
            oracle -= taken;
            penalties += score_before - store.game(game_id).score;
        } else {
            systems.challenge.build(game_id, *golden.orientation, *golden.x, *golden.y);
            if checked != Check::None {
                run_check(store, game_id, builder.tile_id, checked);
                // [Info] The lite check (the full-deck game) leaves the move's points to the board
                // check at the end, for the steps of the VM; its record run has them all
                if checked == Check::Full || RECORD {
                    let (points, _) = check::move_points(store, game_id, builder.tile_id);
                    oracle += points;
                    check::assert_move_scored(store, game_id, builder.tile_id, score_before);
                }
            }
        }
        let game = store.game(game_id);
        if RECORD {
            let drawn: felt252 = store
                .tile(game, store.builder(game, caller.into()).tile_id)
                .plan
                .into();
            println!("GOLDEN {} step={} oracle={} next_plan={}", name, step, oracle, drawn);
        } else {
            assert_eq!(game.score, *golden.score, "Golden {}: score at step {}", name, step);
        }
        step += 1;
    }

    let game = store.game(game_id);
    if checked != Check::None {
        // Every finished structure of the board scored, once
        check::assert_board_scored(store, game_id, penalties);
    }
    if RECORD {
        println!(
            "GOLDEN {} end oracle={} built={} discarded={} tile_count={} over={}",
            name,
            oracle,
            game.built,
            game.discarded,
            game.tile_count,
            game.is_over(),
        );
        assert(false, 'Golden: record run');
    } else {
        assert_outcome(name, game, outcome);
    }
    game
}
