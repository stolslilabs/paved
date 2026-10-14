//! `Economy` (P8 E2) against `MockRouter`, `Faucet`, `PavedToken` and `Vault`. The test double
//! for `Daily` is the address `DAILY`: like `Daily` in E3, it puts the price on `Economy` (here by
//! the USDC faucet, as `transferFrom(player, Economy, P)` would) and then calls `purchase` and
//! `record`.
//!
//! The end-to-end fixture compares `R` and the payout of nine games over two days with
//! `scripts/montecarlo/sim.py`'s formulas: `python3 -I -B scripts/montecarlo/fixture.py
//! --margin-paved` (the purchase's one swap since P-56, its PAVED split by input) imports
//! its `payout_factor` and `Ema`, runs the purchase and day lines of `simulate` on the same inputs,
//! adds the price guard, and prints `expected()` (players keep their rewards, and the pool keeps
//! its fee in its reserves as `MockRouter` does; see the "As built" notes of
//! `docs/architecture/economy.md`).

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_interfaces::erc4626::{
    ERC4626ABIDispatcher, ERC4626ABIDispatcherTrait, IERC4626Dispatcher, IERC4626DispatcherTrait,
};
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::economy::curve::{
    RATE_SCALE, guarded, next_rate, payout, reference, split, supply_factor, threshold, vault_split,
};
use paved::economy::ekubo::{
    Delta, IClearDispatcher, IClearDispatcherTrait, IRouterDispatcher, IRouterDispatcherTrait,
    PoolKey, RouteNode, TokenAmount, i129,
};
use paved::economy::mean::Ema;
use paved::mocks::router::{IMockRouterDispatcher, IMockRouterDispatcherTrait};
use paved::systems::economy::Economy::{
    DayClosed, EconomyConfigured, Event, GameSet, PoolSet, Purchased, Recorded, RouterSet, Settled,
};
use paved::systems::economy::{
    BASE_PRICE, Config, DAY, IEconomyDispatcher, IEconomyDispatcherTrait, IEconomySafeDispatcher,
    IEconomySafeDispatcherTrait, PAVED, decided,
};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use paved::systems::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
use paved::systems::vault::DEAD_ASSETS;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait,
    EventsFilterTrait, declare, mock_call, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address, store,
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
const MEAN0: u64 = 3_980_000;
/// The launch pool's rate after its 5 % fee (800,000 PAVED for 10,000 USDC, x 0.95), in base
/// units per base unit x 1e18: what the deploy passes.
const POOL_RATE: u256 = 76_000_000_000_000 * RATE_SCALE;

/// A router at a fixed rate (`out = in x rate`, no price impact), for the burned PAVED with and
/// without a referrer. Its `swap` hands the input USDC to `reserve` (the pool keeps it) and pulls
/// the PAVED out of `reserve` (approved first), so that `clear`, which sends the router's whole
/// balance as Ekubo's does, returns exactly what the swap produced, and any USDC stray.
#[starknet::interface]
pub trait IFixedRateRouter<TContractState> {
    fn swap(ref self: TContractState, node: RouteNode, token_amount: TokenAmount) -> Delta;
    fn quote_swap(self: @TContractState, node: RouteNode, token_amount: TokenAmount) -> Delta;
    fn clear(self: @TContractState, token: ContractAddress) -> u256;
    fn clear_minimum(self: @TContractState, token: ContractAddress, minimum: u256) -> u256;
}

#[starknet::contract]
pub mod FixedRateRouter {
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use paved::economy::ekubo::{Delta, RouteNode, TokenAmount, i129};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    #[storage]
    struct Storage {
        paved: ContractAddress,
        usdc: ContractAddress,
        reserve: ContractAddress,
        rate: u128,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        paved: ContractAddress,
        usdc: ContractAddress,
        reserve: ContractAddress,
        rate: u128,
    ) {
        self.paved.write(paved);
        self.usdc.write(usdc);
        self.reserve.write(reserve);
        self.rate.write(rate);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn delta(self: @ContractState, usdc_in: u128) -> Delta {
            let usdc_leg = i129 { mag: usdc_in, sign: false };
            let paved_leg = i129 { mag: usdc_in * self.rate.read(), sign: true };
            if self.paved.read() < self.usdc.read() {
                Delta { amount0: paved_leg, amount1: usdc_leg }
            } else {
                Delta { amount0: usdc_leg, amount1: paved_leg }
            }
        }
    }

    #[abi(embed_v0)]
    impl FixedRateRouterImpl of super::IFixedRateRouter<ContractState> {
        fn swap(ref self: ContractState, node: RouteNode, token_amount: TokenAmount) -> Delta {
            let usdc_in = token_amount.amount.mag;
            let reserve = self.reserve.read();
            IERC20Dispatcher { contract_address: self.usdc.read() }
                .transfer(reserve, usdc_in.into());
            IERC20Dispatcher { contract_address: self.paved.read() }
                .transfer_from(
                    reserve, get_contract_address(), (usdc_in * self.rate.read()).into(),
                );
            self.delta(usdc_in)
        }

        fn quote_swap(self: @ContractState, node: RouteNode, token_amount: TokenAmount) -> Delta {
            self.delta(token_amount.amount.mag)
        }

        fn clear(self: @ContractState, token: ContractAddress) -> u256 {
            let erc20 = IERC20Dispatcher { contract_address: token };
            let amount = erc20.balance_of(get_contract_address());
            erc20.transfer(get_caller_address(), amount);
            amount
        }

        fn clear_minimum(self: @ContractState, token: ContractAddress, minimum: u256) -> u256 {
            let amount = self.clear(token);
            assert(amount >= minimum, 'Fixed: below minimum');
            amount
        }
    }
}

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
    let usdc_address = deploy("Faucet", array![]);
    let router = deploy("MockRouter", array![paved_address.into(), usdc_address.into()]);
    let vault = deploy("Vault", array![OWNER().into(), paved_address.into(), 0]);
    let paved = IERC20Dispatcher { contract_address: paved_address };
    let usdc = IERC20Dispatcher { contract_address: usdc_address };
    // [Setup] The Vault's dead shares
    start_cheat_caller_address(paved_address, RECIPIENT());
    paved.approve(vault, DEAD_ASSETS);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(vault, RECIPIENT());
    IERC4626Dispatcher { contract_address: vault }.deposit(DEAD_ASSETS, vault);
    stop_cheat_caller_address(vault);
    // [Setup] The pool
    IFaucetDispatcher { contract_address: usdc_address }.mint(RECIPIENT(), 10_000 * USDC);
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
    tested().serialize(ref calldata);
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

/// The configuration these tests were written at: 70 % of the price swapped for the burn (the
/// decided one before P-56's split, which `test_decided_split_*` covers), so their figures and
/// sim.py's fixture (its `BURN`) keep their round numbers.
fn tested() -> Config {
    Config { burn_bps: 7_000, ..decided() }
}

/// The PAVED that the router's own `quote_swap` answers for `usdc_in`, through `Economy`'s pool
/// and limit.
fn router_quote(s: Setup, usdc_in: u128) -> u256 {
    router_quote_at(s, s.router, usdc_in)
}

/// As `router_quote`, from the router at `router`.
fn router_quote_at(s: Setup, router: ContractAddress, usdc_in: u128) -> u256 {
    let (pool_key, sqrt_ratio_limit) = s.economy.pool();
    let node = RouteNode { pool_key, sqrt_ratio_limit, skip_ahead: 0 };
    let amount = i129 { mag: usdc_in, sign: false };
    let delta = IRouterDispatcher { contract_address: router }
        .quote_swap(node, TokenAmount { token: s.usdc.contract_address, amount });
    let out = if s.paved.contract_address < s.usdc.contract_address {
        delta.amount0
    } else {
        delta.amount1
    };
    assert!(out.sign);
    out.mag.into()
}

fn today() -> u64 {
    starknet::get_block_timestamp() / DAY
}

