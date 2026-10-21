//! `Daily` wired to `Economy` (P8 E3, `docs/architecture/economy.md` section 1): the trust that
//! `Economy.purchase` and `Economy.record` place in their caller (E2's audit). `Economy` trusts
//! `Daily` for the game id, the player, the stake and the price, and only checks that its USDC
//! covers the price; these tests pin what `Daily` passes.

use core::num::traits::Zero;
use paved::constants;
use paved::mocks::token::IERC20Dispatcher;
use paved::models::tile::CENTER;
use paved::systems::challenge::{IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait};
use paved::systems::economy::{BASE_PRICE, IEconomyDispatcherTrait};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use paved::tests::e2e::quests::almost_over_daily;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{EventSpyTrait, spy_events, start_cheat_caller_address, stop_cheat_caller_address};
use starknet::ContractAddress;

fn STRANGER() -> ContractAddress {
    'STRANGER'.try_into().unwrap()
}

/// The PAVED token of the economy of `systems`.
fn paved_token(systems: @setup::Systems) -> IERC20Dispatcher {
    IERC20Dispatcher { contract_address: systems.economy.addresses().paved }
}

/// Spawns a Daily game at `stake` and checks the purchase: exactly `stake x 2 USDC` left the
/// player, `Economy` holds nothing, and its terms are those of the game's own id and player.
fn assert_paid_spawn(
    store: setup::TestStore, systems: @setup::Systems, context: @setup::Context, stake: u8,
) {
    let token = *context.token;
    let economy = *systems.economy;
    let before = token.balance_of(PLAYER());
    let game_id = systems.challenge.spawn(stake, Zero::zero(), 0);
    assert(
        before - token.balance_of(PLAYER()) == stake.into() * BASE_PRICE, 'Economy: player debit',
    );
    assert(token.balance_of(economy.contract_address) == 0, 'Economy: holds USDC');
    assert(paved_token(systems).balance_of(economy.contract_address) == 0, 'Economy: holds PAVED');
    let terms = economy.terms(game_id);
    assert(store.game(game_id).player_id == PLAYER().into(), 'Economy: game player');
    assert(terms.player == PLAYER(), 'Economy: terms player');
    assert(terms.stake == stake, 'Economy: terms stake');
    assert(terms.reference != 0, 'Economy: terms reference');
}

#[test]
fn test_economy_entry_price_is_the_stake_unit() {
    let price: u256 = constants::CHALLENGE_PRICE.into();
    assert(price == BASE_PRICE, 'Economy: unit price');
}

#[test]
#[available_gas(l2_gas: 116729676)]
fn test_economy_spawn_moves_exactly_the_price_of_its_stake() {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    assert_paid_spawn(store, @systems, @context, 1);
    assert_paid_spawn(store, @systems, @context, 10);
}

/// A USDC donation already on `Economy` does not pay for the game: the full price still comes
/// from the player, and the donation leaves with the purchase (to the Vault, as margin).
#[test]
#[available_gas(l2_gas: 96578648)]
fn test_economy_spawn_with_a_donation_still_pulls_the_full_price() {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    IFaucetDispatcher { contract_address: context.token.contract_address }
        .mint(systems.economy.contract_address, 5 * BASE_PRICE);
    assert_paid_spawn(store, @systems, @context, 2);
}

