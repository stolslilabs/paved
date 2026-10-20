//! The avatar on chain (#627, `systems/avatar.cairo`, `docs/architecture/avatar-chain.md`): the
//! owner's layout, price bounds and catalogue, the player's `buy_avatar_item` and `set_avatar`, the
//! cobbles debited by `Setup.spend_cobbles`, and the audit properties, each in a test named after
//! it: an item bought once, never twice; cobbles never below zero; `set_avatar` never accepts a
//! part neither free nor owned; only the spender spends; the limits in quantity and in time.
//!
//! The layout, bounds and prices here are the tests' own: the owner's values are not set yet.
//! The cobbles are written into `Setup`'s ledger directly (`give`): the earning paths have their
//! own tests (`e2e::cobbles*`).

use core::num::traits::Zero;
use core::testing::get_available_gas;
use paved::systems::avatar::Avatar::{
    AvatarItemBought, AvatarItemListed, AvatarSet, Event as AvatarEvent,
};
use paved::systems::avatar::{
    AvatarItem, IAvatarDispatcher, IAvatarDispatcherTrait, IAvatarSafeDispatcher,
    IAvatarSafeDispatcherTrait, LISTED, UNLISTED, WITHDRAWN, item_of, item_word, layout_widths,
    layout_word, look_ids, look_of,
};
use paved::systems::setup::Setup::{CobblesSpent, Event as SetupEvent};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupSpendSafeDispatcher, ISetupSpendSafeDispatcherTrait, SPEND_AVATAR,
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

/// The tests' layout: four categories of 3, 4, 7 and 2 bits.
fn widths() -> Array<u8> {
    array![3, 4, 7, 2]
}

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

/// `Setup` and `Avatar`, `Avatar` allowlisted as a reporter (it spends); no layout, bounds or item
/// yet.
fn bare() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let avatar = deploy("Avatar", array![OWNER().into(), setup.into()]);
    start_cheat_caller_address(setup, OWNER());
    ISetupDispatcher { contract_address: setup }.set_reporter(avatar, true);
    stop_cheat_caller_address(setup);
    World { avatar: IAvatarDispatcher { contract_address: avatar }, setup }
}

