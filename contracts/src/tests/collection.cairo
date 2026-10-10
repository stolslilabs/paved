//! `Collection` (P8 E5a): the mint by range, the one-shot minters, no transfer path, `token_uri`,
//! `supports_interface`. The games are a test double that serves the `game` view.

use core::num::traits::Zero;
use openzeppelin_interfaces::introspection::ISRC5_ID;
use openzeppelin_interfaces::token::erc721::{IERC721_ID, IERC721_METADATA_ID};
use paved::systems::collection::{
    Collection, ICollectionDispatcher, ICollectionDispatcherTrait,
    IERC721MetadataSoulboundDispatcher, IERC721MetadataSoulboundDispatcherTrait,
    IERC721SoulboundCamelDispatcher, IERC721SoulboundCamelDispatcherTrait,
    IERC721SoulboundCamelSafeDispatcher, IERC721SoulboundCamelSafeDispatcherTrait,
    IERC721SoulboundDispatcher, IERC721SoulboundDispatcherTrait, IERC721SoulboundSafeDispatcher,
    IERC721SoulboundSafeDispatcherTrait, ISRC5SoulboundDispatcher, ISRC5SoulboundDispatcherTrait,
    TUTORIAL_OFFSET, metadata,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

/// A game contract that serves one `game` view: `set` stores the score, over flag and start time of
/// every game id.
#[starknet::interface]
pub trait IDouble<TContractState> {
    fn set(ref self: TContractState, score: u32, over: bool, start_time: u64);
}

#[starknet::contract]
pub mod Double {
    use paved::views::{BuilderView, CharacterView, GameView, IGameView, TileView};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        score: u32,
        over: bool,
        start_time: u64,
    }

    #[abi(embed_v0)]
    impl DoubleImpl of super::IDouble<ContractState> {
        fn set(ref self: ContractState, score: u32, over: bool, start_time: u64) {
            self.score.write(score);
            self.over.write(over);
            self.start_time.write(start_time);
        }
    }

    #[abi(embed_v0)]
    impl GameViewImpl of IGameView<ContractState> {
        fn game(self: @ContractState, game_id: u32) -> GameView {
            GameView {
                id: game_id,
                player_id: 0,
                mode: 0,
                seed: 0,
                score: self.score.read(),
                over: self.over.read(),
                tile_count: 0,
                placed_count: 0,
                discarded_count: 0,
                tile_id: 0,
                plan: 0,
                remaining_count: 0,
                deck_size: 0,
                start_time: self.start_time.read(),
                end_time: 0,
                tournament_id: 0,
            }
        }

        fn tiles(self: @ContractState, game_id: u32, from: u32, count: u32) -> Array<TileView> {
            array![]
        }

        fn builder(self: @ContractState, game_id: u32, player_id: felt252) -> BuilderView {
            panic!("unused")
        }

        fn characters(
            self: @ContractState, game_id: u32, player_id: felt252,
        ) -> Array<CharacterView> {
            array![]
        }
    }
}

pub fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

pub fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

pub fn OTHER() -> ContractAddress {
    'OTHER'.try_into().unwrap()
}

const DAILY_ID: u256 = 7;
const TUTORIAL_ID: u256 = 0x100000000 + 7;

#[derive(Copy, Drop)]
struct World {
    collection: ContractAddress,
    daily: ContractAddress,
    tutorial: ContractAddress,
}

fn deploy_double() -> ContractAddress {
    let class = declare("Double").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    address
}

/// Deploys the collection and two doubles, without setting the minters.
fn deploy() -> World {
    let class = declare("Collection").unwrap().contract_class();
    let (collection, _) = class.deploy(@array![OWNER().into()]).unwrap();
    World { collection, daily: deploy_double(), tutorial: deploy_double() }
}

fn setup() -> World {
    let world = deploy();
    set_minters(@world, OWNER());
    world
}

fn set_minters(world: @World, caller: ContractAddress) {
    start_cheat_caller_address(*world.collection, caller);
    ICollectionDispatcher { contract_address: *world.collection }
        .set_minters(*world.daily, *world.tutorial);
    stop_cheat_caller_address(*world.collection);
}

fn mint(world: @World, caller: ContractAddress, to: ContractAddress, token_id: u256) {
    start_cheat_caller_address(*world.collection, caller);
    ICollectionDispatcher { contract_address: *world.collection }.mint(to, token_id);
    stop_cheat_caller_address(*world.collection);
}