/// A spawn that cannot be paid, or at a stake out of 1 to 10, reverts as a whole: no game, no
/// terms, no debit.
#[test]
#[available_gas(l2_gas: 98167749)]
#[feature("safe_dispatcher")]
fn test_economy_unpaid_spawn_reverts_and_leaves_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let challenge = IChallengeSafeDispatcher {
        contract_address: systems.challenge.contract_address,
    };
    let before = context.token.balance_of(PLAYER());
    // Stakes 0 and 11
    let reason = *challenge.spawn(0, Zero::zero(), 0).unwrap_err().at(0);
    assert(reason == 'Economy: wrong stake', 'Economy: stake 0');
    let reason = *challenge.spawn(11, Zero::zero(), 0).unwrap_err().at(0);
    assert(reason == 'Economy: wrong stake', 'Economy: stake 11');
    // No approval
    start_cheat_caller_address(context.token.contract_address, PLAYER());
    context.token.approve(systems.challenge.contract_address, 0);
    stop_cheat_caller_address(context.token.contract_address);
    let reason = *challenge.spawn(1, Zero::zero(), 0).unwrap_err().at(0);
    assert(reason == 'ERC20: insufficient allowance', 'Economy: no approval');
    // Nothing happened
    assert(store.game(1).player_id == 0, 'Economy: a game was left');
    assert(systems.economy.terms(1).player.is_zero(), 'Economy: terms were left');
    assert(context.token.balance_of(PLAYER()) == before, 'Economy: player debited');
}

/// A referrer counts if it is a non-zero address other than the payer (D-25 E: no registration):
/// it then gets 5 % of the price, whether it ever played or not; the payer itself gets nothing,
/// and a zero referrer is no referral.
#[test]
#[available_gas(l2_gas: 169493041)]
fn test_economy_referrer_is_any_address_but_the_payer() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let token = context.token;
    // An address that plays: 5 % of 2 USDC
    let before = token.balance_of(ANYONE());
    systems.challenge.spawn(1, ANYONE(), 0);
    assert(token.balance_of(ANYONE()) - before == 100_000, 'Economy: referral paid');
    // An address that never played nor held USDC: 5 % too
    systems.challenge.spawn(1, STRANGER(), 0);
    assert(token.balance_of(STRANGER()) == 100_000, 'Economy: stranger not paid');
    // The payer: no referral, the payer pays the whole price
    let before = token.balance_of(PLAYER());
    systems.challenge.spawn(1, PLAYER(), 0);
    assert(before - token.balance_of(PLAYER()) == BASE_PRICE, 'Economy: self-referral');
    // Zero: no referral
    let before = token.balance_of(PLAYER());
    systems.challenge.spawn(1, Zero::zero(), 0);
    assert(before - token.balance_of(PLAYER()) == BASE_PRICE, 'Economy: zero referral');
}

/// The protocol addresses `Daily` knows, `Economy` and `Daily` itself, are ignored as referrers,
/// like the payer (economy audit N2 of #350): nothing is paid to them, the payer pays the whole
/// price, and the whole price is swapped (no referral taken out of the Vault's part, which reaches
/// the Vault as PAVED, P-56). Paid to `Economy`, the 5 % would be swept back into the margin and
/// counted twice by `Purchased`; paid to `Daily`, it would be stuck.
#[test]
#[available_gas(l2_gas: 117984689)]
fn test_economy_protocol_address_referrer_is_no_referral() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let token = context.token;
    let addresses = systems.economy.addresses();
    let paved = IERC20Dispatcher { contract_address: addresses.paved };
    for referrer in array![systems.economy.contract_address, systems.challenge.contract_address] {
        let before = token.balance_of(PLAYER());
        let vault_before = paved.balance_of(addresses.vault);
        let swapped = systems.economy.quote_swap(BASE_PRICE);
        let supply = paved.total_supply();
        systems.challenge.spawn(1, referrer, 0);
        assert(before - token.balance_of(PLAYER()) == BASE_PRICE, 'Protocol: price');
        assert(token.balance_of(addresses.vault) == 0, 'Protocol: USDC to the Vault');
        // The whole price was swapped: its PAVED is the burn's and the Vault's parts
        let to_vault = paved.balance_of(addresses.vault) - vault_before;
        assert(to_vault > 0, 'Protocol: margin');
        assert(supply - paved.total_supply() + to_vault == swapped, 'Protocol: whole swap');
        assert(token.balance_of(referrer) == 0, 'Protocol: referrer paid');
    }
}

