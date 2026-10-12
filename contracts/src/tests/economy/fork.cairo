//! E-9: `Economy.quote_swap` and `Economy.purchase` against Ekubo's router on a fork of Starknet
//! mainnet (`docs/architecture/economy.md`, section 5 and "Gates before a real-money game on
//! mainnet"). Read-only: the fork reads the chain at the pinned block (`MAINNET` in `Scarb.toml`)
//! through a public RPC that needs no key, and nothing is sent to any network.
//!
//! Opt-in, out of `ci` (every test is `#[ignore]`): `snforge test paved::tests::economy::fork
//! --ignored` (`docs/programme/OPERATIONS.md`).
//!
//! Two pools, both on mainnet's Ekubo core, router and positions:
//! - USDC/STRK at 0.05 % (tick spacing 1,000, no extension), a deep pool that exists on mainnet.
//!   `Economy` is deployed on the fork with STRK in PAVED's place; STRK cannot be burned by
//!   `Economy`, so its `burn` is mocked and the PAVED bought stays on `Economy`.
//! - PAVED/USDC at Paved's own key (5 %, tick spacing 0x56a4c, no extension), created on the fork
//!   with a real `PavedToken` and a thin position, so that a purchase drains it: the partial fill
//!   that `economy.md` describes, at `Economy`'s extreme price limit, with the real burn.
//!
//! USDC is Circle's native USDC (a FiatToken): the tests mint it as Circle's own flow does, the
//! on-chain master minter naming a controller, which configures a minter.

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::economy::curve::{RATE_SCALE, guarded, next_rate, reference, supply_factor};
use paved::economy::economy::Economy::{Event, Purchased};
use paved::economy::economy::{
    BASE_PRICE, DAY, IEconomyDispatcher, IEconomyDispatcherTrait, IEconomySafeDispatcher,
    IEconomySafeDispatcherTrait, decided,
};
use paved::economy::ekubo::{
    Delta, IClearDispatcher, IClearDispatcherTrait, IRouterDispatcher, IRouterDispatcherTrait,
    IRouterSafeDispatcher, IRouterSafeDispatcherTrait, PoolKey, RouteNode, TokenAmount, i129,
};
use paved::mocks::router::{FEE, TICK_SPACING};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, mock_call, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::{ContractAddress, get_block_timestamp};
use super::token::{RECIPIENT, deploy_token};

// Mainnet (block 16,265,000)

/// Ekubo's router (the one with `quote_swap`; class
/// 0x137a5970f752fd80649fb38d684b090decebec4f2853396617e4f2f01e5396a).
fn ROUTER() -> ContractAddress {
    0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e.try_into().unwrap()
}

fn CORE() -> ContractAddress {
    0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b.try_into().unwrap()
}

fn POSITIONS() -> ContractAddress {
    0x02e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067.try_into().unwrap()
}

/// Circle's native USDC (6 decimals).
fn USDC() -> ContractAddress {
    0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb.try_into().unwrap()
}

fn STRK() -> ContractAddress {
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.try_into().unwrap()
}

/// Ekubo's bounds of a sqrt ratio (0.128 fixed point).
const MIN_SQRT_RATIO: u256 = 18446748437148339061;
const MAX_SQRT_RATIO: u256 = 6277100250585753475930931601400621808602321654880405518632;

/// USDC/STRK at 0.05 %: USDC is token0, so a swap of USDC in lowers the price.
fn USDC_STRK() -> PoolKey {
    PoolKey {
        token0: USDC(),
        token1: STRK(),
        fee: 0x20c49ba5e353f80000000000000000,
        tick_spacing: 1000,
        extension: Zero::zero(),
    }
}

