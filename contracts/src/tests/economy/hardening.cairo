//! `Economy`'s hardening (PM rulings of 2026-10-14,
//! `docs/briefs/economy-swap-sign-and-referrers.md`):
//! the swap refuses a PAVED leg that is not paid out to `Economy`, and a referral is paid to none
//! of the payer, the Vault, the router, `Economy` and the game. The setup is the one of
//! `economy.cairo` (the launch pool, the Vault, `DAILY` as the game).

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_interfaces::erc4626::{IERC4626Dispatcher, IERC4626DispatcherTrait};
use paved::economy::curve::RATE_SCALE;
use paved::economy::ekubo::{Delta, i129};
use paved::mocks::router::{IMockRouterDispatcher, IMockRouterDispatcherTrait};
use paved::systems::economy::{
    BASE_PRICE, DAY, IEconomyDispatcher, IEconomyDispatcherTrait, IEconomySafeDispatcher,
    IEconomySafeDispatcherTrait, decided,
};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use paved::systems::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
use paved::systems::vault::DEAD_ASSETS;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyTrait, EventsFilterTrait, declare, mock_call,
    spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address,
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

const ONE_PAVED: u256 = 1_000_000_000_000_000_000;
const USDC: u256 = 1_000_000;
const DAY0: u64 = 20_000;
const MEAN0: u64 = 3_980_000;
const POOL_RATE: u256 = 76_000_000_000_000 * RATE_SCALE;

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

/// A `MockRouter` on the pair, seeded from the recipient with `paved_amount` and `usdc_amount`.
fn deploy_router(
    paved: IERC20Dispatcher, usdc: IERC20Dispatcher, paved_amount: u256, usdc_amount: u256,
) -> ContractAddress {
    let router = deploy(
        "MockRouter", array![paved.contract_address.into(), usdc.contract_address.into()],
    );
    IFaucetDispatcher { contract_address: usdc.contract_address }.mint(RECIPIENT(), usdc_amount);
    start_cheat_caller_address(paved.contract_address, RECIPIENT());
    paved.approve(router, paved_amount);
    stop_cheat_caller_address(paved.contract_address);
    start_cheat_caller_address(usdc.contract_address, RECIPIENT());
    usdc.approve(router, usdc_amount);
    stop_cheat_caller_address(usdc.contract_address);
    let (amount0, amount1) = if paved.contract_address < usdc.contract_address {
        (paved_amount, usdc_amount)
    } else {
        (usdc_amount, paved_amount)
    };
    start_cheat_caller_address(router, RECIPIENT());
    IMockRouterDispatcher { contract_address: router }.add_liquidity(amount0, amount1);
    stop_cheat_caller_address(router);
    router
}

/// The launch pool (800,000 PAVED and 10,000 USDC), the Vault, and `Economy` with the decided
/// configuration, `DAILY` as its game. An hour into `DAY0`.
fn setup() -> Setup {
    start_cheat_block_timestamp_global(DAY0 * DAY + 3600);
    let paved_address = deploy_token(RECIPIENT());
    let usdc_address = deploy("Faucet", array![]);
    let paved = IERC20Dispatcher { contract_address: paved_address };
    let usdc = IERC20Dispatcher { contract_address: usdc_address };
    let vault = deploy("Vault", array![OWNER().into(), paved_address.into(), 0]);
    start_cheat_caller_address(paved_address, RECIPIENT());
    paved.approve(vault, DEAD_ASSETS);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(vault, RECIPIENT());
    IERC4626Dispatcher { contract_address: vault }.deposit(DEAD_ASSETS, vault);
    stop_cheat_caller_address(vault);
    let router = deploy_router(paved, usdc, 800_000 * ONE_PAVED, 10_000 * USDC);
    let pool_key = IMockRouterDispatcher { contract_address: router }.pool_key();
    let mut calldata: Array<felt252> = array![
        OWNER().into(), paved_address.into(), usdc_address.into(), vault.into(), router.into(),
    ];
    pool_key.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    POOL_RATE.serialize(ref calldata);
    let economy = IEconomyDispatcher { contract_address: deploy("Economy", calldata) };
    start_cheat_caller_address(paved_address, ADMIN());
    IPavedTokenDispatcher { contract_address: paved_address }.set_minter(economy.contract_address);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(economy.contract_address, OWNER());
    economy.set_game(DAILY());
    stop_cheat_caller_address(economy.contract_address);
    Setup { economy, paved, usdc, router, vault }
}

