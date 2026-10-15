//! Cobbles v1, part 2 (P-61, `docs/architecture/cobbles-v1.md`, 2, 7.1, 7.2, 7.4): the packs,
//! through the real contracts (`Setup`, `Economy`, `Challenge`, `PavedToken`, `Vault`,
//! `MockRouter`, the USDC `Faucet`), wired as `scripts/deploy.sh` wires them, `Economy`'s seller
//! `Setup`. The packing of a pack, the owner's `set_pack`, `buy_pack` end to end (the player's USDC
//! through the game's split, the cobbles credited, nothing left on `Setup` or `Economy`), its
//! referral, its refusals, and the audit properties of 7.5 that part 2 carries, each in a test
//! named after it: A1 (cobbles by a purchase only with its price paid), A3 (for the caller only),
//! A4 (no cobble spent in part 2), A6 (the owner's packs), A9 (a pack's split is the game's) and
//! A10 (the price is the owner's). `economy::sell` tests `Economy.sell` on its own.

use core::num::traits::{Bounded, Zero};
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::systems::economy::{
    IEconomyDispatcher, IEconomyDispatcherTrait, IEconomySafeDispatcher,
    IEconomySafeDispatcherTrait,
};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupCobblesSafeDispatcher,
    ISetupCobblesSafeDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupPacksDispatcher, ISetupPacksDispatcherTrait, ISetupPacksSafeDispatcher,
    ISetupPacksSafeDispatcherTrait, Pack, PackPacking, Setup,
};
use paved::tests::economy::sell::{Split, last_split};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, NOONE, OWNER, PLAYER, SOMEONE, USDC,
};
use paved::types::mode::Mode;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

/// Day 14, 100 s in.
const DAY_14: u64 = 14 * 86400 + 100;

/// The owner's four packs (cobbles-v1.md, 2.1): `id cobbles price`.
fn fresh_packs() -> Array<(u8, u32, u128)> {
    array![(1, 50, 5_000_000), (2, 100, 9_000_000), (3, 500, 40_000_000), (4, 1000, 70_000_000)]
}

#[derive(Drop)]
pub struct Shop {
    pub systems: setup::Systems,
    pub packs: ISetupPacksDispatcher,
    pub usdc: IERC20Dispatcher,
    pub paved: IERC20Dispatcher,
    pub vault: ContractAddress,
    pub router: ContractAddress,
}

/// The systems on `DAY_14`, `Economy.set_seller(Setup)` and the four packs set, as `deploy.sh`
/// does.
pub fn shop() -> Shop {
    start_cheat_block_timestamp_global(DAY_14);
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let economy = systems.economy.contract_address;
    start_cheat_caller_address(economy, OWNER());
    systems.economy.set_seller(setup_address);
    stop_cheat_caller_address(economy);
    let packs = ISetupPacksDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    for (id, cobbles, price) in fresh_packs() {
        packs.set_pack(id, cobbles, price, true);
    }
    stop_cheat_caller_address(setup_address);
    let addresses = systems.economy.addresses();
    Shop {
        packs,
        usdc: IERC20Dispatcher { contract_address: context.token.contract_address },
        paved: IERC20Dispatcher { contract_address: addresses.paved },
        vault: addresses.vault,
        router: addresses.router,
        systems,
    }
}

/// `who` approves `Setup` for `amount` USDC (the players hold the faucet's 1,000 USDC).
fn approve(s: @Shop, who: ContractAddress, amount: u256) {
    let usdc = *s.usdc.contract_address;
    start_cheat_caller_address(usdc, who);
    s.usdc.approve(*s.packs.contract_address, amount);
    stop_cheat_caller_address(usdc);
}

/// `who` buys `pack_id` for itself, its price approved first.
pub fn buy(s: @Shop, who: ContractAddress, pack_id: u8, referrer: ContractAddress) {
    let pack = s.packs.pack(pack_id);
    approve(s, who, pack.price.into());
    let setup_address = *s.packs.contract_address;
    start_cheat_caller_address(setup_address, who);
    s.packs.buy_pack(pack_id, referrer, 0);
    stop_cheat_caller_address(setup_address);
}

