//! P8 E5b: `Daily.spawn` mints the game's token to its player (`docs/architecture/economy.md`,
//! section 9), through the real `Daily`, `Setup` and `Collection`: the id is the game id, the
//! player owns it right after the spawn, no entry point lets a caller choose an id, and a spawn
//! without a collection reverts and leaves no game. Since D-21 no Tutorial token is minted: the
//! Tutorial minter of a new deployment is zero, so its range (`2^32 + game id`) has no minter.

use core::byte_array::ByteArrayTrait;
use core::num::traits::Zero;
use paved::systems::collection::{
    Collection, ICollectionSafeDispatcher, ICollectionSafeDispatcherTrait,
    IERC721MetadataSoulboundDispatcher, IERC721MetadataSoulboundDispatcherTrait,
    IERC721SoulboundDispatcher, IERC721SoulboundDispatcherTrait, IERC721SoulboundSafeDispatcher,
    IERC721SoulboundSafeDispatcherTrait, TUTORIAL_OFFSET, metadata,
};
use paved::systems::challenge::{IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait};
use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{ANYONE, IChallengeDispatcherTrait, OWNER, PLAYER, TestStoreTrait};
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
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let erc721 = erc721(@systems);
    assert(context.game_id == 1, 'Mint: first game id');
    assert(erc721.owner_of(context.game_id.into()) == PLAYER(), 'Mint: owner');
    assert(erc721.balance_of(PLAYER()) == 1, 'Mint: balance');
}

/// A spawn always mints exactly the new game's own id: after three spawns the tokens are 1 to 3
/// and the next id is free.
#[test]
fn test_mint_a_spawn_mints_exactly_the_new_game_id() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let erc721 = erc721(@systems);
    let safe = IERC721SoulboundSafeDispatcher {
        contract_address: systems.collection.contract_address,
    };
    let mut spy = spy_events();
    let second = systems.challenge.spawn(1, Zero::zero(), 0);
    let third = systems.challenge.spawn(1, Zero::zero(), 0);
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

/// No public path lets a caller choose a token id: `Daily` has no `mint`, and `Collection.mint`
/// itself refuses everyone but `Daily`, in its own range; the Tutorial range has no minter (D-21).
/// Pre-minting a future game id would make its spawn revert.
#[test]
fn test_mint_no_public_path_reaches_mint_with_a_chosen_id() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let future: u256 = 5;
    // [Check] The entry points of the game contracts
    let safe = ICollectionSafeDispatcher { contract_address: systems.challenge.contract_address };
    let reason = *safe.mint(PLAYER(), future).unwrap_err().at(0);
    assert(reason == 'ENTRYPOINT_NOT_FOUND', 'Mint: a game contract mints');
    // [Check] The collection, for a player, the owner, and a minter outside its own range
    let collection = ICollectionSafeDispatcher {
        contract_address: systems.collection.contract_address,
    };
    for caller in array![PLAYER(), OWNER(), ANYONE()] {
        start_cheat_caller_address(systems.collection.contract_address, caller);
        let reason = *collection.mint(PLAYER(), future).unwrap_err().at(0);
        assert(reason == 'Collection: not minter', 'Mint: a caller mints');
    }
    start_cheat_caller_address(systems.collection.contract_address, systems.challenge.contract_address);
    let reason = *collection.mint(PLAYER(), tutorial_token(5)).unwrap_err().at(0);
    assert(reason == 'Collection: not minter', 'Mint: challenge mints tutorial');
    start_cheat_caller_address(systems.collection.contract_address, Zero::zero());
    let reason = *collection.mint(PLAYER(), tutorial_token(5)).unwrap_err().at(0);
    assert(reason == 'Collection: not minter', 'Mint: zero mints tutorial');
    stop_cheat_caller_address(systems.collection.contract_address);
    // [Check] Nothing was minted, and the next spawn still gets its own id
    let erc721 = erc721(@systems);
    start_cheat_caller_address(systems.challenge.contract_address, PLAYER());
    let mut id = 0;
    while id < 5 {
        id = systems.challenge.spawn(1, Zero::zero(), 0);
    }
    assert(erc721.owner_of(5) == PLAYER(), 'Mint: fifth token');
}