/// The tests' catalogue: items 0 and 1 of every category free, item 2 of category 0 at 30, item 5
/// of category 1 at 50, item 127 of category 2 at 100; bounds 20 to 100.
fn world() -> World {
    let w = bare();
    as_owner(w);
    w.avatar.set_layout(widths().span());
    w.avatar.set_price_bounds(20, 100);
    for category in 0..4_u8 {
        w.avatar.set_item(category, 0, 0, 0, 0);
        w.avatar.set_item(category, 1, 0, 0, 0);
    }
    w.avatar.set_item(0, 2, 30, 0, 0);
    w.avatar.set_item(1, 5, 50, 0, 0);
    w.avatar.set_item(2, 127, 100, 0, 0);
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

fn buy(w: World, who: ContractAddress, category: u8, id: u8) {
    as_player(w, who);
    w.avatar.buy_avatar_item(category, id);
    stop(w);
}

fn set(w: World, who: ContractAddress, look: felt252) {
    as_player(w, who);
    w.avatar.set_avatar(look);
    stop(w);
}

fn look(ids: Array<u8>) -> felt252 {
    look_of(ids.span(), widths().span())
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
}

#[test]
fn test_layout_and_look_round_trip() {
    let widths = widths();
    let word: u256 = layout_word(widths.span()).into();
    assert_eq!(word, 4 + 3 * 0x100 + 4 * 0x10000 + 7 * 0x1000000 + 2 * 0x100000000);
    assert_eq!(layout_widths(word.try_into().unwrap()), widths);
    assert_eq!(layout_widths(0), array![]);
    // Category 0 in the lowest bits; each id at its own offset
    assert_eq!(look(array![1, 0, 0, 0]), 1);
    assert_eq!(look(array![0, 1, 0, 0]), 8);
    assert_eq!(look(array![0, 0, 1, 0]), 128);
    assert_eq!(look(array![0, 0, 0, 1]), 0x4000);
    let ids = array![7, 15, 127, 3];
    let full = look(ids.clone());
    assert_eq!(full, 0xffff);
    assert_eq!(look_ids(full, widths.span()), Some(ids));
    // A bit above the layout (16 bits)
    assert_eq!(look_ids(0x10000, widths.span()), None);
    // Thirty categories of 7 bits: 210 bits in one felt
    let mut wide: Array<u8> = array![];
    let mut tops: Array<u8> = array![];
    for _ in 0..30_u8 {
        wide.append(7);
        tops.append(127);
    }
    assert_eq!(layout_widths(layout_word(wide.span())), wide);
    let top = look_of(tops.span(), wide.span());
    assert_eq!(look_ids(top, wide.span()), Some(tops));
}

// The owner's settings

#[test]
#[feature("safe_dispatcher")]
fn test_the_owner_settings_are_owner_only() {
    let w = world();
    as_player(w, PLAYER());
    let s = safe(w);
    let not_owner = 'Ownable: caller is not owner';
    assert_eq!(error_of(s.set_layout(array![3].span())), not_owner);
    assert_eq!(error_of(s.set_price_bounds(1, 2)), not_owner);
    assert_eq!(error_of(s.set_item(0, 3, 0, 0, 0)), not_owner);
    assert_eq!(error_of(s.withdraw_item(0, 2)), not_owner);
    assert_eq!(error_of(s.set_setup(OTHER())), not_owner);
    stop(w);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_layout_bounds_and_growth() {
    let w = bare();
    as_owner(w);
    let s = safe(w);
    let invalid = 'Avatar: invalid layout';
    assert_eq!(error_of(s.set_layout(array![].span())), invalid);
    assert_eq!(error_of(s.set_layout(array![3, 0].span())), invalid);
    assert_eq!(error_of(s.set_layout(array![8].span())), invalid);
    let mut too_many: Array<u8> = array![];
    for _ in 0..31_u8 {
        too_many.append(1);
    }
    assert_eq!(error_of(s.set_layout(too_many.span())), invalid);
    w.avatar.set_layout(array![3, 4].span());
    assert_eq!(w.avatar.layout(), array![3, 4]);
    // It may only grow, the widths there kept
    let changed = 'Avatar: layout changed';
    assert_eq!(error_of(s.set_layout(array![3].span())), changed);
    assert_eq!(error_of(s.set_layout(array![3, 5].span())), changed);
    assert_eq!(error_of(s.set_layout(array![4, 4, 2].span())), changed);
    w.avatar.set_layout(array![3, 4, 2].span());
    assert_eq!(w.avatar.layout(), array![3, 4, 2]);
    stop(w);
}

#[test]
fn test_items_lists_every_id_of_a_category() {
    let w = world();
    let items = w.avatar.items(0);
    assert_eq!(items.len(), 8);
    assert_eq!(
        *items.at(0), AvatarItem { state: LISTED, cobbles: 0, sold: 0, supply: 0, until: 0 },
    );
    assert_eq!(
        *items.at(2), AvatarItem { state: LISTED, cobbles: 30, sold: 0, supply: 0, until: 0 },
    );
    assert_eq!(*items.at(7), Default::default());
    assert_eq!(w.avatar.items(2).len(), 128);
    assert_eq!(*w.avatar.items(2).at(127), w.avatar.item(2, 127));
    assert_eq!(w.avatar.items(3).len(), 4);
}

#[test]
#[feature("safe_dispatcher")]
fn test_items_of_a_category_outside_the_layout_is_refused() {
    let w = world();
    assert_eq!(error_of(safe(w).items(4)), 'Avatar: invalid item');
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_item_checks_the_layout_and_the_price_bounds() {
    let w = bare();
    as_owner(w);
    let s = safe(w);
    // No layout: no item
    assert_eq!(error_of(s.set_item(0, 0, 0, 0, 0)), 'Avatar: invalid item');
    w.avatar.set_layout(widths().span());
    // A category outside the layout, an id wider than its category
    assert_eq!(error_of(s.set_item(4, 0, 0, 0, 0)), 'Avatar: invalid item');
    assert_eq!(error_of(s.set_item(0, 8, 0, 0, 0)), 'Avatar: invalid item');
    assert_eq!(error_of(s.set_item(3, 4, 0, 0, 0)), 'Avatar: invalid item');
    // No bounds set: only free items
    assert_eq!(error_of(s.set_item(0, 7, 1, 0, 0)), 'Avatar: invalid cobbles');
    w.avatar.set_item(0, 7, 0, 0, 0);
    // The bounds are the owner's
    assert_eq!(error_of(s.set_price_bounds(0, 10)), 'Avatar: invalid bounds');
    assert_eq!(error_of(s.set_price_bounds(11, 10)), 'Avatar: invalid bounds');
    w.avatar.set_price_bounds(20, 100);
    assert_eq!(w.avatar.price_bounds(), (20, 100));
    assert_eq!(error_of(s.set_item(0, 7, 19, 0, 0)), 'Avatar: invalid cobbles');
    assert_eq!(error_of(s.set_item(0, 7, 101, 0, 0)), 'Avatar: invalid cobbles');
    let mut spy = spy_events();
    w.avatar.set_item(2, 127, 100, 5, 1000);
    assert_eq!(
        w.avatar.item(2, 127),
        AvatarItem { state: LISTED, cobbles: 100, sold: 0, supply: 5, until: 1000 },
    );
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::AvatarItemListed(
                        AvatarItemListed {
                            category: 2,
                            id: 127,
                            state: LISTED,
                            cobbles: 100,
                            supply: 5,
                            until: 1000,
                        },
                    ),
                ),
            ],
        );
    // Narrower bounds keep the items listed
    w.avatar.set_price_bounds(20, 50);
    assert_eq!(w.avatar.item(2, 127).cobbles, 100);
    stop(w);
}

