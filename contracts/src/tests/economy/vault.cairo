//! The staking `Vault`, vPAVED (P-56, D-31, `docs/architecture/vault-share.md`, addenda): an
//! ERC4626 over PAVED, its rate, the exit fee kept for the holders who stay, the inflation defence
//! with no dead shares (the owner's deposit is the first), the votes and their delegation by
//! signature, the rounding, which always favours the Vault, and the USDC reward of Nums' Vault:
//! payments, claims, collects, the pause and the close.

use core::hash::HashStateTrait;
use core::num::traits::{Bounded, Zero};
use core::poseidon::PoseidonTrait;
use openzeppelin_governance::votes::VotesComponent;
use openzeppelin_governance::votes::delegation::DELEGATION_TYPE_HASH;
use openzeppelin_interfaces::erc20::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MixinDispatcher, IERC20MixinDispatcherTrait,
};
use openzeppelin_interfaces::erc4626::{ERC4626ABIDispatcher, ERC4626ABIDispatcherTrait};
use openzeppelin_interfaces::nonces::{INoncesDispatcher, INoncesDispatcherTrait};
use openzeppelin_interfaces::votes::{IVotesDispatcher, IVotesDispatcherTrait};
use openzeppelin_utils::cryptography::snip12::{StarknetDomain, StructHash};
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
use paved::systems::vault::Vault::{
    Claimed, Closed, Collected, Event as VaultEvent, ExitFeeSet, Opened, Paid, Paused, Unpaused,
};
use paved::systems::vault::{
    DEFAULT_EXIT_FEE_BPS, IVaultDispatcher, IVaultDispatcherTrait, MAX_EXIT_FEE_BPS, REWARD_SCALE,
};
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use snforge_std::signature::{KeyPairTrait, SignerTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait, declare,
    spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::token::{RECIPIENT, deploy_token};

/// An account that accepts the Stark signatures of one key, for `delegate_by_sig`.
#[starknet::interface]
pub trait IMockSigner<TContractState> {
    fn is_valid_signature(
        self: @TContractState, hash: felt252, signature: Array<felt252>,
    ) -> felt252;
}

#[starknet::contract]
pub mod MockSigner {
    use core::ecdsa::check_ecdsa_signature;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        public_key: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252) {
        self.public_key.write(public_key);
    }

    #[abi(embed_v0)]
    impl MockSignerImpl of super::IMockSigner<ContractState> {
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            if signature.len() == 2
                && check_ecdsa_signature(
                    hash, self.public_key.read(), *signature.at(0), *signature.at(1),
                ) {
                starknet::VALIDATED
            } else {
                0
            }
        }
    }
}

/// A holder that answers `supports_interface(ISRC6_ID)` as told: an account (true) or a contract
/// that cannot claim, a pool for example (false), for `collect`.
#[starknet::interface]
pub trait IMockHolder<TContractState> {
    fn supports_interface(self: @TContractState, interface_id: felt252) -> bool;
}

#[starknet::contract]
pub mod MockHolder {
    use openzeppelin_interfaces::accounts::ISRC6_ID;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        account: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, account: bool) {
        self.account.write(account);
    }

    #[abi(embed_v0)]
    impl MockHolderImpl of super::IMockHolder<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC6_ID && self.account.read()
        }
    }
}

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}

fn BOB() -> ContractAddress {
    'BOB'.try_into().unwrap()
}

fn CAROL() -> ContractAddress {
    'CAROL'.try_into().unwrap()
}

fn PAYER() -> ContractAddress {
    'PAYER'.try_into().unwrap()
}

/// One PAVED in base units.
const PAVED: u256 = 1_000_000_000_000_000_000;
/// One USDC in base units.
const USDC: u256 = 1_000_000;
const T0: u64 = 1_000_000;
/// The owner's deposit in these tests: the Vault's first shares (D-31: no dead shares).
const STAKE: u256 = 1_000 * PAVED;

