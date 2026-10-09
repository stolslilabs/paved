//! `Economy` (P8 E2) against `MockRouter`, `MockUSDC`, `PavedToken` and `Vault`. The test double
//! for `Daily` is the address `DAILY`: like `Daily` in E3, it puts the price on `Economy` (here by
//! the USDC faucet, as `transferFrom(player, Economy, P)` would) and then calls `purchase` and
//! `record`.
//!
//! The end-to-end fixture compares `R` and the payout of nine games over two days with
//! `scripts/montecarlo/sim.py`'s formulas: a script imports its `payout_factor` and `Ema` and runs
//! the purchase and day lines of `simulate` on the same inputs (players keep their rewards, and the
//! pool keeps its fee in its reserves as `MockRouter` does; see the "As built" notes of
//! `docs/architecture/economy.md`).

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::economy::curve::{RATE_SCALE, guarded, reference, split, supply_factor};
use paved::economy::economy::Economy::{
    DayClosed, EconomyConfigured, Event, GameSet, Purchased, Recorded, Settled,
};
use paved::economy::economy::{
    BASE_PRICE, Config, DAY, IEconomyDispatcher, IEconomyDispatcherTrait, PAVED, decided,
};
use paved::economy::ekubo::{
    IClearDispatcher, IClearDispatcherTrait, IRouterDispatcher, IRouterDispatcherTrait, PoolKey,
    RouteNode, TokenAmount, i129,
};
use paved::economy::mean::Ema;
use paved::economy::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
use paved::mocks::router::{IMockRouterDispatcher, IMockRouterDispatcherTrait};
use paved::mocks::usdc::{IMockUSDCDispatcher, IMockUSDCDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::token::{ADMIN, RECIPIENT, deploy_token};

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn DAILY() -> ContractAddress {
    'DAILY'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn REFERRER() -> ContractAddress {
    'REFERRER'.try_into().unwrap()
}

fn SOMEONE() -> ContractAddress {
    'SOMEONE'.try_into().unwrap()
}

const ONE_PAVED: u256 = 1_000_000_000_000_000_000;
const USDC: u256 = 1_000_000;
/// The day of the tests, and an hour into it.
const DAY0: u64 = 20_000;
const MEAN0: u64 = 3_353_000;
/// The launch pool's rate: 800,000 PAVED for 10,000 USDC, in base units per base unit x 1e18.
const POOL_RATE: u256 = 80_000_000_000_000 * RATE_SCALE;

#[derive(Copy, Drop)]
struct Setup {
    economy: IEconomyDispatcher,
    paved: IERC20Dispatcher,
    usdc: IERC20Dispatcher,
    router: ContractAddress,
    vault: ContractAddress,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

fn at(day: u64, seconds: u64) {
    start_cheat_block_timestamp_global(day * DAY + seconds);
}

/// The launch pool (800,000 PAVED and 10,000 USDC, from the initial supply), the Vault, and
/// `Economy` with the decided configuration, `rate` as the guard's initial rate, `PavedToken`'s
/// minter and `DAILY` as its game. An hour into `DAY0`.
fn setup_with(rate: u256) -> Setup {
    at(DAY0, 3600);
    let paved_address = deploy_token(RECIPIENT());
    let usdc_address = deploy("MockUSDC", array![]);
    let router = deploy("MockRouter", array![paved_address.into(), usdc_address.into()]);
    let vault = deploy("Vault", array![paved_address.into(), usdc_address.into()]);
    let paved = IERC20Dispatcher { contract_address: paved_address };
    let usdc = IERC20Dispatcher { contract_address: usdc_address };
    // [Setup] The pool
    IMockUSDCDispatcher { contract_address: usdc_address }.mint(RECIPIENT(), 10_000 * USDC);
    start_cheat_caller_address(paved_address, RECIPIENT());
    paved.approve(router, 800_000 * ONE_PAVED);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(usdc_address, RECIPIENT());
    usdc.approve(router, 10_000 * USDC);
    stop_cheat_caller_address(usdc_address);
    let (amount0, amount1) = if paved_address < usdc_address {
        (800_000 * ONE_PAVED, 10_000 * USDC)
    } else {
        (10_000 * USDC, 800_000 * ONE_PAVED)
    };
    start_cheat_caller_address(router, RECIPIENT());
    IMockRouterDispatcher { contract_address: router }.add_liquidity(amount0, amount1);
    stop_cheat_caller_address(router);
    // [Setup] Economy
    let pool_key = IMockRouterDispatcher { contract_address: router }.pool_key();
    let mut calldata: Array<felt252> = array![
        OWNER().into(), paved_address.into(), usdc_address.into(), vault.into(), router.into(),
    ];
    pool_key.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    rate.serialize(ref calldata);
    let economy = IEconomyDispatcher { contract_address: deploy("Economy", calldata) };
    start_cheat_caller_address(paved_address, ADMIN());
    IPavedTokenDispatcher { contract_address: paved_address }.set_minter(economy.contract_address);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(economy.contract_address, OWNER());
    economy.set_game(DAILY());
    stop_cheat_caller_address(economy.contract_address);
    Setup { economy, paved, usdc, router, vault }
}

fn setup() -> Setup {
    setup_with(POOL_RATE)
}

fn today() -> u64 {
    starknet::get_block_timestamp() / DAY
}

/// What `Daily` does: the price onto `Economy`, then `purchase`. Returns `R`.
fn buy(
    s: Setup, game_id: u32, player: ContractAddress, stake: u8, referrer: ContractAddress,
) -> u128 {
    let price = stake.into() * BASE_PRICE;
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, price);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    let r = s.economy.purchase(game_id, player, today(), stake, price, referrer, 0);
    stop_cheat_caller_address(s.economy.contract_address);
    r
}

fn record(s: Setup, game_id: u32, score: u32, in_day: bool) {
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.record(game_id, score, in_day);
    stop_cheat_caller_address(s.economy.contract_address);
}

fn configure(s: Setup, config: Config) {
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.configure(config);
    stop_cheat_caller_address(s.economy.contract_address);
}

/// Economy holds nothing, and the router holds exactly its reserves.
fn assert_nothing_left(s: Setup) {
    let economy = s.economy.contract_address;
    assert_eq!(s.usdc.balance_of(economy), 0);
    assert_eq!(s.paved.balance_of(economy), 0);
    let (r0, r1) = IMockRouterDispatcher { contract_address: s.router }.reserves();
    let (paved_reserve, usdc_reserve) = if s.paved.contract_address < s.usdc.contract_address {
        (r0, r1)
    } else {
        (r1, r0)
    };
    assert_eq!(s.paved.balance_of(s.router), paved_reserve);
    assert_eq!(s.usdc.balance_of(s.router), usdc_reserve);
}

fn usdc_reserve(s: Setup) -> u256 {
    let (r0, r1) = IMockRouterDispatcher { contract_address: s.router }.reserves();
    if s.paved.contract_address < s.usdc.contract_address {
        r1
    } else {
        r0
    }
}

// Purchase: the split, the burn, nothing left behind

#[test]
fn test_purchase_splits_the_price_exactly_with_a_referrer() {
    let s = setup();
    let supply = s.paved.total_supply();
    let reserve = usdc_reserve(s);
    let price = 3 * BASE_PRICE;
    let (referral, quote, margin) = split(price, 7_000, true);
    assert_eq!((referral, quote, margin), (300_000, 4_200_000, 1_500_000));
    buy(s, 1, PLAYER(), 3, REFERRER());
    // The referrer and the Vault are paid at once, the quote went into the pool
    assert_eq!(s.usdc.balance_of(REFERRER()), referral);
    assert_eq!(s.usdc.balance_of(s.vault), margin);
    assert_eq!(usdc_reserve(s) - reserve, quote);
    assert_eq!(referral + quote + margin, price);
    // What it bought is burned
    let bought = supply - s.paved.total_supply();
    assert!(bought > 0);
    assert_nothing_left(s);
}

#[test]
fn test_purchase_without_a_referrer_sends_30_percent_to_the_vault() {
    let s = setup();
    buy(s, 1, PLAYER(), 10, Zero::zero());
    assert_eq!(s.usdc.balance_of(s.vault), 6 * USDC);
    assert_eq!(usdc_reserve(s), 10_014 * USDC);
    assert_nothing_left(s);
}

#[test]
fn test_purchase_referring_oneself_pays_no_referral() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, PLAYER());
    assert_eq!(s.usdc.balance_of(PLAYER()), 0);
    assert_eq!(s.usdc.balance_of(s.vault), 600_000);
    assert_nothing_left(s);
}