/// What `Daily` does: the price onto `Economy`, then `purchase`. Returns `R`.
fn buy(
    s: Setup, game_id: u32, player: ContractAddress, stake: u8, referrer: ContractAddress,
) -> u128 {
    let price = stake.into() * BASE_PRICE;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, price);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    let r = s.economy.purchase(game_id, player, today(), stake, price, referrer, 0);
    stop_cheat_caller_address(s.economy.contract_address);
    r
}

fn record(s: Setup, game_id: u32, score: u32) {
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.record(game_id, score);
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

/// The PAVED the purchases sent to the Vault: its balance beyond the dead shares' 1,000.
fn vault_paved(s: Setup) -> u256 {
    s.paved.balance_of(s.vault) - DEAD_ASSETS
}

// Purchase: the split, one swap, the burn and the Vault's PAVED, nothing left behind

#[test]
fn test_purchase_splits_the_price_exactly_with_a_referrer() {
    let s = setup();
    let supply = s.paved.total_supply();
    let reserve = usdc_reserve(s);
    let price = 3 * BASE_PRICE;
    let (referral, quote, margin) = split(price, 7_000, 500, true);
    assert_eq!((referral, quote, margin), (300_000, 4_200_000, 1_500_000));
    let out = router_quote(s, 5_700_000);
    buy(s, 1, PLAYER(), 3, REFERRER());
    // The referrer is paid at once; the quote and the margin went into the pool in one swap
    assert_eq!(s.usdc.balance_of(REFERRER()), referral);
    assert_eq!(usdc_reserve(s) - reserve, quote + margin);
    assert_eq!(referral + quote + margin, price);
    // The PAVED it bought: the margin's part to the Vault, rounded down, the rest burned
    assert_eq!(s.usdc.balance_of(s.vault), 0);
    assert_eq!(vault_paved(s), out * margin / (quote + margin));
    assert_eq!(supply - s.paved.total_supply(), out - vault_paved(s));
    assert_nothing_left(s);
}

#[test]
fn test_purchase_without_a_referrer_swaps_the_whole_price() {
    let s = setup();
    let out = router_quote(s, 20_000_000);
    buy(s, 1, PLAYER(), 10, Zero::zero());
    assert_eq!(usdc_reserve(s), 10_020 * USDC);
    assert_eq!(s.usdc.balance_of(s.vault), 0);
    assert_eq!(vault_paved(s), out * 3 / 10);
    assert_nothing_left(s);
}

#[test]
fn test_purchase_referring_oneself_pays_no_referral() {
    let s = setup();
    let supply = s.paved.total_supply();
    let (referral, quote, margin) = split(2 * USDC, 7_000, 500, false);
    assert_eq!((referral, quote, margin), (0, 1_400_000, 600_000));
    let out = router_quote(s, 2_000_000);
    let (burn_part, to_vault) = vault_split(out, quote, margin);
    let mut spy = spy_events();
    let r = buy(s, 1, PLAYER(), 1, PLAYER());
    assert_eq!(s.usdc.balance_of(PLAYER()), 0);
    assert_eq!(usdc_reserve(s), 10_002 * USDC);
    assert_nothing_left(s);
    // The event reports no referrer and no referral, not the player as its own referrer
    let after = s.paved.total_supply();
    assert_eq!(supply - after, burn_part);
    let event = Purchased {
        game_id: 1,
        player_id: PLAYER().into(),
        day: DAY0,
        stake: 1,
        price: 2 * USDC,
        referrer: Zero::zero(),
        referral: 0,
        burned_quote: quote,
        burned: burn_part,
        margin,
        supply: after,
        factor: supply_factor(after, 1_000_000 * ONE_PAVED),
        reference: r,
        vault_paved: to_vault,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Purchased(event))]);
}

/// Each purchase's margin reaches the Vault as PAVED with no share minted: the Vault's assets grow
/// by exactly that PAVED, its supply does not move, and its rate rises.
#[test]
fn test_each_purchase_raises_the_vaults_rate() {
    let s = setup();
    let vault = ERC4626ABIDispatcher { contract_address: s.vault };
    let shares = vault.total_supply();
    let mut assets = vault.total_assets();
    let mut rate = vault.convert_to_assets(ONE_PAVED);
    assert_eq!(rate, ONE_PAVED);
    buy(s, 1, PLAYER(), 1, Zero::zero());
    let first = vault_paved(s);
    buy(s, 2, PLAYER(), 2, REFERRER());
    let total = vault_paved(s);
    assert!(first > 0 && total > first);
    assert_eq!(vault.total_assets(), assets + total);
    assert_eq!(vault.total_supply(), shares);
    // The rate: the assets over the shares, the virtual one of each included
    assert_eq!(vault.convert_to_assets(ONE_PAVED), ONE_PAVED * (assets + total + 1) / (shares + 1));
    assert!(vault.convert_to_assets(ONE_PAVED) > rate);
    assets = vault.total_assets();
    rate = vault.convert_to_assets(ONE_PAVED);
    buy(s, 3, PLAYER(), 10, Zero::zero());
    assert!(vault.total_assets() > assets);
    assert!(vault.convert_to_assets(ONE_PAVED) > rate);
    assert_nothing_left(s);
}

#[test]
fn test_donations_to_economy_join_the_margin_and_the_burn() {
    let s = setup();
    // USDC and PAVED sent to Economy by anyone leave with the next purchase: the USDC joins the
    // margin's swap, the PAVED is burned
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, 5 * USDC);
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(s.economy.contract_address, 7 * ONE_PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    let out = router_quote(s, 7_000_000);
    let supply = s.paved.total_supply();
    let mut spy = spy_events();
    let r = buy(s, 1, PLAYER(), 1, Zero::zero());
    assert_eq!(usdc_reserve(s), 10_007 * USDC);
    // The margin is 0.6 USDC of the price and the 5 USDC donated
    assert_eq!(vault_paved(s), out * 5_600_000 / 7_000_000);
    assert_eq!(supply - s.paved.total_supply(), out - vault_paved(s) + 7 * ONE_PAVED);
    assert_nothing_left(s);
    // The event reports the donation in the margin, the Vault's PAVED, and the donated PAVED burned
    let (burn_part, to_vault) = vault_split(out, 1_400_000, 5_600_000);
    assert_eq!(to_vault, out * 5_600_000 / 7_000_000);
    let after = s.paved.total_supply();
    let event = Purchased {
        game_id: 1,
        player_id: PLAYER().into(),
        day: DAY0,
        stake: 1,
        price: 2 * USDC,
        referrer: Zero::zero(),
        referral: 0,
        burned_quote: 1_400_000,
        burned: burn_part + 7 * ONE_PAVED,
        margin: 5_600_000,
        supply: after,
        factor: supply_factor(after, 1_000_000 * ONE_PAVED),
        reference: r,
        vault_paved: to_vault,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Purchased(event))]);
}

#[test]
fn test_purchase_freezes_r_from_the_burns_paved_and_the_supply_after_the_burn() {
    let s = setup();
    let supply = s.paved.total_supply();
    let out = router_quote(s, 7_600_000);
    let mut spy = spy_events();
    let r = buy(s, 1, PLAYER(), 4, REFERRER());
    let after = s.paved.total_supply();
    let quote = 5_600_000;
    let (burn_part, to_vault) = vault_split(out, quote, 2_000_000);
    assert_eq!(supply - after, burn_part);
    assert_eq!(vault_paved(s), to_vault);
    let factor = supply_factor(after, 1_000_000 * ONE_PAVED);
    assert_eq!(r, reference(guarded(burn_part, quote, POOL_RATE), 4, factor));
    assert_eq!(s.economy.rate(), next_rate(POOL_RATE, burn_part, quote));
    // The terms
    let terms = s.economy.terms(1);
    assert_eq!(terms.player, PLAYER());
    assert_eq!((terms.day, terms.stake, terms.reference), (DAY0, 4, r));
    assert_eq!((terms.sigma_bps, terms.slope_bps, terms.cap), (0, 12_220, 5));
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
        burned: burn_part,
        margin: 2_000_000,
        supply: after,
        factor,
        reference: r,
        vault_paved: to_vault,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Purchased(event))]);
}

