//! Cobbles v1, part 3 (P-61, `docs/architecture/cobbles-v1.md`, 5, 7.1, 7.2, 7.4): the skins,
//! through the real contracts, wired as `scripts/deploy.sh` wires them (the cobbles come from
//! `buy_pack`, the only way a test has to a large balance). The owner's `set_skin_price`, the
//! player's `buy_skin` and `set_skins`, the packing of the active word, and the audit properties of
//! 7.5 that part 3 carries, each in a test named after it: A3 (for the caller only), A4 (cobbles
//! are spent only on skins), A6 (the owner's prices), and the skin properties of the brief: bought
//! once, never twice; cobbles never below zero; `set_skins` never activates a skin not owned; the
//! 19 slots round-trip; a withdrawn price cannot be bought; theme 0 is always allowed.

use core::num::traits::Zero;
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupSkinsDispatcher,
    ISetupSkinsDispatcherTrait, ISetupSkinsSafeDispatcher, ISetupSkinsSafeDispatcherTrait, PLANS,
    Setup, active_themes, active_word,
};
use paved::tests::setup::setup::{ANYONE, OWNER, PLAYER};
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, EventsFilterTrait, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::cobbles_packs::{Shop, buy, cobbles_of, error_of, shop};

/// The rarity table of cobbles-v1.md 5.2, by plan code 1 to 19: `50 + 50 x (9 - c) / 8` rounded to
/// 5, `c` the plan's count among the 72 tiles.
pub fn rarity() -> Array<u8> {
    array![100, 80, 90, 90, 90, 95, 75, 75, 80, 55, 75, 90, 50, 90, 90, 80, 100, 80, 95]
}

fn price_of(plan: u8) -> u8 {
    *rarity().at((plan - 1).into())
}

fn at(s: @Shop) -> ContractAddress {
    *s.packs.contract_address
}

fn skins(s: @Shop) -> ISetupSkinsDispatcher {
    ISetupSkinsDispatcher { contract_address: at(s) }
}

fn safe(s: @Shop) -> ISetupSkinsSafeDispatcher {
    ISetupSkinsSafeDispatcher { contract_address: at(s) }
}

/// The owner prices the 19 plans of `theme` by the table.
fn price_theme(s: @Shop, theme: u8) {
    start_cheat_caller_address(at(s), OWNER());
    for plan in 1..PLANS + 1 {
        skins(s).set_skin_price(theme, plan, price_of(plan));
    }
    stop_cheat_caller_address(at(s));
}

/// A shop with themes 1 and 2 priced by the table and `PLAYER` holding 1,000 cobbles (pack 4).
fn market() -> Shop {
    let s = shop();
    price_theme(@s, 1);
    price_theme(@s, 2);
    buy(@s, PLAYER(), 4, Zero::zero());
    s
}

fn buy_skin(s: @Shop, who: ContractAddress, theme: u8, plan: u8) {
    start_cheat_caller_address(at(s), who);
    skins(s).buy_skin(theme, plan);
    stop_cheat_caller_address(at(s));
}

fn set_skins(s: @Shop, who: ContractAddress, changes: Span<(u8, u8)>) {
    start_cheat_caller_address(at(s), who);
    skins(s).set_skins(changes);
    stop_cheat_caller_address(at(s));
}

fn active(s: @Shop, who: ContractAddress) -> Array<u8> {
    skins(s).active_skins(who.into())
}

fn owns(s: @Shop, who: ContractAddress, theme: u8, plan: u8) -> bool {
    let mut word = skins(s).skins(who.into(), theme);
    for _ in 0..plan {
        word /= 2;
    }
    word % 2 == 1
}

fn all_default() -> Array<u8> {
    active_themes(0)
}

// Packing (7.1)