/// What `Challenge` does: the price onto `Economy`, then `purchase`.
fn pay(s: Setup, game_id: u32, stake: u8, referrer: ContractAddress) {
    let price = stake.into() * BASE_PRICE;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, price);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(game_id, PLAYER(), DAY0, stake, price, referrer, 0);
    stop_cheat_caller_address(s.economy.contract_address);
}

/// The router's next `swap` answers these legs.
fn mock_swap(s: Setup, usdc_leg: i129, paved_leg: i129) {
    let delta = if s.paved.contract_address < s.usdc.contract_address {
        Delta { amount0: paved_leg, amount1: usdc_leg }
    } else {
        Delta { amount0: usdc_leg, amount1: paved_leg }
    };
    mock_call(s.router, selector!("swap"), delta, 1);
}

fn donate_paved(s: Setup, to: ContractAddress, amount: u256) {
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(to, amount);
    stop_cheat_caller_address(s.paved.contract_address);
}

/// The `Purchased` event of the one purchase made so far: its data (day, stake, price, referrer,
/// referral, ...).
fn purchased(ref spy: snforge_std::EventSpy, s: Setup) -> Array<felt252> {
    let mut found: Array<Array<felt252>> = array![];
    for (_, event) in spy.get_events().emitted_by(s.economy.contract_address).events {
        if *event.keys.at(0) == selector!("Purchased") {
            found.append(event.data.clone());
        }
    }
    assert_eq!(found.len(), 1);
    found.pop_front().unwrap()
}

// The swap's PAVED-leg sign

/// A PAVED leg paid in (`sign: false`) reverts, whatever `Economy` holds: PAVED donated to it
/// cannot stand in for the swap's output.
#[test]
#[should_panic(expected: 'Economy: wrong delta')]
fn test_purchase_refuses_a_paved_leg_paid_in() {
    let s = setup();
    donate_paved(s, s.economy.contract_address, 1_000 * ONE_PAVED);
    mock_swap(
        s, i129 { mag: 2_000_000, sign: false }, i129 { mag: 100 * ONE_PAVED.low, sign: false },
    );
    pay(s, 1, 1, Zero::zero());
}

/// The same refusal with no donation, and `min_out` at zero.
#[test]
#[feature("safe_dispatcher")]
fn test_purchase_refuses_a_paved_leg_paid_in_without_a_donation() {
    let s = setup();
    mock_swap(
        s, i129 { mag: 2_000_000, sign: false }, i129 { mag: 100 * ONE_PAVED.low, sign: false },
    );
    let price = BASE_PRICE;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, price);
    let safe = IEconomySafeDispatcher { contract_address: s.economy.contract_address };
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    let result = safe.purchase(1, PLAYER(), DAY0, 1, price, Zero::zero(), 0);
    assert_eq!(*result.unwrap_err().at(0), 'Economy: wrong delta');
}

/// A zero PAVED leg passes the check, as in `quote_swap`: the purchase then bought nothing. The
/// real router never answers one (it reverts on a zero output); this is a double.
#[test]
fn test_purchase_with_a_zero_paved_leg_buys_nothing() {
    let s = setup();
    mock_swap(s, i129 { mag: 2_000_000, sign: false }, i129 { mag: 0, sign: false });
    let supply = s.paved.total_supply();
    pay(s, 1, 1, Zero::zero());
    // Nothing is burned, nothing goes to the Vault; the price stays on `Economy` as USDC (the
    // router's `clear` hands back what it did not swap), to join the next purchase's margin
    assert_eq!(s.paved.total_supply(), supply);
    assert_eq!(s.paved.balance_of(s.vault), DEAD_ASSETS);
    assert_eq!(s.usdc.balance_of(s.economy.contract_address), 2 * USDC);
}

/// The normal path through the real router is unchanged: the PAVED bought is burned (burn quote)
/// and sent to the Vault (margin).
#[test]
fn test_purchase_through_the_router_is_unchanged() {
    let s = setup();
    let supply = s.paved.total_supply();
    let quoted = s.economy.quote_swap(2_000_000);
    pay(s, 1, 1, Zero::zero());
    assert_eq!(
        supply - s.paved.total_supply() + (s.paved.balance_of(s.vault) - DEAD_ASSETS), quoted,
    );
    assert_eq!(s.paved.balance_of(s.economy.contract_address), 0);
    assert_eq!(s.usdc.balance_of(s.economy.contract_address), 0);
}

