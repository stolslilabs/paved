//! `Economy.sell` (cobbles v1, part 2, P-61; `docs/architecture/cobbles-v1.md`, 2.3, 7.1, 7.4):
//! the seller's sale of a price already on `Economy`, through the same money path as a game's
//! `purchase` (`pay`). Against the fixture of `economy::economy` (`MockRouter`, `Faucet`,
//! `PavedToken`, `Vault`), with `SELLER` as the test double of `Setup`: it puts the price on
//! `Economy` (by the USDC faucet, as `Setup.buy_pack`'s `transferFrom` does) and calls `sell`.
//!
//! The audit property A9 (a pack's split is the game's) has its tests here, named after it: one
//! price split by `sell` and by `purchase` from the same pool state gives the same referral, burn
//! quote, margin, PAVED burned, PAVED to the Vault and guard rate; and its fuzz.
//! `e2e::cobbles_packs`
//! runs the same path through `Setup.buy_pack`.

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::IERC20DispatcherTrait;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::economy::curve::split;
use paved::economy::ekubo::i129;
use paved::systems::economy::Economy::{Event, SellerSet};
use paved::systems::economy::{
    BASE_PRICE, IEconomyDispatcherTrait, IEconomySafeDispatcher, IEconomySafeDispatcherTrait,
    decided,
};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, EventsFilterTrait, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::economy::{
    DAILY, ONE_PAVED, OWNER, PLAYER, REFERRER, SOMEONE, Setup, USDC, assert_nothing_left, buy,
    configure, mock_swap, router_quote, setup, today, vault_paved,
};

pub fn SELLER() -> ContractAddress {
    'SELLER'.try_into().unwrap()
}

/// What a `Purchased` or a `Sold` event says of the split: the fields they share.
#[derive(Copy, Drop, Debug, PartialEq)]
pub struct Split {
    pub price: u256,
    pub referrer: ContractAddress,
    pub referral: u256,
    pub quote: u256,
    pub burned: u256,
    pub margin: u256,
    pub supply: u256,
    pub vault_paved: u256,
}

fn u256_at(data: Span<felt252>, i: u32) -> u256 {
    u256 { low: (*data.at(i)).try_into().unwrap(), high: (*data.at(i + 1)).try_into().unwrap() }
}

/// The split of the last `Purchased` (or `Sold`) event `Economy` emitted. `Purchased`'s data starts
/// with the day and the stake, and holds the factor and `R` before the Vault's PAVED.
pub fn last_split(
    ref spy: snforge_std::EventSpy, economy: ContractAddress, purchased: bool,
) -> Split {
    let events = spy.get_events().emitted_by(economy).events;
    let name = if purchased {
        selector!("Purchased")
    } else {
        selector!("Sold")
    };
    let mut found: Option<Split> = Option::None;
    for (_, event) in events {
        if *event.keys.at(0) != name {
            continue;
        }
        let data = event.data.span();
        let o: u32 = if purchased {
            2
        } else {
            0
        };
        let vault_at = if purchased {
            o + 15
        } else {
            o + 13
        };
        found =
            Option::Some(
                Split {
                    price: u256_at(data, o),
                    referrer: (*data.at(o + 2)).try_into().unwrap(),
                    referral: u256_at(data, o + 3),
                    quote: u256_at(data, o + 5),
                    burned: u256_at(data, o + 7),
                    margin: u256_at(data, o + 9),
                    supply: u256_at(data, o + 11),
                    vault_paved: u256_at(data, vault_at),
                },
            );
    }
    found.expect('no split event')
}

/// The fixture with the owner's split (`decided`) and `SELLER` as `Economy`'s seller.
fn seller_setup() -> Setup {
    let s = setup();
    configure(s, decided());
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_seller(SELLER());
    stop_cheat_caller_address(s.economy.contract_address);
    s
}

