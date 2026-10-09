use paved::constants;
use paved::mocks::erc20::interface::{
    IERC20CamelOnlyDispatcher, IERC20CamelOnlyDispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::tests::leaderboard;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE, TestStoreTrait,
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
#[available_gas(l2_gas: 117706152)]
fn test_daily_e2e_discard_increments_counter() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    systems.daily.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Daily: discard count');
}

#[test]
#[available_gas(l2_gas: 119661255)]
fn test_daily_e2e_sponsor_updates_prize_and_balance() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    let prize_before = store.tournament(tournament_id).prize;
    let balance_before = context.token.balance_of(PLAYER());

    let sponsor_amount: felt252 = 20_000_000;
    systems.daily.sponsor(sponsor_amount);

    let prize_after = store.tournament(tournament_id).prize;
    let balance_after = context.token.balance_of(PLAYER());

    assert(prize_after == prize_before + sponsor_amount, 'Daily: sponsor prize');
    assert(balance_after < balance_before, 'Daily: sponsor debit');
}

#[test]
#[available_gas(l2_gas: 124315903)]
fn test_daily_e2e_claim_rewards_top_player_after_tournament_end() {
    start_cheat_block_timestamp_global(100);

    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    // Force a deterministic top-1 winner for this test; the prize is sponsor-only (P-31).
    leaderboard::submit(store.contract, tournament_id, context.player_id, 1);
    let sponsored: felt252 = 2_000_000;
    systems.daily.sponsor(sponsored);

    let balance_before = context.token.balance_of(PLAYER());
    let pool_before = context.token.balance_of(systems.daily.contract_address);

    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    systems.daily.claim(tournament_id, 1);

    let tournament = store.tournament(tournament_id);
    let balance_after = context.token.balance_of(PLAYER());
    let pool_after = context.token.balance_of(systems.daily.contract_address);
    let prize: u256 = tournament.prize.into();

    assert(tournament.top1_claimed, 'Daily: claim marked');
    assert(prize == sponsored.into(), 'Daily: prize is sponsored');
    // Rank 1's fixed share (P-37): ranks 2 and 3 are empty, their shares go back to the sponsor
    let reward: u256 = 1_111_112;
    assert(balance_after - balance_before == reward, 'Daily: claim reward');
    assert(pool_before - pool_after == reward, 'Daily: pool debit');
}

#[test]
#[available_gas(l2_gas: 133619589)]
fn test_daily_e2e_claim_pays_exact_reward_per_rank() {
    start_cheat_block_timestamp_global(100);

    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    // Force the three ranks: PLAYER first, ANYONE second, SOMEONE third.
    leaderboard::submit(store.contract, tournament_id, context.player_id, 3);
    leaderboard::submit(store.contract, tournament_id, context.anyone_id, 2);
    leaderboard::submit(store.contract, tournament_id, context.someone_id, 1);

    // A sponsored prize of 7 USDC (entries no longer feed it, P-31): rank 3 = prize / 6, rank 2 =
    // (prize - rank 3) / 3, rank 1 = the rest.
    systems.daily.sponsor(7_000_000);
    let tournament = store.tournament(tournament_id);
    let prize: u256 = tournament.prize.into();
    assert(prize == 7_000_000_u256, 'Daily: prize');
    let reward_1: u256 = 3_888_890;
    let reward_2: u256 = 1_944_444;
    let reward_3: u256 = 1_166_666;
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

    leaderboard::submit(store.contract, tournament_id, context.player_id, 1);
    systems.daily.sponsor(2_000_000);

    systems.daily.claim(tournament_id, 1);
}

#[test]
#[available_gas(l2_gas: 127473871)]
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
#[available_gas(l2_gas: 119022519)]
fn test_daily_e2e_token_erc20_entrypoints() {
    let (_, _, context) = setup::spawn_game(Mode::Daily);

    let token_address = context.token.contract_address;
    let metadata = IERC20MetadataDispatcher { contract_address: token_address };
    let camel = IERC20CamelOnlyDispatcher { contract_address: token_address };

    // The token of Daily is USDC (6 decimals; `MockUSDC` here, whose name and symbol are byte
    // arrays). Camel ABI methods should stay in sync with standard ERC20 methods.
    assert(metadata.decimals() == 6, 'Token: decimals');

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