#[test]
fn test_each_purchase_pays_the_vault_at_once() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    assert_eq!(s.usdc.balance_of(s.vault), 600_000);
    buy(s, 2, PLAYER(), 2, REFERRER());
    assert_eq!(s.usdc.balance_of(s.vault), 600_000 + 1_000_000);
    assert_nothing_left(s);
}

#[test]
fn test_donations_to_economy_go_to_the_vault_and_the_burn() {
    let s = setup();
    // USDC and PAVED sent to Economy by anyone leave with the next purchase
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, 5 * USDC);
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(s.economy.contract_address, 7 * ONE_PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    assert_eq!(s.usdc.balance_of(s.vault), 5 * USDC + 600_000);
    assert!(supply - s.paved.total_supply() > 7 * ONE_PAVED);
    assert_nothing_left(s);
}

#[test]
fn test_purchase_freezes_r_from_the_supply_after_the_burn() {
    let s = setup();
    let supply = s.paved.total_supply();
    let mut spy = spy_events();
    let r = buy(s, 1, PLAYER(), 4, REFERRER());
    let after = s.paved.total_supply();
    let bought = supply - after;
    let factor = supply_factor(after, 1_000_000 * ONE_PAVED);
    let quote = 5_600_000;
    assert_eq!(r, reference(guarded(bought, quote, POOL_RATE), 4, factor));
    // The terms
    let terms = s.economy.terms(1);
    assert_eq!(terms.player, PLAYER());
    assert_eq!((terms.day, terms.stake, terms.reference), (DAY0, 4, r));
    assert_eq!((terms.sigma_bps, terms.slope_bps, terms.cap), (0, 18_130, 5));
    assert!(!terms.recorded && !terms.settled);
    // The event
    let event = Purchased {
        game_id: 1,
        player_id: PLAYER().into(),
        day: DAY0,
        stake: 4,
        price: 8 * USDC,
        referrer: REFERRER(),
        referral: 400_000,
        burned_quote: quote,
        burned: bought,
        margin: 2_000_000,
        supply: after,
        factor,
        reference: r,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Purchased(event))]);
}

