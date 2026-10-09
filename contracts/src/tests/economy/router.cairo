//! `MockRouter` and `MockUSDC` (P8 E1): the constant product with Ekubo's 5 % fee, the calling
//! pattern `Economy` uses (transfer, `swap`, `clear_minimum`, `clear`), and the faucet.

use openzeppelin_interfaces::erc20::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MixinDispatcher, IERC20MixinDispatcherTrait,
};
use paved::economy::ekubo::{
    IClearDispatcher, IClearDispatcherTrait, IRouterDispatcher, IRouterDispatcherTrait, RouteNode,
    TokenAmount, i129,
};
use paved::mocks::router::{FEE, IMockRouterDispatcher, IMockRouterDispatcherTrait, TWO_POW_128};
use paved::mocks::usdc::{IMockUSDCDispatcher, IMockUSDCDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::token::{RECIPIENT, deploy_token};

fn TRADER() -> ContractAddress {
    'TRADER'.try_into().unwrap()
}

const PAVED: u256 = 1_000_000_000_000_000_000;
const USDC: u256 = 1_000_000;

#[derive(Copy, Drop)]
struct Setup {
    router: ContractAddress,
    paved: IERC20Dispatcher,
    usdc: IERC20Dispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// The pool `scripts/deploy.sh devnet` seeds: 800,000 PAVED and 10,000 USDC.
fn setup() -> Setup {
    let paved_address = deploy_token(RECIPIENT());
    let usdc_address = deploy("MockUSDC", array![]);
    let router = deploy("MockRouter", array![paved_address.into(), usdc_address.into()]);
    let s = Setup {
        router,
        paved: IERC20Dispatcher { contract_address: paved_address },
        usdc: IERC20Dispatcher { contract_address: usdc_address },
    };
    IMockUSDCDispatcher { contract_address: usdc_address }.mint(RECIPIENT(), 10_000 * USDC);
    start_cheat_caller_address(paved_address, RECIPIENT());
    s.paved.approve(router, 800_000 * PAVED);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(usdc_address, RECIPIENT());
    s.usdc.approve(router, 10_000 * USDC);
    stop_cheat_caller_address(usdc_address);
    let (amount0, amount1) = if paved_address < usdc_address {
        (800_000 * PAVED, 10_000 * USDC)
    } else {
        (10_000 * USDC, 800_000 * PAVED)
    };
    start_cheat_caller_address(router, RECIPIENT());
    IMockRouterDispatcher { contract_address: router }.add_liquidity(amount0, amount1);
    stop_cheat_caller_address(router);
    s
}

/// The reserves as (PAVED, USDC).
fn reserves(s: Setup) -> (u256, u256) {
    let (r0, r1) = IMockRouterDispatcher { contract_address: s.router }.reserves();
    if s.paved.contract_address < s.usdc.contract_address {
        (r0, r1)
    } else {
        (r1, r0)
    }
}

/// The reference formula: Ekubo's fee rounded up, the constant product rounded down.
fn expected(reserve_in: u256, reserve_out: u256, amount_in: u256) -> u256 {
    let fee = (amount_in * FEE.into() + TWO_POW_128 - 1) / TWO_POW_128;
    let net = amount_in - fee;
    reserve_out * net / (reserve_in + net)
}

fn node(s: Setup) -> RouteNode {
    let pool_key = IMockRouterDispatcher { contract_address: s.router }.pool_key();
    RouteNode { pool_key, sqrt_ratio_limit: 0, skip_ahead: 0 }
}

/// `Economy`'s pattern, played by the trader: transfer, swap, clear the output with a minimum,
/// clear the input's leftover.
fn swap(
    s: Setup, token_in: IERC20Dispatcher, token_out: IERC20Dispatcher, amount: u128, minimum: u256,
) -> u256 {
    start_cheat_caller_address(token_in.contract_address, TRADER());
    token_in.transfer(s.router, amount.into());
    stop_cheat_caller_address(token_in.contract_address);
    start_cheat_caller_address(s.router, TRADER());
    let amount = i129 { mag: amount, sign: false };
    IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: token_in.contract_address, amount });
    let clear = IClearDispatcher { contract_address: s.router };
    let out = clear.clear_minimum(token_out.contract_address, minimum);
    clear.clear(token_in.contract_address);
    stop_cheat_caller_address(s.router);
    out
}

