use paved::constants;
use paved::mocks::erc20::interface::{
    IERC20CamelOnlyDispatcher, IERC20CamelOnlyDispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::tests::setup::setup::TestStoreTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use snforge_std::{
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};

#[test]
fn test_daily_e2e_discard_increments_counter() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    systems.daily.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Daily: discard count');
}

#[test]
fn test_daily_e2e_sponsor_updates_prize_and_balance() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

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

    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    // Force a deterministic top-1 winner for this test.
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    let balance_before = context.token.balance_of(PLAYER());
    let pool_before = context.token.balance_of(systems.daily.contract_address);

    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);

    let tournament = store.tournament(tournament_id);
    let balance_after = context.token.balance_of(PLAYER());
    let pool_after = context.token.balance_of(systems.daily.contract_address);
    let prize: u256 = tournament.prize.into();

    assert(tournament.top1_claimed, 'Daily: claim marked');
    assert(prize == constants::DAILY_TOURNAMENT_PRICE.into(), 'Daily: prize is entry');
    assert(balance_after - balance_before == prize, 'Daily: claim reward');
    assert(pool_before - pool_after == prize, 'Daily: pool debit');
}

#[test]
fn test_daily_e2e_claim_pays_exact_reward_per_rank() {
    start_cheat_block_timestamp_global(100);

    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    // Force the three ranks: PLAYER first, ANYONE second, SOMEONE third.
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 3;
    tournament.top2_player_id = context.anyone_id;
    tournament.top2_score = 2;
    tournament.top3_player_id = context.someone_id;
    tournament.top3_score = 1;
    store.set_tournament(tournament);

    // Prize 1e18: rank 3 = prize / 6, rank 2 = (prize - rank 3) / 3, rank 1 = the rest.
    let prize: u256 = tournament.prize.into();
    assert(prize == 1_000_000_000_000_000_000_u256, 'Daily: prize');
    let reward_1: u256 = 555_555_555_555_555_556;
    let reward_2: u256 = 277_777_777_777_777_778;
    let reward_3: u256 = 166_666_666_666_666_666;
    assert(reward_1 + reward_2 + reward_3 == prize, 'Daily: rewards sum');

    let daily = systems.daily.contract_address;
    let pool_before = context.token.balance_of(daily);
    let before_1 = context.token.balance_of(PLAYER());
    let before_2 = context.token.balance_of(ANYONE());
    let before_3 = context.token.balance_of(SOMEONE());

    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);
    start_cheat_caller_address(daily, ANYONE());
    systems.daily.claim(tournament_id, 2);
    start_cheat_caller_address(daily, SOMEONE());
    systems.daily.claim(tournament_id, 3);
    stop_cheat_caller_address(daily);

    assert(context.token.balance_of(PLAYER()) - before_1 == reward_1, 'Daily: reward 1');
    assert(context.token.balance_of(ANYONE()) - before_2 == reward_2, 'Daily: reward 2');
    assert(context.token.balance_of(SOMEONE()) - before_3 == reward_3, 'Daily: reward 3');
    assert(pool_before - context.token.balance_of(daily) == prize, 'Daily: pool debit');

    let tournament = store.tournament(tournament_id);
    assert(tournament.top1_claimed, 'Daily: claim 1 marked');
    assert(tournament.top2_claimed, 'Daily: claim 2 marked');
    assert(tournament.top3_claimed, 'Daily: claim 3 marked');
}

#[test]
#[should_panic(expected: ('Tournament: not over',))]
fn test_daily_e2e_claim_reverts_before_tournament_end() {
    start_cheat_block_timestamp_global(100);

    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    systems.daily.claim(tournament_id, 1);
}

#[test]
fn test_daily_e2e_build_then_discard_tracks_both_actions() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
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