#[test]
fn test_first_purchase_of_a_day_fixes_its_prior() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    let day = s.economy.day(DAY0);
    assert_eq!((day.prior, day.sum, day.weight, day.mean, day.closed), (MEAN0, 0, 0, 0, false));
}

// The price guard

#[test]
fn test_price_guard_caps_r_after_a_dump_into_the_pool() {
    let s = setup();
    // Someone sells 400,000 PAVED into the pool: PAVED gets much cheaper
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(s.router, 200_000 * ONE_PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    let router = IRouterDispatcher { contract_address: s.router };
    let pool_key = IMockRouterDispatcher { contract_address: s.router }.pool_key();
    start_cheat_caller_address(s.router, RECIPIENT());
    router
        .swap(
            RouteNode { pool_key, sqrt_ratio_limit: 0, skip_ahead: 0 },
            TokenAmount {
                token: s.paved.contract_address,
                amount: i129 { mag: 200_000_000_000_000_000_000_000, sign: false },
            },
        );
    IClearDispatcher { contract_address: s.router }.clear(s.usdc.contract_address);
    stop_cheat_caller_address(s.router);
    // The purchase buys far more than at the launch rate, but R counts at most 110 % of it
    let supply = s.paved.total_supply();
    let r = buy(s, 1, PLAYER(), 10, Zero::zero());
    let after = s.paved.total_supply();
    let quote: u256 = 14 * USDC;
    let capped = quote * POOL_RATE * 11 / (10 * RATE_SCALE);
    assert!(supply - after > capped);
    assert_eq!(r, reference(capped, 10, supply_factor(after, 1_000_000 * ONE_PAVED)));
    // The rate moves by a 32nd toward what the purchase got
    let observed = (supply - after) * RATE_SCALE / quote;
    assert_eq!(s.economy.rate(), (POOL_RATE * 31 + observed) / 32);
}

#[test]
fn test_without_an_initial_rate_the_first_purchase_sets_it() {
    let s = setup_with(0);
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    let bought = supply - s.paved.total_supply();
    assert_eq!(s.economy.rate(), bought * RATE_SCALE / 1_400_000);
}

// Purchase: refusals

#[test]
#[should_panic(expected: 'CLEAR_AT_LEAST_MINIMUM')]
fn test_purchase_below_min_out_reverts() {
    let s = setup();
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), 200 * ONE_PAVED);
}