#[test]
fn test_the_19_slots_round_trip_at_zero_one_and_maximum() {
    let mut zeros: Array<u8> = array![];
    let mut ones: Array<u8> = array![];
    let mut maxes: Array<u8> = array![];
    let mut distinct: Array<u8> = array![];
    for i in 0..PLANS {
        zeros.append(0);
        ones.append(1);
        maxes.append(255);
        distinct.append(i + 1);
    }
    assert_eq!(active_word(zeros.span()), 0);
    for themes in array![zeros, ones, maxes, distinct] {
        assert_eq!(active_themes(active_word(themes.span())), themes);
    }
    // 19 bytes: 152 bits, plan 1 in the lowest byte
    let word: u256 = active_word(array![1].span()).into();
    assert_eq!(word, 1);
    let mut top: Array<u8> = array![];
    for _ in 0..PLANS - 1 {
        top.append(0);
    }
    top.append(255);
    let word: u256 = active_word(top.span()).into();
    assert_eq!(word, 255 * 0x1000000000000000000000000000000000000_u256);
}

#[test]
fn test_each_slot_holds_its_own_theme_and_no_other() {
    for plan in 0..PLANS {
        let mut themes: Array<u8> = array![];
        for i in 0..PLANS {
            themes.append(if i == plan {
                200
            } else {
                0
            });
        }
        let unpacked = active_themes(active_word(themes.span()));
        assert_eq!(unpacked, themes);
    }
}

// The owner's prices (5.2, A6)

#[test]
#[feature("safe_dispatcher")]
fn test_a6_set_skin_price_by_the_owner_within_its_bounds_and_its_event() {
    let s = shop();
    let setup_address = at(@s);
    assert_eq!(skins(@s).skin_price(1, 1), 0);
    // [Check] The owner only
    start_cheat_caller_address(setup_address, PLAYER());
    assert_eq!(error_of(safe(@s).set_skin_price(1, 1, 50)), 'Ownable: caller is not owner');
    start_cheat_caller_address(setup_address, OWNER());
    // [Check] Theme 1 to 255, plan 1 to 19, a price of 50 to 100 or 0
    assert_eq!(error_of(safe(@s).set_skin_price(0, 1, 50)), 'Setup: invalid skin');
    assert_eq!(error_of(safe(@s).set_skin_price(1, 0, 50)), 'Setup: invalid skin');
    assert_eq!(error_of(safe(@s).set_skin_price(1, 20, 50)), 'Setup: invalid skin');
    assert_eq!(error_of(safe(@s).set_skin_price(1, 1, 49)), 'Setup: invalid cobbles');
    assert_eq!(error_of(safe(@s).set_skin_price(1, 1, 101)), 'Setup: invalid cobbles');
    assert_eq!(error_of(safe(@s).set_skin_price(1, 1, 255)), 'Setup: invalid cobbles');
    // [Check] The bounds themselves, 0 to withdraw, and the events
    let mut spy = spy_events();
    skins(@s).set_skin_price(255, 19, 100);
    skins(@s).set_skin_price(1, 1, 50);
    skins(@s).set_skin_price(1, 1, 0);
    spy
        .assert_emitted(
            @array![
                (
                    setup_address,
                    Setup::Event::SkinPriced(
                        Setup::SkinPriced { theme: 255, plan: 19, cobbles: 100 },
                    ),
                ),
                (
                    setup_address,
                    Setup::Event::SkinPriced(Setup::SkinPriced { theme: 1, plan: 1, cobbles: 50 }),
                ),
                (
                    setup_address,
                    Setup::Event::SkinPriced(Setup::SkinPriced { theme: 1, plan: 1, cobbles: 0 }),
                ),
            ],
        );
    assert_eq!(skins(@s).skin_price(255, 19), 100);
    assert_eq!(skins(@s).skin_price(1, 1), 0);
    stop_cheat_caller_address(setup_address);
}

#[test]
fn test_the_table_prices_a_theme_at_1580_cobbles() {
    let s = shop();
    price_theme(@s, 1);
    let mut total: u32 = 0;
    for plan in 1..PLANS + 1 {
        let price = skins(@s).skin_price(1, plan);
        assert!(price >= 50 && price <= 100);
        total += price.into();
    }
    assert_eq!(total, 1580);
    // A theme without prices sells nothing
    assert_eq!(skins(@s).skin_price(2, 1), 0);
}

// Buying (5.3)