fn fund_trader(s: Setup) {
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }.mint(TRADER(), 100 * USDC);
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(TRADER(), 10_000 * PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
}

#[test]
fn test_mock_usdc_metadata_and_faucet() {
    let address = deploy("MockUSDC", array![]);
    let usdc = IERC20MixinDispatcher { contract_address: address };
    assert_eq!(usdc.symbol(), "USDC");
    assert_eq!(usdc.decimals(), 6);
    assert_eq!(usdc.total_supply(), 0);
    start_cheat_caller_address(address, TRADER());
    IMockUSDCDispatcher { contract_address: address }.mint(TRADER(), 2 * USDC);
    assert_eq!(usdc.balance_of(TRADER()), 2_000_000);
    assert_eq!(usdc.total_supply(), 2_000_000);
}

/// A Daily purchase at stake 1 swaps 70 % of 2 USDC: 1.4 USDC buys 106.385850681859312711 PAVED
/// from the seeded pool (computed apart: fee 70,000 = 5 %, then the constant product).
#[test]
fn test_mock_router_usdc_to_paved_matches_the_constant_product() {
    let s = setup();
    fund_trader(s);
    let (paved_before, usdc_before) = reserves(s);
    let paved_balance = s.paved.balance_of(TRADER());
    let out = swap(s, s.usdc, s.paved, 1_400_000, 0);
    assert_eq!(out, expected(usdc_before, paved_before, 1_400_000));
    assert_eq!(out, 106_385_850_681_859_312_711);
    assert_eq!(s.paved.balance_of(TRADER()), paved_balance + out);
    // The whole input, its fee included, stays in the pool
    let (paved_after, usdc_after) = reserves(s);
    assert_eq!(usdc_after, usdc_before + 1_400_000);
    assert_eq!(paved_after, paved_before - out);
    // The router holds exactly its reserves
    assert_eq!(s.paved.balance_of(s.router), paved_after);
    assert_eq!(s.usdc.balance_of(s.router), usdc_after);
}

#[test]
fn test_mock_router_paved_to_usdc_matches_the_constant_product() {
    let s = setup();
    fund_trader(s);
    swap(s, s.usdc, s.paved, 1_400_000, 0);
    let (paved_before, usdc_before) = reserves(s);
    let out = swap(s, s.paved, s.usdc, 1_000_000_000_000_000_000_000, 0);
    assert_eq!(out, expected(paved_before, usdc_before, 1_000 * PAVED));
    assert_eq!(out, 11_864_151);
    let (paved_after, usdc_after) = reserves(s);
    assert_eq!(paved_after, paved_before + 1_000 * PAVED);
    assert_eq!(usdc_after, usdc_before - out);
}

/// The product of the reserves never decreases: the fee stays in the pool.
#[test]
fn test_mock_router_product_grows_by_the_fee() {
    let s = setup();
    fund_trader(s);
    let (p0, u0) = reserves(s);
    swap(s, s.usdc, s.paved, 50_000_000, 0);
    let (p1, u1) = reserves(s);
    assert!(p1 * u1 > p0 * u0, "k fell");
    swap(s, s.paved, s.usdc, 3_000_000_000_000_000_000_000, 0);
    let (p2, u2) = reserves(s);
    assert!(p2 * u2 > p1 * u1, "k fell");
}

#[test]
fn test_mock_router_quote_is_the_swap_output() {
    let s = setup();
    fund_trader(s);
    let quote = IMockRouterDispatcher { contract_address: s.router }
        .quote(s.usdc.contract_address, 2_000_000);
    assert_eq!(swap(s, s.usdc, s.paved, 2_000_000, 0), quote.into());
}