#[test]
fn test_purchase_at_min_out_passes() {
    let s = setup();
    let out = IMockRouterDispatcher { contract_address: s.router }
        .quote(s.usdc.contract_address, 1_400_000);
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), out.into());
}

#[test]
#[should_panic(expected: 'Economy: not the game')]
fn test_purchase_by_anyone_else_reverts() {
    let s = setup();
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: wrong stake')]
fn test_purchase_of_stake_0_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 0, 0, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: wrong stake')]
fn test_purchase_of_stake_11_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 11, 11 * BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: wrong price')]
fn test_purchase_at_another_price_reverts() {
    let s = setup();
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 2, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: wrong day')]
fn test_purchase_for_another_day_reverts() {
    let s = setup();
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0 - 1, 1, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: price not paid')]
fn test_purchase_without_the_price_on_economy_reverts() {
    let s = setup();
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE - 1);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: already purchased')]
fn test_purchase_of_a_game_twice_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    buy(s, 1, PLAYER(), 1, Zero::zero());
}

#[test]
#[should_panic(expected: 'Economy: zero address')]
fn test_purchase_for_a_zero_player_reverts() {
    let s = setup();
    buy(s, 1, Zero::zero(), 1, Zero::zero());
}

// Record

#[test]
fn test_record_within_the_day_enters_the_accumulator() {
    let s = setup();
    buy(s, 1, PLAYER(), 3, Zero::zero());
    buy(s, 2, PLAYER(), 2, Zero::zero());
    buy(s, 3, PLAYER(), 5, Zero::zero());
    buy(s, 4, PLAYER(), 7, Zero::zero());
    let mut spy = spy_events();
    record(s, 1, 2_000, true);
    record(s, 2, 99, true); // under the min score
    record(s, 3, 50_000, true); // enters as 4 x the prior
    record(s, 4, 5_000, false); // ended after its day
    let day = s.economy.day(DAY0);
    assert_eq!((day.sum, day.weight), (3 * 2_000_000 + 5 * 4 * MEAN0.into(), 8));
    let terms = s.economy.terms(1);
    assert!(terms.recorded && !terms.settled);
    assert_eq!(terms.score, 2_000);
    let event = Recorded { game_id: 4, score: 5_000, in_day: false };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Recorded(event))]);
}

#[test]
#[should_panic(expected: 'Economy: not the game')]
fn test_record_by_anyone_else_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.record(1, 1_000, true);
}

#[test]
#[should_panic(expected: 'Economy: unknown game')]
fn test_record_of_a_game_never_purchased_reverts() {
    let s = setup();
    record(s, 1, 1_000, true);
}

#[test]
#[should_panic(expected: 'Economy: already recorded')]
fn test_record_twice_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    record(s, 1, 1_000, true);
    record(s, 1, 2_000, true);
}

// Settle