pub fn cobbles_of(s: @Shop, who: ContractAddress) -> u64 {
    ISetupCobblesDispatcher { contract_address: *s.packs.contract_address }
        .account(who.into())
        .cobbles
}

fn safe(s: @Shop) -> ISetupPacksSafeDispatcher {
    ISetupPacksSafeDispatcher { contract_address: *s.packs.contract_address }
}

pub fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => 'no error',
        Result::Err(panic) => *panic.at(0),
    }
}

/// `Economy` and `Setup` hold no USDC and no PAVED.
fn assert_nothing_held(s: @Shop) {
    let economy = *s.systems.economy.contract_address;
    let setup_address = *s.packs.contract_address;
    assert_eq!(s.usdc.balance_of(economy), 0);
    assert_eq!(s.paved.balance_of(economy), 0);
    assert_eq!(s.usdc.balance_of(setup_address), 0);
    assert_eq!(s.paved.balance_of(setup_address), 0);
}

// Packing (7.1)

fn round_trip(value: Pack) {
    assert_eq!(PackPacking::unpack(PackPacking::pack(value)), value);
}

#[test]
fn test_packs_packing_round_trips_at_zero_one_and_maximum() {
    round_trip(Default::default());
    round_trip(Pack { cobbles: 1, price: 1, active: true });
    round_trip(Pack { cobbles: Bounded::MAX, price: Bounded::MAX, active: true });
    round_trip(Pack { cobbles: Bounded::MAX, price: Bounded::MAX, active: false });
    round_trip(Pack { cobbles: 0, price: Bounded::MAX, active: false });
    round_trip(Pack { cobbles: Bounded::MAX, price: 0, active: false });
}

// The owner's packs (2.2, A6)

#[test]
#[feature("safe_dispatcher")]
fn test_a6_set_pack_by_the_owner_within_its_bounds_and_its_event() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    // [Check] The four packs of the fresh deployment
    for (id, cobbles, price) in fresh_packs() {
        assert_eq!(s.packs.pack(id), Pack { cobbles, price, active: true });
    }
    assert_eq!(s.packs.pack(5), Default::default());
    // [Check] The owner only
    start_cheat_caller_address(setup_address, PLAYER());
    assert_eq!(error_of(safe(@s).set_pack(5, 10, 1, true)), 'Ownable: caller is not owner');
    // [Check] Ids 1 to 8, cobbles and price non-zero, whether active or not
    start_cheat_caller_address(setup_address, OWNER());
    assert_eq!(error_of(safe(@s).set_pack(0, 10, 1, true)), 'Setup: invalid pack');
    assert_eq!(error_of(safe(@s).set_pack(9, 10, 1, true)), 'Setup: invalid pack');
    assert_eq!(error_of(safe(@s).set_pack(5, 0, 1, true)), 'Setup: invalid pack');
    assert_eq!(error_of(safe(@s).set_pack(5, 10, 0, false)), 'Setup: invalid pack');
    // [Check] The bounds themselves, and the event
    let mut spy = spy_events();
    s.packs.set_pack(8, Bounded::MAX, Bounded::MAX, false);
    s.packs.set_pack(2, 120, 9_000_000, false);
    spy
        .assert_emitted(
            @array![
                (
                    setup_address,
                    Setup::Event::PackSet(
                        Setup::PackSet {
                            pack_id: 8, cobbles: Bounded::MAX, price: Bounded::MAX, active: false,
                        },
                    ),
                ),
                (
                    setup_address,
                    Setup::Event::PackSet(
                        Setup::PackSet {
                            pack_id: 2, cobbles: 120, price: 9_000_000, active: false,
                        },
                    ),
                ),
            ],
        );
    assert_eq!(s.packs.pack(2), Pack { cobbles: 120, price: 9_000_000, active: false });
    stop_cheat_caller_address(setup_address);
}

// The purchase, end to end (7.2)