/// The score of a Daily game reaches `Economy`, for its own id, whichever way it ends.
fn assert_recorded(store: setup::TestStore, systems: @setup::Systems, game_id: u32) {
    let game = store.game(game_id);
    assert(game.over, 'Economy: not over');
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded, 'Economy: not recorded');
    assert(terms.score == game.score, 'Economy: recorded score');
    assert(!terms.expired, 'Economy: expired');
}

#[test]
#[available_gas(l2_gas: 111682273)]
fn test_economy_records_a_game_over_on_build() {
    let (store, systems, context) = almost_over_daily();
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(context.game_id, Orientation::North, CENTER + 1, CENTER);
    assert_recorded(store, @systems, context.game_id);
}

#[test]
#[available_gas(l2_gas: 104871429)]
fn test_economy_records_a_game_over_on_discard() {
    let (store, systems, context) = almost_over_daily();
    systems.challenge.discard(context.game_id);
    assert_recorded(store, @systems, context.game_id);
}

#[test]
#[available_gas(l2_gas: 99823765)]
fn test_economy_records_a_game_over_on_surrender() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    systems.challenge.surrender(context.game_id);
    assert_recorded(store, @systems, context.game_id);
}

/// A `Daily` whose `Setup` has no economy yet: a spawn reverts and leaves no game (without a
/// collection: `tests::e2e::mint`).
#[test]
#[feature("safe_dispatcher")]
fn test_economy_spawn_reverts_before_set_economy() {
    let owner: felt252 = setup::OWNER().into();
    let usdc = snforge_std::declare("Faucet").unwrap();
    let (usdc, _) = snforge_std::ContractClassTrait::deploy(
        snforge_std::DeclareResultTrait::contract_class(@usdc), @array![],
    )
        .unwrap();
    let wiring = snforge_std::declare("Setup").unwrap();
    let (wiring, _) = snforge_std::ContractClassTrait::deploy(
        snforge_std::DeclareResultTrait::contract_class(@wiring), @array![owner],
    )
        .unwrap();
    let challenge = snforge_std::declare("Challenge").unwrap();
    let (challenge, _) = snforge_std::ContractClassTrait::deploy(
        snforge_std::DeclareResultTrait::contract_class(@challenge),
        @array![owner, usdc.into(), wiring.into()],
    )
        .unwrap();
    start_cheat_caller_address(challenge, PLAYER());
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    let reason = *safe.spawn(1, Zero::zero(), 0).unwrap_err().at(0);
    assert(reason == 'Challenge: economy not set', 'Economy: reason');
    assert(TestStoreTrait::new(challenge).game(1).player_id == 0, 'Economy: a game was left');
}

/// A game over at its expiry (24 h after the purchase, P-34) is recorded as expired: it enters no
/// mean, its day closes empty, and its settlement pays 0.
#[test]
#[available_gas(l2_gas: 104255051)]
fn test_economy_records_an_expired_game_over() {
    snforge_std::start_cheat_block_timestamp_global(10 * 86400 + 3600);
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let game_id = systems.challenge.spawn(1, Zero::zero(), 0);
    let spawned = store.game(game_id).start_time;
    let day = spawned / 86400;
    snforge_std::start_cheat_block_timestamp_global(spawned + 86400);
    systems.challenge.surrender(game_id);
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded && terms.expired, 'Economy: not expired');
    snforge_std::start_cheat_block_timestamp_global((day + 2) * 86400);
    let minted = systems.economy.settle(array![game_id].span());
    assert(minted == 0, 'Economy: an expired game paid');
    let closed = systems.economy.day(day);
    assert(closed.closed, 'Economy: day not closed');
    assert(closed.weight == 0 && closed.sum == 0, 'Economy: day not empty');
    let terms = systems.economy.terms(game_id);
    assert(terms.settled && terms.reward == 0, 'Economy: settled');
}