#[test]
fn test_settle_after_the_day_mints_once_to_the_player() {
    let s = setup();
    let r = buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000, true);
    at(DAY0 + 1, 0);
    let mut spy = spy_events();
    let minted = s.economy.settle(array![1].span());
    // The day's mean: (100 x prior + 2 x 6,000,000) / 102
    let mean: u64 = (100 * MEAN0 + 12_000_000) / 102;
    assert_eq!(s.economy.day(DAY0).mean, mean);
    let reward: u128 = (r.into() * 18_130_u256 * 6_000_000 / (mean.into() * 10_000))
        .try_into()
        .unwrap();
    assert_eq!(minted, reward.into());
    assert_eq!(s.paved.balance_of(PLAYER()), reward.into());
    let terms = s.economy.terms(1);
    assert!(terms.settled);
    assert_eq!(terms.reward, reward);
    let settled = Settled {
        game_id: 1, player_id: PLAYER().into(), day: DAY0, score: 6_000, threshold: mean, reward,
    };
    let closed = DayClosed {
        day: DAY0, mean, weight: 2, prior: MEAN0, ema_after: (100 * MEAN0 + 12_000_000) / 102,
    };
    spy
        .assert_emitted(
            @array![
                (s.economy.contract_address, Event::DayClosed(closed)),
                (s.economy.contract_address, Event::Settled(settled)),
            ],
        );
    // Once: a second settlement mints nothing and changes nothing
    assert_eq!(s.economy.settle(array![1].span()), 0);
    assert_eq!(s.paved.balance_of(PLAYER()), reward.into());
    assert_nothing_left(s);
}

#[test]
fn test_settle_closes_the_day_and_pushes_the_ema_once() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    buy(s, 2, PLAYER(), 3, Zero::zero());
    record(s, 1, 6_000, true);
    record(s, 2, 1_000, true);
    at(DAY0 + 1, 0);
    s.economy.settle(array![1].span());
    let (ema, _) = s.economy.ema();
    // The day's average (2 x 6,000 + 3 x 1,000) / 5 = 3,000 points, pushed with weight 5
    assert_eq!(ema, Ema { sum: 100 * MEAN0.into() + 5 * 3_000_000, weight: 105 });
    s.economy.settle(array![2].span());
    let (again, _) = s.economy.ema();
    assert_eq!(again, ema);
}

#[test]
fn test_a_game_below_the_threshold_gets_nothing() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 3_000, true);
    at(DAY0 + 1, 0);
    assert_eq!(s.economy.settle(array![1].span()), 0);
    assert_eq!(s.paved.balance_of(PLAYER()), 0);
    assert!(s.economy.terms(1).settled);
}

#[test]
fn test_a_game_ended_after_its_day_is_settled_against_its_day() {
    let s = setup();
    let r = buy(s, 1, PLAYER(), 1, Zero::zero());
    at(DAY0 + 1, 10);
    record(s, 1, 7_000, false);
    s.economy.settle(array![1].span());
    // No game entered the day: its mean is its prior
    let reward = r.into() * 18_130_u256 * 7_000_000 / (MEAN0.into() * 10_000);
    assert_eq!(s.paved.balance_of(PLAYER()), reward);
}

#[test]
#[should_panic(expected: 'Economy: day not over')]
fn test_settle_during_the_day_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    record(s, 1, 5_000, true);
    at(DAY0, DAY - 1);
    s.economy.settle(array![1].span());
}

#[test]
#[should_panic(expected: 'Economy: not recorded')]
fn test_settle_of_a_game_not_recorded_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    at(DAY0 + 1, 0);
    s.economy.settle(array![1].span());
}

#[test]
#[should_panic(expected: 'Economy: unknown game')]
fn test_settle_of_a_game_never_purchased_reverts() {
    let s = setup();
    at(DAY0 + 1, 0);
    s.economy.settle(array![1].span());
}

#[test]
fn test_settle_in_a_batch_skips_the_games_already_settled() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    buy(s, 2, REFERRER(), 1, Zero::zero());
    record(s, 1, 9_000, true);
    record(s, 2, 9_000, true);
    at(DAY0 + 1, 0);
    let first = s.economy.settle(array![1].span());
    // Someone settles game 1 first: the batch still settles game 2 and pays nothing twice
    let second = s.economy.settle(array![1, 2].span());
    assert_eq!(s.paved.balance_of(PLAYER()), first);
    assert_eq!(s.paved.balance_of(REFERRER()), second);
}