/// What `Setup.buy_pack` does: the price onto `Economy`, then `sell`. Returns the referrer that
/// counted.
fn sell(
    s: Setup, player: ContractAddress, price: u256, referrer: ContractAddress, min_out: u256,
) -> ContractAddress {
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, price);
    start_cheat_caller_address(s.economy.contract_address, SELLER());
    let counted = s.economy.sell(player, price, referrer, min_out);
    stop_cheat_caller_address(s.economy.contract_address);
    counted
}

fn safe(s: Setup) -> IEconomySafeDispatcher {
    IEconomySafeDispatcher { contract_address: s.economy.contract_address }
}

fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => 'no error',
        Result::Err(panic) => *panic.at(0),
    }
}

// The seller: set once by the owner, never zero (A6)

#[test]
#[feature("safe_dispatcher")]
fn test_set_seller_by_the_owner_once_never_zero() {
    let s = setup();
    let economy = s.economy.contract_address;
    assert!(s.economy.seller().is_zero());
    start_cheat_caller_address(economy, SOMEONE());
    assert_eq!(error_of(safe(s).set_seller(SELLER())), 'Ownable: caller is not owner');
    start_cheat_caller_address(economy, OWNER());
    assert_eq!(error_of(safe(s).set_seller(Zero::zero())), 'Economy: zero address');
    let mut spy = spy_events();
    s.economy.set_seller(SELLER());
    spy.assert_emitted(@array![(economy, Event::SellerSet(SellerSet { seller: SELLER() }))]);
    assert_eq!(s.economy.seller(), SELLER());
    assert_eq!(error_of(safe(s).set_seller(SOMEONE())), 'Economy: seller already set');
    stop_cheat_caller_address(economy);
    assert_eq!(IOwnableDispatcher { contract_address: economy }.owner(), OWNER());
}

#[test]
#[feature("safe_dispatcher")]
fn test_a6_sell_by_the_seller_only() {
    let s = setup();
    let economy = s.economy.contract_address;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(economy, 5 * USDC);
    // [Check] No seller set: nobody may sell, the owner and the game included
    for caller in array![SELLER(), OWNER(), DAILY(), Zero::zero()] {
        start_cheat_caller_address(economy, caller);
        assert_eq!(
            error_of(safe(s).sell(PLAYER(), 5 * USDC, Zero::zero(), 0)), 'Economy: not the seller',
        );
    }
    start_cheat_caller_address(economy, OWNER());
    s.economy.set_seller(SELLER());
    // [Check] The seller set: anyone else is refused
    for caller in array![SOMEONE(), OWNER(), DAILY(), PLAYER()] {
        start_cheat_caller_address(economy, caller);
        assert_eq!(
            error_of(safe(s).sell(PLAYER(), 5 * USDC, Zero::zero(), 0)), 'Economy: not the seller',
        );
    }
    start_cheat_caller_address(economy, SELLER());
    safe(s).sell(PLAYER(), 5 * USDC, Zero::zero(), 0).unwrap();
    stop_cheat_caller_address(economy);
    assert_nothing_left(s);
}

#[test]
#[feature("safe_dispatcher")]
fn test_sell_refuses_a_price_not_on_economy_a_zero_price_and_a_zero_player() {
    let s = seller_setup();
    let economy = s.economy.contract_address;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(economy, 5 * USDC - 1);
    start_cheat_caller_address(economy, SELLER());
    assert_eq!(
        error_of(safe(s).sell(PLAYER(), 5 * USDC, Zero::zero(), 0)), 'Economy: price not paid',
    );
    assert_eq!(error_of(safe(s).sell(PLAYER(), 0, Zero::zero(), 0)), 'Economy: wrong price');
    assert_eq!(
        error_of(safe(s).sell(Zero::zero(), 5 * USDC - 1, Zero::zero(), 0)),
        'Economy: zero address',
    );
    stop_cheat_caller_address(economy);
}

#[test]
#[should_panic(expected: 'Economy: swap below min_out')]
fn test_sell_below_min_out_reverts() {
    let s = seller_setup();
    let out = router_quote(s, 5_000_000);
    sell(s, PLAYER(), 5 * USDC, Zero::zero(), out + 1);
}