// Buying

#[test]
fn test_buy_spends_the_price_sets_the_bit_and_emits() {
    let w = world();
    give(w, PLAYER(), 200);
    let player_id: felt252 = PLAYER().into();
    let mut spy = spy_events();
    buy(w, PLAYER(), 2, 127);
    assert_eq!(cobbles_of(w, PLAYER()), 100);
    assert_eq!(w.avatar.owned(player_id, 2), 0x80000000000000000000000000000000);
    assert_eq!(w.avatar.item(2, 127).sold, 1);
    // Buying does not set the avatar
    assert_eq!(w.avatar.avatar(player_id), 0);
    spy
        .assert_emitted(
            @array![
                (
                    w.avatar.contract_address,
                    AvatarEvent::AvatarItemBought(
                        AvatarItemBought {
                            player_id, category: 2, id: 127, cobbles: 100, sold: 1, balance: 100,
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
                            kind: SPEND_AVATAR,
                            id: 2 * 0x100 + 127,
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
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5)), 'Avatar: item owned');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 150);
    assert_eq!(w.avatar.item(1, 5).sold, 1);
}

#[test]
#[feature("safe_dispatcher")]
fn test_cobbles_never_below_zero() {
    let w = world();
    give(w, PLAYER(), 99);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(2, 127)), 'Setup: not enough cobbles');
    stop(w);
    // Nothing written: the bit, the count sold, the balance
    assert_eq!(w.avatar.owned(PLAYER().into(), 2), 0);
    assert_eq!(w.avatar.item(2, 127).sold, 0);
    assert_eq!(cobbles_of(w, PLAYER()), 99);
    // Exactly the price: to zero
    give(w, PLAYER(), 100);
    buy(w, PLAYER(), 2, 127);
    assert_eq!(cobbles_of(w, PLAYER()), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_free_unlisted_and_withdrawn_items_are_not_for_sale() {
    let w = world();
    give(w, PLAYER(), 500);
    as_player(w, PLAYER());
    let not_for_sale = 'Avatar: item not for sale';
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 0)), not_for_sale);
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 6)), not_for_sale);
    assert_eq!(error_of(safe(w).buy_avatar_item(9, 0)), not_for_sale);
    stop(w);
    as_owner(w);
    w.avatar.withdraw_item(1, 5);
    assert_eq!(w.avatar.item(1, 5).state, WITHDRAWN);
    assert_eq!(error_of(safe(w).withdraw_item(1, 5)), 'Avatar: item not listed');
    assert_eq!(error_of(safe(w).withdraw_item(0, 6)), 'Avatar: item not listed');
    stop(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5)), not_for_sale);
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
    // Two copies of item 3 of category 0; item 4 sold until time 1000
    w.avatar.set_item(0, 3, 40, 1, 0);
    w.avatar.set_item(0, 4, 40, 0, 1000);
    stop(w);
    buy(w, PLAYER(), 0, 3);
    as_player(w, OTHER());
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 3)), 'Avatar: item sold out');
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
    assert_eq!(error_of(safe(w).buy_avatar_item(0, 4)), 'Avatar: sale ended');
    stop(w);
}