/// The player's price leaves it for `Economy`, whose sale burns, pays the Vault and keeps nothing;
/// `Setup` holds nothing; the cobbles are credited; `PackBought` and `Sold` in the same call.
#[test]
fn test_buy_pack_end_to_end() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let economy = s.systems.economy.contract_address;
    for (id, cobbles, price) in fresh_packs() {
        let usdc_before = s.usdc.balance_of(PLAYER());
        let vault_before = s.paved.balance_of(s.vault);
        let supply_before = s.paved.total_supply();
        let balance_before = cobbles_of(@s, PLAYER());
        let mut spy = spy_events();
        buy(@s, PLAYER(), id, Zero::zero());
        let sold = last_split(ref spy, economy, false);
        let balance = balance_before + cobbles.into();
        spy
            .assert_emitted(
                @array![
                    (
                        setup_address,
                        Setup::Event::PackBought(
                            Setup::PackBought {
                                player_id: PLAYER().into(),
                                pack_id: id,
                                cobbles,
                                price,
                                referrer: Zero::zero(),
                                balance,
                            },
                        ),
                    ),
                ],
            );
        assert_eq!(usdc_before - s.usdc.balance_of(PLAYER()), price.into());
        assert_eq!(cobbles_of(@s, PLAYER()), balance);
        assert_eq!(sold.price, price.into());
        assert_eq!(sold.referral, 0);
        assert_eq!(s.paved.balance_of(s.vault) - vault_before, sold.vault_paved);
        assert!(sold.vault_paved > 0);
        assert_eq!(supply_before - s.paved.total_supply(), sold.burned);
        assert_eq!(sold.supply, s.paved.total_supply());
        assert_nothing_held(@s);
    }
    assert_eq!(cobbles_of(@s, PLAYER()), 1650);
}

/// A referrer that counts gets 5 % of the price in USDC, in the same call (P-56, as for a game);
/// `PackBought` names it.
#[test]
fn test_buy_pack_with_a_referrer_pays_it_five_percent() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let mut spy = spy_events();
    buy(@s, PLAYER(), 4, NOONE());
    assert_eq!(s.usdc.balance_of(NOONE()) - setup::FUNDS, 3_500_000);
    let sold = last_split(ref spy, s.systems.economy.contract_address, false);
    assert_eq!(sold.referrer, NOONE());
    assert_eq!(sold.referral, 3_500_000);
    spy
        .assert_emitted(
            @array![
                (
                    setup_address,
                    Setup::Event::PackBought(
                        Setup::PackBought {
                            player_id: PLAYER().into(),
                            pack_id: 4,
                            cobbles: 1000,
                            price: 70_000_000,
                            referrer: NOONE(),
                            balance: 1000,
                        },
                    ),
                ),
            ],
        );
    assert_nothing_held(@s);
}

/// The referrers a pack ignores, with no revert: the buyer, `Setup` and `Economy` (filtered by
/// `Setup`), the game, the Vault and the router (filtered by `Economy`). No referral is paid and
/// `PackBought` names none.
#[test]
fn test_buy_pack_ignores_the_referrers_the_game_ignores_and_setup() {
    let s = shop();
    let ignored = array![
        PLAYER(), s.packs.contract_address, s.systems.economy.contract_address,
        s.systems.challenge.contract_address, s.vault, s.router,
    ];
    for referrer in ignored {
        let usdc_before = s.usdc.balance_of(referrer);
        let mut spy = spy_events();
        buy(@s, PLAYER(), 1, referrer);
        let sold = last_split(ref spy, s.systems.economy.contract_address, false);
        assert!(sold.referrer.is_zero());
        assert_eq!(sold.referral, 0);
        assert_eq!(sold.quote + sold.margin, 5 * USDC);
        if referrer != s.router && referrer != PLAYER() {
            assert_eq!(s.usdc.balance_of(referrer), usdc_before);
        }
        assert_nothing_held(@s);
    }
    assert_eq!(cobbles_of(@s, PLAYER()), 300);
}