#[test]
fn test_buy_skin_spends_its_price_sets_its_bit_and_does_not_activate() {
    let s = market();
    let player_id: felt252 = PLAYER().into();
    let mut spy = spy_events();
    buy_skin(@s, PLAYER(), 1, 13);
    assert_eq!(cobbles_of(@s, PLAYER()), 1000 - 50);
    assert!(owns(@s, PLAYER(), 1, 13));
    assert_eq!(skins(@s).skins(player_id, 1), 0x2000);
    assert_eq!(skins(@s).skins(player_id, 2), 0);
    // Buying does not activate
    assert_eq!(active(@s, PLAYER()), all_default());
    spy
        .assert_emitted(
            @array![
                (
                    at(@s),
                    Setup::Event::SkinBought(
                        Setup::SkinBought {
                            player_id, theme: 1, plan: 13, cobbles: 50, balance: 950,
                        },
                    ),
                ),
            ],
        );
    // Another plan of the theme, and the same plan of another theme: bits apart
    buy_skin(@s, PLAYER(), 1, 1);
    buy_skin(@s, PLAYER(), 2, 13);
    assert_eq!(skins(@s).skins(player_id, 1), 0x2002);
    assert_eq!(skins(@s).skins(player_id, 2), 0x2000);
    assert_eq!(cobbles_of(@s, PLAYER()), 950 - 100 - 50);
}

#[test]
#[feature("safe_dispatcher")]
fn test_a_skin_is_bought_once_never_twice() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 9);
    let balance = cobbles_of(@s, PLAYER());
    start_cheat_caller_address(at(@s), PLAYER());
    assert_eq!(error_of(safe(@s).buy_skin(1, 9)), 'Setup: skin owned');
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, PLAYER()), balance);
    assert_eq!(skins(@s).skins(PLAYER().into(), 1), 0x200);
}

#[test]
#[feature("safe_dispatcher")]
fn test_cobbles_never_go_below_zero() {
    let s = market();
    // 1,000 cobbles: plans 1 (100) x 10 would be exact, so spend down to under one price
    start_cheat_caller_address(at(@s), PLAYER());
    let mut plan: u8 = 1;
    while cobbles_of(@s, PLAYER()) >= 100 {
        // plans 1 and 17 cost 100; the others are bought in two themes
        let theme = if plan <= 19 {
            1
        } else {
            2
        };
        let at_plan = if plan <= 19 {
            plan
        } else {
            plan - 19
        };
        skins(@s).buy_skin(theme, at_plan);
        plan += 1;
    }
    let left = cobbles_of(@s, PLAYER());
    assert!(left < 100);
    // The next skin costs more than the balance: refused, nothing changes
    let theme = if plan <= 19 {
        1
    } else {
        2
    };
    let at_plan = if plan <= 19 {
        plan
    } else {
        plan - 19
    };
    let price = price_of(at_plan).into();
    if left < price {
        assert_eq!(error_of(safe(@s).buy_skin(theme, at_plan)), 'Setup: not enough cobbles');
        assert_eq!(cobbles_of(@s, PLAYER()), left);
        assert!(!owns(@s, PLAYER(), theme, at_plan));
    }
    stop_cheat_caller_address(at(@s));
}

#[test]
#[feature("safe_dispatcher")]
fn test_buy_skin_with_a_balance_of_exactly_its_price_leaves_zero() {
    let s = shop();
    price_theme(@s, 1);
    // 50 cobbles (pack 1) and a skin of 50 (plan 13)
    buy(@s, ANYONE(), 1, Zero::zero());
    assert_eq!(cobbles_of(@s, ANYONE()), 50);
    buy_skin(@s, ANYONE(), 1, 13);
    assert_eq!(cobbles_of(@s, ANYONE()), 0);
    start_cheat_caller_address(at(@s), ANYONE());
    assert_eq!(error_of(safe(@s).buy_skin(1, 10)), 'Setup: not enough cobbles');
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, ANYONE()), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_a_withdrawn_or_never_set_price_cannot_be_bought() {
    let s = market();
    start_cheat_caller_address(at(@s), PLAYER());
    // Never priced: theme 3, and a plan outside 1 to 19
    assert_eq!(error_of(safe(@s).buy_skin(3, 1)), 'Setup: skin not for sale');
    assert_eq!(error_of(safe(@s).buy_skin(1, 0)), 'Setup: skin not for sale');
    assert_eq!(error_of(safe(@s).buy_skin(1, 20)), 'Setup: skin not for sale');
    assert_eq!(error_of(safe(@s).buy_skin(0, 1)), 'Setup: skin not for sale');
    // Withdrawn
    start_cheat_caller_address(at(@s), OWNER());
    skins(@s).set_skin_price(1, 5, 0);
    start_cheat_caller_address(at(@s), PLAYER());
    assert_eq!(error_of(safe(@s).buy_skin(1, 5)), 'Setup: skin not for sale');
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, PLAYER()), 1000);
    assert_eq!(skins(@s).skins(PLAYER().into(), 1), 0);
}

