//! P8 E5b: `Lobby.spawn` mints the game's token to its player (`docs/architecture/economy.md`,
//! section 9), through the real `Daily`, `Tutorial`, `Account` and `Collection`: the id is the
//! game id for Daily and `2^32 + game id` for Tutorial, the player owns it right after the spawn,
//! no entry point lets a caller choose an id, and a spawn without a collection reverts and leaves
//! no game.

use core::byte_array::ByteArrayTrait;
use core::num::traits::Zero;
use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
use paved::systems::collection::{
    Collection, ICollectionSafeDispatcher, ICollectionSafeDispatcherTrait,
    IERC721MetadataSoulboundDispatcher, IERC721MetadataSoulboundDispatcherTrait,
    IERC721SoulboundDispatcher, IERC721SoulboundDispatcherTrait, IERC721SoulboundSafeDispatcher,
    IERC721SoulboundSafeDispatcherTrait, TUTORIAL_OFFSET, metadata,
};
use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::systems::tutorial::{
    ITutorialDispatcherTrait, ITutorialSafeDispatcher, ITutorialSafeDispatcherTrait,
};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, OWNER, PLAYER, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn erc721(systems: @setup::Systems) -> IERC721SoulboundDispatcher {
    IERC721SoulboundDispatcher { contract_address: *systems.collection.contract_address }
}

fn tutorial_token(game_id: u32) -> u256 {
    TUTORIAL_OFFSET + game_id.into()
}

/// What `token_uri` must return for a game of `contract` read now: section 9's JSON, base64.
fn expected_uri(contract: ContractAddress, token_id: u256, game_id: u32) -> ByteArray {
    let game = IGameViewDispatcher { contract_address: contract }.game(game_id);
    let json = metadata::json(token_id, game.score, game.over, game.start_time / 86400);
    let mut uri = metadata::uri_prefix();
    ByteArrayTrait::append(ref uri, @metadata::base64(@json));
    uri
}

#[test]
fn test_mint_a_daily_spawn_mints_the_game_to_the_player() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    let erc721 = erc721(@systems);
    assert(context.game_id == 1, 'Mint: first game id');
    assert(erc721.owner_of(context.game_id.into()) == PLAYER(), 'Mint: owner');
    assert(erc721.balance_of(PLAYER()) == 1, 'Mint: balance');
}

#[test]
fn test_mint_a_tutorial_spawn_mints_2_pow_32_plus_the_game_id() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    let erc721 = erc721(@systems);
    assert(erc721.owner_of(tutorial_token(context.game_id)) == PLAYER(), 'Mint: owner');
    assert(erc721.balance_of(PLAYER()) == 1, 'Mint: balance');
    // [Check] The Daily range is untouched
    let safe = IERC721SoulboundSafeDispatcher {
        contract_address: systems.collection.contract_address,
    };
    assert(safe.owner_of(context.game_id.into()).is_err(), 'Mint: daily id minted');
}

/// The same game id exists in both contracts: two tokens, told apart by the range.
#[test]
fn test_mint_the_same_game_id_of_both_modes_is_two_tokens() {
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    let tutorial = systems.tutorial.spawn();
    let erc721 = erc721(@systems);
    assert(tutorial == 1, 'Mint: tutorial game id');
    assert(erc721.owner_of(1) == PLAYER(), 'Mint: daily token');
    assert(erc721.owner_of(tutorial_token(1)) == PLAYER(), 'Mint: tutorial token');
    assert(erc721.balance_of(PLAYER()) == 2, 'Mint: balance');
}