// Configure, set_game, set_pool

#[test]
fn test_configure_applies_to_the_next_purchases_only() {
    let s = setup();
    let r = buy(s, 1, PLAYER(), 1, Zero::zero());
    let config = Config {
        burn_bps: 9_000, sigma_bps: -3_000, slope_bps: 1_000, cap: 1, target: 100_000 * PAVED,
    };
    let mut spy = spy_events();
    configure(s, config);
    let event = EconomyConfigured {
        burn_bps: 9_000, sigma_bps: -3_000, slope_bps: 1_000, cap: 1, target: 100_000 * PAVED,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::EconomyConfigured(event))]);
    assert_eq!(s.economy.config(), config);
    buy(s, 2, PLAYER(), 1, Zero::zero());
    assert_eq!(s.usdc.balance_of(s.vault), 600_000 + 200_000);
    // Game 1 keeps its curve, game 2 has the new one
    let first = s.economy.terms(1);
    assert_eq!((first.sigma_bps, first.slope_bps, first.cap, first.reference), (0, 18_130, 5, r));
    let second = s.economy.terms(2);
    assert_eq!((second.sigma_bps, second.slope_bps, second.cap), (-3_000, 1_000, 1));
    // At a supply far above the new target, the factor is 0
    assert_eq!(second.reference, 0);
}

#[test]
#[should_panic(expected: 'Economy: not owner')]
fn test_configure_by_anyone_else_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.configure(decided());
}

#[test]
#[should_panic(expected: 'Economy: burn out of bounds')]
fn test_configure_out_of_bounds_reverts() {
    let s = setup();
    let mut config = decided();
    config.burn_bps = 9_500;
    configure(s, config);
}

#[test]
#[should_panic(expected: 'Economy: game already set')]
fn test_set_game_twice_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_game(SOMEONE());
}

#[test]
#[should_panic(expected: 'Economy: not owner')]
fn test_set_game_by_anyone_else_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.set_game(SOMEONE());
}

#[test]
fn test_set_game_emits_and_is_readable() {
    let mut spy = spy_events();
    let s = setup();
    let event = GameSet { game: DAILY() };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::GameSet(event))]);
    let addresses = s.economy.addresses();
    assert_eq!((addresses.game, addresses.vault, addresses.router), (DAILY(), s.vault, s.router));
    assert_eq!(s.economy.owner(), OWNER());
}

#[test]
fn test_set_pool_takes_another_fee_on_the_same_tokens() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    let other = PoolKey { fee: 1, ..pool_key };
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_pool(other, 7);
    assert_eq!(s.economy.pool(), (other, 7));
}

#[test]
#[should_panic(expected: 'Economy: wrong pool')]
fn test_set_pool_on_other_tokens_reverts() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    let other = PoolKey { token1: SOMEONE(), ..pool_key };
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_pool(other, 0);
}

#[test]
#[should_panic(expected: 'Economy: not owner')]
fn test_set_pool_by_anyone_else_reverts() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.set_pool(pool_key, 0);
}

// Views

#[test]
fn test_quote_shows_the_split_and_the_curve() {
    let s = setup();
    let quote = s.economy.quote(5);
    assert_eq!(quote.price, 10 * USDC);
    assert_eq!((quote.burn_quote, quote.referral, quote.margin), (7 * USDC, 500_000, 3 * USDC));
    assert_eq!(quote.min_out_hint, 7 * USDC * POOL_RATE * 99 / (100 * RATE_SCALE));
    // The pool's 800,000 PAVED count in the supply: 1,000,000, the target
    assert_eq!(quote.factor, 10_000);
    assert_eq!((quote.mean, quote.threshold, quote.slope, quote.cap), (MEAN0, MEAN0, 18_130, 5));
}

// The end-to-end fixture against sim.py