#[test]
#[feature("safe_dispatcher")]
fn test_buy_pack_refusals_change_nothing() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let usdc_before = s.usdc.balance_of(PLAYER());
    // [Check] A pack never set, or stopped, is not on sale
    start_cheat_caller_address(setup_address, OWNER());
    s.packs.set_pack(3, 500, 40_000_000, false);
    approve(@s, PLAYER(), 1_000 * USDC);
    start_cheat_caller_address(setup_address, PLAYER());
    assert_eq!(error_of(safe(@s).buy_pack(5, Zero::zero(), 0)), 'Setup: pack not on sale');
    assert_eq!(error_of(safe(@s).buy_pack(0, Zero::zero(), 0)), 'Setup: pack not on sale');
    assert_eq!(error_of(safe(@s).buy_pack(3, Zero::zero(), 0)), 'Setup: pack not on sale');
    // [Check] A min_out above the swap reverts the whole purchase
    let out = s.systems.economy.quote_swap(5 * USDC);
    assert!(safe(@s).buy_pack(1, Zero::zero(), out + 1).is_err());
    stop_cheat_caller_address(setup_address);
    // [Check] With no approval, the payment fails and nothing is credited
    approve(@s, PLAYER(), 0);
    start_cheat_caller_address(setup_address, PLAYER());
    assert!(safe(@s).buy_pack(1, Zero::zero(), 0).is_err());
    stop_cheat_caller_address(setup_address);
    assert_eq!(cobbles_of(@s, PLAYER()), 0);
    assert_eq!(s.usdc.balance_of(PLAYER()), usdc_before);
    assert_nothing_held(@s);
}

/// `Setup` with no `Economy` in its wiring sells nothing; `Economy` with no seller refuses the
/// sale, so the purchase reverts whole.
#[test]
#[feature("safe_dispatcher")]
fn test_buy_pack_needs_the_economy_and_the_seller() {
    // [Check] No economy wired
    let class = declare("Setup").unwrap().contract_class();
    let (alone, _) = class.deploy(@array![OWNER().into()]).unwrap();
    start_cheat_caller_address(alone, OWNER());
    ISetupPacksDispatcher { contract_address: alone }.set_pack(1, 50, 5_000_000, true);
    start_cheat_caller_address(alone, PLAYER());
    assert_eq!(
        error_of(
            ISetupPacksSafeDispatcher { contract_address: alone }.buy_pack(1, Zero::zero(), 0),
        ),
        'Setup: economy not set',
    );
    stop_cheat_caller_address(alone);
    // [Check] Economy without its seller
    start_cheat_block_timestamp_global(DAY_14);
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    start_cheat_caller_address(setup_address, OWNER());
    ISetupPacksDispatcher { contract_address: setup_address }.set_pack(1, 50, 5_000_000, true);
    start_cheat_caller_address(context.token.contract_address, PLAYER());
    IERC20Dispatcher { contract_address: context.token.contract_address }
        .approve(setup_address, 5 * USDC);
    stop_cheat_caller_address(context.token.contract_address);
    start_cheat_caller_address(setup_address, PLAYER());
    assert_eq!(
        error_of(
            ISetupPacksSafeDispatcher { contract_address: setup_address }
                .buy_pack(1, Zero::zero(), 0),
        ),
        'Economy: not the seller',
    );
    stop_cheat_caller_address(setup_address);
    assert_eq!(
        ISetupCobblesDispatcher { contract_address: setup_address }
            .account(PLAYER().into())
            .cobbles,
        0,
    );
}

// The audit lens (7.5)

/// A1: `buy_pack` credits a pack's cobbles only with exactly its price paid, in the same call; a
/// purchase that reverts credits nothing.
#[test]
#[feature("safe_dispatcher")]
fn test_a1_buy_pack_credits_only_with_exactly_the_price_paid() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let start = s.usdc.balance_of(PLAYER());
    buy(@s, PLAYER(), 2, Zero::zero());
    buy(@s, PLAYER(), 2, Zero::zero());
    buy(@s, PLAYER(), 1, Zero::zero());
    assert_eq!(cobbles_of(@s, PLAYER()), 250);
    assert_eq!(start - s.usdc.balance_of(PLAYER()), 23 * USDC);
    // [Check] An allowance one unit short pays nothing and credits nothing
    approve(@s, PLAYER(), 9 * USDC - 1);
    start_cheat_caller_address(setup_address, PLAYER());
    assert!(safe(@s).buy_pack(2, Zero::zero(), 0).is_err());
    stop_cheat_caller_address(setup_address);
    assert_eq!(cobbles_of(@s, PLAYER()), 250);
    assert_eq!(start - s.usdc.balance_of(PLAYER()), 23 * USDC);
}