#[test]
fn test_a_price_withdrawn_after_the_purchase_keeps_the_skin_and_its_activation() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 5);
    start_cheat_caller_address(at(@s), OWNER());
    skins(@s).set_skin_price(1, 5, 0);
    stop_cheat_caller_address(at(@s));
    assert!(owns(@s, PLAYER(), 1, 5));
    set_skins(@s, PLAYER(), array![(5, 1)].span());
    assert_eq!(*active(@s, PLAYER()).at(4), 1);
}

#[test]
fn test_a_repriced_skin_costs_the_new_price_and_an_owned_one_is_not_refunded() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 5);
    assert_eq!(cobbles_of(@s, PLAYER()), 910);
    start_cheat_caller_address(at(@s), OWNER());
    skins(@s).set_skin_price(1, 5, 100);
    skins(@s).set_skin_price(1, 6, 50);
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, PLAYER()), 910);
    buy_skin(@s, PLAYER(), 1, 6);
    assert_eq!(cobbles_of(@s, PLAYER()), 860);
}

// A3: the player is the caller

#[test]
fn test_a3_skins_are_the_callers_and_move_to_no_one() {
    let s = market();
    buy(@s, ANYONE(), 4, Zero::zero());
    buy_skin(@s, PLAYER(), 1, 1);
    // Another account is untouched
    assert_eq!(cobbles_of(@s, ANYONE()), 1000);
    assert_eq!(skins(@s).skins(ANYONE().into(), 1), 0);
    assert_eq!(active(@s, ANYONE()), all_default());
    // The other account buys and activates its own
    buy_skin(@s, ANYONE(), 1, 2);
    set_skins(@s, ANYONE(), array![(2, 1)].span());
    assert_eq!(skins(@s).skins(PLAYER().into(), 1), 1 * 2);
    assert_eq!(active(@s, PLAYER()), all_default());
    assert_eq!(*active(@s, ANYONE()).at(1), 1);
}

#[test]
#[feature("safe_dispatcher")]
fn test_a3_a_skin_owned_by_another_account_cannot_be_activated() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 1);
    start_cheat_caller_address(at(@s), ANYONE());
    assert_eq!(error_of(safe(@s).set_skins(array![(1, 1)].span())), 'Setup: skin not owned');
    stop_cheat_caller_address(at(@s));
    assert_eq!(active(@s, ANYONE()), all_default());
}

// Activating (5.3)