// The spender

#[test]
#[feature("safe_dispatcher")]
fn test_only_a_reporter_spends() {
    let w = world();
    give(w, PLAYER(), 100);
    let spend = ISetupSpendSafeDispatcher { contract_address: w.setup };
    // The player, the owner and anyone else: refused
    for who in array![PLAYER(), OWNER(), OTHER(), Zero::zero()] {
        start_cheat_caller_address(w.setup, who);
        assert_eq!(
            error_of(spend.spend_cobbles(PLAYER().into(), 10, SPEND_AVATAR, 0)),
            'Quest: not reporter',
        );
        stop_cheat_caller_address(w.setup);
    }
    // The reporter: not zero cobbles
    start_cheat_caller_address(w.setup, w.avatar.contract_address);
    assert_eq!(
        error_of(spend.spend_cobbles(PLAYER().into(), 0, SPEND_AVATAR, 0)),
        'Setup: invalid cobbles',
    );
    stop_cheat_caller_address(w.setup);
    // Avatar removed from the allowlist: it spends nothing
    start_cheat_caller_address(w.setup, OWNER());
    ISetupDispatcher { contract_address: w.setup }.set_reporter(w.avatar.contract_address, false);
    stop_cheat_caller_address(w.setup);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).buy_avatar_item(1, 5)), 'Quest: not reporter');
    stop(w);
    assert_eq!(cobbles_of(w, PLAYER()), 100);
    assert_eq!(w.avatar.owned(PLAYER().into(), 1), 0);
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
    assert_eq!(error_of(s.set_avatar(look(array![1, 1, 127, 1]))), not_owned);
    // Never listed
    assert_eq!(error_of(s.set_avatar(look(array![0, 0, 0, 2]))), not_owned);
    // A bit above the layout
    assert_eq!(error_of(s.set_avatar(0x10000)), 'Avatar: invalid look');
    stop(w);
    // Owned: accepted
    buy(w, PLAYER(), 2, 127);
    buy(w, PLAYER(), 0, 2);
    let value = look(array![2, 1, 127, 0]);
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
    // A free item made paid: no longer selectable without a purchase
    as_owner(w);
    w.avatar.set_item(3, 1, 25, 0, 0);
    stop(w);
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).set_avatar(look(array![0, 0, 0, 1]))), 'Avatar: item not owned');
    stop(w);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_avatar_needs_a_layout_and_a_grown_layout_keeps_old_looks() {
    let w = bare();
    as_player(w, PLAYER());
    assert_eq!(error_of(safe(w).set_avatar(1)), 'Avatar: no layout');
    // 0 needs nothing
    w.avatar.set_avatar(0);
    stop(w);
    as_owner(w);
    w.avatar.set_layout(array![3].span());
    w.avatar.set_item(0, 1, 0, 0, 0);
    stop(w);
    set(w, PLAYER(), 1);
    // A new category: an old look reads item 0 there, which the owner lists free
    as_owner(w);
    w.avatar.set_layout(array![3, 2].span());
    w.avatar.set_item(1, 0, 0, 0, 0);
    stop(w);
    assert_eq!(look_ids(w.avatar.avatar(PLAYER().into()), array![3, 2].span()), Some(array![1, 0]));
    set(w, PLAYER(), 1);
}