/// A spawn always mints exactly the new game's own id: after three spawns the tokens are 1 to 3
/// and the next id is free.
#[test]
fn test_mint_a_spawn_mints_exactly_the_new_game_id() {
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    let erc721 = erc721(@systems);
    let safe = IERC721SoulboundSafeDispatcher {
        contract_address: systems.collection.contract_address,
    };
    let mut spy = spy_events();
    let second = systems.daily.spawn(1, Zero::zero(), 0);
    let third = systems.daily.spawn(1, Zero::zero(), 0);
    assert(second == 2 && third == 3, 'Mint: game ids');
    spy
        .assert_emitted(
            @array![
                (
                    systems.collection.contract_address,
                    Collection::Event::Transfer(
                        Collection::Transfer { from: Zero::zero(), to: PLAYER(), token_id: 2 },
                    ),
                ),
                (
                    systems.collection.contract_address,
                    Collection::Event::Transfer(
                        Collection::Transfer { from: Zero::zero(), to: PLAYER(), token_id: 3 },
                    ),
                ),
            ],
        );
    assert(erc721.balance_of(PLAYER()) == 3, 'Mint: three tokens');
    assert(safe.owner_of(4).is_err(), 'Mint: next id minted');
    assert(safe.owner_of(tutorial_token(1)).is_err(), 'Mint: tutorial id minted');
}

/// No public path lets a caller choose a token id: `Daily`, `Tutorial` and the `Lobby` class they
/// run have no `mint`, and `Collection.mint` itself refuses everyone but the two minters, each
/// for its own range. Pre-minting a future game id would make its spawn revert.
#[test]
fn test_mint_no_public_path_reaches_mint_with_a_chosen_id() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let future: u256 = 5;
    // [Check] The entry points of the game contracts
    for contract in array![systems.daily.contract_address, systems.tutorial.contract_address] {
        let safe = ICollectionSafeDispatcher { contract_address: contract };
        let reason = *safe.mint(PLAYER(), future).unwrap_err().at(0);
        assert(reason == 'ENTRYPOINT_NOT_FOUND', 'Mint: a game contract mints');
    }
    // [Check] The collection, for a player, the owner, and a minter outside its own range
    let collection = ICollectionSafeDispatcher {
        contract_address: systems.collection.contract_address,
    };
    for caller in array![PLAYER(), OWNER(), ANYONE()] {
        start_cheat_caller_address(systems.collection.contract_address, caller);
        let reason = *collection.mint(PLAYER(), future).unwrap_err().at(0);
        assert(reason == 'Collection: not minter', 'Mint: a caller mints');
    }
    start_cheat_caller_address(systems.collection.contract_address, systems.daily.contract_address);
    let reason = *collection.mint(PLAYER(), tutorial_token(5)).unwrap_err().at(0);
    assert(reason == 'Collection: not minter', 'Mint: daily mints tutorial');
    start_cheat_caller_address(
        systems.collection.contract_address, systems.tutorial.contract_address,
    );
    let reason = *collection.mint(PLAYER(), future).unwrap_err().at(0);
    assert(reason == 'Collection: not minter', 'Mint: tutorial mints daily');
    stop_cheat_caller_address(systems.collection.contract_address);
    // [Check] Nothing was minted, and the next spawn still gets its own id
    let erc721 = erc721(@systems);
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let mut id = 0;
    while id < 5 {
        id = systems.daily.spawn(1, Zero::zero(), 0);
    }
    assert(erc721.owner_of(5) == PLAYER(), 'Mint: fifth token');
}