/// (game id, day offset, stake, referred, score)
fn games() -> Array<(u32, u64, u8, bool, u32)> {
    array![
        (1, 0, 1, false, 5_000), (2, 0, 3, true, 2_000), (3, 0, 10, false, 15_000),
        (4, 0, 5, true, 50), (5, 0, 2, false, 4_300), (6, 1, 4, false, 6_000),
        (7, 1, 7, true, 9_000), (8, 1, 1, false, 4_300), (9, 1, 6, false, 800),
    ]
}

/// From the script (sim.py's formulas): (PAVED bought, R, payout), base units.
fn expected() -> Array<(u256, u256, u256)> {
    array![
        (106385850681859293184, 107461140317395435520, 231073754630391332864),
        (318985618797046267904, 328694945363810254848, 0),
        (1061428156729374932992, 1169306916487651786752, 5846534582438258016256),
        (529621023063031218176, 557223409921734868992, 0),
        (211644360707862626304, 216358236464565485568, 400102311512568627200),
        (422946200207570436096, 438180820709595611136, 1086506419453083648000),
        (739057146347848859648, 788349466403804020736, 2932168806360728207360),
        (105462621834060398592, 106199594480732110848, 0),
        (632185385858679701504, 668541739044175216640, 0),
    ]
}

/// The difference in parts per million of the expected value (0 and 0 agree exactly).
fn ppm(actual: u256, expected: u256) -> u256 {
    if expected == 0 {
        assert_eq!(actual, 0);
        return 0;
    }
    let gap = if actual > expected {
        actual - expected
    } else {
        expected - actual
    };
    gap * 1_000_000 / expected
}

#[test]
fn test_fixture_matches_sim() {
    // No initial rate: the guard never binds on a pool that only gets bought from
    let s = setup_with(0);
    let mut bought: Array<u256> = array![];
    let mut references: Array<u256> = array![];
    for d in 0..2_u64 {
        at(DAY0 + d, 3600);
        // The previous day is settled first, as sim.py does
        if d == 1 {
            s.economy.settle(array![1, 2, 3, 4, 5].span());
        }
        for (game_id, day, stake, referred, _) in games() {
            if day != d {
                continue;
            }
            let referrer = if referred {
                REFERRER()
            } else {
                Zero::zero()
            };
            let supply = s.paved.total_supply();
            let player: ContractAddress = (game_id.into() + 1000_felt252).try_into().unwrap();
            references.append(buy(s, game_id, player, stake, referrer).into());
            bought.append(supply - s.paved.total_supply());
        }
        for (game_id, day, _, _, score) in games() {
            if day == d {
                record(s, game_id, score, true);
            }
        }
    }
    at(DAY0 + 2, 0);
    s.economy.settle(array![6, 7, 8, 9].span());
    assert_nothing_left(s);
    // Each row within 120 ppm: integer rounding, F in basis points (1 bps of 1x is 100 ppm)
    let mut worst: u256 = 0;
    let expected = expected();
    for i in 0..9_usize {
        let (out, r, reward) = *expected.at(i);
        let game_id: u32 = (i + 1).try_into().unwrap();
        let player: ContractAddress = (game_id.into() + 1000_felt252).try_into().unwrap();
        let rows = array![
            ppm(*bought.at(i), out), ppm(*references.at(i), r),
            ppm(s.paved.balance_of(player), reward),
        ];
        for gap in rows {
            assert!(gap <= 120, "game {} is {} ppm off sim", game_id, gap);
            if gap > worst {
                worst = gap;
            }
        }
    }
    println!("fixture: worst gap {} ppm", worst);
    // The day means and the EMA (sim: 4,215.689655, 4,387.025132; EMA after 4,366.567164); the
    // second day's mean is 1 milli-point under sim's, as its prior is the EMA rounded down
    assert_eq!(s.economy.day(DAY0).mean, 4_215_689);
    assert_eq!(s.economy.day(DAY0 + 1).mean, 4_387_024);
    let (_, mean) = s.economy.ema();
    assert_eq!(mean, 4_366_567);
}