// Test actors

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn DAILY() -> ContractAddress {
    'DAILY'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn VAULT() -> ContractAddress {
    'VAULT'.try_into().unwrap()
}

const USDC_UNIT: u256 = 1_000_000;
const ONE_PAVED: u256 = 1_000_000_000_000_000_000;
const MEAN0: u64 = 3_353_000;
/// About 9.8 STRK per USDC, in base units per base unit x 1e18 (the guard's initial rate).
const STRK_RATE: u256 = 9_800_000_000_000 * RATE_SCALE;
/// About 70 PAVED per USDC.
const PAVED_RATE: u256 = 70_000_000_000_000 * RATE_SCALE;

// Ekubo's core and positions: the entry points these tests use (ABI-compatible)

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
struct PoolPrice {
    sqrt_ratio: u256,
    tick: i129,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
struct Bounds {
    lower: i129,
    upper: i129,
}

#[starknet::interface]
trait ICore<TContractState> {
    fn get_pool_price(self: @TContractState, pool_key: PoolKey) -> PoolPrice;
    fn get_pool_liquidity(self: @TContractState, pool_key: PoolKey) -> u128;
    fn initialize_pool(ref self: TContractState, pool_key: PoolKey, initial_tick: i129) -> u256;
}

/// Circle's FiatToken (native USDC): its minter management.
#[starknet::interface]
trait IFiatToken<TContractState> {
    fn master_minter(self: @TContractState) -> ContractAddress;
    fn configure_controller(
        ref self: TContractState, controller: ContractAddress, minter: ContractAddress,
    );
    fn configure_minter(ref self: TContractState, minter_allowance: u256);
    fn mint(ref self: TContractState, to: ContractAddress, amount: u256);
}

#[starknet::interface]
trait IPositions<TContractState> {
    fn mint_and_deposit(
        ref self: TContractState, pool_key: PoolKey, bounds: Bounds, min_liquidity: u128,
    ) -> (u64, u128);
}

// Helpers

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

fn price(pool_key: PoolKey) -> u256 {
    ICoreDispatcher { contract_address: CORE() }.get_pool_price(pool_key).sqrt_ratio
}

fn usdc() -> IERC20Dispatcher {
    IERC20Dispatcher { contract_address: USDC() }
}

fn CONTROLLER() -> ContractAddress {
    'CONTROLLER'.try_into().unwrap()
}

fn MINTER() -> ContractAddress {
    'MINTER'.try_into().unwrap()
}

/// Mints `amount` USDC to `account`: the master minter names `CONTROLLER` for `MINTER`, which
/// gets the allowance, then mints.
fn give_usdc(account: ContractAddress, amount: u256) {
    let fiat = IFiatTokenDispatcher { contract_address: USDC() };
    let before = usdc().balance_of(account);
    start_cheat_caller_address(USDC(), fiat.master_minter());
    fiat.configure_controller(CONTROLLER(), MINTER());
    start_cheat_caller_address(USDC(), CONTROLLER());
    fiat.configure_minter(amount);
    start_cheat_caller_address(USDC(), MINTER());
    fiat.mint(account, amount);
    stop_cheat_caller_address(USDC());
    assert_eq!(usdc().balance_of(account), before + amount);
}

/// `Economy` on the fork: `paved` in PAVED's place, mainnet's USDC and router, `DAILY` as its
/// game, `VAULT` as its Vault.
fn deploy_economy(
    paved: ContractAddress, pool_key: PoolKey, sqrt_ratio_limit: u256, rate: u256,
) -> IEconomyDispatcher {
    let mut calldata: Array<felt252> = array![
        OWNER().into(), paved.into(), USDC().into(), VAULT().into(), ROUTER().into(),
    ];
    pool_key.serialize(ref calldata);
    sqrt_ratio_limit.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    rate.serialize(ref calldata);
    let economy = IEconomyDispatcher { contract_address: deploy("Economy", calldata) };
    start_cheat_caller_address(economy.contract_address, OWNER());
    economy.set_game(DAILY());
    stop_cheat_caller_address(economy.contract_address);
    economy
}

fn set_pool(economy: IEconomyDispatcher, pool_key: PoolKey, sqrt_ratio_limit: u256) {
    start_cheat_caller_address(economy.contract_address, OWNER());
    economy.set_pool(pool_key, sqrt_ratio_limit);
    stop_cheat_caller_address(economy.contract_address);
}

fn node(economy: IEconomyDispatcher) -> RouteNode {
    let (pool_key, sqrt_ratio_limit) = economy.pool();
    RouteNode { pool_key, sqrt_ratio_limit, skip_ahead: 0 }
}

fn usdc_in(amount: u128) -> TokenAmount {
    TokenAmount { token: USDC(), amount: i129 { mag: amount, sign: false } }
}

/// (USDC the pool took, other token it paid) from a `Delta` of USDC in.
fn legs(pool_key: PoolKey, delta: Delta) -> (i129, i129) {
    if pool_key.token0 == USDC() {
        (delta.amount0, delta.amount1)
    } else {
        (delta.amount1, delta.amount0)
    }
}

/// A real swap through the router, as `Economy` does it: `amount` USDC onto the router, `swap`,
/// then the output and the USDC left over cleared to the swapper, this test contract (a cheated
/// caller on the router would also reach core's callback, which refuses it: 'CORE_ONLY').
/// Returns the swap's `Delta`.
fn swap(route: RouteNode, amount: u128, token_out: ContractAddress) -> Delta {
    give_usdc(ROUTER(), amount.into());
    let delta = IRouterDispatcher { contract_address: ROUTER() }.swap(route, usdc_in(amount));
    let clear = IClearDispatcher { contract_address: ROUTER() };
    let (_, out) = legs(route.pool_key, delta);
    assert_eq!(clear.clear(token_out), out.mag.into());
    clear.clear(USDC());
    delta
}

/// What `Daily` does: the price onto `Economy`, then `purchase` at stake 10.
fn buy(economy: IEconomyDispatcher, min_out: u256) -> u128 {
    let price = 10 * BASE_PRICE;
    give_usdc(economy.contract_address, price);
    start_cheat_caller_address(economy.contract_address, DAILY());
    let day = get_block_timestamp() / DAY;
    let r = economy.purchase(1, PLAYER(), day, 10, price, Zero::zero(), min_out);
    stop_cheat_caller_address(economy.contract_address);
    r
}

fn contains(data: Span<felt252>, value: felt252) -> bool {
    for item in data {
        if *item == value {
            return true;
        }
    }
    false
}

// USDC/STRK: the quote is the swap

#[test]
#[ignore]
#[fork("MAINNET")]
fn test_fork_quote_swap_through_economy_is_the_swap() {
    let economy = deploy_economy(STRK(), USDC_STRK(), MIN_SQRT_RATIO, STRK_RATE);
    let router = IRouterDispatcher { contract_address: ROUTER() };
    // 1.4 USDC (stake 1's burn), 14 USDC (stake 10's), 1,000 USDC, 100,000 USDC (ticks crossed);
    // each swap moves the pool before the next quote
    let amounts: Array<u128> = array![1_400_000, 14_000_000, 1_000_000_000, 100_000_000_000];
    for amount in amounts {
        let quoted = economy.quote_swap(amount.into());
        let delta = router.quote_swap(node(economy), usdc_in(amount));
        let (usdc_leg, strk_leg) = legs(USDC_STRK(), delta);
        // A full fill: the pool takes the whole input and pays STRK out
        assert_eq!(usdc_leg, i129 { mag: amount, sign: false });
        assert!(strk_leg.sign);
        assert_eq!(quoted, strk_leg.mag.into());
        let swapped = swap(node(economy), amount, STRK());
        assert_eq!(swapped, delta);
        println!("E-9 fork: {} USDC base units, quote {} STRK, swap {:?}", amount, quoted, swapped);
    }
}

#[test]
#[ignore]
#[fork("MAINNET")]
#[feature("safe_dispatcher")]
fn test_fork_economys_limit_for_usdc_in_is_the_minimum() {
    // USDC is token0: USDC in lowers the price, so the extreme limit is MIN_SQRT_RATIO; the
    // router reads a limit of 0 as that extreme (what `deploy.sh` passes to the mock)
    let economy = deploy_economy(STRK(), USDC_STRK(), MIN_SQRT_RATIO, STRK_RATE);
    let at_min = economy.quote_swap(14_000_000);
    set_pool(economy, USDC_STRK(), 0);
    assert_eq!(economy.quote_swap(14_000_000), at_min);
    // On the other side of the price, every quote and every purchase reverts in core
    set_pool(economy, USDC_STRK(), MAX_SQRT_RATIO);
    let safe = IEconomySafeDispatcher { contract_address: economy.contract_address };
    match safe.quote_swap(14_000_000) {
        Result::Ok(_) => panic!("a quote past the limit's direction was served"),
        Result::Err(data) => assert!(contains(data.span(), 'LIMIT_DIRECTION')),
    }
    give_usdc(economy.contract_address, 10 * BASE_PRICE);
    start_cheat_caller_address(economy.contract_address, DAILY());
    let day = get_block_timestamp() / DAY;
    match safe.purchase(1, PLAYER(), day, 10, 10 * BASE_PRICE, Zero::zero(), 0) {
        Result::Ok(_) => panic!("a purchase past the limit's direction passed"),
        Result::Err(data) => assert!(contains(data.span(), 'LIMIT_DIRECTION')),
    }
}

#[test]
#[ignore]
#[fork("MAINNET")]
fn test_fork_quote_of_a_draining_amount_is_the_partial_swap() {
    // 2^127 USDC base units: more than the pool can take before the extreme limit. The quote does
    // not revert: it answers the partial fill, which the swap then does exactly, down to the limit
    let economy = deploy_economy(STRK(), USDC_STRK(), MIN_SQRT_RATIO, STRK_RATE);
    let amount: u128 = 0x80000000000000000000000000000000;
    let router = IRouterDispatcher { contract_address: ROUTER() };
    let delta = router.quote_swap(node(economy), usdc_in(amount));
    let (usdc_leg, strk_leg) = legs(USDC_STRK(), delta);
    assert!(!usdc_leg.sign && usdc_leg.mag < amount);
    assert_eq!(economy.quote_swap(amount.into()), strk_leg.mag.into());
    println!("E-9 fork: 2^127 USDC in quotes {:?}", delta);
    // The swap: the router holds what the pool takes (plus one USDC); the rest is never asked for
    give_usdc(ROUTER(), usdc_leg.mag.into() + USDC_UNIT);
    let swapped = router.swap(node(economy), usdc_in(amount));
    assert_eq!(swapped, delta);
    assert_eq!(price(USDC_STRK()), MIN_SQRT_RATIO);
    // An empty input quotes nothing
    let zero = router.quote_swap(node(economy), usdc_in(0));
    let (usdc_leg, strk_leg) = legs(USDC_STRK(), zero);
    assert_eq!((usdc_leg.mag, strk_leg.mag), (0, 0));
    assert_eq!(economy.quote_swap(0), 0);
}

#[test]
#[ignore]
#[fork("MAINNET")]
#[feature("safe_dispatcher")]
fn test_fork_quote_needs_no_funds_and_answers_where_the_swap_reverts() {
    // The router holds no USDC for this swap: `swap` reverts in core's payment, `quote_swap`
    // answers, since it reverts the swap on purpose before any payment
    let economy = deploy_economy(STRK(), USDC_STRK(), MIN_SQRT_RATIO, STRK_RATE);
    let amount: u128 = 1_000_000_000_000;
    assert!(usdc().balance_of(ROUTER()) < amount.into());
    let quoted = economy.quote_swap(amount.into());
    assert!(quoted != 0);
    let safe = IRouterSafeDispatcher { contract_address: ROUTER() };
    match safe.swap(node(economy), usdc_in(amount)) {
        Result::Ok(_) => panic!("an unpaid swap passed"),
        Result::Err(data) => {
            assert!(!contains(data.span(), 'CORE_ONLY'));
            println!("E-9 fork: the unpaid swap reverts with {:?}", data);
        },
    }
}

// USDC/STRK: a partial fill at a limit set by `set_pool`

#[test]
#[ignore]
#[fork("MAINNET")]
fn test_fork_purchase_fills_part_of_the_input_at_a_near_limit() {
    let economy = deploy_economy(STRK(), USDC_STRK(), MIN_SQRT_RATIO, STRK_RATE);
    // A limit 1e-6 below the current sqrt ratio: stake 10's 14 USDC would move it about 3e-6
    let start = price(USDC_STRK());
    let limit = start - start / 1_000_000;
    set_pool(economy, USDC_STRK(), limit);
    let quote: u256 = 14 * USDC_UNIT;
    let delta = IRouterDispatcher { contract_address: ROUTER() }
        .quote_swap(node(economy), usdc_in(14_000_000));
    let (usdc_leg, strk_leg) = legs(USDC_STRK(), delta);
    let filled: u256 = usdc_leg.mag.into();
    assert!(filled > 0 && filled < quote);
    let out = economy.quote_swap(quote);
    assert_eq!(out, strk_leg.mag.into());
    // The purchase, at the client's min_out (the quote less 1 %); STRK's burn is mocked
    mock_call(STRK(), selector!("burn"), (), 1);
    let supply = IERC20Dispatcher { contract_address: STRK() }.total_supply();
    let mut spy = spy_events();
    let r = buy(economy, out * 99 / 100);
    // The swap stopped at the limit; the rest of the quote went back to the Vault as margin
    assert_eq!(price(USDC_STRK()), limit);
    let price_paid = 10 * BASE_PRICE;
    let margin = price_paid - filled;
    assert_eq!(usdc().balance_of(VAULT()), margin);
    assert_eq!(usdc().balance_of(economy.contract_address), 0);
    let strk = IERC20Dispatcher { contract_address: STRK() };
    assert_eq!(strk.balance_of(economy.contract_address), out);
    // R follows the STRK bought against the whole quote, so the partial fill lowers it, and the
    // guard's observation, clamped to 10 % below the rate
    let factor = supply_factor(supply, decided().target.into());
    assert_eq!(r, reference(guarded(out, quote, STRK_RATE), 10, factor));
    assert_eq!(economy.rate(), next_rate(STRK_RATE, out, quote));
    let day = get_block_timestamp() / DAY;
    spy
        .assert_emitted(
            @array![
                (
                    economy.contract_address,
                    Event::Purchased(
                        Purchased {
                            game_id: 1,
                            player_id: PLAYER().into(),
                            day,
                            stake: 10,
                            price: price_paid,
                            referrer: Zero::zero(),
                            referral: 0,
                            burned_quote: quote,
                            burned: out,
                            margin,
                            supply,
                            factor,
                            reference: r,
                        },
                    ),
                ),
            ],
        );
    println!(
        "E-9 fork: near limit {}, filled {} of {} USDC, STRK out {}, margin {}, R {}",
        limit,
        filled,
        quote,
        out,
        margin,
        r,
    );
}

// PAVED/USDC at Paved's key: a thin pool drained by one purchase

/// A PAVED/USDC pool at Paved's key, initialised at about 74 PAVED per USDC, with one position of
/// 1 USDC and 100 PAVED across two tick spacings around the price. Returns (PAVED, the key).
fn thin_pool() -> (IERC20Dispatcher, PoolKey) {
    let paved = IERC20Dispatcher { contract_address: deploy_token(RECIPIENT()) };
    let usdc_first = USDC() < paved.contract_address;
    let (token0, token1) = if usdc_first {
        (USDC(), paved.contract_address)
    } else {
        (paved.contract_address, USDC())
    };
    let pool_key = PoolKey {
        token0, token1, fee: FEE, tick_spacing: TICK_SPACING, extension: Zero::zero(),
    };
    // 90 tick spacings of 1.000001^354892: about 7.4e13 PAVED base units per USDC base unit
    let mag: u128 = 90 * TICK_SPACING;
    let tick = i129 { mag, sign: !usdc_first };
    ICoreDispatcher { contract_address: CORE() }.initialize_pool(pool_key, tick);
    let bounds = Bounds {
        lower: if usdc_first {
            i129 { mag: mag - TICK_SPACING, sign: false }
        } else {
            i129 { mag: mag + TICK_SPACING, sign: true }
        },
        upper: if usdc_first {
            i129 { mag: mag + TICK_SPACING, sign: false }
        } else {
            i129 { mag: mag - TICK_SPACING, sign: true }
        },
    };
    // The position, held by this test contract (no cheated caller on Positions, whose callback
    // from core must see core): the tokens onto Positions, mint, clear what it did not take
    give_usdc(POSITIONS(), USDC_UNIT);
    start_cheat_caller_address(paved.contract_address, RECIPIENT());
    paved.transfer(POSITIONS(), 100 * ONE_PAVED);
    stop_cheat_caller_address(paved.contract_address);
    let (_, liquidity) = IPositionsDispatcher { contract_address: POSITIONS() }
        .mint_and_deposit(pool_key, bounds, 0);
    let clear = IClearDispatcher { contract_address: POSITIONS() };
    clear.clear(USDC());
    clear.clear(paved.contract_address);
    assert!(liquidity != 0);
    assert_eq!(
        ICoreDispatcher { contract_address: CORE() }.get_pool_liquidity(pool_key), liquidity,
    );
    (paved, pool_key)
}

#[test]
#[ignore]
#[fork("MAINNET")]
fn test_fork_purchase_drains_a_thin_pool_to_economys_limit() {
    let (paved, pool_key) = thin_pool();
    // Economy's extreme limit for USDC in
    let limit = if pool_key.token0 == USDC() {
        MIN_SQRT_RATIO
    } else {
        MAX_SQRT_RATIO
    };
    let economy = deploy_economy(paved.contract_address, pool_key, limit, PAVED_RATE);
    let quote: u256 = 14 * USDC_UNIT;
    let delta = IRouterDispatcher { contract_address: ROUTER() }
        .quote_swap(node(economy), usdc_in(14_000_000));
    let (usdc_leg, paved_leg) = legs(pool_key, delta);
    let filled: u256 = usdc_leg.mag.into();
    assert!(filled > 0 && filled < quote);
    let out = economy.quote_swap(quote);
    assert_eq!(out, paved_leg.mag.into());
    // The purchase at the client's min_out: the real burn
    let supply = paved.total_supply();
    let r = buy(economy, out * 99 / 100);
    // The pool is drained: the price went to the limit; the rest of the quote is margin
    assert_eq!(price(pool_key), limit);
    let margin = 10 * BASE_PRICE - filled;
    assert_eq!(usdc().balance_of(VAULT()), margin);
    assert_eq!(supply - paved.total_supply(), out);
    // Nothing left on Economy, nor on the router (beyond what it held before)
    assert_eq!(usdc().balance_of(economy.contract_address), 0);
    assert_eq!(paved.balance_of(economy.contract_address), 0);
    assert_eq!(paved.balance_of(ROUTER()), 0);
    let after = paved.total_supply();
    let factor = supply_factor(after, decided().target.into());
    assert_eq!(r, reference(guarded(out, quote, PAVED_RATE), 10, factor));
    assert_eq!(economy.rate(), next_rate(PAVED_RATE, out, quote));
    println!(
        "E-9 fork: thin pool {:?}, limit {}, filled {} of {} USDC, PAVED out {}, margin {}, R {}",
        pool_key,
        limit,
        filled,
        quote,
        out,
        margin,
        r,
    );
}