/// The split by input: the two parts add up to what the swap bought, the Vault's rounded down.
#[test]
fn test_vault_split_adds_up() {
    assert_eq!(vault_split(1_000, 7, 3), (700, 300));
    assert_eq!(vault_split(1_001, 7, 3), (701, 300));
    assert_eq!(vault_split(999, 7, 3), (700, 299));
    assert_eq!(vault_split(1_000, 7, 0), (1_000, 0));
    assert_eq!(vault_split(1_000, 0, 0), (1_000, 0));
    let (burn, vault) = vault_split(123_456_789_000_000_000_000, 5_600_000, 2_000_000);
    assert_eq!(burn + vault, 123_456_789_000_000_000_000);
    assert_eq!(vault, 123_456_789_000_000_000_000 * 2_000_000 / 7_600_000);
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
    // Someone sells 190,000 PAVED into the pool: PAVED gets much cheaper
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(s.router, 190_000 * ONE_PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    let router = IRouterDispatcher { contract_address: s.router };
    let pool_key = IMockRouterDispatcher { contract_address: s.router }.pool_key();
    start_cheat_caller_address(s.router, RECIPIENT());
    router
        .swap(
            RouteNode { pool_key, sqrt_ratio_limit: 0, skip_ahead: 0 },
            TokenAmount {
                token: s.paved.contract_address,
                amount: i129 { mag: 190_000_000_000_000_000_000_000, sign: false },
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
    // The rate moves by a 32nd toward what the purchase got, clamped at 110 % of the rate
    let observed = (supply - after) * RATE_SCALE / quote;
    assert!(observed > POOL_RATE * 11 / 10);
    assert_eq!(s.economy.rate(), (POOL_RATE * 31 + POOL_RATE * 11 / 10) / 32);
}

#[test]
fn test_constructor_refuses_a_zero_rate() {
    let s = setup();
    let class = declare("Economy").unwrap().contract_class();
    let (pool_key, _) = s.economy.pool();
    let mut calldata: Array<felt252> = array![
        OWNER().into(), s.paved.contract_address.into(), s.usdc.contract_address.into(),
        s.vault.into(), s.router.into(),
    ];
    pool_key.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    match class.deploy(@calldata) {
        Result::Ok(_) => panic!("a zero rate was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Economy: zero rate'),
    }
}

#[test]
fn test_constructor_refuses_a_rate_of_two_pow_128() {
    let s = setup();
    let class = declare("Economy").unwrap().contract_class();
    let (pool_key, _) = s.economy.pool();
    let mut calldata: Array<felt252> = array![
        OWNER().into(), s.paved.contract_address.into(), s.usdc.contract_address.into(),
        s.vault.into(), s.router.into(),
    ];
    pool_key.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    u256 { low: 0, high: 1 }.serialize(ref calldata);
    match class.deploy(@calldata) {
        Result::Ok(_) => panic!("a rate of 2^128 was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Economy: rate overflow'),
    }
}

#[test]
#[should_panic(expected: 'Economy: amount too large')]
fn test_quote_swap_refuses_an_amount_above_u128() {
    let s = setup();
    s.economy.quote_swap(u256 { low: 0, high: 1 });
}

// Purchase: refusals

#[test]
#[should_panic(expected: 'Economy: swap below min_out')]
fn test_purchase_below_min_out_reverts() {
    let s = setup();
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), 200 * ONE_PAVED);
}

/// `min_out` bounds the whole swap, the burn quote and the margin (P-56): the swap's own output
/// passes, one base unit more reverts.
#[test]
fn test_purchase_at_min_out_passes() {
    let s = setup();
    let out = router_quote(s, 2_000_000);
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), out.into());
}

#[test]
#[should_panic(expected: 'Economy: swap below min_out')]
fn test_purchase_above_the_whole_swap_reverts() {
    let s = setup();
    let out = router_quote(s, 2_000_000);
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), out + 1);
}

/// The router's next `swap` answers these legs (a router that fills part of the input).
fn mock_swap(s: Setup, usdc_leg: i129, paved_leg: i129) {
    let delta = if s.paved.contract_address < s.usdc.contract_address {
        Delta { amount0: paved_leg, amount1: usdc_leg }
    } else {
        Delta { amount0: usdc_leg, amount1: paved_leg }
    };
    mock_call(s.router, selector!("swap"), delta, 1);
}

/// A swap that takes less than the whole price reverts the purchase: the Vault has no use for the
/// unswapped USDC (P-56).
#[test]
#[should_panic(expected: 'Economy: partial fill')]
fn test_purchase_refuses_a_partial_fill() {
    let s = setup();
    mock_swap(
        s, i129 { mag: 1_999_999, sign: false }, i129 { mag: 100 * ONE_PAVED.low, sign: true },
    );
    buy(s, 1, PLAYER(), 1, Zero::zero());
}

#[test]
#[should_panic(expected: 'Economy: not the game')]
fn test_purchase_by_anyone_else_reverts() {
    let s = setup();
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
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
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 2, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: wrong day')]
fn test_purchase_for_another_day_reverts() {
    let s = setup();
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0 - 1, 1, BASE_PRICE, Zero::zero(), 0);
}

#[test]
#[should_panic(expected: 'Economy: price not paid')]
fn test_purchase_without_the_price_on_economy_reverts() {
    let s = setup();
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
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
fn test_record_before_expiry_enters_the_purchase_day() {
    let s = setup();
    buy(s, 1, PLAYER(), 3, Zero::zero());
    buy(s, 2, PLAYER(), 2, Zero::zero());
    buy(s, 3, PLAYER(), 5, Zero::zero());
    buy(s, 4, PLAYER(), 7, Zero::zero());
    let mut spy = spy_events();
    record(s, 1, 2_000);
    record(s, 2, 99); // under the min score
    record(s, 3, 50_000); // enters as 4 x the prior
    // After midnight, before its expiry (24 h after its purchase, an hour into DAY0)
    at(DAY0 + 1, 3599);
    record(s, 4, 5_000);
    let terms = s.economy.terms(4);
    assert!(terms.recorded && !terms.expired && !terms.settled);
    assert_eq!((terms.score, terms.day, terms.time), (5_000, DAY0, DAY0 * DAY + 3600));
    let event = Recorded { game_id: 4, score: 5_000, expired: false };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Recorded(event))]);
    // The day shows its sum once closed
    at(DAY0 + 2, 0);
    s.economy.settle(array![1].span());
    let day = s.economy.day(DAY0);
    assert_eq!((day.sum, day.weight), (3 * 2_000_000 + 5 * 4 * MEAN0.into() + 7 * 5_000_000, 15));
}

#[test]
fn test_record_at_expiry_earns_nothing_and_moves_no_mean() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    buy(s, 2, PLAYER(), 3, Zero::zero());
    record(s, 1, 6_000);
    // Exactly 24 h after its purchase
    at(DAY0 + 1, 3600);
    let mut spy = spy_events();
    record(s, 2, 9_000);
    let event = Recorded { game_id: 2, score: 9_000, expired: true };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Recorded(event))]);
    assert!(s.economy.terms(2).expired);
    at(DAY0 + 2, 0);
    assert_eq!(s.economy.settle(array![2].span()), 0);
    assert_eq!(s.paved.balance_of(PLAYER()), 0);
    let terms = s.economy.terms(2);
    assert!(terms.settled && terms.expired);
    assert_eq!(terms.reward, 0);
    // Only game 1 is in the day's mean and in the EMA
    let day = s.economy.day(DAY0);
    assert_eq!((day.sum, day.weight), (12_000_000, 2));
    let (ema, _) = s.economy.ema();
    assert_eq!(ema, Ema { sum: 100 * MEAN0.into() + 12_000_000, weight: 102 });
}

#[test]
fn test_record_after_the_close_is_expired_and_changes_no_mean() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    buy(s, 2, PLAYER(), 3, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 2, 0);
    s.economy.settle(array![1].span());
    let day = s.economy.day(DAY0);
    let ema = s.economy.ema();
    record(s, 2, 9_000);
    assert!(s.economy.terms(2).expired);
    assert_eq!(s.economy.day(DAY0), day);
    assert_eq!(s.economy.ema(), ema);
}