#[test]
fn test_set_skins_activates_owned_skins_in_one_write_with_the_packed_word() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 3);
    buy_skin(@s, PLAYER(), 2, 7);
    let player_id: felt252 = PLAYER().into();
    let mut spy = spy_events();
    set_skins(@s, PLAYER(), array![(3, 1), (7, 2)].span());
    let mut expected = all_default();
    let mut themes: Array<u8> = array![];
    for i in 0..PLANS {
        themes.append(if i == 2 {
            1
        } else if i == 6 {
            2
        } else {
            0
        });
    }
    expected = themes;
    assert_eq!(active(@s, PLAYER()), expected);
    let word = active_word(expected.span());
    spy
        .assert_emitted(
            @array![
                (
                    at(@s),
                    Setup::Event::SkinsActivated(Setup::SkinsActivated { player_id, active: word }),
                ),
            ],
        );
    // One event for the whole batch
    let events = spy.get_events().emitted_by(at(@s)).events;
    let mut activations = 0;
    for (_, event) in events {
        if *event.keys.at(0) == selector!("SkinsActivated") {
            activations += 1;
        }
    }
    assert_eq!(activations, 1);
    // Activating does not spend
    assert_eq!(cobbles_of(@s, PLAYER()), 1000 - 90 - 75);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_skins_never_activates_a_skin_not_owned() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 3);
    start_cheat_caller_address(at(@s), PLAYER());
    // Not bought: another plan of the theme, the same plan of another theme, an unpriced theme
    assert_eq!(error_of(safe(@s).set_skins(array![(4, 1)].span())), 'Setup: skin not owned');
    assert_eq!(error_of(safe(@s).set_skins(array![(3, 2)].span())), 'Setup: skin not owned');
    assert_eq!(error_of(safe(@s).set_skins(array![(3, 9)].span())), 'Setup: skin not owned');
    // One unowned change refuses the whole batch, the owned ones before it too
    assert_eq!(
        error_of(safe(@s).set_skins(array![(3, 1), (4, 1)].span())), 'Setup: skin not owned',
    );
    stop_cheat_caller_address(at(@s));
    assert_eq!(active(@s, PLAYER()), all_default());
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_skins_refuses_a_plan_outside_1_to_19() {
    let s = market();
    start_cheat_caller_address(at(@s), PLAYER());
    assert_eq!(error_of(safe(@s).set_skins(array![(0, 0)].span())), 'Setup: invalid skin');
    assert_eq!(error_of(safe(@s).set_skins(array![(20, 0)].span())), 'Setup: invalid skin');
    assert_eq!(error_of(safe(@s).set_skins(array![(255, 1)].span())), 'Setup: invalid skin');
    stop_cheat_caller_address(at(@s));
}

#[test]
fn test_theme_0_is_always_allowed_and_restores_the_default() {
    let s = market();
    // With nothing owned
    set_skins(@s, PLAYER(), array![(1, 0), (19, 0)].span());
    assert_eq!(active(@s, PLAYER()), all_default());
    // After activating, theme 0 puts a plan back to default and leaves the others
    buy_skin(@s, PLAYER(), 1, 1);
    buy_skin(@s, PLAYER(), 1, 2);
    set_skins(@s, PLAYER(), array![(1, 1), (2, 1)].span());
    set_skins(@s, PLAYER(), array![(1, 0)].span());
    let now = active(@s, PLAYER());
    assert_eq!(*now.at(0), 0);
    assert_eq!(*now.at(1), 1);
    // The skin is still owned
    assert!(owns(@s, PLAYER(), 1, 1));
}

#[test]
fn test_an_empty_batch_writes_the_unchanged_word() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 4);
    set_skins(@s, PLAYER(), array![(4, 1)].span());
    let before = active(@s, PLAYER());
    set_skins(@s, PLAYER(), array![].span());
    assert_eq!(active(@s, PLAYER()), before);
}

#[test]
fn test_two_changes_of_one_plan_in_a_batch_the_last_wins() {
    let s = market();
    buy_skin(@s, PLAYER(), 1, 6);
    buy_skin(@s, PLAYER(), 2, 6);
    set_skins(@s, PLAYER(), array![(6, 1), (6, 2)].span());
    assert_eq!(*active(@s, PLAYER()).at(5), 2);
    set_skins(@s, PLAYER(), array![(6, 2), (6, 1)].span());
    assert_eq!(*active(@s, PLAYER()).at(5), 1);
    // The last one is checked too, and the first being valid does not save it
    set_skins(@s, PLAYER(), array![(6, 1), (6, 0)].span());
    assert_eq!(*active(@s, PLAYER()).at(5), 0);
}

#[test]
fn test_a_batch_of_19_changes_is_one_write_and_the_19_slots_round_trip() {
    let s = shop();
    price_theme(@s, 1);
    price_theme(@s, 2);
    price_theme(@s, 3);
    // 3 packs of 1,000 buy all of themes 1 and 2 and a part of 3 (1,580 x 2 = 3,160)
    for _ in 0..4_u8 {
        buy(@s, PLAYER(), 4, Zero::zero());
    }
    // Plan p shows theme 1 + p % 3
    let mut changes: Array<(u8, u8)> = array![];
    let mut expected: Array<u8> = array![];
    for plan in 1..PLANS + 1 {
        let theme = 1 + plan % 3;
        buy_skin(@s, PLAYER(), theme, plan);
        changes.append((plan, theme));
        expected.append(theme);
    }
    let mut spy = spy_events();
    set_skins(@s, PLAYER(), changes.span());
    assert_eq!(active(@s, PLAYER()), expected);
    let events = spy.get_events().emitted_by(at(@s)).events;
    assert_eq!(events.len(), 1);
    // The 19 changes back to the default in one batch
    let mut reset: Array<(u8, u8)> = array![];
    for plan in 1..PLANS + 1 {
        reset.append((plan, 0));
    }
    set_skins(@s, PLAYER(), reset.span());
    assert_eq!(active(@s, PLAYER()), all_default());
}

