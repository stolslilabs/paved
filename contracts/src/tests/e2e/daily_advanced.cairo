use paved::constants;
use paved::store::{StoreTrait};
use paved::models::tournament::{TournamentTrait};
use paved::models::tile::{CENTER};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::plan::Plan;
use paved::mocks::erc20::interface::{
    IERC20MetadataDispatcher, IERC20MetadataDispatcherTrait, IERC20CamelOnlyDispatcher,
    IERC20CamelOnlyDispatcherTrait,
};

use paved::tests::setup::{
    setup,
    setup::{IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, ANYONE, SOMEONE},
};
use snforge_std::{
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address
};

#[test]
fn test_daily_e2e_discard_increments_counter() {
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    systems.daily.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Daily: discard count');
}

#[test]
fn test_daily_e2e_sponsor_updates_prize_and_balance() {
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::DAILY_TOURNAMENT_DURATION);

    let prize_before = store.tournament(tournament_id).prize;
    let balance_before = context.token.balance_of(PLAYER());

    let sponsor_amount: felt252 = 2_000_000_000_000_000_000;
    systems.daily.sponsor(sponsor_amount);

    let prize_after = store.tournament(tournament_id).prize;
    let balance_after = context.token.balance_of(PLAYER());

    assert(prize_after == prize_before + sponsor_amount, 'Daily: sponsor prize');
    assert(balance_after < balance_before, 'Daily: sponsor debit');
}

#[test]
fn test_daily_e2e_claim_rewards_top_player_after_tournament_end() {
    start_cheat_block_timestamp_global(100);

    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::DAILY_TOURNAMENT_DURATION);

    // Force a deterministic top-1 winner for this test.
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    let balance_before = context.token.balance_of(PLAYER());

    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);

    let tournament = store.tournament(tournament_id);
    let balance_after = context.token.balance_of(PLAYER());

    assert(tournament.top1_claimed, 'Daily: claim marked');
    assert(balance_after > balance_before, 'Daily: claim reward');
}

#[test]
#[should_panic(expected: ('Tournament: not over',))]
fn test_daily_e2e_claim_reverts_before_tournament_end() {
    start_cheat_block_timestamp_global(100);

    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::DAILY_TOURNAMENT_DURATION);

    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    systems.daily.claim(tournament_id, 1);
}

#[test]
fn test_daily_e2e_build_then_discard_tracks_both_actions() {
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems.daily.build(
        context.game_id,
        Orientation::North,
        CENTER,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    systems.daily.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Daily: build kept');
    assert(game.discarded == 1, 'Daily: discard kept');
}

#[test]
fn test_daily_e2e_token_erc20_entrypoints() {
    let (_, _, context) = setup::spawn_game(Mode::Daily);

    let token_address = context.token.contract_address;
    let metadata = IERC20MetadataDispatcher { contract_address: token_address };
    let camel = IERC20CamelOnlyDispatcher { contract_address: token_address };

    // Metadata and camel ABI methods should stay in sync with standard ERC20 methods.
    assert(metadata.name() == 'Lords', 'Token: name');
    assert(metadata.symbol() == 'LORDS', 'Token: symbol');
    assert(metadata.decimals() == 18, 'Token: decimals');

    let supply_standard = context.token.total_supply();
    let supply_camel = camel.totalSupply();
    assert(supply_standard == supply_camel, 'Token: supply');

    let balance_standard = context.token.balance_of(PLAYER());
    let balance_camel = camel.balanceOf(PLAYER());
    assert(balance_standard == balance_camel, 'Token: balance');

    start_cheat_caller_address(token_address, PLAYER());
    context.token.approve(ANYONE(), 123_u256);
    stop_cheat_caller_address(token_address);

    let allowance = context.token.allowance(PLAYER(), ANYONE());
    assert(allowance == 123_u256, 'Token: allowance');

    let recipient_before = context.token.balance_of(SOMEONE());
    start_cheat_caller_address(token_address, ANYONE());
    context.token.transfer_from(PLAYER(), SOMEONE(), 100_u256);
    stop_cheat_caller_address(token_address);
    let recipient_after = context.token.balance_of(SOMEONE());

    assert(recipient_after > recipient_before, 'Token: transfer from');
}