#[test]
fn test_day_hides_its_sum_weight_and_mean_until_it_closes() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 1, 0);
    let day = s.economy.day(DAY0);
    assert_eq!((day.prior, day.sum, day.weight, day.mean, day.closed), (MEAN0, 0, 0, 0, false));
    at(DAY0 + 2, 0);
    s.economy.settle(array![1].span());
    let day = s.economy.day(DAY0);
    let mean = (100 * MEAN0 + 12_000_000) / 102;
    assert_eq!(
        (day.prior, day.sum, day.weight, day.mean, day.closed), (MEAN0, 12_000_000, 2, mean, true),
    );
}

#[test]
#[should_panic(expected: 'Economy: not the game')]
fn test_record_by_anyone_else_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.record(1, 1_000);
}

#[test]
#[should_panic(expected: 'Economy: unknown game')]
fn test_record_of_a_game_never_purchased_reverts() {
    let s = setup();
    record(s, 1, 1_000);
}

#[test]
#[should_panic(expected: 'Economy: already recorded')]
fn test_record_twice_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    record(s, 1, 1_000);
    record(s, 1, 2_000);
}

// Settle

#[test]
fn test_settle_after_the_day_mints_once_to_the_player() {
    let s = setup();
    let r = buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 2, 0);
    let mut spy = spy_events();
    let minted = s.economy.settle(array![1].span());
    // The day's mean: (100 x prior + 2 x 6,000,000) / 102
    let mean: u64 = (100 * MEAN0 + 12_000_000) / 102;
    assert_eq!(s.economy.day(DAY0).mean, mean);
    let reward: u128 = (r.into() * 12_220_u256 * 6_000_000 / (mean.into() * 10_000))
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
    record(s, 1, 6_000);
    record(s, 2, 1_000);
    at(DAY0 + 2, 0);
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
    record(s, 1, 3_000);
    at(DAY0 + 2, 0);
    assert_eq!(s.economy.settle(array![1].span()), 0);
    assert_eq!(s.paved.balance_of(PLAYER()), 0);
    assert!(s.economy.terms(1).settled);
}

#[test]
#[should_panic(expected: 'Economy: day cannot close yet')]
fn test_settle_before_the_end_of_the_next_day_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    record(s, 1, 5_000);
    at(DAY0 + 2, 0);
    start_cheat_block_timestamp_global((DAY0 + 2) * DAY - 1);
    s.economy.settle(array![1].span());
}

#[test]
fn test_settle_at_the_end_of_the_next_day_passes() {
    let s = setup();
    let r = buy(s, 1, PLAYER(), 1, Zero::zero());
    record(s, 1, 7_000);
    start_cheat_block_timestamp_global((DAY0 + 2) * DAY);
    s.economy.settle(array![1].span());
    let mean = (100 * MEAN0 + 7_000_000) / 101;
    let reward = r.into() * 12_220_u256 * 7_000_000 / (mean.into() * 10_000);
    assert_eq!(s.paved.balance_of(PLAYER()), reward);
}

#[test]
fn test_days_can_close_out_of_order() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 1, 3600);
    // Day 1's prior is the EMA at its first purchase: day 0 is not closed yet
    buy(s, 2, PLAYER(), 3, Zero::zero());
    record(s, 2, 1_000);
    at(DAY0 + 3, 0);
    s.economy.settle(array![2].span());
    s.economy.settle(array![1].span());
    // Day 1: (100 x 3,980,000 + 3 x 1,000,000) / 103; day 0: (100 x 3,980,000 + 2 x 6,000,000) /
    // 102
    assert_eq!(s.economy.day(DAY0 + 1).mean, 3_893_203);
    assert_eq!(s.economy.day(DAY0).mean, 4_019_607);
    // The EMA took day 1's average first, then day 0's
    let (ema, mean) = s.economy.ema();
    assert_eq!(ema, Ema { sum: 100 * MEAN0.into() + 3 * 1_000_000 + 2 * 6_000_000, weight: 105 });
    assert_eq!(mean, 3_933_333);
}

#[test]
#[should_panic(expected: 'Economy: not recorded')]
fn test_settle_of_a_game_not_recorded_reverts() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    at(DAY0 + 2, 0);
    s.economy.settle(array![1].span());
}

#[test]
#[should_panic(expected: 'Economy: unknown game')]
fn test_settle_of_a_game_never_purchased_reverts() {
    let s = setup();
    at(DAY0 + 2, 0);
    s.economy.settle(array![1].span());
}

#[test]
fn test_settle_in_a_batch_skips_the_games_already_settled() {
    let s = setup();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    buy(s, 2, REFERRER(), 1, Zero::zero());
    record(s, 1, 9_000);
    record(s, 2, 9_000);
    at(DAY0 + 2, 0);
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
        burn_bps: 9_000,
        sigma_bps: -3_000,
        slope_bps: 1_000,
        cap: 1,
        target: 100_000 * PAVED,
        referral_bps: 1_000,
    };
    let mut spy = spy_events();
    configure(s, config);
    let event = EconomyConfigured {
        burn_bps: 9_000,
        sigma_bps: -3_000,
        slope_bps: 1_000,
        cap: 1,
        target: 100_000 * PAVED,
        referral_bps: 1_000,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::EconomyConfigured(event))]);
    assert_eq!(s.economy.config(), config);
    // At 90 % burned, the second purchase's margin is 10 % of its swap
    let before = vault_paved(s);
    let out = router_quote(s, 2_000_000);
    buy(s, 2, PLAYER(), 1, Zero::zero());
    assert_eq!(vault_paved(s) - before, out / 10);
    // Game 1 keeps its curve, game 2 has the new one
    let first = s.economy.terms(1);
    assert_eq!((first.sigma_bps, first.slope_bps, first.cap, first.reference), (0, 12_220, 5, r));
    let second = s.economy.terms(2);
    assert_eq!((second.sigma_bps, second.slope_bps, second.cap), (-3_000, 1_000, 1));
    // At a supply far above the new target, the factor is 0
    assert_eq!(second.reference, 0);
}

// The split (P-56): owner-set, the burn and the Vault adding up to the price

#[test]
fn test_decided_split_is_the_owners() {
    let s = setup();
    configure(s, decided());
    assert_eq!(s.economy.split_bps(), (7_368, 2_632, 500));
    // Without a referrer: 7,368 + 2,632 bps of the price swapped, burned and to the Vault by input
    let out = router_quote(s, 20_000_000);
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 10, Zero::zero());
    assert_eq!(usdc_reserve(s), 10_020 * USDC);
    assert_eq!(vault_paved(s), out * 5_264_000 / 20_000_000);
    assert_eq!(supply - s.paved.total_supply(), out - vault_paved(s));
    // With one: the same burn quote, the referral out of the Vault's part
    let quote = s.economy.quote(10);
    assert_eq!((quote.price, quote.burn_quote, quote.referral), (20 * USDC, 14_736_000, USDC));
    assert_eq!(quote.margin, 5_264_000);
    assert_nothing_left(s);
}