fn erc721(world: @World) -> IERC721SoulboundDispatcher {
    IERC721SoulboundDispatcher { contract_address: *world.collection }
}

fn minted(world: @World) {
    mint(world, *world.daily, PLAYER(), DAILY_ID);
    mint(world, *world.tutorial, PLAYER(), TUTORIAL_ID);
}

// Mint

#[test]
fn test_collection_mint_by_range() {
    let world = setup();
    let mut spy = spy_events();
    minted(@world);
    // The standard Transfer(from: 0, to, token_id), all three fields keys: wallets and the indexer.
    spy
        .assert_emitted(
            @array![
                (
                    world.collection,
                    Collection::Event::Transfer(
                        Collection::Transfer {
                            from: Zero::zero(), to: PLAYER(), token_id: DAILY_ID,
                        },
                    ),
                ),
                (
                    world.collection,
                    Collection::Event::Transfer(
                        Collection::Transfer {
                            from: Zero::zero(), to: PLAYER(), token_id: TUTORIAL_ID,
                        },
                    ),
                ),
            ],
        );
    let erc721 = erc721(@world);
    assert_eq!(erc721.owner_of(DAILY_ID), PLAYER());
    assert_eq!(erc721.owner_of(TUTORIAL_ID), PLAYER());
    assert_eq!(erc721.balance_of(PLAYER()), 2);
    assert_eq!(erc721.balance_of(OTHER()), 0);
    let camel = IERC721SoulboundCamelDispatcher { contract_address: world.collection };
    assert_eq!(camel.ownerOf(DAILY_ID), PLAYER());
    assert_eq!(camel.balanceOf(PLAYER()), 2);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_daily_id_by_tutorial() {
    let world = setup();
    mint(@world, world.tutorial, PLAYER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_tutorial_id_by_daily() {
    let world = setup();
    mint(@world, world.daily, PLAYER(), TUTORIAL_ID);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_by_anyone() {
    let world = setup();
    mint(@world, OTHER(), PLAYER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_by_owner() {
    let world = setup();
    mint(@world, OWNER(), PLAYER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_before_minters() {
    let world = deploy();
    mint(@world, world.daily, PLAYER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: not minter')]
fn test_collection_mint_before_minters_by_zero() {
    let world = deploy();
    mint(@world, Zero::zero(), PLAYER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: already minted')]
fn test_collection_mint_twice() {
    let world = setup();
    mint(@world, world.daily, PLAYER(), DAILY_ID);
    mint(@world, world.daily, OTHER(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: zero recipient')]
fn test_collection_mint_to_zero() {
    let world = setup();
    mint(@world, world.daily, Zero::zero(), DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: invalid token')]
fn test_collection_mint_beyond_the_ranges() {
    let world = setup();
    mint(@world, world.tutorial, PLAYER(), 2 * TUTORIAL_OFFSET);
}

#[test]
#[should_panic(expected: 'Collection: invalid token')]
fn test_collection_mint_high_word() {
    let world = setup();
    mint(@world, world.tutorial, PLAYER(), u256 { low: 7, high: 1 });
}

// Minters

#[test]
fn test_collection_minters_are_read() {
    let world = setup();
    let collection = ICollectionDispatcher { contract_address: world.collection };
    assert_eq!(collection.owner(), OWNER());
    assert_eq!(collection.daily(), world.daily);
    assert_eq!(collection.tutorial(), world.tutorial);
}

#[test]
#[should_panic(expected: 'Collection: minters set')]
fn test_collection_set_minters_twice() {
    let world = setup();
    set_minters(@world, OWNER());
}

#[test]
#[should_panic(expected: 'Collection: same minter')]
fn test_collection_set_minters_refuses_one_address_for_both() {
    let world = deploy();
    start_cheat_caller_address(world.collection, OWNER());
    ICollectionDispatcher { contract_address: world.collection }
        .set_minters(world.daily, world.daily);
}

#[test]
#[should_panic(expected: 'Collection: not owner')]
fn test_collection_set_minters_by_anyone() {
    let world = deploy();
    set_minters(@world, OTHER());
}

#[test]
#[should_panic(expected: 'Collection: zero minter')]
fn test_collection_set_minters_zero() {
    let world = deploy();
    start_cheat_caller_address(world.collection, OWNER());
    ICollectionDispatcher { contract_address: world.collection }
        .set_minters(world.daily, Zero::zero());
}

#[test]
#[should_panic(expected: 'Collection: zero minter')]
fn test_collection_set_minters_zero_daily() {
    let world = deploy();
    start_cheat_caller_address(world.collection, OWNER());
    ICollectionDispatcher { contract_address: world.collection }
        .set_minters(Zero::zero(), world.tutorial);
}

#[test]
fn test_collection_constructor_rejects_zero_owner() {
    let class = declare("Collection").unwrap().contract_class();
    let error = class.deploy(@array![0]).unwrap_err();
    assert_eq!(*error.at(0), 'Collection: zero owner');
}

// Soulbound: every entry point, minted and unminted tokens, owner or not

/// Calls the entry point through the safe dispatcher so that the revert reason is read.
fn assert_all_revert(world: @World, caller: ContractAddress, token_id: u256) {
    let collection = *world.collection;
    let erc721 = IERC721SoulboundSafeDispatcher { contract_address: collection };
    let camel = IERC721SoulboundCamelSafeDispatcher { contract_address: collection };
    start_cheat_caller_address(collection, caller);
    let empty: Span<felt252> = array![].span();
    let to = OTHER();
    let from = PLAYER();
    let reasons = array![
        erc721.transfer_from(from, to, token_id).unwrap_err(),
        erc721.safe_transfer_from(from, to, token_id, empty).unwrap_err(),
        erc721.approve(to, token_id).unwrap_err(),
        erc721.set_approval_for_all(to, true).unwrap_err(),
        erc721.set_approval_for_all(to, false).unwrap_err(),
        camel.transferFrom(from, to, token_id).unwrap_err(),
        camel.safeTransferFrom(from, to, token_id, empty).unwrap_err(),
        camel.setApprovalForAll(to, true).unwrap_err(),
        camel.setApprovalForAll(to, false).unwrap_err(),
    ];
    stop_cheat_caller_address(collection);
    for reason in reasons {
        // The dispatcher appends 'ENTRYPOINT_FAILED' to the contract's own reason.
        assert_eq!(*reason.at(0), 'Collection: soulbound');
    }
}

#[test]
fn test_collection_every_transfer_and_approval_reverts() {
    let world = setup();
    minted(@world);
    let owner = PLAYER();
    // Minted tokens, called by the owner of the token, the collection's owner, a minter, anyone.
    for caller in array![owner, OWNER(), world.daily, world.tutorial, OTHER()] {
        for token_id in array![DAILY_ID, TUTORIAL_ID] {
            assert_all_revert(@world, caller, token_id);
        }
    }
    // Unminted tokens, including ones outside both ranges.
    for token_id in array![1, 8, TUTORIAL_ID + 1, 2 * TUTORIAL_OFFSET, u256 { low: 0, high: 1 }] {
        assert_all_revert(@world, owner, token_id);
        assert_all_revert(@world, OTHER(), token_id);
    }
    // Nothing moved.
    assert_eq!(erc721(@world).owner_of(DAILY_ID), owner);
    assert_eq!(erc721(@world).balance_of(owner), 2);
    assert_eq!(erc721(@world).balance_of(OTHER()), 0);
}

#[test]
fn test_collection_approvals_are_always_empty() {
    let world = setup();
    minted(@world);
    let erc721 = erc721(@world);
    assert!(erc721.get_approved(DAILY_ID).is_zero());
    assert!(erc721.get_approved(99).is_zero());
    assert!(!erc721.is_approved_for_all(PLAYER(), OTHER()));
    let camel = IERC721SoulboundCamelDispatcher { contract_address: world.collection };
    assert!(camel.getApproved(DAILY_ID).is_zero());
    assert!(!camel.isApprovedForAll(PLAYER(), OTHER()));
}

#[test]
#[should_panic(expected: 'Collection: invalid token')]
fn test_collection_owner_of_unminted() {
    let world = setup();
    erc721(@world).owner_of(DAILY_ID);
}

#[test]
#[should_panic(expected: 'Collection: zero account')]
fn test_collection_balance_of_zero() {
    let world = setup();
    erc721(@world).balance_of(Zero::zero());
}

// Metadata

fn set_game(game: ContractAddress, score: u32, over: bool, start_time: u64) {
    IDoubleDispatcher { contract_address: game }.set(score, over, start_time);
}

#[test]
fn test_collection_name_and_symbol() {
    let world = setup();
    let metadata = IERC721MetadataSoulboundDispatcher { contract_address: world.collection };
    assert_eq!(metadata.name(), "Paved Games");
    assert_eq!(metadata.symbol(), "PAVEDGAME");
}

#[test]
fn test_collection_token_uri_running_daily_game() {
    let world = setup();
    minted(@world);
    set_game(world.daily, 0, false, 20000 * 86400 + 5);
    let metadata = IERC721MetadataSoulboundDispatcher { contract_address: world.collection };
    let expected: ByteArray =
        "data:application/json;base64,eyJuYW1lIjoiUGF2ZWQgR2FtZXMgIzciLCJkZXNjcmlwdGlvbiI6IkEgZ2FtZSBvZiBQYXZlZC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU2NvcmUiLCJ2YWx1ZSI6MH0seyJ0cmFpdF90eXBlIjoiT3ZlciIsInZhbHVlIjpmYWxzZX0seyJ0cmFpdF90eXBlIjoiRGF5IiwidmFsdWUiOjIwMDAwfV19";
    assert_eq!(metadata.token_uri(DAILY_ID), expected.clone());
    assert_eq!(metadata.tokenURI(DAILY_ID), expected);
}

#[test]
fn test_collection_token_uri_finished_tutorial_game() {
    let world = setup();
    minted(@world);
    // The tutorial double is read for the tutorial range, the daily one is not.
    set_game(world.tutorial, 1234, true, 20001 * 86400);
    set_game(world.daily, 5, false, 0);
    let metadata = IERC721MetadataSoulboundDispatcher { contract_address: world.collection };
    let expected: ByteArray =
        "data:application/json;base64,eyJuYW1lIjoiUGF2ZWQgR2FtZXMgIzQyOTQ5NjczMDMiLCJkZXNjcmlwdGlvbiI6IkEgZ2FtZSBvZiBQYXZlZC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU2NvcmUiLCJ2YWx1ZSI6MTIzNH0seyJ0cmFpdF90eXBlIjoiT3ZlciIsInZhbHVlIjp0cnVlfSx7InRyYWl0X3R5cGUiOiJEYXkiLCJ2YWx1ZSI6MjAwMDF9XX0=";
    assert_eq!(metadata.token_uri(TUTORIAL_ID), expected);
}

#[test]
#[should_panic(expected: 'Collection: invalid token')]
fn test_collection_token_uri_unminted() {
    let world = setup();
    IERC721MetadataSoulboundDispatcher { contract_address: world.collection }.token_uri(DAILY_ID);
}

#[test]
fn test_collection_json() {
    let json = metadata::json(42, 99, true, 7);
    let expected: ByteArray =
        "{\"name\":\"Paved Games #42\",\"description\":\"A game of Paved.\",\"attributes\":[{\"trait_type\":\"Score\",\"value\":99},{\"trait_type\":\"Over\",\"value\":true},{\"trait_type\":\"Day\",\"value\":7}]}";
    assert_eq!(json, expected);
}

#[test]
fn test_collection_decimal() {
    assert_eq!(metadata::decimal(0), "0");
    assert_eq!(metadata::decimal(9), "9");
    assert_eq!(metadata::decimal(10), "10");
    assert_eq!(metadata::decimal(4294967303), "4294967303");
    assert_eq!(metadata::decimal(0xffffffffffffffff), "18446744073709551615");
}

#[test]
fn test_collection_base64_vectors() {
    // RFC 4648 section 10.
    assert_eq!(metadata::base64(@""), "");
    assert_eq!(metadata::base64(@"f"), "Zg==");
    assert_eq!(metadata::base64(@"fo"), "Zm8=");
    assert_eq!(metadata::base64(@"foo"), "Zm9v");
    assert_eq!(metadata::base64(@"foob"), "Zm9vYg==");
    assert_eq!(metadata::base64(@"fooba"), "Zm9vYmE=");
    assert_eq!(metadata::base64(@"foobar"), "Zm9vYmFy");
    // The last two symbols of the alphabet.
    let mut bytes: ByteArray = "";
    bytes.append_byte(0xfb);
    bytes.append_byte(0xff);
    bytes.append_byte(0xbf);
    assert_eq!(metadata::base64(@bytes), "+/+/");
}

// Interfaces

#[test]
fn test_collection_supports_interface() {
    let world = setup();
    let src5 = ISRC5SoulboundDispatcher { contract_address: world.collection };
    assert!(src5.supports_interface(ISRC5_ID));
    assert!(src5.supports_interface(IERC721_ID));
    assert!(src5.supports_interface(IERC721_METADATA_ID));
    assert!(!src5.supports_interface(0));
    assert!(!src5.supports_interface(0x1234));
    // ERC20's id, for instance.
    assert!(!src5.supports_interface(0x36372b07));
}