/// `Setup`'s collection is not set: the spawn reverts, as without an economy, and leaves no game
/// and no token.
#[test]
#[feature("safe_dispatcher")]
fn test_mint_a_spawn_reverts_without_a_collection_and_leaves_no_game() {
    let owner: felt252 = OWNER().into();
    let (economy, usdc) = setup::deploy_economy();
    let setup_address = deploy_one("Setup", array![owner]);
    let challenge = deploy_one("Challenge", array![owner, usdc.into(), setup_address.into()]);
    start_cheat_caller_address(setup_address, OWNER());
    ISetupDispatcher { contract_address: setup_address }.set_economy(economy);
    stop_cheat_caller_address(setup_address);
    // The Daily spawn is paid first: give the player USDC and the economy its game
    paved::systems::faucet::IFaucetDispatcherTrait::mint(
        paved::systems::faucet::IFaucetDispatcher { contract_address: usdc }, PLAYER(), 100_000_000,
    );
    start_cheat_caller_address(usdc, PLAYER());
    paved::mocks::token::IERC20DispatcherTrait::approve(
        paved::mocks::token::IERC20Dispatcher { contract_address: usdc }, challenge, 100_000_000,
    );
    stop_cheat_caller_address(usdc);
    start_cheat_caller_address(economy, OWNER());
    paved::systems::economy::IEconomyDispatcherTrait::set_game(
        paved::systems::economy::IEconomyDispatcher { contract_address: economy }, challenge,
    );
    stop_cheat_caller_address(economy);

    start_cheat_caller_address(challenge, PLAYER());
    let reason = *IChallengeSafeDispatcher { contract_address: challenge }
        .spawn(1, Zero::zero(), 0)
        .unwrap_err()
        .at(0);
    assert(reason == 'Challenge: collection not set', 'Mint: challenge reason');
    assert(TestStoreTrait::new(challenge).game(1).player_id == 0, 'Mint: a challenge game left');
}

fn deploy_one(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `token_uri` through the real contracts: section 9's JSON of a running and of a finished game.
#[test]
fn test_mint_token_uri_of_running_and_finished_games() {
    start_cheat_block_timestamp_global(5 * 86400 + 3600);
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let uri = IERC721MetadataSoulboundDispatcher {
        contract_address: systems.collection.contract_address,
    };
    let daily_address = systems.challenge.contract_address;

    // [Literal] section 9's exact text for Daily game 1 on day 5, running with score 0, pinned
    // apart from the contract's own builder: the JSON, then its base64 in the URI
    let literal: ByteArray =
        "{\"name\":\"Paved Games #1\",\"description\":\"A game of Paved.\",\"attributes\":[{\"trait_type\":\"Score\",\"value\":0},{\"trait_type\":\"Over\",\"value\":false},{\"trait_type\":\"Day\",\"value\":5}]}";
    assert(metadata::json(1, 0, false, 5) == literal, 'Mint: literal json');
    let mut literal_uri = metadata::uri_prefix();
    ByteArrayTrait::append(ref literal_uri, @metadata::base64(@literal));
    assert(uri.token_uri(1) == literal_uri, 'Mint: literal uri');

    // [Running]
    let daily_uri = uri.token_uri(1);
    assert(daily_uri == expected_uri(daily_address, 1, 1), 'Mint: challenge running uri');
    let running = IGameViewDispatcher { contract_address: daily_address }.game(1);
    assert(!running.over, 'Mint: challenge is running');

    // [Finished]
    systems.challenge.surrender(1);
    let finished_daily = uri.token_uri(1);
    assert(finished_daily == expected_uri(daily_address, 1, 1), 'Mint: challenge finished uri');
    assert(finished_daily != daily_uri, 'Mint: challenge uri unchanged');
}

/// The collection is set in `Setup` but `set_minters` was never called: no one may mint, so the
/// spawn reverts 'Collection: not minter' and leaves no game.
#[test]
#[feature("safe_dispatcher")]
fn test_mint_a_spawn_reverts_when_the_minters_were_never_set() {
    let owner: felt252 = OWNER().into();
    let (economy, usdc) = setup::deploy_economy();
    let collection = deploy_one("Collection", array![owner]);
    let setup_address = deploy_one("Setup", array![owner]);
    let challenge = deploy_one("Challenge", array![owner, usdc.into(), setup_address.into()]);
    start_cheat_caller_address(setup_address, OWNER());
    ISetupDispatcher { contract_address: setup_address }.set_economy(economy);
    ISetupDispatcher { contract_address: setup_address }.set_collection(collection);
    stop_cheat_caller_address(setup_address);
    paved::systems::faucet::IFaucetDispatcherTrait::mint(
        paved::systems::faucet::IFaucetDispatcher { contract_address: usdc }, PLAYER(), 100_000_000,
    );
    start_cheat_caller_address(usdc, PLAYER());
    paved::mocks::token::IERC20DispatcherTrait::approve(
        paved::mocks::token::IERC20Dispatcher { contract_address: usdc }, challenge, 100_000_000,
    );
    stop_cheat_caller_address(usdc);
    start_cheat_caller_address(economy, OWNER());
    paved::systems::economy::IEconomyDispatcherTrait::set_game(
        paved::systems::economy::IEconomyDispatcher { contract_address: economy }, challenge,
    );
    stop_cheat_caller_address(economy);

    start_cheat_caller_address(challenge, PLAYER());
    let reason = *IChallengeSafeDispatcher { contract_address: challenge }
        .spawn(1, Zero::zero(), 0)
        .unwrap_err()
        .at(0);
    assert(reason == 'Collection: not minter', 'Mint: challenge reason');
    assert(TestStoreTrait::new(challenge).game(1).player_id == 0, 'Mint: a challenge game left');
}