#[test]
#[fuzzer(runs: 8, seed: 627)]
#[feature("safe_dispatcher")]
fn test_fuzz_buys_and_sets(seed: u64) {
    let w = world();
    give(w, PLAYER(), 150);
    let paid: Array<(u8, u8, u64)> = array![(0, 2, 30), (1, 5, 50), (2, 127, 100)];
    let mut balance: u64 = 150;
    let mut owned: Array<bool> = array![false, false, false];
    let mut x = seed;
    for _ in 0..6_u8 {
        let pick: u32 = (x % 3).try_into().unwrap();
        x = x / 3 + 7919;
        let (category, id, price) = *paid.at(pick);
        let mine = *owned.at(pick);
        let safe_avatar = safe(w);
        as_player(w, PLAYER());
        let result = safe_avatar.buy_avatar_item(category, id);
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
    // The avatar of everything owned is accepted
    let mut ids: Array<u8> = array![0, 0, 0, 0];
    if *owned.at(0) {
        ids = array![2, 0, 0, 0];
    }
    set(w, PLAYER(), look(ids));
}

// Gas (the test profile; `get_available_gas` around the one call, as `tests/gas.cairo`). The
// figures are printed for the pull request; each ceiling is the first measure on the VPS + 5 %,
// rounded up (`avatar-chain.md`, "As built": above the design's estimates).

/// A layout of ten categories of 7 bits, every item 0 to 3 free and item 4 at 50 in each; `PLAYER`
/// owns item 4 of every category when `owned`.
fn ten(owned: bool) -> World {
    let w = bare();
    let mut widths: Array<u8> = array![];
    for _ in 0..10_u8 {
        widths.append(7);
    }
    as_owner(w);
    w.avatar.set_layout(widths.span());
    w.avatar.set_price_bounds(20, 100);
    for category in 0..10_u8 {
        for id in 0..5_u8 {
            w.avatar.set_item(category, id, if id == 4 {
                50
            } else {
                0
            }, 0, 0);
        }
    }
    stop(w);
    if owned {
        give(w, PLAYER(), 500);
        for category in 0..10_u8 {
            buy(w, PLAYER(), category, 4);
        }
    }
    w
}

fn ten_look(id: u8) -> felt252 {
    let mut ids: Array<u8> = array![];
    let mut widths: Array<u8> = array![];
    for _ in 0..10_u8 {
        ids.append(id);
        widths.append(7);
    }
    look_of(ids.span(), widths.span())
}

#[test]
fn test_gas_buy_avatar_item() {
    let w = ten(false);
    give(w, PLAYER(), 500);
    as_player(w, PLAYER());
    let before = get_available_gas();
    w.avatar.buy_avatar_item(3, 4);
    let gas = before - get_available_gas();
    stop(w);
    println!("gas: buy_avatar_item: {}", gas);
    assert(gas <= 1220000, 'Avatar: gas of a buy');
}

#[test]
fn test_gas_set_avatar_ten_free_parts() {
    let w = ten(false);
    as_player(w, PLAYER());
    let before = get_available_gas();
    w.avatar.set_avatar(ten_look(3));
    let gas = before - get_available_gas();
    stop(w);
    println!("gas: set_avatar, 10 free parts: {}", gas);
    assert(gas <= 3100000, 'Avatar: gas of 10 free');
}

#[test]
fn test_gas_set_avatar_ten_owned_parts() {
    let w = ten(true);
    as_player(w, PLAYER());
    let before = get_available_gas();
    w.avatar.set_avatar(ten_look(4));
    let gas = before - get_available_gas();
    stop(w);
    println!("gas: set_avatar, 10 owned parts: {}", gas);
    assert(gas <= 4110000, 'Avatar: gas of 10 owned');
}

#[test]
fn test_gas_set_item() {
    let w = ten(false);
    as_owner(w);
    let before = get_available_gas();
    w.avatar.set_item(9, 100, 80, 10, 5000);
    let gas = before - get_available_gas();
    stop(w);
    println!("gas: set_item: {}", gas);
    assert(gas <= 1070000, 'Avatar: gas of set_item');
}