/// The burned PAVED is the same with and without a referrer, given the same pool: at a fixed rate
/// (no price impact) it is exactly equal, and R follows it (read at each purchase's own supply).
/// The burn's USDC is `burn_bps` of the price in both; the referral comes out of the Vault's part.
/// (In a real pool the referred swap is smaller, 95 % of the price, so its impact differs, and the
/// burned PAVED with it, by that impact only.)
#[test]
fn test_burned_paved_does_not_depend_on_the_referrer() {
    let s = setup();
    configure(s, decided());
    // 76 PAVED per USDC, from the initial supply's holder
    let rate: u128 = 76_000_000_000_000;
    let fixed = deploy(
        "FixedRateRouter",
        array![
            s.paved.contract_address.into(), s.usdc.contract_address.into(), RECIPIENT().into(),
            rate.into(),
        ],
    );
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.approve(fixed, 100_000 * ONE_PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_router(fixed);
    stop_cheat_caller_address(s.economy.contract_address);
    let mut stake: u8 = 1;
    while stake <= 10 {
        let price = stake.into() * BASE_PRICE;
        let quote = price * 7_368 / 10_000;
        // Without a referrer
        let supply = s.paved.total_supply();
        let vault = vault_paved(s);
        let r_none = buy(s, stake.into() * 2, PLAYER(), stake, Zero::zero());
        let after = s.paved.total_supply();
        let burned_none = supply - after;
        let factor = supply_factor(after, 1_000_000 * ONE_PAVED);
        assert_eq!(r_none, reference(guarded(burned_none, quote, POOL_RATE), stake, factor));
        let vault_none = vault_paved(s) - vault;
        // With one
        let supply = s.paved.total_supply();
        let vault = vault_paved(s);
        let r_referred = buy(s, stake.into() * 2 + 1, PLAYER(), stake, REFERRER());
        let after = s.paved.total_supply();
        let burned_referred = supply - after;
        let factor = supply_factor(after, 1_000_000 * ONE_PAVED);
        assert_eq!(
            r_referred, reference(guarded(burned_referred, quote, POOL_RATE), stake, factor),
        );
        let vault_referred = vault_paved(s) - vault;
        // The burn: exactly the burn quote at the rate, in both
        assert_eq!(burned_none, quote * rate.into());
        assert_eq!(burned_referred, burned_none);
        // The Vault pays the referral: its part is the rest of the swap
        assert_eq!(vault_none, (price - quote) * rate.into());
        assert_eq!(vault_referred, (price - quote - price / 20) * rate.into());
        // Nothing left on Economy, nor on the router
        assert_eq!(s.usdc.balance_of(s.economy.contract_address), 0);
        assert_eq!(s.paved.balance_of(s.economy.contract_address), 0);
        assert_eq!(s.usdc.balance_of(fixed), 0);
        assert_eq!(s.paved.balance_of(fixed), 0);
        stake += 1;
    }
}

/// The burn quote of a purchase is the same with or without a referrer: only the Vault's part pays
/// the referral.
#[test]
fn test_burn_quote_does_not_depend_on_the_referrer() {
    let s = setup();
    configure(s, decided());
    let mut spy = spy_events();
    buy(s, 1, PLAYER(), 4, Zero::zero());
    buy(s, 2, PLAYER(), 4, REFERRER());
    let mut quotes: Array<u256> = array![];
    for (_, event) in spy.get_events().emitted_by(s.economy.contract_address).events {
        if *event.keys.at(0) == selector!("Purchased") {
            // `burned_quote`: after day, stake, price (2), referrer, referral (2)
            quotes
                .append(
                    u256 {
                        low: (*event.data.at(7)).try_into().unwrap(),
                        high: (*event.data.at(8)).try_into().unwrap(),
                    },
                );
        }
    }
    assert_eq!(quotes.len(), 2);
    assert_eq!(*quotes.at(0), 8 * USDC * 7_368 / 10_000);
    assert_eq!(*quotes.at(1), *quotes.at(0));
    assert_eq!(s.usdc.balance_of(REFERRER()), 400_000);
}

#[test]
fn test_configure_the_split_at_its_bounds_and_its_event() {
    let s = setup();
    let ends: Array<(u16, u16)> = array![(5_000, 0), (5_000, 1_000), (9_000, 0), (9_000, 1_000)];
    for (burn_bps, referral_bps) in ends {
        let config = Config { burn_bps, referral_bps, ..decided() };
        let mut spy = spy_events();
        configure(s, config);
        let event = EconomyConfigured {
            burn_bps,
            sigma_bps: 0,
            slope_bps: 12_220,
            cap: 5,
            target: 1_000_000 * PAVED,
            referral_bps,
        };
        spy.assert_emitted(@array![(s.economy.contract_address, Event::EconomyConfigured(event))]);
        assert_eq!(s.economy.split_bps(), (burn_bps, 10_000 - burn_bps, referral_bps));
        // A purchase splits the price exactly: the referral, the swap, nothing left
        let reserve = usdc_reserve(s);
        let price = 7 * BASE_PRICE;
        let game_id: u32 = burn_bps.into() + referral_bps.into();
        let vault_before = vault_paved(s);
        buy(s, game_id, PLAYER(), 7, REFERRER());
        let referral = price * referral_bps.into() / 10_000;
        assert_eq!(usdc_reserve(s) - reserve, price - referral);
        // The Vault's PAVED: nothing when the referral takes the whole margin, else it grows
        if referral_bps == 10_000 - burn_bps {
            assert_eq!(vault_paved(s), vault_before);
        } else {
            assert!(vault_paved(s) > vault_before);
        }
        assert_nothing_left(s);
    }
    assert_eq!(s.usdc.balance_of(REFERRER()), 2 * 7 * BASE_PRICE * 1_000 / 10_000);
}

/// A configuration stored by the class before P-56 (no referral in its packed felt, the top bits
/// 0) reads back after the upgrade with the referral at its default, 500 bps, the constant it had;
/// the other fields unchanged. And the new packing round-trips a referral of 0.
#[test]
fn test_config_stored_before_the_referral_reads_it_at_its_default() {
    let s = setup();
    // The former packing: cap, slope, sigma (offset by 2^15), burn in the high part, the target low
    let mut high: u256 = 5;
    high = high * 0x100000000 + 12_220;
    high = high * 0x10000 + 0x8000 - 3_000;
    high = high * 0x10000 + 8_000;
    let target: u256 = (2_000_000 * PAVED).into();
    let packed: felt252 = (target + high * 0x100000000000000000000000000000000).try_into().unwrap();
    store(s.economy.contract_address, selector!("config"), array![packed].span());
    let config = s.economy.config();
    assert_eq!(
        config,
        Config {
            burn_bps: 8_000,
            sigma_bps: -3_000,
            slope_bps: 12_220,
            cap: 5,
            target: 2_000_000 * PAVED,
            referral_bps: 500,
        },
    );
    assert_eq!(s.economy.split_bps(), (8_000, 2_000, 500));
    configure(s, Config { referral_bps: 0, ..config });
    assert_eq!(s.economy.config().referral_bps, 0);
    assert_eq!(s.economy.split_bps(), (8_000, 2_000, 0));
}

#[test]
#[should_panic(expected: 'Economy: referral out of bounds')]
fn test_configure_a_referral_above_its_bound_reverts() {
    let s = setup();
    configure(s, Config { referral_bps: 1_001, ..decided() });
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
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
#[should_panic(expected: 'Ownable: caller is not owner')]
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
    assert_eq!(
        IOwnableDispatcher { contract_address: s.economy.contract_address }.owner(), OWNER(),
    );
}

#[test]
fn test_set_pool_takes_another_fee_on_the_same_tokens() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    let other = PoolKey { fee: 1, ..pool_key };
    let mut spy = spy_events();
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_pool(other, 7);
    assert_eq!(s.economy.pool(), (other, 7));
    let event = PoolSet { pool_key: other, sqrt_ratio_limit: 7 };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::PoolSet(event))]);
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
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_set_pool_by_anyone_else_reverts() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.set_pool(pool_key, 0);
}

// set_router (E-9)

/// A second `MockRouter` on the same pair, seeded from the recipient at the launch price.
fn deploy_router(s: Setup, paved_amount: u256, usdc_amount: u256) -> ContractAddress {
    let router = deploy(
        "MockRouter", array![s.paved.contract_address.into(), s.usdc.contract_address.into()],
    );
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(RECIPIENT(), usdc_amount);
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.approve(router, paved_amount);
    stop_cheat_caller_address(s.paved.contract_address);
    start_cheat_caller_address(s.usdc.contract_address, RECIPIENT());
    s.usdc.approve(router, usdc_amount);
    stop_cheat_caller_address(s.usdc.contract_address);
    let (amount0, amount1) = if s.paved.contract_address < s.usdc.contract_address {
        (paved_amount, usdc_amount)
    } else {
        (usdc_amount, paved_amount)
    };
    start_cheat_caller_address(router, RECIPIENT());
    IMockRouterDispatcher { contract_address: router }.add_liquidity(amount0, amount1);
    stop_cheat_caller_address(router);
    router
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_set_router_by_anyone_else_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, SOMEONE());
    s.economy.set_router(SOMEONE());
}

