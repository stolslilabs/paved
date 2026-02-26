use paved::constants;
use paved::mocks::token::{IERC20FaucetDispatcher, IERC20FaucetDispatcherTrait};
use paved::store::{StoreTrait};
use paved::models::tournament::{TournamentTrait};
use paved::types::mode::Mode;
use paved::tests::setup::{setup, setup::{IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER},};
use snforge_std::{
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address
};

#[test]
fn test_economy_spawn_locks_snapshot_once() {
    start_cheat_block_timestamp_global(1_000);

    let (world, _, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    assert(game.entry_multiplier_fp > 0, 'Economy: lock multiplier');
    assert(game.entry_target_snapshot != 0, 'Economy: lock target');

    let mut state = store.economy_state();
    state.last_supply = 9_999_999_999_999_999_999;
    store.set_economy_state(state);

    let game_after = store.game(context.game_id);
    assert(
        game_after.entry_multiplier_fp == game.entry_multiplier_fp, 'Economy: snapshot immutable'
    );
}

#[test]
fn test_economy_claim_uses_locked_multiplier_after_supply_change() {
    start_cheat_block_timestamp_global(2_000);

    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION
    );

    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_game_id = game.id;
    tournament.top1_multiplier_fp = game.entry_multiplier_fp;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    let mut state = store.economy_state();
    state.last_supply = 9_999_999_999_999_999_999;
    store.set_economy_state(state);

    let balance_before = context.token.balance_of(PLAYER());
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);
    let balance_after = context.token.balance_of(PLAYER());

    assert(balance_after > balance_before, 'Economy: locked reward');
}

#[test]
fn test_economy_oversupply_snapshot_zero_multiplier_results_in_zero_mint() {
    start_cheat_block_timestamp_global(3_000);

    let (world, systems, context) = setup::spawn_game(Mode::None);
    let store = StoreTrait::new(world);

    let mut state = store.economy_state();
    state.last_supply = 3_000_000_000_000_000_000;
    store.set_economy_state(state);

    let game_id = systems.daily.spawn();
    let game = store.game(game_id);
    assert(game.entry_multiplier_fp == 0, 'Economy: oversupply multiplier');

    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION
    );
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_game_id = game.id;
    tournament.top1_multiplier_fp = game.entry_multiplier_fp;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    let balance_before = context.token.balance_of(PLAYER());
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);
    let balance_after = context.token.balance_of(PLAYER());

    assert(balance_after == balance_before, 'Economy: zero mint');
}

#[test]
fn test_economy_faucet_mint_updates_supply_snapshot() {
    let (world, _, context) = setup::spawn_game(Mode::None);
    let store = StoreTrait::new(world);
    let faucet = IERC20FaucetDispatcher { contract_address: context.token.contract_address };
    let state_before = store.economy_state();

    start_cheat_caller_address(context.token.contract_address, PLAYER());
    faucet.mint();
    stop_cheat_caller_address(context.token.contract_address);

    let state_after = store.economy_state();
    assert(state_after.last_supply != state_before.last_supply, 'Economy: faucet updates supply');
    assert(
        state_after.total_minted != state_before.total_minted, 'Economy: faucet tracks minted'
    );
}