#[test]
fn test_mock_router_delta_signs() {
    let s = setup();
    fund_trader(s);
    start_cheat_caller_address(s.usdc.contract_address, TRADER());
    s.usdc.transfer(s.router, 1_400_000);
    stop_cheat_caller_address(s.usdc.contract_address);
    let amount = i129 { mag: 1_400_000, sign: false };
    let delta = IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: s.usdc.contract_address, amount });
    let received = i129 { mag: 106_385_850_681_859_312_711, sign: true };
    if s.usdc.contract_address < s.paved.contract_address {
        assert_eq!(delta.amount0, amount);
        assert_eq!(delta.amount1, received);
    } else {
        assert_eq!(delta.amount1, amount);
        assert_eq!(delta.amount0, received);
    }
}

#[test]
#[should_panic(expected: 'CLEAR_AT_LEAST_MINIMUM')]
fn test_mock_router_clear_minimum_reverts_below_the_minimum() {
    let s = setup();
    fund_trader(s);
    swap(s, s.usdc, s.paved, 1_400_000, 106_385_850_681_859_312_712);
}

#[test]
fn test_mock_router_clear_minimum_at_the_minimum() {
    let s = setup();
    fund_trader(s);
    assert_eq!(
        swap(s, s.usdc, s.paved, 1_400_000, 106_385_850_681_859_312_711),
        106_385_850_681_859_312_711,
    );
}

/// `clear` returns what was sent to the router and not swapped.
#[test]
fn test_mock_router_clear_returns_the_leftover() {
    let s = setup();
    fund_trader(s);
    start_cheat_caller_address(s.usdc.contract_address, TRADER());
    s.usdc.transfer(s.router, 3 * USDC);
    stop_cheat_caller_address(s.usdc.contract_address);
    start_cheat_caller_address(s.router, TRADER());
    let amount = i129 { mag: 2_000_000, sign: false };
    IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: s.usdc.contract_address, amount });
    let clear = IClearDispatcher { contract_address: s.router };
    assert_eq!(clear.clear(s.usdc.contract_address), 1 * USDC);
    assert_eq!(clear.clear(s.usdc.contract_address), 0);
}

#[test]
#[should_panic(expected: 'MockRouter: input not paid')]
fn test_mock_router_swap_without_the_input_reverts() {
    let s = setup();
    let amount = i129 { mag: 1_400_000, sign: false };
    IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: s.usdc.contract_address, amount });
}

#[test]
#[should_panic(expected: 'MockRouter: exact input only')]
fn test_mock_router_exact_output_reverts() {
    let s = setup();
    let amount = i129 { mag: 1_400_000, sign: true };
    IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: s.usdc.contract_address, amount });
}

#[test]
#[should_panic(expected: 'MockRouter: wrong pool')]
fn test_mock_router_wrong_fee_reverts() {
    let s = setup();
    let mut route = node(s);
    route.pool_key.fee = FEE + 1;
    let amount = i129 { mag: 1_400_000, sign: false };
    IRouterDispatcher { contract_address: s.router }
        .swap(route, TokenAmount { token: s.usdc.contract_address, amount });
}

#[test]
#[should_panic(expected: 'MockRouter: wrong token')]
fn test_mock_router_wrong_token_reverts() {
    let s = setup();
    let amount = i129 { mag: 1_400_000, sign: false };
    IRouterDispatcher { contract_address: s.router }
        .swap(node(s), TokenAmount { token: TRADER(), amount });
}

#[test]
fn test_mock_router_pool_key() {
    let s = setup();
    let key = IMockRouterDispatcher { contract_address: s.router }.pool_key();
    assert!(key.token0 < key.token1, "order");
    assert_eq!(key.fee, 0xccccccccccccccccccccccccccccccc);
    assert_eq!(key.tick_spacing, 0x56a4c);
    assert_eq!(key.extension, 0.try_into().unwrap());
}