#[test]
#[should_panic(expected: 'Economy: zero address')]
fn test_set_router_to_zero_reverts() {
    let s = setup();
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_router(Zero::zero());
}

#[test]
fn test_set_router_emits_the_previous_and_the_new_router() {
    let s = setup();
    assert_eq!(s.economy.router(), s.router);
    let mut spy = spy_events();
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_router(SOMEONE());
    stop_cheat_caller_address(s.economy.contract_address);
    let event = RouterSet { previous: s.router, router: SOMEONE() };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::RouterSet(event))]);
    assert_eq!(s.economy.router(), SOMEONE());
    assert_eq!(s.economy.addresses().router, SOMEONE());
}

#[test]
fn test_set_router_moves_quotes_and_purchases_to_the_new_router() {
    let s = setup();
    // A thinner pool at the same price: its quote is lower
    let other = deploy_router(s, 100_000 * ONE_PAVED, 1_250 * USDC);
    let before = s.economy.quote_swap(14_000_000);
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_router(other);
    stop_cheat_caller_address(s.economy.contract_address);
    let quoted = s.economy.quote_swap(14_000_000);
    assert!(quoted < before);
    assert_eq!(quoted, router_quote_at(s, other, 14_000_000));
    // The purchase swaps the burn quote and the margin through the new router only
    let quoted = s.economy.quote_swap(20_000_000);
    let old_reserves = IMockRouterDispatcher { contract_address: s.router }.reserves();
    let (new0, new1) = IMockRouterDispatcher { contract_address: other }.reserves();
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 10, Zero::zero());
    assert_eq!(supply - s.paved.total_supply() + vault_paved(s), quoted);
    assert_eq!(IMockRouterDispatcher { contract_address: s.router }.reserves(), old_reserves);
    let (paved_in, usdc_in) = if s.paved.contract_address < s.usdc.contract_address {
        (new0 - quoted, new1 + 20 * USDC)
    } else {
        (new1 - quoted, new0 + 20 * USDC)
    };
    let (after0, after1) = IMockRouterDispatcher { contract_address: other }.reserves();
    let (paved_after, usdc_after) = if s.paved.contract_address < s.usdc.contract_address {
        (after0, after1)
    } else {
        (after1, after0)
    };
    assert_eq!((paved_after, usdc_after), (paved_in, usdc_in));
    assert_eq!(s.usdc.balance_of(s.economy.contract_address), 0);
    assert_eq!(s.paved.balance_of(other), paved_after);
}

// Views

#[test]
fn test_quote_shows_the_split_and_the_curve() {
    let s = setup();
    let quote = s.economy.quote(5);
    assert_eq!(quote.price, 10 * USDC);
    assert_eq!((quote.burn_quote, quote.referral, quote.margin), (7 * USDC, 500_000, 3 * USDC));
    assert_eq!(quote.min_out_hint, 9_500_000 * POOL_RATE * 99 / (100 * RATE_SCALE));
    // The pool's 800,000 PAVED count in the supply: 1,000,000, the target
    assert_eq!(quote.factor, 10_000);
    assert_eq!((quote.mean, quote.threshold, quote.slope, quote.cap), (MEAN0, MEAN0, 12_220, 5));
}

// The router: what the swap paid, the rate's clamp, the quotes

/// Sends `amount` PAVED from the initial supply to `to`.
fn send_paved(s: Setup, to: ContractAddress, amount: u256) {
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(to, amount);
    stop_cheat_caller_address(s.paved.contract_address);
}

#[test]
fn test_paved_on_the_router_before_a_purchase_does_not_count_in_r() {
    let s = setup();
    send_paved(s, s.router, 50 * ONE_PAVED);
    let quote: u256 = 14 * USDC;
    let swap_out = router_quote(s, 20_000_000);
    let (burn_part, to_vault) = vault_split(swap_out, quote, 6 * USDC);
    let supply = s.paved.total_supply();
    let mut spy = spy_events();
    let r = buy(s, 1, PLAYER(), 10, Zero::zero());
    let after = s.paved.total_supply();
    // The 50 PAVED are burned with the purchase, but R, the rate and the Vault's part follow the
    // swap alone
    assert_eq!(supply - after, burn_part + 50 * ONE_PAVED);
    assert_eq!(vault_paved(s), to_vault);
    let factor = supply_factor(after, 1_000_000 * ONE_PAVED);
    assert_eq!(r, reference(guarded(burn_part, quote, POOL_RATE), 10, factor));
    assert_eq!(s.economy.rate(), next_rate(POOL_RATE, burn_part, quote));
    // The event reports what was burned, the 50 PAVED included
    let event = Purchased {
        game_id: 1,
        player_id: PLAYER().into(),
        day: DAY0,
        stake: 10,
        price: 20 * USDC,
        referrer: Zero::zero(),
        referral: 0,
        burned_quote: quote,
        burned: burn_part + 50 * ONE_PAVED,
        margin: 6 * USDC,
        supply: after,
        factor,
        reference: r,
        vault_paved: to_vault,
    };
    spy.assert_emitted(@array![(s.economy.contract_address, Event::Purchased(event))]);
    assert_nothing_left(s);
}

#[test]
fn test_one_purchase_moves_the_rate_down_by_at_most_the_clamp() {
    let s = setup();
    // Someone buys 5,000 USDC of PAVED: PAVED gets much dearer, a purchase gets far less
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(s.router, 5_000 * USDC);
    let pool_key = IMockRouterDispatcher { contract_address: s.router }.pool_key();
    start_cheat_caller_address(s.router, RECIPIENT());
    IRouterDispatcher { contract_address: s.router }
        .swap(
            RouteNode { pool_key, sqrt_ratio_limit: 0, skip_ahead: 0 },
            TokenAmount {
                token: s.usdc.contract_address, amount: i129 { mag: 5_000_000_000, sign: false },
            },
        );
    IClearDispatcher { contract_address: s.router }.clear(s.paved.contract_address);
    stop_cheat_caller_address(s.router);
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 1, Zero::zero());
    let observed = (supply - s.paved.total_supply()) * RATE_SCALE / 1_400_000;
    assert!(vault_paved(s) > 0);
    assert!(observed < POOL_RATE * 10 / 11);
    assert_eq!(s.economy.rate(), (POOL_RATE * 31 + POOL_RATE * 10 / 11) / 32);
}

#[test]
#[should_panic(expected: 'Economy: swap below min_out')]
fn test_paved_on_the_router_does_not_let_a_swap_below_min_out_pass() {
    let s = setup();
    // The router's balance covers min_out, the swap alone does not
    send_paved(s, s.router, 1_000 * ONE_PAVED);
    let min_out = s.economy.quote_swap(2_000_000) + 1;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, Zero::zero(), min_out);
}

#[test]
fn test_rate_moves_at_most_once_per_block() {
    let s = setup();
    let quote: u256 = 1_400_000;
    // Two purchases in the same block: the first moves the rate, the second does not. The rate
    // reads the burn's part of the swap of the whole price
    let (out, _) = vault_split(s.economy.quote_swap(2_000_000), quote, 600_000);
    buy(s, 1, PLAYER(), 1, Zero::zero());
    let once = next_rate(POOL_RATE, out, quote);
    assert_eq!(s.economy.rate(), once);
    buy(s, 2, PLAYER(), 1, Zero::zero());
    assert_eq!(s.economy.rate(), once);
    // The next block moves it again
    at(DAY0, 3601);
    let (out, _) = vault_split(s.economy.quote_swap(2_000_000), quote, 600_000);
    buy(s, 3, PLAYER(), 1, Zero::zero());
    assert_eq!(s.economy.rate(), next_rate(once, out, quote));
}

#[test]
fn test_quote_min_out_hint_is_not_above_the_swap_output_at_launch() {
    let s = setup();
    let mut stake: u8 = 1;
    while stake <= 10 {
        let quote = s.economy.quote(stake);
        let swap = quote.burn_quote + quote.margin - quote.referral;
        let out = router_quote(s, swap.try_into().unwrap());
        assert!(quote.min_out_hint <= out);
        stake += 1;
    }
}

