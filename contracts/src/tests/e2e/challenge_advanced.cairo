use paved::constants;
use paved::mocks::erc20::interface::{
    IERC20CamelOnlyDispatcher, IERC20CamelOnlyDispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use paved::models::tile::CENTER;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};

#[test]
#[available_gas(l2_gas: 97092919)]
fn test_daily_e2e_discard_increments_counter() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);

    systems.challenge.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Challenge: discard count');
}

#[test]
#[available_gas(l2_gas: 109053000)]
fn test_daily_e2e_build_then_discard_tracks_both_actions() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
    systems.challenge.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Challenge: build kept');
    assert(game.discarded == 1, 'Challenge: discard kept');
}

#[test]
#[available_gas(l2_gas: 97096564)]
fn test_daily_e2e_token_erc20_entrypoints() {
    let (_, _, context) = setup::spawn_game(Mode::Challenge);

    let token_address = context.token.contract_address;
    let metadata = IERC20MetadataDispatcher { contract_address: token_address };
    let camel = IERC20CamelOnlyDispatcher { contract_address: token_address };

    // The token of Daily is USDC (6 decimals; `Faucet` here, whose name and symbol are byte
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
