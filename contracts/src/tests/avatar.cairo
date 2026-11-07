//! The avatar on chain (#627, `systems/avatar.cairo`, `avatar/*.cairo`,
//! `docs/architecture/avatar-chain.md`): the look in AVATAR-LOOK's format, the owner's parts, price
//! bounds and catalogue, the player's `buy_avatar_item` and `set_avatar`, the cobbles debited by
//! `Setup.spend_cobbles`, and the audit properties, each in a test named after it: an item bought
//! once, never twice; cobbles never below zero; `set_avatar` never accepts a part neither free nor
//! owned; only an allowlisted spender spends; the limits in quantity and in time.
//!
//! The player's name (PLAYER-RENAME, `avatar/name.cairo`): the shape (UTF-8, 3 to 15 characters of
//! any script's letters and digits, single spaces and hyphens between them),
//! the first change free and every later one at the owner's price, debited on `Setup`'s ledger in
//! the same call; one player per name whatever its case, a name left free at once; never above the
//! price the player confirmed, never below zero cobbles.
//!
//! The parts, bounds and prices here are the tests' own: the owner's values are not set yet. The
//! cobbles are written into `Setup`'s ledger directly (`give`): the earning paths have their own
//! tests (`e2e::cobbles*`). The gas of each call is measured in `tests/gas.cairo` (z27 to z31).

use core::num::traits::Zero;
use core::poseidon::poseidon_hash_span;
use paved::avatar::catalogue::CatalogueComponent::{
    AvatarItemListed, Event as CatalogueEvent, PriceBoundsSet,
};
use paved::avatar::item::{
    AvatarItem, LISTED, UNLISTED, WITHDRAWN, is_free_word, item_of, item_word,
};
use paved::avatar::look::{MAX_PARTS, look_ids, look_of};
use paved::avatar::name::{allowed, decode, fold, name_key};
use paved::systems::avatar::Avatar::{
    AvatarItemBought, AvatarSet, Event as AvatarEvent, PartsSet, RenamePriceSet, Renamed,
};
use paved::systems::avatar::{
    AVATAR_REASON, IAvatarDispatcher, IAvatarDispatcherTrait, IAvatarNameDispatcher,
    IAvatarNameDispatcherTrait, IAvatarNameSafeDispatcher, IAvatarNameSafeDispatcherTrait,
    IAvatarSafeDispatcher, IAvatarSafeDispatcherTrait, PriceBounds, RENAME_REASON,
};
use paved::systems::setup::Setup::{CobblesSpent, Event as SetupEvent};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupSpendDispatcher,
    ISetupSpendDispatcherTrait, ISetupSpendSafeDispatcher, ISetupSpendSafeDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, map_entry_address,
    spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address, store,
};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn OTHER() -> ContractAddress {
    'OTHER'.try_into().unwrap()
}

/// The tests' parts in use.
const PARTS: u8 = 4;