#[derive(Copy, Drop)]
struct Setup {
    vault: ERC4626ABIDispatcher,
    paved: IERC20Dispatcher,
    usdc: IERC20Dispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

fn deploy_vault(paved: ContractAddress, usdc: ContractAddress, fee: u16) -> ContractAddress {
    deploy("Vault", array![OWNER().into(), paved.into(), usdc.into(), fee.into()])
}

/// The token (initial supply to `RECIPIENT`), the faucet's USDC, the Vault at `fee`; Alice, Bob and
/// Carol receive 100,000 PAVED each. At `T0`. No share yet.
fn empty_with(fee: u16) -> Setup {
    start_cheat_block_timestamp_global(T0);
    let paved_address = deploy_token(RECIPIENT());
    let usdc_address = deploy("Faucet", array![]);
    let vault_address = deploy_vault(paved_address, usdc_address, fee);
    let s = Setup {
        vault: ERC4626ABIDispatcher { contract_address: vault_address },
        paved: IERC20Dispatcher { contract_address: paved_address },
        usdc: IERC20Dispatcher { contract_address: usdc_address },
    };
    start_cheat_caller_address(paved_address, RECIPIENT());
    s.paved.transfer(ALICE(), 100_000 * PAVED);
    s.paved.transfer(BOB(), 100_000 * PAVED);
    s.paved.transfer(CAROL(), 100_000 * PAVED);
    s.paved.transfer(OWNER(), STAKE);
    stop_cheat_caller_address(paved_address);
    s
}

/// As `empty_with`, then the owner's deposit of 1,000 PAVED, the Vault's first shares at 1:1, as
/// `deploy.sh` makes it (D-31).
fn setup_with(fee: u16) -> Setup {
    let s = empty_with(fee);
    deposit(s, OWNER(), STAKE);
    s
}

fn setup() -> Setup {
    setup_with(0)
}

fn deposit(s: Setup, account: ContractAddress, assets: u256) -> u256 {
    start_cheat_caller_address(s.paved.contract_address, account);
    s.paved.approve(s.vault.contract_address, assets);
    stop_cheat_caller_address(s.paved.contract_address);
    start_cheat_caller_address(s.vault.contract_address, account);
    let shares = s.vault.deposit(assets, account);
    stop_cheat_caller_address(s.vault.contract_address);
    shares
}

fn mint(s: Setup, account: ContractAddress, shares: u256) -> u256 {
    start_cheat_caller_address(s.paved.contract_address, account);
    s.paved.approve(s.vault.contract_address, s.vault.preview_mint(shares));
    stop_cheat_caller_address(s.paved.contract_address);
    start_cheat_caller_address(s.vault.contract_address, account);
    let assets = s.vault.mint(shares, account);
    stop_cheat_caller_address(s.vault.contract_address);
    assets
}

fn redeem(s: Setup, account: ContractAddress, shares: u256) -> u256 {
    start_cheat_caller_address(s.vault.contract_address, account);
    let assets = s.vault.redeem(shares, account, account);
    stop_cheat_caller_address(s.vault.contract_address);
    assets
}

fn withdraw(s: Setup, account: ContractAddress, assets: u256) -> u256 {
    start_cheat_caller_address(s.vault.contract_address, account);
    let shares = s.vault.withdraw(assets, account, account);
    stop_cheat_caller_address(s.vault.contract_address);
    shares
}

fn transfer(s: Setup, from: ContractAddress, to: ContractAddress, shares: u256) {
    start_cheat_caller_address(s.vault.contract_address, from);
    s.vault.transfer(to, shares);
    stop_cheat_caller_address(s.vault.contract_address);
}

/// PAVED reaching the Vault without shares: a donation.
fn donate(s: Setup, amount: u256) {
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(s.vault.contract_address, amount);
    stop_cheat_caller_address(s.paved.contract_address);
}

fn set_fee(s: Setup, fee: u16) {
    start_cheat_caller_address(s.vault.contract_address, OWNER());
    IVaultDispatcher { contract_address: s.vault.contract_address }.set_exit_fee(fee);
    stop_cheat_caller_address(s.vault.contract_address);
}

fn votes(s: Setup) -> IVotesDispatcher {
    IVotesDispatcher { contract_address: s.vault.contract_address }
}

fn delegate(s: Setup, account: ContractAddress, delegatee: ContractAddress) {
    start_cheat_caller_address(s.vault.contract_address, account);
    votes(s).delegate(delegatee);
    stop_cheat_caller_address(s.vault.contract_address);
}

/// The PAVED of one whole vPAVED, rounded down.
fn rate(s: Setup) -> u256 {
    s.vault.convert_to_assets(PAVED)
}

// The share

#[test]
fn test_vault_share_metadata_and_wiring() {
    let s = setup_with(DEFAULT_EXIT_FEE_BPS);
    assert_eq!(s.vault.name(), "Vault PAVED");
    assert_eq!(s.vault.symbol(), "vPAVED");
    assert_eq!(s.vault.decimals(), 18);
    assert_eq!(s.vault.asset(), s.paved.contract_address);
    let vault = IVaultDispatcher { contract_address: s.vault.contract_address };
    assert_eq!(vault.exit_fee(), 500);
    let ownable = IOwnableDispatcher { contract_address: s.vault.contract_address };
    assert_eq!(ownable.owner(), OWNER());
    assert_eq!(ownable.pending_owner(), Zero::zero());
    // No dead shares: the owner's 1,000 vPAVED are the first, minted 1:1
    assert_eq!(s.vault.balance_of(s.vault.contract_address), 0);
    assert_eq!(s.vault.balance_of(OWNER()), STAKE);
    assert_eq!(s.vault.total_supply(), STAKE);
    assert_eq!(s.vault.total_assets(), STAKE);
    assert_eq!(rate(s), PAVED);
    // The reward: USDC, nothing paid yet; open, not paused
    assert_eq!(vault.reward_token(), s.usdc.contract_address);
    assert_eq!((vault.reward_index(), vault.total_paid(), vault.total_claimed()), (0, 0, 0));
    assert!(vault.is_open() && !vault.is_paused());
}

#[test]
fn test_vault_constructor_refuses_a_fee_above_the_ceiling() {
    let paved = deploy_token(RECIPIENT());
    let usdc = deploy("Faucet", array![]);
    let class = declare("Vault").unwrap().contract_class();
    let fee: felt252 = (MAX_EXIT_FEE_BPS + 1).into();
    match class.deploy(@array![OWNER().into(), paved.into(), usdc.into(), fee]) {
        Result::Ok(_) => panic!("a fee of 1,001 bps was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Vault: fee too high'),
    }
    // The ceiling itself passes
    deploy_vault(paved, usdc, MAX_EXIT_FEE_BPS);
}

#[test]
fn test_vault_constructor_refuses_a_zero_owner() {
    let paved = deploy_token(RECIPIENT());
    let usdc = deploy("Faucet", array![]);
    let class = declare("Vault").unwrap().contract_class();
    match class.deploy(@array![0, paved.into(), usdc.into(), 0]) {
        Result::Ok(_) => panic!("a zero owner was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Vault: zero address'),
    }
    match class.deploy(@array![OWNER().into(), paved.into(), 0, 0]) {
        Result::Ok(_) => panic!("a zero reward token was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Vault: zero address'),
    }
}

#[test]
#[should_panic]
fn test_vault_constructor_refuses_a_zero_asset() {
    deploy_vault(Zero::zero(), deploy("Faucet", array![]), 0);
}

/// With no dead shares (D-31), the first deposit of an empty Vault mints 1:1.
#[test]
fn test_vault_first_deposit_mints_one_to_one() {
    let s = empty_with(DEFAULT_EXIT_FEE_BPS);
    assert_eq!(s.vault.total_supply(), 0);
    assert_eq!(deposit(s, OWNER(), STAKE), STAKE);
    assert_eq!(s.vault.balance_of(OWNER()), STAKE);
    assert_eq!(rate(s), PAVED);
}

// The rate

/// At a stable rate a deposit, a mint, a withdraw and a redeem each give exactly the PAVED or the
/// shares the rate says, and leave the rate where it was.
#[test]
fn test_vault_deposits_and_exits_at_a_stable_rate() {
    let s = setup();
    assert_eq!(deposit(s, ALICE(), 300 * PAVED), 300 * PAVED);
    assert_eq!(mint(s, BOB(), 200 * PAVED), 200 * PAVED);
    assert_eq!(rate(s), PAVED);
    assert_eq!(redeem(s, ALICE(), 100 * PAVED), 100 * PAVED);
    assert_eq!(withdraw(s, BOB(), 50 * PAVED), 50 * PAVED);
    assert_eq!(rate(s), PAVED);
    assert_eq!(s.vault.balance_of(ALICE()), 200 * PAVED);
    assert_eq!(s.vault.balance_of(BOB()), 150 * PAVED);
    assert_eq!(s.paved.balance_of(ALICE()), 99_800 * PAVED);
    assert_eq!(s.vault.total_assets(), 1_350 * PAVED);
}

/// PAVED that reaches the Vault without shares (a donation) raises the rate by exactly that amount
/// over the shares, and a later depositor buys in at the new rate: none of it is theirs.
#[test]
fn test_vault_donation_raises_the_rate_for_the_holders_of_the_time() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    let supply = s.vault.total_supply();
    let assets = s.vault.total_assets();
    let margin = 500 * PAVED;
    donate(s, margin);
    assert_eq!(s.vault.total_supply(), supply);
    assert_eq!(s.vault.total_assets(), assets + margin);
    // The rate, (A + 1) / (S + 1): 2,500 PAVED over 2,000 shares
    assert_eq!(rate(s), PAVED * (assets + margin + 1) / (supply + 1));
    assert_eq!(rate(s), 1_250_000_000_000_000_000 - 1);
    // Alice's 1,000 shares hold half the donation (the owner's stake the other half)
    assert_eq!(s.vault.convert_to_assets(1_000 * PAVED), 1_250 * PAVED - 1);
    // Bob deposits after: his shares are worth what he put in, to the rounding
    let shares = deposit(s, BOB(), 1_000 * PAVED);
    assert_eq!(shares, 800 * PAVED);
    assert!(s.vault.convert_to_assets(shares) <= 1_000 * PAVED);
    assert_eq!(redeem(s, ALICE(), 1_000 * PAVED), 1_250 * PAVED - 1);
}

/// Every conversion rounds against the caller: a mint costs at least what its shares are worth, a
/// withdraw burns at least the shares its assets convert to, and a round trip never gains.
#[test]
fn test_vault_rounding_favours_the_vault() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    donate(s, 1); // an odd rate: 2,000 PAVED + 1 over 2,000 shares
    let assets = 7 * PAVED + 3;
    let shares = s.vault.preview_deposit(assets);
    assert!(s.vault.convert_to_assets(shares) <= assets, "deposit");
    assert!(s.vault.preview_mint(shares) >= s.vault.convert_to_assets(shares), "mint");
    assert!(s.vault.preview_withdraw(assets) >= s.vault.convert_to_shares(assets), "withdraw");
    assert!(s.vault.preview_redeem(shares) <= assets, "redeem");
    let before = s.paved.balance_of(BOB());
    let got = deposit(s, BOB(), assets);
    redeem(s, BOB(), got);
    assert!(s.paved.balance_of(BOB()) <= before, "round trip");
    let before = s.paved.balance_of(CAROL());
    let paid = mint(s, CAROL(), shares);
    assert!(withdraw(s, CAROL(), paid - 1) >= shares - 1, "mint then withdraw");
    assert!(s.paved.balance_of(CAROL()) < before, "mint round trip");
}

// The exit fee

/// At 100 bps, a redeem worth 101 PAVED pays 100 and a withdraw of 100 PAVED burns about 101
/// shares: the same 1 % of what the holder receives, and the fee stays in the Vault.
#[test]
fn test_vault_withdraw_and_redeem_charge_the_same_fee_in_assets() {
    let s = setup_with(100);
    deposit(s, ALICE(), 1_010 * PAVED);
    deposit(s, BOB(), 1_010 * PAVED);
    let assets = s.vault.total_assets();
    // Redeem
    assert_eq!(s.vault.preview_redeem(101 * PAVED), 100 * PAVED);
    assert_eq!(redeem(s, ALICE(), 101 * PAVED), 100 * PAVED);
    assert_eq!(s.vault.total_assets(), assets - 100 * PAVED);
    // Withdraw, at the rate the first fee left (above 1, so a few base units fewer shares)
    let shares = s.vault.preview_withdraw(100 * PAVED);
    assert!(shares <= 101 * PAVED && shares > 100 * PAVED, "shares {}", shares);
    assert_eq!(withdraw(s, BOB(), 100 * PAVED), shares);
    assert_eq!(s.paved.balance_of(BOB()), 99_090 * PAVED);
    assert_eq!(s.vault.total_assets(), assets - 200 * PAVED);
}

/// The fee raises the rate of those who stay: Alice leaves with all her shares at 5 %, and Bob's
/// shares and the owner's share what she left behind.
#[test]
fn test_vault_exit_fee_raises_the_rate_for_the_remaining_holders() {
    let s = setup_with(500);
    deposit(s, ALICE(), 1_050 * PAVED);
    deposit(s, BOB(), 1_000 * PAVED);
    let before = rate(s);
    assert_eq!(before, PAVED);
    assert_eq!(redeem(s, ALICE(), 1_050 * PAVED), 1_000 * PAVED);
    // 50 PAVED of fee over the 2,000 shares left
    assert_eq!(s.vault.total_assets(), 2_050 * PAVED);
    assert_eq!(s.vault.total_supply(), 2_000 * PAVED);
    assert_eq!(rate(s), PAVED * (2_050 * PAVED + 1) / (2_000 * PAVED + 1));
    assert!(rate(s) > before);
}

/// `max_withdraw` is the PAVED a full redeem pays, the fee taken, and a withdraw of it succeeds
/// within the balance; `max_redeem` is the balance.
#[test]
fn test_vault_max_withdraw_and_max_redeem_are_exact_with_a_fee() {
    let s = setup_with(100);
    deposit(s, ALICE(), 777 * PAVED + 13);
    donate(s, 3 * PAVED + 1); // an odd rate
    let balance = s.vault.balance_of(ALICE());
    assert_eq!(s.vault.max_redeem(ALICE()), balance);
    let max = s.vault.max_withdraw(ALICE());
    assert_eq!(max, s.vault.preview_redeem(balance));
    assert!(s.vault.preview_withdraw(max) <= balance, "max withdraw needs too many shares");
    let paved = s.paved.balance_of(ALICE());
    withdraw(s, ALICE(), max);
    assert_eq!(s.paved.balance_of(ALICE()), paved + max);
    // What may be left is rounding dust, worth nothing to withdraw
    assert!(s.vault.balance_of(ALICE()) < 3, "left {}", s.vault.balance_of(ALICE()));
    assert_eq!(s.vault.max_withdraw(ALICE()), 0);
}

#[test]
#[should_panic(expected: 'ERC4626: exceeds max withdraw')]
fn test_vault_withdraw_above_max_reverts() {
    let s = setup_with(100);
    deposit(s, ALICE(), 1_000 * PAVED);
    withdraw(s, ALICE(), s.vault.max_withdraw(ALICE()) + 1);
}

#[test]
#[should_panic(expected: 'ERC4626: exceeds max redeem')]
fn test_vault_redeem_above_balance_reverts() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    redeem(s, ALICE(), 1_000 * PAVED + 1);
}

#[test]
fn test_vault_owner_sets_the_fee_within_its_bounds() {
    let s = setup_with(DEFAULT_EXIT_FEE_BPS);
    let vault = IVaultDispatcher { contract_address: s.vault.contract_address };
    let mut spy = spy_events();
    set_fee(s, 0);
    assert_eq!(vault.exit_fee(), 0);
    set_fee(s, MAX_EXIT_FEE_BPS);
    assert_eq!(vault.exit_fee(), 1_000);
    spy
        .assert_emitted(
            @array![
                (
                    s.vault.contract_address,
                    VaultEvent::ExitFeeSet(ExitFeeSet { previous: 500, fee: 0 }),
                ),
                (
                    s.vault.contract_address,
                    VaultEvent::ExitFeeSet(ExitFeeSet { previous: 0, fee: 1_000 }),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Vault: fee too high')]
fn test_vault_fee_above_the_ceiling_reverts() {
    let s = setup();
    set_fee(s, MAX_EXIT_FEE_BPS + 1);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_vault_fee_by_a_stranger_reverts() {
    let s = setup();
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    IVaultDispatcher { contract_address: s.vault.contract_address }.set_exit_fee(0);
}

// Exits by a third party (security audit note 5 of #382)

/// An approved spender redeems or withdraws for the owner: the PAVED goes to the receiver, and the
/// allowance falls by exactly the shares burned, the fee's included.
#[test]
fn test_vault_exits_by_an_approved_spender_spend_the_shares_and_the_fee() {
    let s = setup_with(500);
    deposit(s, ALICE(), 2_100 * PAVED);
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    s.vault.approve(BOB(), 1_000 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    // Redeem 210 shares worth 210 PAVED at a rate of 1: 200 out, 10 of fee
    start_cheat_caller_address(s.vault.contract_address, BOB());
    let assets = s.vault.redeem(210 * PAVED, CAROL(), ALICE());
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(assets, 200 * PAVED);
    assert_eq!(s.paved.balance_of(CAROL()), 100_200 * PAVED);
    assert_eq!(s.vault.balance_of(ALICE()), 1_890 * PAVED);
    assert_eq!(s.vault.allowance(ALICE(), BOB()), 790 * PAVED);
    // Withdraw 100 PAVED: the shares of 100 plus the 5 PAVED fee burn, and leave the allowance
    let shares = s.vault.preview_withdraw(100 * PAVED);
    assert!(shares > 100 * PAVED, "the fee's shares");
    start_cheat_caller_address(s.vault.contract_address, BOB());
    assert_eq!(s.vault.withdraw(100 * PAVED, BOB(), ALICE()), shares);
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(s.paved.balance_of(BOB()), 100_100 * PAVED);
    assert_eq!(s.vault.allowance(ALICE(), BOB()), 790 * PAVED - shares);
    assert_eq!(s.vault.balance_of(ALICE()), 1_890 * PAVED - shares);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn test_vault_redeem_by_an_unapproved_spender_reverts() {
    let s = setup_with(500);
    deposit(s, ALICE(), 1_000 * PAVED);
    start_cheat_caller_address(s.vault.contract_address, BOB());
    s.vault.redeem(100 * PAVED, BOB(), ALICE());
}

/// An allowance that covers the assets but not the fee's shares is not enough.
#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn test_vault_withdraw_beyond_the_allowance_with_the_fee_reverts() {
    let s = setup_with(500);
    deposit(s, ALICE(), 1_000 * PAVED);
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    s.vault.approve(BOB(), 100 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    start_cheat_caller_address(s.vault.contract_address, BOB());
    s.vault.withdraw(100 * PAVED, BOB(), ALICE());
}

// The inflation defence

/// The classic attack, after the owner's deposit: Alice deposits one base unit, then donates
/// 10,000 PAVED to inflate the share; Bob's 1,000 PAVED deposit still gets shares worth his
/// deposit to the rounding, and Alice loses nearly all her donation to the owner's shares.
#[test]
fn test_vault_inflation_attack_fails_after_the_owners_deposit() {
    let s = setup();
    let alice = s.paved.balance_of(ALICE());
    deposit(s, ALICE(), 1);
    start_cheat_caller_address(s.paved.contract_address, ALICE());
    s.paved.transfer(s.vault.contract_address, 10_000 * PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    let shares = deposit(s, BOB(), 1_000 * PAVED);
    let bob = s.vault.convert_to_assets(shares);
    assert!(bob <= 1_000 * PAVED && 1_000 * PAVED - bob <= 12, "bob lost {}", 1_000 * PAVED - bob);
    // Alice takes back what her one share is worth
    let back = redeem(s, ALICE(), s.vault.balance_of(ALICE()));
    assert!(back < 100, "back {}", back);
    assert!(alice - s.paved.balance_of(ALICE()) > 9_999 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: zero shares')]
fn test_vault_zero_deposit_reverts() {
    let s = setup();
    deposit(s, ALICE(), 0);
}

/// Above a rate of 1, a deposit of one base unit rounds to zero shares and reverts instead of
/// giving its PAVED away.
#[test]
#[should_panic(expected: 'Vault: zero shares')]
fn test_vault_deposit_that_would_mint_no_share_reverts() {
    let s = setup();
    donate(s, 1_000 * PAVED);
    deposit(s, ALICE(), 1);
}

/// Every holder but the owner leaves while donations keep coming: the next depositor still gets
/// shares worth their deposit, since the owner's shares hold the pile.
#[test]
fn test_vault_donation_while_only_the_owners_stake_remains_is_not_taken_by_the_next_depositor() {
    let s = setup();
    let shares = deposit(s, ALICE(), 5_000 * PAVED);
    redeem(s, ALICE(), shares);
    assert_eq!(s.vault.total_supply(), STAKE);
    donate(s, 3_000 * PAVED);
    let got = deposit(s, BOB(), 2_000 * PAVED);
    let worth = s.vault.convert_to_assets(got);
    assert!(worth <= 2_000 * PAVED && 2_000 * PAVED - worth <= 4, "worth {}", worth);
}

// Transfers

/// The share is a plain ERC20: a transfer, an approved `transfer_from`, a transfer to the Vault
/// itself (allowed: its USDC is the owner's to collect) all move the PAVED behind it.
#[test]
fn test_vault_share_transfers_move_the_paved_behind_them() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    donate(s, 1_000 * PAVED);
    transfer(s, ALICE(), BOB(), 400 * PAVED);
    assert_eq!(s.vault.balance_of(BOB()), 400 * PAVED);
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    s.vault.approve(CAROL(), 100 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    start_cheat_caller_address(s.vault.contract_address, CAROL());
    s.vault.transfer_from(ALICE(), CAROL(), 100 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    transfer(s, ALICE(), s.vault.contract_address, 100 * PAVED);
    assert_eq!(s.vault.balance_of(ALICE()), 400 * PAVED);
    assert_eq!(s.vault.balance_of(CAROL()), 100 * PAVED);
    assert_eq!(s.vault.balance_of(s.vault.contract_address), 100 * PAVED);
    // Bob redeems what Alice sent him at the rate: 3,000 PAVED over 2,000 shares
    assert_eq!(redeem(s, BOB(), 400 * PAVED), 600 * PAVED - 1);
}

/// A seeded random walk of deposits, mints, withdraws, redeems, transfers, donations and fee
/// changes among three accounts. After every step the PAVED the Vault holds covers what all its
/// shares convert to, and the owner's stake never loses value. At the end every holder redeems:
/// the three took out no more than they put in plus the donations, and the Vault keeps at least
/// the owner's 1,000 PAVED.
#[test]
fn test_vault_random_walk_keeps_the_assets_and_rounds_for_the_vault() {
    let s = setup();
    let accounts = array![ALICE(), BOB(), CAROL()];
    let mut seed: u256 = 0x5eed;
    let mut margins: u256 = 0;
    let mut step: u32 = 0;
    while step != 150 {
        seed = (seed * 6364136223846793005 + 1442695040888963407) % 0x10000000000000000;
        let account = *accounts.at((seed % 3).try_into().unwrap());
        let other = *accounts.at(((seed / 3) % 3).try_into().unwrap());
        let amount = (seed / 9) % (500 * PAVED) + 1;
        let balance = s.vault.balance_of(account);
        let kind = (seed / 7) % 7;
        if kind == 0 {
            if s.vault.preview_deposit(amount) != 0 {
                deposit(s, account, amount);
            }
        } else if kind == 1 {
            mint(s, account, amount / 2 + 1);
        } else if kind == 2 {
            let max = s.vault.max_withdraw(account);
            if max != 0 {
                withdraw(s, account, amount % max + 1);
            }
        } else if kind == 3 {
            if balance != 0 {
                redeem(s, account, amount % balance + 1);
            }
        } else if kind == 4 {
            if balance != 0 && account != other {
                transfer(s, account, other, amount % balance + 1);
            }
        } else if kind == 5 {
            margins += amount / 10;
            donate(s, amount / 10);
        } else {
            set_fee(s, (amount % 1_001).try_into().unwrap());
        }
        // [Check] The Vault holds what every share converts to, the owner's included
        let total = s.vault.total_supply();
        assert!(s.vault.total_assets() >= s.vault.convert_to_assets(total), "step {}", step);
        assert!(s.vault.convert_to_assets(STAKE) >= STAKE - 1, "stake {}", step);
        step += 1;
    }
    // Everyone leaves
    for account in accounts.span() {
        let shares = s.vault.balance_of(*account);
        if shares != 0 {
            redeem(s, *account, shares);
        }
    }
    assert_eq!(s.vault.total_supply(), STAKE);
    let held = s.paved.balance_of(ALICE())
        + s.paved.balance_of(BOB())
        + s.paved.balance_of(CAROL());
    assert!(held <= 300_000 * PAVED + margins, "the holders took more than they gave");
    assert!(s.vault.total_assets() >= STAKE, "the owner's stake is backed");
    // Every PAVED is accounted for: the holders', the Vault's, the donations'
    assert_eq!(held + s.vault.total_assets(), 300_000 * PAVED + STAKE + margins);
}

// Votes

#[test]
fn test_vault_votes_count_once_delegated_and_follow_deposits_redeems_and_transfers() {
    let s = setup();
    let v = votes(s);
    deposit(s, ALICE(), 1_000 * PAVED);
    // Nothing counts before delegation
    assert_eq!(v.get_votes(ALICE()), 0);
    delegate(s, ALICE(), ALICE());
    assert_eq!(v.get_votes(ALICE()), 1_000 * PAVED);
    // Bob delegates to Carol before he deposits
    delegate(s, BOB(), CAROL());
    deposit(s, BOB(), 500 * PAVED);
    assert_eq!(v.get_votes(CAROL()), 500 * PAVED);
    assert_eq!(v.get_votes(BOB()), 0);
    // A transfer moves the votes between the delegates
    transfer(s, ALICE(), BOB(), 200 * PAVED);
    assert_eq!(v.get_votes(ALICE()), 800 * PAVED);
    assert_eq!(v.get_votes(CAROL()), 700 * PAVED);
    // A redeem takes them away
    redeem(s, ALICE(), 300 * PAVED);
    assert_eq!(v.get_votes(ALICE()), 500 * PAVED);
    // A donation moves the rate, a payment the rewards, never a vote
    donate(s, 10_000 * PAVED);
    pay(s, 100 * USDC);
    assert_eq!(v.get_votes(ALICE()), 500 * PAVED);
    // The owner's stake counts only once delegated
    assert_eq!(v.delegates(OWNER()), Zero::zero());
    assert_eq!(v.get_votes(OWNER()), 0);
}

#[test]
fn test_vault_past_votes_and_past_total_supply() {
    let s = setup();
    let v = votes(s);
    delegate(s, ALICE(), ALICE());
    start_cheat_block_timestamp_global(T0 + 10);
    deposit(s, ALICE(), 1_000 * PAVED);
    start_cheat_block_timestamp_global(T0 + 20);
    redeem(s, ALICE(), 400 * PAVED);
    start_cheat_block_timestamp_global(T0 + 30);
    deposit(s, BOB(), 50 * PAVED);
    donate(s, 5_000 * PAVED);
    start_cheat_block_timestamp_global(T0 + 40);
    assert_eq!(v.clock(), T0 + 40);
    assert_eq!(v.CLOCK_MODE(), "mode=timestamp&from=starknet::SN_MAIN");
    assert_eq!(v.get_past_votes(ALICE(), T0 + 5), 0);
    assert_eq!(v.get_past_votes(ALICE(), T0 + 10), 1_000 * PAVED);
    assert_eq!(v.get_past_votes(ALICE(), T0 + 25), 600 * PAVED);
    assert_eq!(v.get_past_votes(ALICE(), T0 + 39), 600 * PAVED);
    // The total supply counts every share, the undelegated ones included
    assert_eq!(v.get_past_total_supply(T0), STAKE);
    assert_eq!(v.get_past_total_supply(T0 + 15), STAKE + 1_000 * PAVED);
    assert_eq!(v.get_past_total_supply(T0 + 20), STAKE + 600 * PAVED);
    assert_eq!(v.get_past_total_supply(T0 + 35), STAKE + 650 * PAVED);
}

#[test]
#[should_panic(expected: 'Votes: future Lookup')]
fn test_vault_past_votes_now_reverts() {
    let s = setup();
    votes(s).get_past_votes(ALICE(), T0);
}

// Delegation by signature

const SECRET: felt252 = 0x1234567890abcdef;

/// The SNIP-12 hash `delegate_by_sig` checks: the domain `('vPAVED', '1')` on the test chain, the
/// signer, and the `Delegation` struct.
fn delegation_hash(
    vault: ContractAddress,
    signer: ContractAddress,
    delegatee: ContractAddress,
    nonce: felt252,
    expiry: u64,
) -> felt252 {
    let domain = StarknetDomain {
        name: 'vPAVED',
        version: '1',
        chain_id: starknet::get_tx_info().unbox().chain_id,
        revision: 1,
    };
    let delegation = PoseidonTrait::new()
        .update(DELEGATION_TYPE_HASH)
        .update(vault.into())
        .update(delegatee.into())
        .update(nonce)
        .update(expiry.into())
        .finalize();
    PoseidonTrait::new()
        .update('StarkNet Message')
        .update(domain.hash_struct())
        .update(signer.into())
        .update(delegation)
        .finalize()
}

fn signer() -> ContractAddress {
    let key = StarkCurveKeyPairImpl::from_secret_key(SECRET);
    deploy("MockSigner", array![key.public_key])
}

fn sign(hash: felt252) -> Array<felt252> {
    let key = StarkCurveKeyPairImpl::from_secret_key(SECRET);
    let (r, s) = key.sign(hash).unwrap();
    array![r, s]
}

#[test]
fn test_vault_delegate_by_sig() {
    let s = setup();
    let v = votes(s);
    let account = signer();
    start_cheat_caller_address(s.paved.contract_address, RECIPIENT());
    s.paved.transfer(account, 100 * PAVED);
    stop_cheat_caller_address(s.paved.contract_address);
    deposit(s, account, 100 * PAVED);
    let expiry = T0 + 100;
    let hash = delegation_hash(s.vault.contract_address, account, BOB(), 0, expiry);
    let mut spy = spy_events();
    // Anyone may relay it
    start_cheat_caller_address(s.vault.contract_address, CAROL());
    v.delegate_by_sig(account, BOB(), 0, expiry, sign(hash).span());
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(v.delegates(account), BOB());
    assert_eq!(v.get_votes(BOB()), 100 * PAVED);
    assert_eq!(INoncesDispatcher { contract_address: s.vault.contract_address }.nonces(account), 1);
    spy
        .assert_emitted(
            @array![
                (
                    s.vault.contract_address,
                    VaultEvent::VotesEvent(
                        VotesComponent::Event::DelegateChanged(
                            VotesComponent::DelegateChanged {
                                delegator: account, from_delegate: Zero::zero(), to_delegate: BOB(),
                            },
                        ),
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Nonces: invalid nonce')]
fn test_vault_delegate_by_sig_replay_reverts() {
    let s = setup();
    let v = votes(s);
    let account = signer();
    let expiry = T0 + 100;
    let signature = sign(delegation_hash(s.vault.contract_address, account, BOB(), 0, expiry));
    v.delegate_by_sig(account, BOB(), 0, expiry, signature.span());
    v.delegate_by_sig(account, BOB(), 0, expiry, signature.span());
}

#[test]
#[should_panic(expected: 'Votes: expired signature')]
fn test_vault_delegate_by_sig_expired_reverts() {
    let s = setup();
    let account = signer();
    let expiry = T0 - 1;
    let signature = sign(delegation_hash(s.vault.contract_address, account, BOB(), 0, expiry));
    votes(s).delegate_by_sig(account, BOB(), 0, expiry, signature.span());
}

#[test]
#[should_panic(expected: 'Votes: invalid signature')]
fn test_vault_delegate_by_sig_for_another_delegatee_reverts() {
    let s = setup();
    let account = signer();
    let expiry = T0 + 100;
    // Signed for Bob, relayed for Carol
    let signature = sign(delegation_hash(s.vault.contract_address, account, BOB(), 0, expiry));
    votes(s).delegate_by_sig(account, CAROL(), 0, expiry, signature.span());
}

// Coverage T1 (docs/measures/coverage.md): the limits, the zero-share refusal on `mint`, the fee
// maths to the unit, and the camelCase entry points

/// `ceil(a / b)`.
fn ceil_div(a: u256, b: u256) -> u256 {
    (a + b - 1) / b
}

/// The Vault takes any deposit and any mint: its limits are the type's, for any account.
#[test]
fn test_vault_max_deposit_and_max_mint_are_unbounded() {
    let s = setup_with(500);
    let max = Bounded::<u256>::MAX;
    assert_eq!(s.vault.max_deposit(ALICE()), max);
    assert_eq!(s.vault.max_mint(ALICE()), max);
    assert_eq!(s.vault.max_deposit(BOB()), max);
    assert_eq!(s.vault.max_mint(BOB()), max);
    assert_eq!(s.vault.max_deposit(s.vault.contract_address), max);
    assert_eq!(s.vault.max_mint(Zero::zero()), max);
}

/// A mint of no share reverts, as a deposit of none does.
#[test]
#[should_panic(expected: 'Vault: zero shares')]
fn test_vault_mint_of_zero_shares_reverts() {
    let s = setup();
    mint(s, ALICE(), 0);
}

/// At 100 bps and an odd rate, `preview_withdraw(a)` is the shares of `a` plus its fee rounded up,
/// converted up: `ceil((a + ceil(a x 100 / 10_000)) x (S + 1) / (A + 1))`, and `withdraw` burns it.
#[test]
fn test_vault_preview_withdraw_is_exact_with_the_fee() {
    let s = setup_with(100);
    deposit(s, ALICE(), 1_000 * PAVED);
    donate(s, 3 * PAVED + 1);
    let supply = s.vault.total_supply();
    let assets = s.vault.total_assets();
    assert_eq!((supply, assets), (2_000 * PAVED, 2_003 * PAVED + 1));
    // An amount whose fee needs rounding: 100 PAVED + 7 base units
    let amount = 100 * PAVED + 7;
    let fee = ceil_div(amount * 100, 10_000);
    assert_eq!(fee, PAVED + 1);
    let expected = ceil_div((amount + fee) * (supply + 1), assets + 1);
    assert_eq!(s.vault.preview_withdraw(amount), expected);
    // Strictly between the shares of the amount and of the amount plus a whole percent
    assert!(expected > s.vault.convert_to_shares(amount));
    let shares_before = s.vault.balance_of(ALICE());
    let paved_before = s.paved.balance_of(ALICE());
    assert_eq!(withdraw(s, ALICE(), amount), expected);
    assert_eq!(s.vault.balance_of(ALICE()), shares_before - expected);
    assert_eq!(s.paved.balance_of(ALICE()), paved_before + amount);
    // The fee stays in the Vault: it left `amount` only
    assert_eq!(s.vault.total_assets(), assets - amount);
}

/// At the ceiling, 1,000 bps, and a rate of 1: a redeem worth 110 PAVED pays exactly 100 (the fee,
/// 10, is `110 x 1000 / 11000`), and a withdraw of 100 burns the shares of 110 (the fee, 10, is
/// `100 x 1000 / 10000`). Two Vaults at the same rate, one for each exit.
#[test]
fn test_vault_exits_at_the_fee_ceiling() {
    let s = setup_with(MAX_EXIT_FEE_BPS);
    let t = setup_with(MAX_EXIT_FEE_BPS);
    deposit(s, ALICE(), 1_100 * PAVED);
    deposit(t, ALICE(), 1_100 * PAVED);
    assert_eq!(rate(s), PAVED);
    assert_eq!(rate(t), PAVED);
    // The redeem
    assert_eq!(s.vault.preview_redeem(110 * PAVED), 100 * PAVED);
    let paved = s.paved.balance_of(ALICE());
    assert_eq!(redeem(s, ALICE(), 110 * PAVED), 100 * PAVED);
    assert_eq!(s.paved.balance_of(ALICE()), paved + 100 * PAVED);
    assert_eq!(s.vault.balance_of(ALICE()), 990 * PAVED);
    // The fee, 10 PAVED, stays: 2,100 - 100 PAVED over 2,100 - 110 shares
    assert_eq!(s.vault.total_assets(), 2_000 * PAVED);
    assert_eq!(s.vault.total_supply(), 1_990 * PAVED);
    // The withdraw
    assert_eq!(t.vault.preview_withdraw(100 * PAVED), 110 * PAVED);
    let paved = t.paved.balance_of(ALICE());
    assert_eq!(withdraw(t, ALICE(), 100 * PAVED), 110 * PAVED);
    assert_eq!(t.paved.balance_of(ALICE()), paved + 100 * PAVED);
    assert_eq!(t.vault.balance_of(ALICE()), 990 * PAVED);
    assert_eq!(t.vault.total_assets(), 2_000 * PAVED);
    assert_eq!(t.vault.total_supply(), 1_990 * PAVED);
}

/// The fee rounds up, so on dust it takes everything: at 500 bps and a rate of 1, one share is
/// worth 1 base unit, whose fee is 1 (`ceil(1 x 500 / 10500)`): the redeem pays 0 and burns the
/// share.
#[test]
fn test_vault_redeem_of_dust_pays_nothing() {
    let s = setup_with(500);
    deposit(s, ALICE(), 1_000 * PAVED);
    assert_eq!(rate(s), PAVED);
    assert_eq!(s.vault.convert_to_assets(1), 1);
    assert_eq!(s.vault.preview_redeem(1), 0);
    let shares = s.vault.balance_of(ALICE());
    let supply = s.vault.total_supply();
    let assets = s.vault.total_assets();
    let paved = s.paved.balance_of(ALICE());
    assert_eq!(redeem(s, ALICE(), 1), 0);
    assert_eq!(s.vault.balance_of(ALICE()), shares - 1);
    assert_eq!(s.vault.total_supply(), supply - 1);
    assert_eq!(s.paved.balance_of(ALICE()), paved);
    // The base unit stays in the Vault, for those who stay
    assert_eq!(s.vault.total_assets(), assets);
}

/// A withdraw or a redeem of 0 pays 0 and burns 0, and does not revert (today's behaviour).
#[test]
fn test_vault_zero_exits_change_nothing() {
    let s = setup_with(500);
    deposit(s, ALICE(), 1_000 * PAVED);
    let shares = s.vault.balance_of(ALICE());
    let paved = s.paved.balance_of(ALICE());
    let supply = s.vault.total_supply();
    let assets = s.vault.total_assets();
    assert_eq!(withdraw(s, ALICE(), 0), 0);
    assert_eq!(redeem(s, ALICE(), 0), 0);
    assert_eq!(s.vault.balance_of(ALICE()), shares);
    assert_eq!(s.paved.balance_of(ALICE()), paved);
    assert_eq!(s.vault.total_supply(), supply);
    assert_eq!(s.vault.total_assets(), assets);
}

/// The camelCase entry points of the share (`totalSupply`, `balanceOf`, `transferFrom`) answer as
/// the snake_case ones do, and `transferFrom` moves the shares and spends the allowance.
#[test]
fn test_vault_camel_entry_points() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    let camel = IERC20MixinDispatcher { contract_address: s.vault.contract_address };
    assert_eq!(camel.totalSupply(), s.vault.total_supply());
    assert_eq!(camel.totalSupply(), 2_000 * PAVED);
    assert_eq!(camel.balanceOf(ALICE()), s.vault.balance_of(ALICE()));
    assert_eq!(camel.balanceOf(ALICE()), 1_000 * PAVED);
    assert_eq!(camel.balanceOf(OWNER()), STAKE);
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    s.vault.approve(BOB(), 300 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    start_cheat_caller_address(s.vault.contract_address, BOB());
    assert!(camel.transferFrom(ALICE(), CAROL(), 100 * PAVED));
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(s.vault.balance_of(ALICE()), 900 * PAVED);
    assert_eq!(s.vault.balance_of(CAROL()), 100 * PAVED);
    assert_eq!(s.vault.allowance(ALICE(), BOB()), 200 * PAVED);
    assert_eq!(camel.balanceOf(CAROL()), 100 * PAVED);
    assert_eq!(camel.totalSupply(), 2_000 * PAVED);
}

// The USDC reward (D-31, as Nums' Vault)

fn rewards(s: Setup) -> IVaultDispatcher {
    IVaultDispatcher { contract_address: s.vault.contract_address }
}

/// What `Economy` does at a purchase: `amount` USDC approved to the Vault, then `pay`.
fn pay(s: Setup, amount: u256) {
    IFaucetDispatcher { contract_address: s.usdc.contract_address }.mint(PAYER(), amount);
    start_cheat_caller_address(s.usdc.contract_address, PAYER());
    s.usdc.approve(s.vault.contract_address, amount);
    stop_cheat_caller_address(s.usdc.contract_address);
    start_cheat_caller_address(s.vault.contract_address, PAYER());
    rewards(s).pay(amount);
    stop_cheat_caller_address(s.vault.contract_address);
}

fn claim(s: Setup, account: ContractAddress) -> u256 {
    start_cheat_caller_address(s.vault.contract_address, account);
    let amount = rewards(s).claim();
    stop_cheat_caller_address(s.vault.contract_address);
    amount
}

fn as_owner(s: Setup) {
    start_cheat_caller_address(s.vault.contract_address, OWNER());
}

fn holder(account: bool) -> ContractAddress {
    deploy("MockHolder", array![if account {
        1
    } else {
        0
    }])
}

/// A payment is shared by balance among the holders of the time: the index rises by the payment
/// over the supply, and each holder can claim its part.
#[test]
fn test_vault_pay_shares_the_usdc_by_balance() {
    let s = setup();
    deposit(s, ALICE(), 3_000 * PAVED);
    let mut spy = spy_events();
    pay(s, 100 * USDC);
    let r = rewards(s);
    // 100 USDC over 4,000 vPAVED: 25,000 base units of USDC per vPAVED, times 10^36 over 10^18
    let index = 100 * USDC * REWARD_SCALE / (4_000 * PAVED);
    assert_eq!(r.reward_index(), index);
    assert_eq!(r.claimable_of(ALICE()), 75 * USDC);
    assert_eq!(r.claimable_of(OWNER()), 25 * USDC);
    assert_eq!(r.claimable_of(BOB()), 0);
    assert_eq!((r.total_paid(), r.total_claimed()), (100 * USDC, 0));
    assert_eq!(s.usdc.balance_of(s.vault.contract_address), 100 * USDC);
    // Earned is claimed plus claimable; nothing claimed yet
    assert_eq!((r.earned_of(ALICE()), r.claimed_of(ALICE())), (75 * USDC, 0));
    // A payment changes neither the rate nor the supply
    assert_eq!(rate(s), PAVED);
    assert_eq!(s.vault.total_supply(), 4_000 * PAVED);
    let event = Paid { payer: PAYER(), amount: 100 * USDC, index };
    spy.assert_emitted(@array![(s.vault.contract_address, VaultEvent::Paid(event))]);
}

/// The 1:1 note's exactness case (section 7): Alice holds, a payment `I`; she sends half her shares
/// to Bob; a payment `J`. Alice earns her part of `I` and half her part of `J`, Bob the other half.
#[test]
fn test_vault_reward_follows_share_transfers_exactly() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pay(s, 100 * USDC);
    transfer(s, ALICE(), BOB(), 500 * PAVED);
    pay(s, 40 * USDC);
    let r = rewards(s);
    assert_eq!(r.claimable_of(ALICE()), 50 * USDC + 10 * USDC);
    assert_eq!(r.claimable_of(BOB()), 10 * USDC);
    assert_eq!(r.claimable_of(OWNER()), 50 * USDC + 20 * USDC);
    // An approved `transfer_from` settles the same way
    start_cheat_caller_address(s.vault.contract_address, BOB());
    s.vault.approve(CAROL(), 500 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    start_cheat_caller_address(s.vault.contract_address, CAROL());
    s.vault.transfer_from(BOB(), CAROL(), 500 * PAVED);
    stop_cheat_caller_address(s.vault.contract_address);
    pay(s, 20 * USDC);
    assert_eq!(r.claimable_of(BOB()), 10 * USDC);
    assert_eq!(r.claimable_of(CAROL()), 5 * USDC);
}

/// New shares earn only what is paid after them: a deposit settles its receiver first.
#[test]
fn test_vault_new_shares_earn_only_later_payments() {
    let s = setup();
    pay(s, 100 * USDC);
    deposit(s, ALICE(), 1_000 * PAVED);
    let r = rewards(s);
    assert_eq!(r.claimable_of(ALICE()), 0);
    assert_eq!(r.claimable_of(OWNER()), 100 * USDC);
    pay(s, 20 * USDC);
    assert_eq!(r.claimable_of(ALICE()), 10 * USDC);
    assert_eq!(r.claimable_of(OWNER()), 110 * USDC);
    // A mint settles the same way
    mint(s, BOB(), 2_000 * PAVED);
    assert_eq!(r.claimable_of(BOB()), 0);
}

/// An exit keeps what the shares earned: a redeem or a withdraw settles its owner first, and the
/// USDC stays claimable with no share left.
#[test]
fn test_vault_exits_keep_the_reward() {
    let s = setup_with(DEFAULT_EXIT_FEE_BPS);
    deposit(s, ALICE(), 1_000 * PAVED);
    deposit(s, BOB(), 2_000 * PAVED);
    pay(s, 40 * USDC);
    redeem(s, ALICE(), 1_000 * PAVED);
    withdraw(s, BOB(), 1_000 * PAVED);
    let r = rewards(s);
    assert_eq!(s.vault.balance_of(ALICE()), 0);
    assert_eq!(r.claimable_of(ALICE()), 10 * USDC);
    assert_eq!(r.claimable_of(BOB()), 20 * USDC);
    // Alice earns nothing more; Bob on what he kept
    let bob = s.vault.balance_of(BOB());
    let supply = s.vault.total_supply();
    pay(s, 30 * USDC);
    assert_eq!(r.claimable_of(ALICE()), 10 * USDC);
    let index = r.reward_index();
    assert_eq!(
        r.claimable_of(BOB()),
        20 * USDC + bob * (index - 40 * USDC * REWARD_SCALE / (4_000 * PAVED)) / REWARD_SCALE,
    );
    assert!(supply < 3_000 * PAVED);
    assert_eq!(claim(s, ALICE()), 10 * USDC);
}

/// A claim pays the holder all its USDC, whenever it likes, and leaves it nothing to claim; the
/// views keep the totals: earned is claimed plus claimable.
#[test]
fn test_vault_claim_pays_and_keeps_the_totals() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pay(s, 60 * USDC);
    let mut spy = spy_events();
    assert_eq!(claim(s, ALICE()), 30 * USDC);
    let r = rewards(s);
    assert_eq!(s.usdc.balance_of(ALICE()), 30 * USDC);
    assert_eq!(r.claimable_of(ALICE()), 0);
    assert_eq!(r.claimed_of(ALICE()), 30 * USDC);
    assert_eq!(r.earned_of(ALICE()), 30 * USDC);
    assert_eq!(r.total_claimed(), 30 * USDC);
    assert_eq!(s.usdc.balance_of(s.vault.contract_address), 30 * USDC);
    let event = Claimed { account: ALICE(), amount: 30 * USDC };
    spy.assert_emitted(@array![(s.vault.contract_address, VaultEvent::Claimed(event))]);
    // A second payment: claimable again, earned grows, claimed stays
    pay(s, 20 * USDC);
    assert_eq!(r.claimable_of(ALICE()), 10 * USDC);
    assert_eq!(r.earned_of(ALICE()), 40 * USDC);
    assert_eq!(claim(s, ALICE()), 10 * USDC);
    assert_eq!(r.claimed_of(ALICE()), 40 * USDC);
}

#[test]
#[should_panic(expected: 'Vault: nothing to claim')]
fn test_vault_claim_of_nothing_reverts() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    claim(s, ALICE());
}

/// A claim keeps the fraction of a base unit it cannot pay: nothing is lost to a claim's rounding.
#[test]
fn test_vault_claim_keeps_the_fraction() {
    let s = setup();
    deposit(s, ALICE(), 3_000 * PAVED);
    // 1 base unit over 4,000 vPAVED: Alice earns 3/4 of a base unit per payment, the owner 1/4
    pay(s, 1);
    pay(s, 1);
    let r = rewards(s);
    assert_eq!(r.claimable_of(ALICE()), 1);
    assert_eq!(claim(s, ALICE()), 1);
    // The half kept by the claim joins the next two payments: 1/2 + 3/4 + 3/4 = 2
    pay(s, 1);
    pay(s, 1);
    assert_eq!(r.claimable_of(ALICE()), 2);
    assert_eq!(r.earned_of(ALICE()), 3);
}

/// A payment while no share exists waits, and the next payment shares it with the first holders
/// (Nums reverts instead, which would stop every purchase while the Vault is empty).
#[test]
fn test_vault_payment_with_no_share_waits_for_the_next() {
    let s = empty_with(0);
    pay(s, 30 * USDC);
    let r = rewards(s);
    assert_eq!((r.reward_waiting(), r.reward_index(), r.total_paid()), (30 * USDC, 0, 30 * USDC));
    deposit(s, OWNER(), STAKE);
    assert_eq!(r.claimable_of(OWNER()), 0);
    pay(s, 10 * USDC);
    assert_eq!(r.reward_waiting(), 0);
    assert_eq!(r.claimable_of(OWNER()), 40 * USDC);
}

#[test]
fn test_vault_pay_of_zero_does_nothing() {
    let s = setup();
    let mut spy = spy_events();
    start_cheat_caller_address(s.vault.contract_address, PAYER());
    rewards(s).pay(0);
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!((rewards(s).reward_index(), rewards(s).total_paid()), (0, 0));
    assert_eq!(spy.get_events().events.len(), 0);
}

// Collect (D-31: the owner takes what a contract holder cannot claim)

/// A pool (a contract that answers SRC5 but is no account) holds shares: the owner collects its
/// USDC and receives it; the pool's position counts it as paid out.
#[test]
fn test_vault_owner_collects_a_contract_holders_usdc() {
    let s = setup();
    let pool = holder(false);
    deposit(s, ALICE(), 1_000 * PAVED);
    transfer(s, ALICE(), pool, 1_000 * PAVED);
    pay(s, 50 * USDC);
    let r = rewards(s);
    assert_eq!(r.claimable_of(pool), 25 * USDC);
    let mut spy = spy_events();
    as_owner(s);
    assert_eq!(r.collect(pool), 25 * USDC);
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(s.usdc.balance_of(OWNER()), 25 * USDC);
    assert_eq!((r.claimable_of(pool), r.claimed_of(pool)), (0, 25 * USDC));
    assert_eq!(r.total_claimed(), 25 * USDC);
    let event = Collected { holder: pool, recipient: OWNER(), amount: 25 * USDC };
    spy.assert_emitted(@array![(s.vault.contract_address, VaultEvent::Collected(event))]);
}

/// Shares sent to the Vault itself earn like any holder's, and the owner collects them with no
/// probe (the Vault is no account).
#[test]
fn test_vault_owner_collects_the_vaults_own_position() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    transfer(s, ALICE(), s.vault.contract_address, 1_000 * PAVED);
    pay(s, 10 * USDC);
    as_owner(s);
    assert_eq!(rewards(s).collect(s.vault.contract_address), 5 * USDC);
}

#[test]
#[should_panic(expected: 'Vault: holder is an account')]
fn test_vault_collect_from_an_account_reverts() {
    let s = setup();
    let account = holder(true);
    deposit(s, ALICE(), 1_000 * PAVED);
    transfer(s, ALICE(), account, 1_000 * PAVED);
    pay(s, 10 * USDC);
    as_owner(s);
    rewards(s).collect(account);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_vault_collect_by_a_stranger_reverts() {
    let s = setup();
    let pool = holder(false);
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    rewards(s).collect(pool);
}

#[test]
#[should_panic(expected: 'Vault: nothing to claim')]
fn test_vault_collect_of_nothing_reverts() {
    let s = setup();
    let pool = holder(false);
    as_owner(s);
    rewards(s).collect(pool);
}

#[test]
#[should_panic(expected: 'Vault: zero address')]
fn test_vault_collect_from_zero_reverts() {
    let s = setup();
    as_owner(s);
    rewards(s).collect(Zero::zero());
}

// Pause and close (D-31, as Nums)

fn pause(s: Setup) {
    as_owner(s);
    rewards(s).pause();
    stop_cheat_caller_address(s.vault.contract_address);
}

fn close(s: Setup) {
    as_owner(s);
    rewards(s).close();
    stop_cheat_caller_address(s.vault.contract_address);
}

/// The pause stops no payment, transfer or vote: purchases go on, and the holders keep earning.
#[test]
fn test_vault_pause_lets_payments_and_transfers_through() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    let mut spy = spy_events();
    pause(s);
    assert!(rewards(s).is_paused());
    pay(s, 20 * USDC);
    transfer(s, ALICE(), BOB(), 500 * PAVED);
    delegate(s, BOB(), BOB());
    assert_eq!(rewards(s).claimable_of(ALICE()), 10 * USDC);
    as_owner(s);
    rewards(s).unpause();
    stop_cheat_caller_address(s.vault.contract_address);
    assert!(!rewards(s).is_paused());
    assert_eq!(claim(s, ALICE()), 10 * USDC);
    spy
        .assert_emitted(
            @array![
                (s.vault.contract_address, VaultEvent::Paused(Paused { account: OWNER() })),
                (s.vault.contract_address, VaultEvent::Unpaused(Unpaused { account: OWNER() })),
            ],
        );
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_stops_deposits() {
    let s = setup();
    pause(s);
    deposit(s, ALICE(), 1_000 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_stops_mints() {
    let s = setup();
    pause(s);
    mint(s, ALICE(), 1_000 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_stops_redeems() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pause(s);
    redeem(s, ALICE(), 1_000 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_stops_withdraws() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pause(s);
    withdraw(s, ALICE(), 100 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_stops_claims() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pay(s, 10 * USDC);
    pause(s);
    claim(s, ALICE());
}

#[test]
#[should_panic(expected: 'Vault: paused')]
fn test_vault_pause_twice_reverts() {
    let s = setup();
    pause(s);
    pause(s);
}

#[test]
#[should_panic(expected: 'Vault: not paused')]
fn test_vault_unpause_when_not_paused_reverts() {
    let s = setup();
    as_owner(s);
    rewards(s).unpause();
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_vault_pause_by_a_stranger_reverts() {
    let s = setup();
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    rewards(s).pause();
}

/// A closed Vault takes deposits but lets no PAVED or USDC out; open again, everything works.
#[test]
fn test_vault_close_takes_deposits_and_reopens() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pay(s, 10 * USDC);
    let mut spy = spy_events();
    close(s);
    assert!(!rewards(s).is_open());
    deposit(s, BOB(), 1_000 * PAVED);
    as_owner(s);
    rewards(s).open();
    stop_cheat_caller_address(s.vault.contract_address);
    assert!(rewards(s).is_open());
    assert_eq!(claim(s, ALICE()), 5 * USDC);
    assert_eq!(redeem(s, ALICE(), 1_000 * PAVED), 1_000 * PAVED);
    spy
        .assert_emitted(
            @array![
                (s.vault.contract_address, VaultEvent::Closed(Closed { account: OWNER() })),
                (s.vault.contract_address, VaultEvent::Opened(Opened { account: OWNER() })),
            ],
        );
}

#[test]
#[should_panic(expected: 'Vault: closed')]
fn test_vault_close_stops_redeems() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    close(s);
    redeem(s, ALICE(), 1_000 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: closed')]
fn test_vault_close_stops_withdraws() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    close(s);
    withdraw(s, ALICE(), 100 * PAVED);
}

#[test]
#[should_panic(expected: 'Vault: closed')]
fn test_vault_close_stops_claims() {
    let s = setup();
    deposit(s, ALICE(), 1_000 * PAVED);
    pay(s, 10 * USDC);
    close(s);
    claim(s, ALICE());
}

#[test]
#[should_panic(expected: 'Vault: open')]
fn test_vault_open_when_open_reverts() {
    let s = setup();
    as_owner(s);
    rewards(s).open();
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_vault_close_by_a_stranger_reverts() {
    let s = setup();
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    rewards(s).close();
}

/// A seeded random walk of deposits, redeems, transfers, payments and claims among three accounts
/// and the owner. After every step no USDC is created: what the holders can claim plus what they
/// claimed never exceeds what was paid, the Vault holds what was paid less what was claimed, and
/// the rounding loses at most one base unit per payment. At the end everyone claims.
#[test]
fn test_vault_random_walk_creates_and_loses_no_usdc() {
    let s = setup();
    let r = rewards(s);
    let accounts = array![ALICE(), BOB(), CAROL(), OWNER()];
    let mut seed: u256 = 0xc1a1;
    let mut payments: u256 = 0;
    let mut step: u32 = 0;
    while step != 120 {
        seed = (seed * 6364136223846793005 + 1442695040888963407) % 0x10000000000000000;
        let account = *accounts.at((seed % 3).try_into().unwrap());
        let other = *accounts.at(((seed / 3) % 4).try_into().unwrap());
        let amount = (seed / 12) % (500 * PAVED) + 1;
        let balance = s.vault.balance_of(account);
        let kind = (seed / 7) % 6;
        if kind == 0 {
            if s.vault.preview_deposit(amount) != 0 {
                deposit(s, account, amount);
            }
        } else if kind == 1 {
            if balance != 0 {
                redeem(s, account, amount % balance + 1);
            }
        } else if kind == 2 {
            if balance != 0 && account != other {
                transfer(s, account, other, amount % balance + 1);
            }
        } else if kind == 3 || kind == 4 {
            pay(s, amount % (50 * USDC) + 1);
            payments += 1;
        } else if r.claimable_of(account) != 0 {
            claim(s, account);
        }
        // [Check] No USDC created; the Vault holds the rest; the rounding loses little
        let mut claimable: u256 = 0;
        for holder in accounts.span() {
            claimable += r.claimable_of(*holder);
            assert_eq!(r.earned_of(*holder), r.claimed_of(*holder) + r.claimable_of(*holder));
        }
        let paid = r.total_paid();
        let claimed = r.total_claimed();
        assert!(claimable + claimed <= paid, "step {}: more owed than paid", step);
        assert!(
            paid - claimable - claimed <= payments + 4,
            "step {}: lost {}",
            step,
            paid - claimable - claimed,
        );
        assert_eq!(s.usdc.balance_of(s.vault.contract_address), paid - claimed);
        step += 1;
    }
    // Everyone claims what is left
    for holder in accounts.span() {
        if r.claimable_of(*holder) != 0 {
            claim(s, *holder);
        }
    }
    let left = s.usdc.balance_of(s.vault.contract_address);
    assert!(left <= payments + 4, "{} base units left", left);
    assert_eq!(left, r.total_paid() - r.total_claimed());
}