#[test]
fn test_quote_swap_is_the_router_quote() {
    let s = setup();
    assert_eq!(s.economy.quote_swap(1_400_000), router_quote(s, 1_400_000));
    assert_eq!(s.economy.quote_swap(14_000_000), router_quote(s, 14_000_000));
    // The launch pool's figure, unchanged from the mock's former `quote` (MockRouter tests)
    assert_eq!(s.economy.quote_swap(1_400_000), 106_385_850_681_859_312_711);
}

#[test]
fn test_quote_swap_is_the_paved_bought() {
    let s = setup();
    // The swap of the whole price: its burn's part burned, its margin's part in the Vault
    let out = s.economy.quote_swap(20_000_000);
    let supply = s.paved.total_supply();
    buy(s, 1, PLAYER(), 10, Zero::zero());
    assert_eq!(supply - s.paved.total_supply() + vault_paved(s), out);
}

#[test]
#[feature("safe_dispatcher")]
fn test_quote_swap_follows_set_pool() {
    let s = setup();
    let (pool_key, _) = s.economy.pool();
    let mut other = pool_key;
    other.fee = 0;
    start_cheat_caller_address(s.economy.contract_address, OWNER());
    s.economy.set_pool(other, 0);
    stop_cheat_caller_address(s.economy.contract_address);
    // The mock serves one pool: the quote goes through the stored key, so it is refused
    let safe = IEconomySafeDispatcher { contract_address: s.economy.contract_address };
    match safe.quote_swap(1_400_000) {
        Result::Ok(_) => panic!("a quote through another pool was served"),
        Result::Err(data) => assert_eq!(*data.at(0), 'MockRouter: wrong pool'),
    }
}

/// The router's next `quote_swap` answers these legs (a test double of a router that fills part
/// of the input, or reports a wrong sign).
fn mock_quote(s: Setup, usdc_leg: i129, paved_leg: i129) {
    let delta = if s.paved.contract_address < s.usdc.contract_address {
        Delta { amount0: paved_leg, amount1: usdc_leg }
    } else {
        Delta { amount0: usdc_leg, amount1: paved_leg }
    };
    mock_call(s.router, selector!("quote_swap"), delta, 1);
}

#[test]
#[should_panic(expected: 'Economy: partial fill')]
fn test_quote_swap_refuses_a_partial_fill() {
    let s = setup();
    let usdc_leg = i129 { mag: 1_399_999, sign: false };
    mock_quote(s, usdc_leg, i129 { mag: 100 * ONE_PAVED.low, sign: true });
    s.economy.quote_swap(1_400_000);
}

#[test]
#[should_panic(expected: 'Economy: partial fill')]
fn test_quote_swap_refuses_a_usdc_leg_paid_out() {
    let s = setup();
    let usdc_leg = i129 { mag: 1_400_000, sign: true };
    mock_quote(s, usdc_leg, i129 { mag: 100 * ONE_PAVED.low, sign: true });
    s.economy.quote_swap(1_400_000);
}

#[test]
#[should_panic(expected: 'Economy: wrong delta')]
fn test_quote_swap_refuses_a_paved_leg_paid_in() {
    let s = setup();
    let usdc_leg = i129 { mag: 1_400_000, sign: false };
    mock_quote(s, usdc_leg, i129 { mag: 100 * ONE_PAVED.low, sign: false });
    s.economy.quote_swap(1_400_000);
}

#[test]
fn test_quote_swap_of_a_full_fill_is_unchanged_through_the_mock() {
    let s = setup();
    // A full fill quotes the PAVED out; a zero output (1 base unit, all fee) quotes 0, no revert
    assert_eq!(s.economy.quote_swap(1_400_000), 106_385_850_681_859_312_711);
    assert_eq!(s.economy.quote_swap(1), 0);
    assert_eq!(s.economy.quote_swap(0), 0);
}

#[test]
fn test_purchase_at_99_percent_of_quote_swap_passes() {
    let s = setup();
    let min_out = s.economy.quote_swap(20_000_000) * 99 / 100;
    IFaucetDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.economy.contract_address, 10 * BASE_PRICE);
    start_cheat_caller_address(s.economy.contract_address, DAILY());
    s.economy.purchase(1, PLAYER(), DAY0, 10, 10 * BASE_PRICE, Zero::zero(), min_out);
    stop_cheat_caller_address(s.economy.contract_address);
    assert_nothing_left(s);
}

// Coverage T1 (docs/measures/coverage.md): what settlement and the quotes read, the router's
// legs, the constructor and the first operand of the game guard

/// A curve unlike the decided one in its sigma, slope and cap.
fn other_curve() -> Config {
    Config { sigma_bps: -3_000, slope_bps: 1_000, cap: 1, ..decided() }
}

/// `settle` reads the curve that the purchase froze in the game's terms, not today's `config`: game
/// 1 is bought before a `configure`, game 2 after, and each is paid and reported with its own.
#[test]
fn test_settle_pays_with_the_curve_frozen_at_purchase() {
    let s = setup();
    let r1 = buy(s, 1, PLAYER(), 2, Zero::zero());
    configure(s, other_curve());
    let r2 = buy(s, 2, SOMEONE(), 2, Zero::zero());
    assert_eq!((s.economy.terms(1).sigma_bps, s.economy.terms(1).slope_bps), (0, 12_220));
    assert_eq!((s.economy.terms(2).sigma_bps, s.economy.terms(2).slope_bps), (-3_000, 1_000));
    record(s, 1, 6_000);
    record(s, 2, 6_000);
    at(DAY0 + 2, 0);
    let mut spy = spy_events();
    let minted = s.economy.settle(array![1, 2].span());
    // The day's mean: (100 x prior + 4 x 6,000,000) / 104, two games of stake 2
    let mean: u64 = (100 * MEAN0 + 24_000_000) / 104;
    assert_eq!(s.economy.day(DAY0).mean, mean);
    // Game 1 with the curve of its purchase (cap 5), game 2 with the new one (cap 1)
    let first = payout(r1, 6_000, threshold(mean, 0), 12_220, 5);
    let second = payout(r2, 6_000, threshold(mean, -3_000), 1_000, 1);
    assert!(first > 0 && second > 0);
    assert_eq!(s.economy.terms(1).reward, first);
    assert_eq!(s.economy.terms(2).reward, second);
    assert_eq!(s.paved.balance_of(PLAYER()), first.into());
    assert_eq!(s.paved.balance_of(SOMEONE()), second.into());
    let total: u256 = first.into() + second.into();
    assert_eq!(minted, total);
    // The configuration of the day of the settlement would have paid game 1 otherwise
    assert!(payout(r1, 6_000, threshold(mean, -3_000), 1_000, 1) != first);
    let settled_1 = Settled {
        game_id: 1,
        player_id: PLAYER().into(),
        day: DAY0,
        score: 6_000,
        threshold: mean,
        reward: first,
    };
    let settled_2 = Settled {
        game_id: 2,
        player_id: SOMEONE().into(),
        day: DAY0,
        score: 6_000,
        threshold: threshold(mean, -3_000),
        reward: second,
    };
    assert_eq!(settled_2.threshold, mean * 7 / 10);
    spy
        .assert_emitted(
            @array![
                (s.economy.contract_address, Event::Settled(settled_1)),
                (s.economy.contract_address, Event::Settled(settled_2)),
            ],
        );
}

/// A batch returns what it minted: the sum of every paying game's reward, not the last one's.
#[test]
fn test_settle_returns_the_sum_of_a_batch() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    buy(s, 2, SOMEONE(), 3, Zero::zero());
    record(s, 1, 6_000);
    record(s, 2, 9_000);
    at(DAY0 + 2, 0);
    let supply = s.paved.total_supply();
    let minted = s.economy.settle(array![1, 2].span());
    let first = s.paved.balance_of(PLAYER());
    let second = s.paved.balance_of(SOMEONE());
    assert!(first > 0 && second > 0);
    assert_eq!(first, s.economy.terms(1).reward.into());
    assert_eq!(second, s.economy.terms(2).reward.into());
    assert_eq!(minted, first + second);
    assert_eq!(s.paved.total_supply() - supply, minted);
}