#[test]
fn test_sell_at_min_out_passes() {
    let s = seller_setup();
    let out = router_quote(s, 5_000_000);
    sell(s, PLAYER(), 5 * USDC, Zero::zero(), out);
    assert_nothing_left(s);
}

#[test]
#[should_panic(expected: 'Economy: partial fill')]
fn test_sell_refuses_a_partial_fill() {
    let s = seller_setup();
    mock_swap(
        s, i129 { mag: 4_999_999, sign: false }, i129 { mag: 100 * ONE_PAVED.low, sign: true },
    );
    sell(s, PLAYER(), 5 * USDC, Zero::zero(), 0);
}

// The split: the game's (A9)

/// One price, one referrer and one pool state: `sell` and `purchase` split it identically (the
/// referral, the burn quote, the margin, the PAVED burned and sent to the Vault, the supply after,
/// the guard's rate), as they run the same code. Each on a fresh fixture: the same deploys give the
/// same pool.
#[test]
fn test_a9_sell_and_purchase_split_a_price_identically() {
    for referrer in array![Zero::zero(), REFERRER()] {
        for stake in array![1_u8, 4, 10] {
            let price: u256 = stake.into() * BASE_PRICE;
            let game = seller_setup();
            let mut spy = spy_events();
            buy(game, 1, PLAYER(), stake, referrer);
            let purchased = last_split(ref spy, game.economy.contract_address, true);
            let pack = seller_setup();
            let mut spy = spy_events();
            let counted = sell(pack, PLAYER(), price, referrer, 0);
            let sold = last_split(ref spy, pack.economy.contract_address, false);
            assert_eq!(sold, purchased);
            assert_eq!(counted, referrer);
            assert_eq!(pack.economy.rate(), game.economy.rate());
            assert_eq!(vault_paved(pack), vault_paved(game));
            assert_eq!(pack.usdc.balance_of(REFERRER()), game.usdc.balance_of(REFERRER()));
            // [Check] The referral, the burn quote and the margin add up to the price; the
            // referral is 5 % of it with a referrer, out of the Vault's part
            assert_eq!(sold.referral + sold.quote + sold.margin, price);
            let (referral, quote, _) = split(price, 7_368, 500, referrer.is_non_zero());
            assert_eq!((sold.referral, sold.quote), (referral, quote));
            assert_nothing_left(pack);
        }
    }
}

/// The referral rule of a sale is the game's, plus the seller (cobbles v1, 2.3): a zero referrer,
/// the buyer, the Vault, the router, `Economy`, the game and the seller are each ignored with no
/// revert; their share stays in the Vault's part. Any other address is paid 5 % of the price.
#[test]
fn test_a9_sell_ignores_the_referrers_a_game_ignores_and_the_seller() {
    let s = seller_setup();
    let ignored = array![
        Zero::zero(), PLAYER(), s.vault, s.router, s.economy.contract_address, DAILY(), SELLER(),
    ];
    for referrer in ignored {
        let before = s.usdc.balance_of(referrer);
        let mut spy = spy_events();
        let counted = sell(s, PLAYER(), 5 * USDC, referrer, 0);
        let sold = last_split(ref spy, s.economy.contract_address, false);
        assert!(counted.is_zero());
        assert!(sold.referrer.is_zero());
        assert_eq!(sold.referral, 0);
        assert_eq!(sold.quote + sold.margin, 5 * USDC);
        if referrer != s.router {
            assert_eq!(s.usdc.balance_of(referrer), before);
        }
        assert_nothing_left(s);
    }
    let counted = sell(s, PLAYER(), 5 * USDC, SOMEONE(), 0);
    assert_eq!(counted, SOMEONE());
    assert_eq!(s.usdc.balance_of(SOMEONE()), 250_000);
}

/// A game's purchase ignores the seller as a referrer too (its referral rule is the shared one).
#[test]
fn test_purchase_ignores_the_seller_as_a_referrer() {
    let s = seller_setup();
    let mut spy = spy_events();
    buy(s, 1, PLAYER(), 1, SELLER());
    let purchased = last_split(ref spy, s.economy.contract_address, true);
    assert!(purchased.referrer.is_zero());
    assert_eq!(purchased.referral, 0);
    assert_eq!(s.usdc.balance_of(SELLER()), 0);
}