// A4: cobbles are spent only on skins

/// `cobbles` falls only in `buy_skin`, by exactly the skin's price: neither `set_skin_price`, nor
/// `set_skins`, nor a withdrawn price, nor a refused purchase moves it.
#[test]
#[feature("safe_dispatcher")]
fn test_a4_cobbles_fall_only_in_buy_skin_by_the_skins_price() {
    let s = market();
    let start = cobbles_of(@s, PLAYER());
    start_cheat_caller_address(at(@s), OWNER());
    skins(@s).set_skin_price(1, 2, 60);
    skins(@s).set_skin_price(1, 2, 0);
    skins(@s).set_skin_price(1, 2, 70);
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, PLAYER()), start);
    // A refused purchase
    start_cheat_caller_address(at(@s), PLAYER());
    assert!(safe(@s).buy_skin(3, 3).is_err());
    stop_cheat_caller_address(at(@s));
    assert_eq!(cobbles_of(@s, PLAYER()), start);
    // The purchase: exactly the price
    buy_skin(@s, PLAYER(), 1, 2);
    assert_eq!(cobbles_of(@s, PLAYER()), start - 70);
    // The activation
    set_skins(@s, PLAYER(), array![(2, 1)].span());
    set_skins(@s, PLAYER(), array![(2, 0)].span());
    assert_eq!(cobbles_of(@s, PLAYER()), start - 70);
    // The rest of the account is unchanged by a skin (credits, counts, claimed bits)
    let account = ISetupCobblesDispatcher { contract_address: at(@s) }.account(PLAYER().into());
    assert_eq!(account.credits, 0);
    assert_eq!(account.achievements_claimed, 0);
}

// Fuzz (7.4)

/// Random sequences of buys and activations: the cobbles equal 2,000 less the prices of the skins
/// owned (so never below zero), and the active theme of every plan is 0 or an owned theme.
#[test]
#[fuzzer(runs: 8, seed: 61)]
#[feature("safe_dispatcher")]
fn test_fuzz_skins_cobbles_never_negative_and_the_active_set_is_owned(seed: u64) {
    let s = shop();
    price_theme(@s, 1);
    price_theme(@s, 2);
    price_theme(@s, 3);
    buy(@s, PLAYER(), 4, Zero::zero());
    buy(@s, PLAYER(), 4, Zero::zero());
    let mut state: u64 = seed + 1;
    let mut i: u32 = 0;
    start_cheat_caller_address(at(@s), PLAYER());
    while i < 40 {
        state = (state % 2147483648 * 1103515245 + 12345) % 2147483648;
        let roll = state / 16;
        let plan: u8 = (1 + roll % 19).try_into().unwrap();
        let theme: u8 = ((roll / 19) % 4).try_into().unwrap();
        if (roll / 76) % 2 == 0 && theme != 0 {
            let _ = safe(@s).buy_skin(theme, plan);
        } else {
            let _ = safe(@s).set_skins(array![(plan, theme)].span());
        }
        // The invariants, after each operation
        let mut spent: u64 = 0;
        for t in 1..4_u8 {
            for p in 1..PLANS + 1 {
                if owns(@s, PLAYER(), t, p) {
                    spent += price_of(p).into();
                }
            }
        }
        assert_eq!(cobbles_of(@s, PLAYER()), 2000 - spent);
        let now = active(@s, PLAYER());
        let mut p: u8 = 1;
        for t in now {
            assert!(t == 0 || owns(@s, PLAYER(), t, p));
            p += 1;
        }
        i += 1;
    }
    stop_cheat_caller_address(at(@s));
}