// No referral to the protocol's own addresses

/// One purchase of stake 1 with the referrer `kind` (0 none, 1 Vault, 2 router, 3 `Economy`, 4 the
/// game, 5 the payer, 6 an outsider), on a fresh setup: its `Purchased` data, the Vault's PAVED,
/// the supply after, and the USDC the referrer holds beyond what it held.
fn run(kind: u8) -> (Array<felt252>, u256, u256, u256) {
    let s = setup();
    let referrer = if kind == 1 {
        s.vault
    } else if kind == 2 {
        s.router
    } else if kind == 3 {
        s.economy.contract_address
    } else if kind == 4 {
        DAILY()
    } else if kind == 5 {
        PLAYER()
    } else if kind == 6 {
        REFERRER()
    } else {
        Zero::zero()
    };
    let before = s.usdc.balance_of(referrer);
    let mut spy = spy_events();
    pay(s, 1, 1, referrer);
    let data = purchased(ref spy, s);
    let gained = if referrer.is_zero() {
        0
    } else {
        s.usdc.balance_of(referrer) - before
    };
    (data, s.paved.balance_of(s.vault), s.paved.total_supply(), gained)
}

#[test]
fn test_referrals_to_the_protocol_pay_nothing_and_change_nothing() {
    let (none, vault, supply, _) = run(0);
    // `referrer` is the fourth word of the data (day, stake, price x 2), `referral` the next two
    assert_eq!(*none.at(4), 0);
    assert_eq!(*none.at(5), 0);
    let mut kind = 1;
    while kind <= 5 {
        let (data, v, t, gained) = run(kind);
        assert_eq!(data, none.clone());
        assert_eq!(v, vault);
        assert_eq!(t, supply);
        // The router holds the price it swapped, the others nothing: none holds a referral
        assert_eq!(gained, if kind == 2 {
            2 * USDC
        } else {
            0
        });
        kind += 1;
    };
}

/// The control: an outsider is paid 5 % of the price, out of the Vault's part.
#[test]
fn test_referral_to_an_outsider_is_paid() {
    let (data, vault, _, gained) = run(6);
    let (none, vault_none, _, _) = run(0);
    assert_eq!(*data.at(4), REFERRER().into());
    assert_eq!(gained, 100_000);
    assert_eq!(*data.at(5), 100_000);
    // The burn quote is the same; the Vault's part is smaller by the referral
    assert_eq!(*data.at(7), *none.at(7));
    assert!(vault < vault_none);
}

/// The router is read when the purchase runs: after `set_router(new)`, the new one is excluded and
/// the old one is paid.
#[test]
fn test_set_router_moves_the_excluded_router() {
    let s = setup();
    let other = deploy_router(s.paved, s.usdc, 100_000 * ONE_PAVED, 1_250 * USDC);
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_router(other);
    stop_cheat_caller_address(s.economy.contract_address);
    // The new router: no referral
    let mut spy = spy_events();
    let usdc_before = s.usdc.balance_of(other);
    pay(s, 1, 1, other);
    let data = purchased(ref spy, s);
    assert_eq!(*data.at(4), 0);
    assert_eq!(*data.at(5), 0);
    // The pool took the whole price: the router holds its reserve and nothing more
    let (r0, r1) = IMockRouterDispatcher { contract_address: other }.reserves();
    let reserve = if s.paved.contract_address < s.usdc.contract_address {
        r1
    } else {
        r0
    };
    assert_eq!(s.usdc.balance_of(other), reserve);
    assert_eq!(reserve, usdc_before + 2 * USDC);
    // The old router: paid
    let mut spy = spy_events();
    let old_before = s.usdc.balance_of(s.router);
    pay(s, 2, 1, s.router);
    let data = purchased(ref spy, s);
    assert_eq!(*data.at(4), s.router.into());
    assert_eq!(*data.at(5), 100_000);
    assert_eq!(s.usdc.balance_of(s.router), old_before + 100_000);
}