/// A3: a purchase credits its caller only, whoever it names as referrer.
#[test]
fn test_a3_buy_pack_credits_the_caller_only() {
    let s = shop();
    buy(@s, PLAYER(), 3, ANYONE());
    buy(@s, SOMEONE(), 1, PLAYER());
    assert_eq!(cobbles_of(@s, PLAYER()), 500);
    assert_eq!(cobbles_of(@s, SOMEONE()), 50);
    assert_eq!(cobbles_of(@s, ANYONE()), 0);
    assert_eq!(cobbles_of(@s, NOONE()), 0);
}

/// A4 (part 2's share): no entry point of part 1 or 2 lowers a balance of cobbles. Purchases,
/// repricing, stopping a pack and the claims' refusals leave every balance at least where it was;
/// the only spend, `buy_skin`, is part 3's.
#[test]
#[feature("safe_dispatcher")]
fn test_a4_no_entry_point_of_part_2_spends_cobbles() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    buy(@s, PLAYER(), 4, Zero::zero());
    assert_eq!(cobbles_of(@s, PLAYER()), 1000);
    start_cheat_caller_address(setup_address, OWNER());
    s.packs.set_pack(4, 1, 1_000_000, true);
    s.packs.set_pack(1, 50, 5_000_000, false);
    ISetupDispatcher { contract_address: setup_address }.set_reporter(OWNER(), true);
    // [Check] No credit to spend: refused, and no cobble moves
    assert!(
        ISetupCobblesSafeDispatcher { contract_address: setup_address }
            .spend_credit(PLAYER().into(), 1)
            .is_err(),
    );
    stop_cheat_caller_address(setup_address);
    assert_eq!(cobbles_of(@s, PLAYER()), 1000);
    buy(@s, PLAYER(), 4, Zero::zero());
    assert_eq!(cobbles_of(@s, PLAYER()), 1001);
}

/// A10: the price is the owner's. `buy_pack` takes no price; it charges the price stored for the
/// pack, and a repricing by the owner changes what the next purchase charges.
#[test]
fn test_a10_the_pack_price_is_the_owners() {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let start = s.usdc.balance_of(PLAYER());
    buy(@s, PLAYER(), 1, Zero::zero());
    assert_eq!(start - s.usdc.balance_of(PLAYER()), 5 * USDC);
    start_cheat_caller_address(setup_address, OWNER());
    s.packs.set_pack(1, 50, 7_000_000, true);
    stop_cheat_caller_address(setup_address);
    buy(@s, PLAYER(), 1, Zero::zero());
    assert_eq!(start - s.usdc.balance_of(PLAYER()), 12 * USDC);
    // [Check] An allowance above the price is not drawn beyond it
    approve(@s, PLAYER(), 100 * USDC);
    start_cheat_caller_address(setup_address, PLAYER());
    s.packs.buy_pack(1, Zero::zero(), 0);
    stop_cheat_caller_address(setup_address);
    assert_eq!(start - s.usdc.balance_of(PLAYER()), 19 * USDC);
    assert_eq!(cobbles_of(@s, PLAYER()), 150);
}