/// A sale is no game: no player per game, no terms, no prior for the day, no move of the EMA.
#[test]
fn test_sell_writes_no_terms_no_player_no_day_and_no_mean() {
    let s = seller_setup();
    let (ema, mean) = s.economy.ema();
    sell(s, PLAYER(), 70 * USDC, REFERRER(), 0);
    let day = s.economy.day(today());
    assert_eq!(day.prior, 0);
    assert!(!day.closed);
    let terms = s.economy.terms(0);
    assert!(terms.player.is_zero());
    assert_eq!(terms.reference, 0);
    assert!(s.economy.terms(1).player.is_zero());
    let (after, after_mean) = s.economy.ema();
    assert_eq!((after.sum, after.weight, after_mean), (ema.sum, ema.weight, mean));
    // [Check] A game bought after it gets the day's prior from the same EMA
    buy(s, 1, PLAYER(), 1, Zero::zero());
    assert_eq!(s.economy.day(today()).prior, mean);
}

/// Decision 4 (cobbles v1, 8): a sale moves the guard's rate as a game's purchase does, at most
/// once per block; the next block moves it again.
#[test]
fn test_decision_4_a_sale_moves_the_guards_rate_once_per_block() {
    let s = seller_setup();
    let launch = s.economy.rate();
    sell(s, PLAYER(), 40 * USDC, Zero::zero(), 0);
    let moved = s.economy.rate();
    assert!(moved != launch);
    sell(s, PLAYER(), 40 * USDC, Zero::zero(), 0);
    assert_eq!(s.economy.rate(), moved);
    start_cheat_block_timestamp_global(starknet::get_block_timestamp() + 1);
    sell(s, PLAYER(), 40 * USDC, Zero::zero(), 0);
    assert!(s.economy.rate() != moved);
}

/// The split, fuzzed (7.4): a random stake price and referrer split identically by `sell` and by
/// `purchase` on fresh fixtures; then, on the sale's fixture, a random price (up to 100 USDC) whose
/// referral, burn quote and margin add up to it and follow `curve::split` with the owner's split.
#[test]
#[fuzzer(runs: 12, seed: 61)]
fn test_a9_fuzz_sell_splits_as_purchase(seed: u64) {
    let stake: u8 = (1 + seed % 10).try_into().unwrap();
    let price: u256 = stake.into() * BASE_PRICE;
    let game = seller_setup();
    let pack = seller_setup();
    let candidates = array![
        Zero::zero(), PLAYER(), REFERRER(), SOMEONE(), SELLER(), DAILY(), pack.vault,
    ];
    let referrer = *candidates.at(((seed / 10) % 7).try_into().unwrap());
    // [Check] The game's referral rule on the two fixtures (their Vaults differ: map it)
    let game_referrer = if referrer == pack.vault {
        game.vault
    } else {
        referrer
    };
    let mut spy = spy_events();
    buy(game, 1, PLAYER(), stake, game_referrer);
    let mut purchased = last_split(ref spy, game.economy.contract_address, true);
    let mut spy = spy_events();
    sell(pack, PLAYER(), price, referrer, 0);
    let mut sold = last_split(ref spy, pack.economy.contract_address, false);
    if referrer == pack.vault {
        purchased.referrer = Zero::zero();
        sold.referrer = Zero::zero();
    }
    assert_eq!(sold, purchased);
    // [Check] Any price: the parts add up to it, as `curve::split` gives them
    let any: u256 = (1 + (seed / 100) % 100_000_000).into();
    let mut spy = spy_events();
    sell(pack, SOMEONE(), any, REFERRER(), 0);
    let sold = last_split(ref spy, pack.economy.contract_address, false);
    let (referral, quote, _) = split(any, 7_368, 500, true);
    assert_eq!((sold.referral, sold.quote), (referral, quote));
    assert_eq!(sold.referral + sold.quote + sold.margin, any);
    assert_nothing_left(pack);
}