/// The Account's collection is not set: the spawn reverts, as without an economy, and leaves no
/// game and no token.
#[test]
#[feature("safe_dispatcher")]
fn test_mint_a_spawn_reverts_without_a_collection_and_leaves_no_game() {
    let owner: felt252 = OWNER().into();
    let (economy, usdc) = setup::deploy_economy();
    let account = deploy_one("Account", array![owner]);
    let lobby: felt252 = (*declare("Lobby").unwrap().contract_class().class_hash).into();
    let daily = deploy_one("Daily", array![owner, account.into(), usdc.into(), lobby]);
    let tutorial = deploy_one("Tutorial", array![owner, account.into(), lobby]);
    start_cheat_caller_address(account, OWNER());
    IAccountDispatcher { contract_address: account }.set_economy(economy);
    stop_cheat_caller_address(account);
    start_cheat_caller_address(account, PLAYER());
    IAccountDispatcher { contract_address: account }.create('PLAYER', PLAYER());
    stop_cheat_caller_address(account);
    // The Daily spawn is paid first: give the player USDC and the economy its game
    paved::mocks::usdc::IMockUSDCDispatcherTrait::mint(
        paved::mocks::usdc::IMockUSDCDispatcher { contract_address: usdc }, PLAYER(), 100_000_000,
    );
    start_cheat_caller_address(usdc, PLAYER());
    paved::mocks::token::IERC20DispatcherTrait::approve(
        paved::mocks::token::IERC20Dispatcher { contract_address: usdc }, daily, 100_000_000,
    );
    stop_cheat_caller_address(usdc);
    start_cheat_caller_address(economy, OWNER());
    paved::economy::economy::IEconomyDispatcherTrait::set_game(
        paved::economy::economy::IEconomyDispatcher { contract_address: economy }, daily,
    );
    stop_cheat_caller_address(economy);

    start_cheat_caller_address(daily, PLAYER());
    start_cheat_caller_address(tutorial, PLAYER());
    let reason = *IDailySafeDispatcher { contract_address: daily }
        .spawn(1, Zero::zero(), 0)
        .unwrap_err()
        .at(0);
    assert(reason == 'Lobby: collection not set', 'Mint: daily reason');
    assert(TestStoreTrait::new(daily).game(1).player_id == 0, 'Mint: a daily game left');
    let reason = *ITutorialSafeDispatcher { contract_address: tutorial }
        .spawn()
        .unwrap_err()
        .at(0);
    assert(reason == 'Lobby: collection not set', 'Mint: tutorial reason');
    assert(
        TestStoreTrait::new(tutorial).game(1).player_id == 0, 'Mint: a tutorial game left',
    );
}

fn deploy_one(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `token_uri` through the real contracts: section 9's JSON of a running and of a finished game,
/// Daily and Tutorial.
#[test]
fn test_mint_token_uri_of_running_and_finished_games() {
    start_cheat_block_timestamp_global(5 * 86400 + 3600);
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    let tutorial = systems.tutorial.spawn();
    let uri = IERC721MetadataSoulboundDispatcher {
        contract_address: systems.collection.contract_address,
    };
    let daily_address = systems.daily.contract_address;
    let tutorial_address = systems.tutorial.contract_address;

    // [Running]
    let daily_uri = uri.token_uri(1);
    assert(daily_uri == expected_uri(daily_address, 1, 1), 'Mint: daily running uri');
    let running = IGameViewDispatcher { contract_address: daily_address }.game(1);
    assert(!running.over, 'Mint: daily is running');
    let tutorial_uri = uri.token_uri(tutorial_token(tutorial));
    assert(
        tutorial_uri == expected_uri(tutorial_address, tutorial_token(tutorial), tutorial),
        'Mint: tutorial running uri',
    );
    assert(!IGameViewDispatcher { contract_address: tutorial_address }.game(tutorial).over, 'T run');

    // [Finished]
    systems.daily.surrender(1);
    start_cheat_caller_address(tutorial_address, PLAYER());
    systems.tutorial.surrender(tutorial);
    let finished_daily = uri.token_uri(1);
    assert(finished_daily == expected_uri(daily_address, 1, 1), 'Mint: daily finished uri');
    assert(finished_daily != daily_uri, 'Mint: daily uri unchanged');
    let finished_tutorial = uri.token_uri(tutorial_token(tutorial));
    assert(
        finished_tutorial == expected_uri(
            tutorial_address, tutorial_token(tutorial), tutorial,
        ),
        'Mint: tutorial finished uri',
    );
    assert(finished_tutorial != tutorial_uri, 'Mint: tutorial uri unchanged');
}