/// A9 through the real contracts: a pack at a game's price (2 USDC) and a stake-1 spawn, each on a
/// fresh system with the same pool, split the price identically, with and without a referrer.
#[test]
fn test_a9_buy_pack_takes_the_games_split() {
    for referrer in array![Zero::zero(), NOONE()] {
        let game = shop();
        let challenge = game.systems.challenge.contract_address;
        let mut spy = spy_events();
        start_cheat_caller_address(challenge, PLAYER());
        game.systems.challenge.spawn(1, referrer, 0);
        stop_cheat_caller_address(challenge);
        let purchased = last_split(ref spy, game.systems.economy.contract_address, true);
        let pack = shop();
        let setup_address = pack.packs.contract_address;
        start_cheat_caller_address(setup_address, OWNER());
        pack.packs.set_pack(5, 20, 2_000_000, true);
        stop_cheat_caller_address(setup_address);
        let mut spy = spy_events();
        buy(@pack, PLAYER(), 5, referrer);
        let sold = last_split(ref spy, pack.systems.economy.contract_address, false);
        assert_eq!(sold, purchased);
        assert_eq!(pack.systems.economy.rate(), game.systems.economy.rate());
        assert_eq!(pack.paved.balance_of(pack.vault), game.paved.balance_of(game.vault));
        assert_eq!(pack.paved.total_supply(), game.paved.total_supply());
    }
}

/// The split through `buy_pack`, fuzzed (7.4): a random price set by the owner (up to 100 USDC) and
/// a random referrer. The player pays exactly the price; a referrer that counts gets 5 % of it; the
/// referral, the burn quote and the margin add up to it; nothing stays on `Setup` or `Economy`; the
/// cobbles are credited.
#[test]
#[fuzzer(runs: 12, seed: 61)]
fn test_a9_fuzz_buy_pack_split(seed: u64) {
    let s = shop();
    let setup_address = s.packs.contract_address;
    let price: u128 = (1 + seed % 100_000_000).into();
    let cobbles: u32 = (1 + (seed / 7) % 5_000).try_into().unwrap();
    let candidates = array![
        Zero::zero(), PLAYER(), NOONE(), ANYONE(), setup_address,
        s.systems.economy.contract_address, s.systems.challenge.contract_address, s.vault,
    ];
    let index: u32 = ((seed / 11) % 8).try_into().unwrap();
    let referrer = *candidates.at(index);
    let counts = index == 2 || index == 3;
    start_cheat_caller_address(setup_address, OWNER());
    s.packs.set_pack(7, cobbles, price, true);
    stop_cheat_caller_address(setup_address);
    let usdc_before = s.usdc.balance_of(PLAYER());
    let referrer_before = s.usdc.balance_of(referrer);
    let mut spy = spy_events();
    buy(@s, PLAYER(), 7, referrer);
    let sold: Split = last_split(ref spy, s.systems.economy.contract_address, false);
    let referral: u256 = if counts {
        price.into() * 500 / 10_000
    } else {
        0
    };
    assert_eq!(usdc_before - s.usdc.balance_of(PLAYER()), price.into());
    assert_eq!(sold.referral, referral);
    if counts {
        assert_eq!(sold.referrer, referrer);
        assert_eq!(s.usdc.balance_of(referrer) - referrer_before, referral);
    } else {
        assert!(sold.referrer.is_zero());
    }
    assert_eq!(sold.referral + sold.quote + sold.margin, price.into());
    assert_eq!(cobbles_of(@s, PLAYER()), cobbles.into());
    assert_nothing_held(@s);
}

/// `Economy`'s views of a sale: its seller is `Setup`, and a safe call by anyone else is refused.
#[test]
#[feature("safe_dispatcher")]
fn test_a6_only_setup_sells_on_economy() {
    let s = shop();
    let economy = s.systems.economy.contract_address;
    assert_eq!(s.systems.economy.seller(), s.packs.contract_address);
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(economy, 5 * USDC);
    start_cheat_caller_address(economy, PLAYER());
    assert_eq!(
        error_of(
            IEconomySafeDispatcher { contract_address: economy }
                .sell(PLAYER(), 5 * USDC, Zero::zero(), 0),
        ),
        'Economy: not the seller',
    );
    start_cheat_caller_address(economy, OWNER());
    assert_eq!(
        error_of(IEconomySafeDispatcher { contract_address: economy }.set_seller(OWNER())),
        'Economy: seller already set',
    );
    stop_cheat_caller_address(economy);
    let _ = IEconomyDispatcher { contract_address: economy };
}