#[derive(Copy, Drop)]
struct World {
    avatar: IAvatarDispatcher,
    setup: ContractAddress,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup` and `Avatar`, `Avatar` an allowlisted spender of `Setup`; no parts, bounds or item yet.
fn bare() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let avatar = deploy("Avatar", array![OWNER().into(), setup.into()]);
    start_cheat_caller_address(setup, OWNER());
    ISetupSpendDispatcher { contract_address: setup }.set_spender(avatar, true);
    stop_cheat_caller_address(setup);
    World { avatar: IAvatarDispatcher { contract_address: avatar }, setup }
}

/// The tests' catalogue: four parts, items 0 and 1 of every part free, item 2 of part 0 at 30,
/// item 5 of part 1 at 50, item 255 of part 2 at 100; bounds 20 to 100.
fn world() -> World {
    let w = bare();
    as_owner(w);
    w.avatar.set_parts(PARTS);
    w.avatar.set_price_bounds(20, 100);
    for part in 0..PARTS {
        w.avatar.set_item(part, 0, 0, 0, 0);
        w.avatar.set_item(part, 1, 0, 0, 0);
    }
    w.avatar.set_item(0, 2, 30, 0, 0);
    w.avatar.set_item(1, 5, 50, 0, 0);
    w.avatar.set_item(2, 255, 100, 0, 0);
    stop(w);
    w
}

fn as_owner(w: World) {
    start_cheat_caller_address(w.avatar.contract_address, OWNER());
}

fn as_player(w: World, who: ContractAddress) {
    start_cheat_caller_address(w.avatar.contract_address, who);
}

fn stop(w: World) {
    stop_cheat_caller_address(w.avatar.contract_address);
}

fn safe(w: World) -> IAvatarSafeDispatcher {
    IAvatarSafeDispatcher { contract_address: w.avatar.contract_address }
}

/// Writes `cobbles` as the player's whole account (`Setup`'s `accounts`, cobbles in [0, 64)).
fn give(w: World, who: ContractAddress, cobbles: u64) {
    store(
        w.setup,
        map_entry_address(selector!("accounts"), array![who.into()].span()),
        array![cobbles.into()].span(),
    );
}

fn cobbles_of(w: World, who: ContractAddress) -> u64 {
    ISetupCobblesDispatcher { contract_address: w.setup }.account(who.into()).cobbles
}

fn buy(w: World, who: ContractAddress, part: u8, id: u8) {
    as_player(w, who);
    w.avatar.buy_avatar_item(part, id, 0xffff);
    stop(w);
}

fn set(w: World, who: ContractAddress, look: u128) {
    as_player(w, who);
    w.avatar.set_avatar(look);
    stop(w);
}

fn look(ids: Array<u8>) -> u128 {
    look_of(ids.span())
}

fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => 'no error',
        Result::Err(panic) => *panic.at(0),
    }
}

// Packing

#[test]
fn test_item_word_round_trips_at_zero_and_maximum() {
    let zero: AvatarItem = Default::default();
    assert_eq!(item_word(zero), 0);
    assert_eq!(item_of(0), zero);
    let max = AvatarItem {
        state: 255,
        cobbles: 0xffff,
        sold: 0xffffffff,
        supply: 0xffffffff,
        until: 0xffffffffffffffff,
    };
    assert_eq!(item_of(item_word(max)), max);
    let one = AvatarItem { state: 1, cobbles: 2, sold: 3, supply: 4, until: 5 };
    let word: u256 = item_word(one).into();
    assert_eq!(word.low, 1 + 2 * 0x100 + 3 * 0x100000000 + 4 * 0x10000000000000000);
    assert_eq!(word.high, 5);
    assert_eq!(item_of(item_word(one)), one);
    // Free: listed at 0 cobbles, whatever its limits
    assert!(
        is_free_word(
            item_word(AvatarItem { state: LISTED, cobbles: 0, sold: 9, supply: 9, until: 9 }),
        ),
    );
    assert!(
        !is_free_word(
            item_word(AvatarItem { state: LISTED, cobbles: 20, sold: 0, supply: 0, until: 0 }),
        ),
    );
    assert!(
        !is_free_word(
            item_word(AvatarItem { state: WITHDRAWN, cobbles: 0, sold: 0, supply: 0, until: 0 }),
        ),
    );
    assert!(!is_free_word(0));
}

/// The vectors of AVATAR-LOOK's format (`packages/renderer/__tests__/avatar.test.ts` and
/// `packages/chain/test/avatar.test.ts` pin the same ones): the version in byte 0, part `p` in byte
/// `p + 1`.
#[test]
fn test_look_is_the_format_of_avatar_look() {
    // Every part at its default: the version alone
    assert_eq!(look(array![0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 1);
    assert_eq!(look(array![]), 1);
    // Each id in its own byte
    assert_eq!(look(array![1]), 0x101);
    assert_eq!(look(array![0, 1]), 0x10001);
    assert_eq!(look(array![0, 0, 0, 0, 0, 0, 0, 0, 0, 16]), 0x1000000000000000000001);
    let ids = array![8, 5, 5, 4, 5, 7, 5, 7, 7, 16];
    let full = look(ids.clone());
    assert_eq!(full, 0x1007070507050405050801);
    assert_eq!(look_ids(full, 10), Some(ids));
    // 0 (no avatar), another version, a byte past the parts: no ids
    assert_eq!(look_ids(0, 10), None);
    assert_eq!(look_ids(2, 10), None);
    assert_eq!(look_ids(0x100, 0), None);
    assert_eq!(look_ids(0x1000000000000000000001, 9), None);
    assert_eq!(look_ids(0x1000000000000000000001, 10), Some(array![0, 0, 0, 0, 0, 0, 0, 0, 0, 16]));
    // A shorter look reads as item 0 in the parts it does not set
    assert_eq!(look_ids(0x0301, 3), Some(array![3, 0, 0]));
    // Fifteen parts of 255: the whole u128
    let mut tops: Array<u8> = array![];
    for _ in 0..MAX_PARTS {
        tops.append(255);
    }
    let top = look(tops.clone());
    assert_eq!(top, 0xffffffffffffffffffffffffffffff01);
    assert_eq!(look_ids(top, MAX_PARTS), Some(tops));
}

// The owner's settings

#[test]
#[feature("safe_dispatcher")]
fn test_the_owner_settings_are_owner_only() {
    let w = world();
    as_player(w, PLAYER());
    let s = safe(w);
    let not_owner = 'Ownable: caller is not owner';
    assert_eq!(error_of(s.set_parts(5)), not_owner);
    assert_eq!(error_of(s.set_price_bounds(1, 2)), not_owner);
    assert_eq!(error_of(s.set_item(0, 3, 0, 0, 0)), not_owner);
    assert_eq!(error_of(s.withdraw_item(0, 2)), not_owner);
    assert_eq!(error_of(s.set_setup(OTHER())), not_owner);
    stop(w);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_parts_bounds_and_growth() {
    let w = bare();
    assert_eq!(w.avatar.parts(), 0);
    as_owner(w);
    let s = safe(w);
    let invalid = 'Avatar: invalid parts';
    assert_eq!(error_of(s.set_parts(0)), invalid);
    assert_eq!(error_of(s.set_parts(MAX_PARTS + 1)), invalid);
    let mut spy = spy_events();
    w.avatar.set_parts(10);
    assert_eq!(w.avatar.parts(), 10);
    spy
        .assert_emitted(
            @array![(w.avatar.contract_address, AvatarEvent::PartsSet(PartsSet { parts: 10 }))],
        );
    // It may only grow
    assert_eq!(error_of(s.set_parts(9)), invalid);
    w.avatar.set_parts(10);
    w.avatar.set_parts(MAX_PARTS);
    assert_eq!(w.avatar.parts(), MAX_PARTS);
    stop(w);
}

#[test]
fn test_items_lists_ids_up_to_the_highest_listed() {
    let w = world();
    let items = w.avatar.items(0);
    assert_eq!(items.len(), 3);
    assert_eq!(
        *items.at(0), AvatarItem { state: LISTED, cobbles: 0, sold: 0, supply: 0, until: 0 },
    );
    assert_eq!(
        *items.at(2), AvatarItem { state: LISTED, cobbles: 30, sold: 0, supply: 0, until: 0 },
    );
    let items = w.avatar.items(1);
    assert_eq!(items.len(), 6);
    assert_eq!(*items.at(3), Default::default());
    assert_eq!(w.avatar.items(2).len(), 256);
    assert_eq!(*w.avatar.items(2).at(255), w.avatar.item(2, 255));
    assert_eq!(w.avatar.items(3).len(), 2);
    // A part with nothing listed, a part not in use: empty
    assert_eq!(w.avatar.items(14).len(), 0);
    // Withdrawn items stay in the list
    as_owner(w);
    w.avatar.withdraw_item(0, 2);
    stop(w);
    assert_eq!(w.avatar.items(0).len(), 3);
    let items = w.avatar.items(0);
    assert_eq!(items.len(), 3);
    assert_eq!((*items.at(2)).state, WITHDRAWN);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_item_checks_the_part_and_the_price_bounds() {
    let w = bare();
    as_owner(w);
    let s = safe(w);
    // No parts: no item
    assert_eq!(error_of(s.set_item(0, 0, 0, 0, 0)), 'Avatar: invalid part');
    w.avatar.set_parts(PARTS);
    // A part not in use
    assert_eq!(error_of(s.set_item(PARTS, 0, 0, 0, 0)), 'Avatar: invalid part');
    // No bounds set: only free items
    assert_eq!(error_of(s.set_item(0, 7, 1, 0, 0)), 'Avatar: invalid cobbles');
    w.avatar.set_item(0, 7, 0, 0, 0);
    // The bounds are the owner's
    assert_eq!(error_of(s.set_price_bounds(0, 10)), 'Avatar: invalid bounds');
    assert_eq!(error_of(s.set_price_bounds(11, 10)), 'Avatar: invalid bounds');
    let mut spy = spy_events();
    w.avatar.set_price_bounds(20, 100);
    assert_eq!(w.avatar.price_bounds(), PriceBounds { min: 20, max: 100 });
    assert_eq!(error_of(s.set_item(0, 7, 19, 0, 0)), 'Avatar: invalid cobbles');
    assert_eq!(error_of(s.set_item(0, 7, 101, 0, 0)), 'Avatar: invalid cobbles');
    w.avatar.set_item(2, 255, 100, 5, 1000);
    assert_eq!(
        w.avatar.item(2, 255),
        AvatarItem { state: LISTED, cobbles: 100, sold: 0, supply: 5, until: 1000 },
    );
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::CatalogueEvent(
                        CatalogueEvent::PriceBoundsSet(PriceBoundsSet { min: 20, max: 100 }),
                    ),
                ),
                (
                    w.avatar.contract_address,
                    AvatarEvent::CatalogueEvent(
                        CatalogueEvent::AvatarItemListed(
                            AvatarItemListed {
                                part: 2,
                                id: 255,
                                state: LISTED,
                                cobbles: 100,
                                supply: 5,
                                until: 1000,
                            },
                        ),
                    ),
                ),
            ],
        );
    // Narrower bounds keep the items listed
    w.avatar.set_price_bounds(20, 50);
    assert_eq!(w.avatar.item(2, 255).cobbles, 100);
    stop(w);
}

// Buying

#[test]
fn test_buy_spends_the_price_sets_the_bit_and_emits() {
    let w = world();
    give(w, PLAYER(), 200);
    let player_id: felt252 = PLAYER().into();
    let mut spy = spy_events();
    buy(w, PLAYER(), 2, 255);
    assert_eq!(cobbles_of(w, PLAYER()), 100);
    assert_eq!(
        w.avatar.owned(player_id, 2), u256 { low: 0, high: 0x80000000000000000000000000000000 },
    );
    assert_eq!(w.avatar.item(2, 255).sold, 1);
    // Buying does not set the avatar
    assert_eq!(w.avatar.avatar(player_id), 0);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::AvatarItemBought(
                        AvatarItemBought {
                            player_id, part: 2, id: 255, cobbles: 100, sold: 1, balance: 100,
                        },
                    ),
                ),
            ],
        );
    spy
        .assert_emitted(
            @array![
                (
                    w.setup,
                    SetupEvent::CobblesSpent(
                        CobblesSpent {
                            player_id,
                            spender: w.avatar.contract_address,
                            reason: AVATAR_REASON,
                            cobbles: 100,
                            balance: 100,
                        },
                    ),
                ),
            ],
        );
    buy(w, PLAYER(), 0, 2);
    assert_eq!(w.avatar.owned(player_id, 0), 0x4);
    assert_eq!(cobbles_of(w, PLAYER()), 70);
    // Another player owns nothing
    assert_eq!(w.avatar.owned(OTHER().into(), 0), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_an_item_is_bought_once_never_twice() {
    let w = world();
    give(w, PLAYER(), 200);
    buy(w, PLAYER(), 1, 5);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5, 0xffff)), 'Avatar: item owned');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 150);
    assert_eq!(w.avatar.item(1, 5).sold, 1);
    // Item 128 + 5 is another bit, in the other half
    as_owner(w);
    w.avatar.set_item(1, 133, 50, 0, 0);
    stop(w);
    buy(w, PLAYER(), 1, 133);
    assert_eq!(w.avatar.owned(PLAYER().into(), 1), u256 { low: 0x20, high: 0x20 });
}

#[test]
#[feature("safe_dispatcher")]
fn test_never_charged_above_the_confirmed_price() {
    let w = world();
    give(w, PLAYER(), 200);
    // Confirmed at 50; the owner relists at 60 before the purchase lands: refused, nothing moved
    as_owner(w);
    w.avatar.set_item(1, 5, 60, 0, 0);
    stop(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5, 50)), 'Avatar: price above max');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 200);
    assert_eq!(w.avatar.owned(PLAYER().into(), 1), 0);
    assert_eq!(w.avatar.item(1, 5).sold, 0);
    // Exactly the confirmed price: charged it
    as_player(w, PLAYER());
    w.avatar.buy_avatar_item(1, 5, 60);
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 140);
    // A price lowered since the confirmation: charged the lower one
    as_owner(w);
    w.avatar.set_item(0, 2, 20, 0, 0);
    stop(w);
    as_player(w, PLAYER());
    w.avatar.buy_avatar_item(0, 2, 30);
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 120);
}

#[test]
#[feature("safe_dispatcher")]
fn test_cobbles_never_below_zero() {
    let w = world();
    give(w, PLAYER(), 99);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(2, 255, 0xffff)), 'Setup: not enough cobbles');
    stop(w);
    // Nothing written: the bit, the count sold, the balance
    assert_eq!(w.avatar.owned(PLAYER().into(), 2), 0);
    assert_eq!(w.avatar.item(2, 255).sold, 0);
    assert_eq!(cobbles_of(w, PLAYER()), 99);
    // Exactly the price: to zero
    give(w, PLAYER(), 100);
    buy(w, PLAYER(), 2, 255);
    assert_eq!(cobbles_of(w, PLAYER()), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_free_unlisted_and_withdrawn_items_are_not_for_sale() {
    let w = world();
    give(w, PLAYER(), 500);
    as_player(w, PLAYER());
    let not_for_sale = 'Avatar: item not for sale';
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 0, 0xffff)), not_for_sale);
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 6, 0xffff)), not_for_sale);
    assert_eq!(error_of(safe(w).buy_avatar_item(9, 0, 0xffff)), not_for_sale);
    stop(w);
    as_owner(w);
    w.avatar.withdraw_item(1, 5);
    assert_eq!(w.avatar.item(1, 5).state, WITHDRAWN);
    assert_eq!(error_of(safe(w).withdraw_item(1, 5)), 'Avatar: item not listed');
    assert_eq!(error_of(safe(w).withdraw_item(0, 6)), 'Avatar: item not listed');
    stop(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5, 0xffff)), not_for_sale);
    stop(w);
    // Relisted, on sale again
    as_owner(w);
    w.avatar.set_item(1, 5, 60, 0, 0);
    stop(w);
    buy(w, PLAYER(), 1, 5);
    assert_eq!(cobbles_of(w, PLAYER()), 440);
    assert_eq!(w.avatar.item(0, 6).state, UNLISTED);
}

#[test]
#[feature("safe_dispatcher")]
fn test_the_limits_in_quantity_and_in_time() {
    let w = world();
    give(w, PLAYER(), 500);
    give(w, OTHER(), 500);
    as_owner(w);
    // One copy of item 3 of part 0; item 4 a seasonal item, on sale until time 1000
    w.avatar.set_item(0, 3, 40, 1, 0);
    w.avatar.set_item(0, 4, 40, 0, 1000);
    stop(w);
    buy(w, PLAYER(), 0, 3);
    as_player(w, OTHER());
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 3, 0xffff)), 'Avatar: item sold out');
    stop(w);
    // Relisting keeps the count sold: one more copy
    as_owner(w);
    w.avatar.set_item(0, 3, 40, 2, 0);
    stop(w);
    buy(w, OTHER(), 0, 3);
    assert_eq!(w.avatar.item(0, 3).sold, 2);
    // Time
    start_cheat_block_timestamp_global(999);
    buy(w, PLAYER(), 0, 4);
    start_cheat_block_timestamp_global(1000);
    as_player(w, OTHER());
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 4, 0xffff)), 'Avatar: sale ended');
    stop(w);
    // The season over, the item bought stays usable
    set(w, PLAYER(), look(array![4, 0, 0, 0]));
}

// The spender

#[test]
#[feature("safe_dispatcher")]
fn test_only_an_allowlisted_spender_spends() {
    let w = world();
    give(w, PLAYER(), 100);
    let spend = ISetupSpendSafeDispatcher { contract_address: w.setup };
    // The player, the owner and anyone else: refused
    for who in array![PLAYER(), OWNER(), OTHER(), Zero::zero()] {
        start_cheat_caller_address(w.setup, who);
        assert_eq!(
            error_of(spend.spend_cobbles(PLAYER().into(), 10, AVATAR_REASON)), 'Setup: not spender',
        );
        stop_cheat_caller_address(w.setup);
    }
    // Avatar removed from the allowlist: it spends nothing, and nothing is recorded
    start_cheat_caller_address(w.setup, OWNER());
    ISetupSpendDispatcher { contract_address: w.setup }
        .set_spender(w.avatar.contract_address, false);
    stop_cheat_caller_address(w.setup);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5, 0xffff)), 'Setup: not spender');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 100);
    assert_eq!(w.avatar.owned(PLAYER().into(), 1), 0);
    assert_eq!(w.avatar.item(1, 5).sold, 0);
}

// The avatar

#[test]
fn test_set_avatar_with_free_items_stores_and_emits() {
    let w = world();
    let player_id: felt252 = PLAYER().into();
    let value = look(array![1, 0, 1, 1]);
    let mut spy = spy_events();
    set(w, PLAYER(), value);
    assert_eq!(w.avatar.avatar(player_id), value);
    assert_eq!(w.avatar.avatar(OTHER().into()), 0);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::AvatarSet(AvatarSet { player_id, look: value }),
                ),
            ],
        );
    // Every part at its default: the version alone
    set(w, PLAYER(), 1);
    assert_eq!(w.avatar.avatar(player_id), 1);
    // Cleared with 0
    set(w, PLAYER(), 0);
    assert_eq!(w.avatar.avatar(player_id), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_avatar_never_accepts_a_part_neither_free_nor_owned() {
    let w = world();
    give(w, PLAYER(), 500);
    as_player(w, PLAYER());
    let s = safe(w);
    let not_owned = 'Avatar: item not owned';
    // Paid and not owned, in each position
    assert_eq!(error_of(s.set_avatar(look(array![2, 0, 0, 0]))), not_owned);
    assert_eq!(error_of(s.set_avatar(look(array![0, 5, 0, 0]))), not_owned);
    assert_eq!(error_of(s.set_avatar(look(array![1, 1, 255, 1]))), not_owned);
    // Never listed
    assert_eq!(error_of(s.set_avatar(look(array![0, 0, 0, 2]))), not_owned);
    // A part past the parts in use, another version
    let invalid = 'Avatar: invalid look';
    assert_eq!(error_of(s.set_avatar(look(array![0, 0, 0, 0, 1]))), invalid);
    assert_eq!(error_of(s.set_avatar(2)), invalid);
    assert_eq!(error_of(s.set_avatar(0x0100)), invalid);
    stop(w);
    // Owned: accepted
    buy(w, PLAYER(), 2, 255);
    buy(w, PLAYER(), 0, 2);
    let value = look(array![2, 1, 255, 0]);
    set(w, PLAYER(), value);
    assert_eq!(w.avatar.avatar(PLAYER().into()), value);
    // Another player does not own them
    as_player(w, OTHER());
    assert_eq!(error_of(safe(w).set_avatar(value)), not_owned);
    stop(w);
}

#[test]
#[feature("safe_dispatcher")]
fn test_withdrawn_items_owned_stay_usable_free_ones_do_not() {
    let w = world();
    give(w, PLAYER(), 500);
    buy(w, PLAYER(), 1, 5);
    as_owner(w);
    w.avatar.withdraw_item(1, 5);
    w.avatar.withdraw_item(0, 1);
    stop(w);
    // Owned and withdrawn: usable
    set(w, PLAYER(), look(array![0, 5, 0, 0]));
    // Free and withdrawn: no longer free
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).set_avatar(look(array![1, 0, 0, 0]))), 'Avatar: item not owned');
    stop(w);
    // A free item made paid: no longer selectable without a purchase; a stored look keeps it
    set(w, PLAYER(), look(array![0, 0, 0, 1]));
    as_owner(w);
    w.avatar.set_item(3, 1, 25, 0, 0);
    stop(w);
    assert_eq!(w.avatar.avatar(PLAYER().into()), look(array![0, 0, 0, 1]));
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).set_avatar(look(array![0, 0, 0, 1]))), 'Avatar: item not owned');
    stop(w);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_avatar_needs_parts_and_more_parts_keep_old_looks() {
    let w = bare();
    as_player(w, PLAYER());
    // No parts: only the version, whose items (none) are all usable, and 0
    assert_eq!(error_of(safe(w).set_avatar(0x0101)), 'Avatar: invalid look');
    w.avatar.set_avatar(0);
    stop(w);
    as_owner(w);
    w.avatar.set_parts(1);
    w.avatar.set_item(0, 1, 0, 0, 0);
    stop(w);
    set(w, PLAYER(), look(array![1]));
    // A new part: an old look reads item 0 there, which the owner lists free
    as_owner(w);
    w.avatar.set_parts(2);
    w.avatar.set_item(1, 0, 0, 0, 0);
    stop(w);
    assert_eq!(look_ids(w.avatar.avatar(PLAYER().into()), 2), Some(array![1, 0]));
    set(w, PLAYER(), look(array![1]));
}

#[test]
#[fuzzer(runs: 8, seed: 627)]
#[feature("safe_dispatcher")]
fn test_fuzz_buys_and_sets(seed: u64) {
    let w = world();
    give(w, PLAYER(), 150);
    let paid: Array<(u8, u8, u64)> = array![(0, 2, 30), (1, 5, 50), (2, 255, 100)];
    let mut balance: u64 = 150;
    let mut owned: Array<bool> = array![false, false, false];
    let mut x = seed;
    for _ in 0..6_u8 {
        let pick: u32 = (x % 3).try_into().unwrap();
        x = x / 3 + 7919;
        let (part, id, price) = *paid.at(pick);
        let mine = *owned.at(pick);
        let safe_avatar = safe(w);
        as_player(w, PLAYER());
        let result = safe_avatar.buy_avatar_item(part, id, price.try_into().unwrap());
        stop(w);
        if !mine && balance >= price {
            assert!(result.is_ok());
            balance -= price;
            let mut next: Array<bool> = array![];
            for i in 0..3_u32 {
                next.append(*owned.at(i) || i == pick);
            }
            owned = next;
        } else {
            assert!(result.is_err());
        }
        assert_eq!(cobbles_of(w, PLAYER()), balance);
    }
    // The avatar of each paid item owned (the free item 1 elsewhere) is accepted
    let mut ids: Array<u8> = array![];
    for i in 0..3_u32 {
        let (part, id, _) = *paid.at(i);
        let part: u32 = part.into();
        assert_eq!(part, i);
        ids.append(if *owned.at(i) {
            id
        } else {
            1
        });
    }
    set(w, PLAYER(), look(ids));
}

// The name (PLAYER-RENAME)

fn names(w: World) -> IAvatarNameDispatcher {
    IAvatarNameDispatcher { contract_address: w.avatar.contract_address }
}

fn safe_names(w: World) -> IAvatarNameSafeDispatcher {
    IAvatarNameSafeDispatcher { contract_address: w.avatar.contract_address }
}

/// `bare()` with the rename price at 50, as `scripts/deploy.sh` sets it.
fn priced() -> World {
    let w = bare();
    as_owner(w);
    names(w).set_rename_price(50);
    stop(w);
    w
}

fn rename(w: World, who: ContractAddress, name: ByteArray) {
    as_player(w, who);
    names(w).rename(name, 0xffff);
    stop(w);
}

/// A `ByteArray` of these bytes (UTF-8 written out: Cairo's literals are ASCII).
fn utf8(bytes: Array<u8>) -> ByteArray {
    let mut text: ByteArray = "";
    for byte in bytes {
        text.append_byte(byte);
    }
    text
}

/// 李小龙 (Chinese), Élodie (accented Latin), ÉLODIE, Анна and АННА (Cyrillic).
fn li_xiaolong() -> ByteArray {
    utf8(array![0xe6, 0x9d, 0x8e, 0xe5, 0xb0, 0x8f, 0xe9, 0xbe, 0x99])
}

fn elodie() -> ByteArray {
    utf8(array![0xc3, 0x89, 'l', 'o', 'd', 'i', 'e'])
}

fn elodie_upper() -> ByteArray {
    utf8(array![0xc3, 0x89, 'L', 'O', 'D', 'I', 'E'])
}

fn anna() -> ByteArray {
    utf8(array![0xd0, 0x90, 0xd0, 0xbd, 0xd0, 0xbd, 0xd0, 0xb0])
}

fn anna_upper() -> ByteArray {
    utf8(array![0xd0, 0x90, 0xd0, 0x9d, 0xd0, 0x9d, 0xd0, 0x90])
}

/// The key of a name of ASCII and Latin-1 characters, as `name_key` makes it: each character
/// folded, hashed.
fn key_of(codes: Array<u32>) -> felt252 {
    let mut folded: Array<felt252> = array![];
    for code in codes {
        folded.append(fold(code).into());
    }
    poseidon_hash_span(folded.span())
}

#[test]
fn test_utf8_is_decoded_strictly() {
    assert_eq!(decode(@"a", 0), Some((0x61, 1)));
    assert_eq!(decode(@utf8(array![0xc3, 0x89]), 0), Some((0xc9, 2)));
    assert_eq!(decode(@utf8(array![0xe6, 0x9d, 0x8e]), 0), Some((0x674e, 3)));
    assert_eq!(decode(@utf8(array![0xf0, 0x9f, 0x98, 0x80]), 0), Some((0x1f600, 4)));
    // A lone continuation, an overlong form, a surrogate, past U+10FFFF, a cut sequence
    assert_eq!(decode(@utf8(array![0x80]), 0), None);
    assert_eq!(decode(@utf8(array![0xc0, 0x81]), 0), None);
    assert_eq!(decode(@utf8(array![0xe0, 0x80, 0x80]), 0), None);
    assert_eq!(decode(@utf8(array![0xed, 0xa0, 0x80]), 0), None);
    assert_eq!(decode(@utf8(array![0xf4, 0x90, 0x80, 0x80]), 0), None);
    assert_eq!(decode(@utf8(array![0xf5, 0x80, 0x80, 0x80]), 0), None);
    assert_eq!(decode(@utf8(array![0xe6, 0x9d]), 0), None);
    assert_eq!(decode(@utf8(array![0xc3, 0x41]), 0), None);
}

#[test]
fn test_name_key_takes_any_script_with_single_spaces_and_hyphens() {
    // ASCII, the case folded
    assert_eq!(name_key(@"MossyMason27"), name_key(@"mossymason27"));
    assert_eq!(name_key(@"abc"), Some(key_of(array!['a', 'b', 'c'])));
    assert_eq!(name_key(@"ABC"), name_key(@"abc"));
    assert!(name_key(@"123456789012345").is_some());
    // Spaces and hyphens between words
    assert!(name_key(@"Mossy Mason").is_some());
    assert!(name_key(@"Jean-Luc").is_some());
    assert!(name_key(@"A B-C").is_some());
    assert!(name_key(@"Mossy Mason") != name_key(@"Mossy-Mason"));
    // Any script: Chinese, accented Latin (its case folded), Cyrillic (its case folded)
    assert!(name_key(@li_xiaolong()).is_some());
    assert_eq!(name_key(@elodie()), Some(key_of(array![0xc9, 'l', 'o', 'd', 'i', 'e'])));
    assert_eq!(name_key(@elodie_upper()), name_key(@elodie()));
    assert!(name_key(@anna()).is_some());
    assert_eq!(name_key(@anna_upper()), name_key(@anna()));
    // Chinese with Latin and digits (no lookalike there)
    let mut mixed = li_xiaolong();
    mixed.append(@" Lee 7");
    assert!(name_key(@mixed).is_some());
    // 15 characters of 3 bytes each: 45 bytes
    let mut fifteen: ByteArray = "";
    for _ in 0..5_u8 {
        fifteen.append(@li_xiaolong());
    }
    assert!(name_key(@fifteen).is_some());
}

#[test]
fn test_name_key_refuses_what_could_hide_another_name() {
    // Too short, too long (characters and bytes), nothing
    assert_eq!(name_key(@""), None);
    assert_eq!(name_key(@"ab"), None);
    assert_eq!(name_key(@"1234567890123456"), None);
    let mut sixteen = li_xiaolong();
    for _ in 0..4_u8 {
        sixteen.append(@li_xiaolong());
    }
    sixteen.append(@"x");
    assert_eq!(name_key(@sixteen), None);
    // Separators: first, last, doubled, side by side
    assert_eq!(name_key(@" abc"), None);
    assert_eq!(name_key(@"abc "), None);
    assert_eq!(name_key(@"-abc"), None);
    assert_eq!(name_key(@"abc-"), None);
    assert_eq!(name_key(@"ab  c"), None);
    assert_eq!(name_key(@"ab--c"), None);
    assert_eq!(name_key(@"ab -c"), None);
    // ASCII signs and controls
    assert_eq!(name_key(@"ab_c"), None);
    assert_eq!(name_key(@"abc."), None);
    assert_eq!(name_key(@"@bc"), None);
    assert_eq!(name_key(@"ab'c"), None);
    assert_eq!(name_key(@utf8(array!['a', 'b', 0x09, 'c'])), None);
    assert_eq!(name_key(@utf8(array!['a', 'b', 0x00, 'c'])), None);
    // Invalid UTF-8
    assert_eq!(name_key(@utf8(array!['a', 'b', 0xff])), None);
    // A no-break space, a zero-width space, a direction mark, a Hangul filler, an ideographic space
    assert_eq!(name_key(@utf8(array!['a', 0xc2, 0xa0, 'b', 'c'])), None);
    assert_eq!(name_key(@utf8(array!['a', 0xe2, 0x80, 0x8b, 'b', 'c'])), None);
    assert_eq!(name_key(@utf8(array!['a', 0xe2, 0x80, 0x8f, 'b', 'c'])), None);
    assert_eq!(name_key(@utf8(array!['a', 0xe3, 0x85, 0xa4, 'b', 'c'])), None);
    assert_eq!(name_key(@utf8(array!['a', 0xe3, 0x80, 0x80, 'b', 'c'])), None);
    // A combining accent after a Latin letter (composed text only), an emoji, fullwidth ASCII
    assert_eq!(name_key(@utf8(array!['E', 0xcc, 0x81, 'l', 'o'])), None);
    assert_eq!(name_key(@utf8(array!['a', 'b', 0xf0, 0x9f, 0x98, 0x80])), None);
    assert_eq!(name_key(@utf8(array![0xef, 0xbd, 0x82, 'a', 'l'])), None);
    // Latin with a Cyrillic lookalike ("bаl7hazar", its а Cyrillic), Greek with Latin
    assert_eq!(name_key(@utf8(array!['b', 0xd0, 0xb0, 'l', '7', 'h', 'a', 'z', 'a', 'r'])), None);
    assert_eq!(name_key(@utf8(array![0xce, 0x91, 'b', 'c'])), None);
}

#[test]
fn test_allowed_and_fold_by_range() {
    assert!(allowed('a') && allowed('Z') && allowed('0'));
    assert!(!allowed(' ') && !allowed('-') && !allowed('_'));
    assert!(allowed(0xe9)); // é
    assert!(!allowed(0xd7) && !allowed(0xf7) && !allowed(0xa0) && !allowed(0xad));
    assert!(allowed(0x674e) && allowed(0x3005)); // 李, 々
    assert!(!allowed(0x3000) && !allowed(0x200b) && !allowed(0xfeff) && !allowed(0x1f600));
    assert!(
        allowed(0x0627) && allowed(0x0915) && allowed(0x093f),
    ); // Arabic alef, Devanagari ka and its vowel sign
    assert_eq!(fold('A'), 'a');
    assert_eq!(fold(0xc9), 0xe9); // É
    assert_eq!(fold(0xdf), 0xdf); // ß has no capital here
    assert_eq!(fold(0x152), 0x153); // Œ
    assert_eq!(fold(0x178), 0xff); // Ÿ
    assert_eq!(fold(0x141), 0x142); // Ł
    assert_eq!(fold(0x391), 0x3b1); // Α
    assert_eq!(fold(0x416), 0x436); // Ж
    assert_eq!(fold(0x401), 0x451); // Ё
    assert_eq!(fold(0x674e), 0x674e);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_rename_price_owner_only_never_zero() {
    let w = bare();
    assert_eq!(names(w).rename_price(), 0);
    let s = safe_names(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(s.set_rename_price(50)), 'Ownable: caller is not owner');
    stop(w);
    as_owner(w);
    assert_eq!(error_of(s.set_rename_price(0)), 'Avatar: invalid rename price');
    let mut spy = spy_events();
    names(w).set_rename_price(50);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::RenamePriceSet(RenamePriceSet { cobbles: 50 }),
                ),
            ],
        );
    names(w).set_rename_price(70);
    stop(w);
    assert_eq!(names(w).rename_price(), 70);
}

#[test]
fn test_first_rename_is_free_and_emits() {
    let w = priced();
    let player_id: felt252 = PLAYER().into();
    assert_eq!(names(w).name(player_id), "");
    assert_eq!(names(w).renames(player_id), 0);
    let mut spy = spy_events();
    // No cobbles at all: the first change is free
    rename(w, PLAYER(), li_xiaolong());
    assert_eq!(names(w).name(player_id), li_xiaolong());
    assert_eq!(names(w).renames(player_id), 1);
    assert_eq!(names(w).name_owner(li_xiaolong()), player_id);
    assert_eq!(cobbles_of(w, PLAYER()), 0);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::Renamed(
                        Renamed { player_id, name: li_xiaolong(), cobbles: 0, count: 1 },
                    ),
                ),
            ],
        );
}

#[test]
#[feature("safe_dispatcher")]
fn test_later_renames_cost_the_price_debited_by_setup() {
    let w = priced();
    let player_id: felt252 = PLAYER().into();
    give(w, PLAYER(), 120);
    rename(w, PLAYER(), "First");
    assert_eq!(cobbles_of(w, PLAYER()), 120);
    let mut spy = spy_events();
    rename(w, PLAYER(), "Mossy Mason");
    assert_eq!(cobbles_of(w, PLAYER()), 70);
    assert_eq!(names(w).renames(player_id), 2);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::Renamed(
                        Renamed { player_id, name: "Mossy Mason", cobbles: 50, count: 2 },
                    ),
                ),
            ],
        );
    spy
        .assert_emitted(
            @array![
                (
                    w.setup,
                    SetupEvent::CobblesSpent(
                        CobblesSpent {
                            player_id,
                            spender: w.avatar.contract_address,
                            reason: RENAME_REASON,
                            cobbles: 50,
                            balance: 70,
                        },
                    ),
                ),
            ],
        );
    rename(w, PLAYER(), elodie());
    assert_eq!(cobbles_of(w, PLAYER()), 20);
    // Short: refused, and nothing changed
    as_player(w, PLAYER());
    assert_eq!(error_of(safe_names(w).rename("Fourth", 0xffff)), 'Setup: not enough cobbles');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 20);
    assert_eq!(names(w).name(player_id), elodie());
    assert_eq!(names(w).renames(player_id), 3);
    assert_eq!(names(w).name_owner("Fourth"), 0);
    assert_eq!(names(w).name_owner(elodie_upper()), player_id);
}

#[test]
#[feature("safe_dispatcher")]
fn test_rename_refuses_a_price_above_the_confirmed_one_or_none_set() {
    let w = bare();
    let player_id: felt252 = PLAYER().into();
    give(w, PLAYER(), 200);
    // No price set: the first change still free, a later one refused
    as_player(w, PLAYER());
    names(w).rename("First", 0);
    assert_eq!(error_of(safe_names(w).rename("Second", 0xffff)), 'Avatar: rename not priced');
    stop(w);
    // The owner sets 50: a player who confirmed 40 is not charged more
    as_owner(w);
    names(w).set_rename_price(50);
    stop(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe_names(w).rename("Second", 40)), 'Avatar: price above max');
    assert_eq!(names(w).name(player_id), "First");
    assert_eq!(cobbles_of(w, PLAYER()), 200);
    names(w).rename("Second", 50);
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 150);
}

#[test]
#[feature("safe_dispatcher")]
fn test_rename_refuses_an_invalid_or_the_same_name() {
    let w = priced();
    give(w, PLAYER(), 100);
    let s = safe_names(w);
    as_player(w, PLAYER());
    let invalid = 'Avatar: invalid name';
    assert_eq!(error_of(s.rename("", 0xffff)), invalid);
    assert_eq!(error_of(s.rename("ab", 0xffff)), invalid);
    assert_eq!(error_of(s.rename("a  b c", 0xffff)), invalid);
    assert_eq!(error_of(s.rename("1234567890123456", 0xffff)), invalid);
    assert_eq!(error_of(s.rename(utf8(array!['a', 'b', 0xff]), 0xffff)), invalid);
    // A refusal is no change: the first is still free
    assert_eq!(names(w).renames(PLAYER().into()), 0);
    names(w).rename("Paver", 0);
    assert_eq!(error_of(s.rename("Paver", 0xffff)), 'Avatar: same name');
    // Another case is another name (charged), and stays the player's
    names(w).rename("PAVER", 50);
    stop(w);
    assert_eq!(names(w).name(PLAYER().into()), "PAVER");
    assert_eq!(names(w).name_owner("paver"), PLAYER().into());
    assert_eq!(cobbles_of(w, PLAYER()), 50);
}

#[test]
#[feature("safe_dispatcher")]
fn test_one_player_per_name_whatever_its_case() {
    let w = priced();
    give(w, PLAYER(), 100);
    give(w, OTHER(), 100);
    rename(w, PLAYER(), elodie());
    let s = safe_names(w);
    as_player(w, OTHER());
    let taken = 'Avatar: name taken';
    assert_eq!(error_of(s.rename(elodie(), 0xffff)), taken);
    assert_eq!(error_of(s.rename(elodie_upper(), 0xffff)), taken);
    stop(w);
    // A refusal is no change, and spends nothing
    assert_eq!(names(w).renames(OTHER().into()), 0);
    assert_eq!(cobbles_of(w, OTHER()), 100);
    // The name a player leaves is free at once
    rename(w, PLAYER(), "Carter");
    assert_eq!(names(w).name_owner(elodie()), 0);
    rename(w, OTHER(), elodie_upper());
    assert_eq!(names(w).name_owner(elodie()), OTHER().into());
    as_player(w, PLAYER());
    assert_eq!(error_of(s.rename(elodie(), 0xffff)), taken);
    stop(w);
}

#[test]
#[fuzzer(runs: 8, seed: 1100)]
#[feature("safe_dispatcher")]
fn test_fuzz_renames_keep_one_player_per_name_and_the_cobbles(seed: u64) {
    let w = priced();
    give(w, PLAYER(), 130);
    give(w, OTHER(), 60);
    let pool: Array<ByteArray> = array![
        elodie(), elodie_upper(), anna(), anna_upper(), "Mossy Mason",
    ];
    let players = array![PLAYER(), OTHER()];
    let mut balances: Array<u64> = array![130, 60];
    let mut counts: Array<u32> = array![0, 0];
    let mut x = seed;
    for _ in 0..10_u8 {
        let who: u32 = (x % 2).try_into().unwrap();
        x = x / 2 + 104729;
        let pick: u32 = (x % 5).try_into().unwrap();
        x = x / 5 + 7919;
        let player = *players.at(who);
        let player_id: felt252 = player.into();
        let name = pool.at(pick).clone();
        let key = name_key(@name).unwrap();
        let holder = names(w).name_owner(name.clone());
        let current = names(w).name(player_id);
        let count = *counts.at(who);
        let balance = *balances.at(who);
        let price: u64 = if count == 0 {
            0
        } else {
            50
        };
        let ok = name != current && (holder == 0 || holder == player_id) && balance >= price;
        as_player(w, player);
        let result = safe_names(w).rename(name.clone(), 0xffff);
        stop(w);
        assert_eq!(result.is_ok(), ok);
        if ok {
            let mut next_balances: Array<u64> = array![];
            let mut next_counts: Array<u32> = array![];
            for i in 0..2_u32 {
                next_balances.append(if i == who {
                    balance - price
                } else {
                    *balances.at(i)
                });
                next_counts.append(if i == who {
                    count + 1
                } else {
                    *counts.at(i)
                });
            }
            balances = next_balances;
            counts = next_counts;
            assert_eq!(names(w).name_owner(name.clone()), player_id);
            if let Some(left) = name_key(@current) {
                if left != key {
                    assert_eq!(names(w).name_owner(current), 0);
                }
            }
        }
        // Every player's balance and count as tracked; each name held by its holder only
        for i in 0..2_u32 {
            let p = *players.at(i);
            assert_eq!(cobbles_of(w, p), *balances.at(i));
            assert_eq!(names(w).renames(p.into()), *counts.at(i));
            let held = names(w).name(p.into());
            if held.len() != 0 {
                assert_eq!(names(w).name_owner(held), p.into());
            }
        }
    }
}