/// The same game twice in one batch pays once: the first pass writes SETTLED, the second skips it.
#[test]
fn test_settle_the_same_game_twice_in_one_batch_pays_once() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 2, 0);
    let supply = s.paved.total_supply();
    let minted = s.economy.settle(array![1, 1].span());
    let reward: u256 = s.economy.terms(1).reward.into();
    assert!(reward > 0);
    assert_eq!(minted, reward);
    assert_eq!(s.paved.balance_of(PLAYER()), reward);
    assert_eq!(s.paved.total_supply() - supply, reward);
}

/// A day that has a prior quotes it as its mean, though the EMA has moved since: game 2 is bought
/// on `DAY0 + 2` (prior `MEAN0`), then day 0 closes and the EMA moves.
#[test]
fn test_quote_uses_todays_prior_not_the_moved_ema() {
    let s = setup();
    buy(s, 1, PLAYER(), 2, Zero::zero());
    record(s, 1, 6_000);
    at(DAY0 + 2, 3600);
    buy(s, 2, SOMEONE(), 1, Zero::zero());
    assert_eq!(s.economy.day(DAY0 + 2).prior, MEAN0);
    s.economy.settle(array![1].span());
    let (_, ema_mean) = s.economy.ema();
    assert_eq!(ema_mean, (100 * MEAN0 + 12_000_000) / 102);
    assert!(ema_mean != MEAN0);
    let quote = s.economy.quote(1);
    assert_eq!(quote.mean, MEAN0);
    assert_eq!(quote.threshold, MEAN0);
}

/// The quote's cliff follows the configured sigma, and its factor the supply against the target.
#[test]
fn test_quote_threshold_follows_sigma() {
    let s = setup();
    configure(s, Config { sigma_bps: -3_000, ..decided() });
    let quote = s.economy.quote(1);
    assert_eq!(quote.mean, MEAN0);
    assert_eq!(quote.threshold, threshold(MEAN0, -3_000));
    assert_eq!(quote.threshold, 2_786_000);
    // After a burn the supply is under the target: the factor is above 1x
    buy(s, 1, PLAYER(), 10, Zero::zero());
    let quote = s.economy.quote(1);
    let factor = supply_factor(s.paved.total_supply(), 1_000_000 * ONE_PAVED);
    assert_eq!(quote.factor, factor);
    assert!(factor > 10_000 && factor < 20_000);
}

/// A router that reports the USDC leg as paid out (not paid in) is refused as a partial fill.
#[test]
#[should_panic(expected: 'Economy: partial fill')]
fn test_purchase_refuses_a_usdc_leg_paid_out() {
    let s = setup();
    mock_swap(
        s, i129 { mag: 2_000_000, sign: true }, i129 { mag: 100 * ONE_PAVED.low, sign: true },
    );
    buy(s, 1, PLAYER(), 1, Zero::zero());
}

/// A quote of a zero PAVED leg, with the sign of an input, is 0.
#[test]
fn test_quote_swap_of_a_zero_paved_leg_paid_in_is_zero() {
    let s = setup();
    mock_quote(s, i129 { mag: 1_400_000, sign: false }, i129 { mag: 0, sign: false });
    assert_eq!(s.economy.quote_swap(1_400_000), 0);
}

/// The Economy's calldata at the launch rate, the addresses given.
fn economy_calldata(
    s: Setup,
    owner: ContractAddress,
    paved: ContractAddress,
    usdc: ContractAddress,
    vault: ContractAddress,
    router: ContractAddress,
) -> Array<felt252> {
    let (pool_key, _) = s.economy.pool();
    let mut calldata: Array<felt252> = array![
        owner.into(), paved.into(), usdc.into(), vault.into(), router.into(),
    ];
    pool_key.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    decided().serialize(ref calldata);
    MEAN0.serialize(ref calldata);
    POOL_RATE.serialize(ref calldata);
    calldata
}

/// A zero owner, PAVED, USDC, Vault or router is refused, each in turn (a zero Vault would send the
/// margin's PAVED to address 0).
#[test]
fn test_constructor_refuses_a_zero_address() {
    let s = setup();
    let class = declare("Economy").unwrap().contract_class();
    let zero: ContractAddress = Zero::zero();
    let (paved, usdc) = (s.paved.contract_address, s.usdc.contract_address);
    let calls = array![
        economy_calldata(s, zero, paved, usdc, s.vault, s.router),
        economy_calldata(s, OWNER(), zero, usdc, s.vault, s.router),
        economy_calldata(s, OWNER(), paved, zero, s.vault, s.router),
        economy_calldata(s, OWNER(), paved, usdc, zero, s.router),
        economy_calldata(s, OWNER(), paved, usdc, s.vault, zero),
    ];
    for calldata in calls {
        match class.deploy(@calldata) {
            Result::Ok(_) => panic!("a zero address was accepted"),
            Result::Err(data) => assert_eq!(*data.at(0), 'Economy: zero address'),
        }
    }
    // The same calldata with none zero deploys
    class.deploy(@economy_calldata(s, OWNER(), paved, usdc, s.vault, s.router)).unwrap();
}

/// Before `set_game` the game is the zero address, and the zero caller is not it: a zero game with
/// a zero caller would otherwise match.
#[test]
#[feature("safe_dispatcher")]
fn test_purchase_before_set_game_reverts_for_zero() {
    let s = setup();
    let class = declare("Economy").unwrap().contract_class();
    let (paved, usdc) = (s.paved.contract_address, s.usdc.contract_address);
    let (address, _) = class
        .deploy(@economy_calldata(s, OWNER(), paved, usdc, s.vault, s.router))
        .unwrap();
    let zero: ContractAddress = Zero::zero();
    assert_eq!(IEconomyDispatcher { contract_address: address }.addresses().game, zero);
    IFaucetDispatcher { contract_address: usdc }.mint(address, BASE_PRICE);
    start_cheat_caller_address(address, zero);
    let safe = IEconomySafeDispatcher { contract_address: address };
    match safe.purchase(1, PLAYER(), DAY0, 1, BASE_PRICE, zero, 0) {
        Result::Ok(_) => panic!("a purchase by the zero caller passed"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Economy: not the game'),
    }
    match safe.record(1, 1_000) {
        Result::Ok(_) => panic!("a record by the zero caller passed"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Economy: not the game'),
    }
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

/// From the script (`fixture.py --margin-paved`, sim.py's formulas): (PAVED bought for the burn,
/// R, payout), base units.
fn expected() -> Array<(u256, u256, u256)> {
    array![
        (106379787840310345728, 107455015544567005184, 134178676563367329792),
        (318902897022788501504, 328609676530136317952, 0),
        (1060391014664822063104, 1168163050677178073088, 4376042514788354359296),
        (528662245775446638592, 556213506597038784512, 0),
        (211184798405037162496, 215887890445736280064, 0),
        (421882027416415698944, 437939983316764983296, 647230043599002140672),
        (736779441718533423104, 787466285302996271104, 1745690702785477345280),
        (105095243286348578816, 106037826425674858496, 0),
        (629732858941959962624, 667255690634294329344, 0),
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
    // The launch rate after the fee: the guard never binds on a pool that only gets bought from
    let s = setup_with(POOL_RATE);
    let mut bought: Array<u256> = array![];
    let mut references: Array<u256> = array![];
    // The second day of games is two days later, so that the first one is settled before its
    // purchases, as sim.py does
    for d in 0..2_u64 {
        at(DAY0 + 2 * d, 3600);
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
                record(s, game_id, score);
            }
        }
    }
    at(DAY0 + 4, 0);
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
    // The day means and the EMA (sim: 4,893.103448, 4,961.104617; EMA after 4,952.985075); the
    // EMA is 1 milli-point under sim's, as the integer EMA rounds down at each step
    assert_eq!(s.economy.day(DAY0).mean, 4_893_103);
    assert_eq!(s.economy.day(DAY0 + 2).mean, 4_961_104);
    let (_, mean) = s.economy.ema();
    assert_eq!(mean, 4_952_984);
}
