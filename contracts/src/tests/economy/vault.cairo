//! The staking `Vault`, vPAVED (P-56, `docs/architecture/vault-share.md`, addendum): an ERC4626
//! over PAVED, its rate, the exit fee kept for the holders who stay, the dead shares against the
//! inflation attack, the votes and their delegation by signature, and the rounding, which always
//! favours the Vault.

use core::hash::HashStateTrait;
use core::num::traits::Zero;
use core::poseidon::PoseidonTrait;
use openzeppelin_governance::votes::VotesComponent;
use openzeppelin_governance::votes::delegation::DELEGATION_TYPE_HASH;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_interfaces::erc4626::{ERC4626ABIDispatcher, ERC4626ABIDispatcherTrait};
use openzeppelin_interfaces::nonces::{INoncesDispatcher, INoncesDispatcherTrait};
use openzeppelin_interfaces::votes::{IVotesDispatcher, IVotesDispatcherTrait};
use openzeppelin_utils::cryptography::snip12::{StarknetDomain, StructHash};
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::systems::vault::Vault::{Event as VaultEvent, ExitFeeSet};
use paved::systems::vault::{
    DEAD_ASSETS, DEFAULT_EXIT_FEE_BPS, IVaultDispatcher, IVaultDispatcherTrait, MAX_EXIT_FEE_BPS,
};
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use snforge_std::signature::{KeyPairTrait, SignerTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
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

/// One PAVED in base units.
const PAVED: u256 = 1_000_000_000_000_000_000;
const T0: u64 = 1_000_000;

#[derive(Copy, Drop)]
struct Setup {
    vault: ERC4626ABIDispatcher,
    paved: IERC20Dispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

fn deploy_vault(paved: ContractAddress, fee: u16) -> ContractAddress {
    deploy("Vault", array![OWNER().into(), paved.into(), fee.into()])
}

/// The token (initial supply to `RECIPIENT`), the Vault at `fee` with its 1,000 PAVED of dead
/// shares, as `deploy.sh` makes them; Alice, Bob and Carol receive 100,000 PAVED each. At `T0`.
fn setup_with(fee: u16) -> Setup {
    start_cheat_block_timestamp_global(T0);
    let paved_address = deploy_token(RECIPIENT());
    let vault_address = deploy_vault(paved_address, fee);
    let s = Setup {
        vault: ERC4626ABIDispatcher { contract_address: vault_address },
        paved: IERC20Dispatcher { contract_address: paved_address },
    };
    start_cheat_caller_address(paved_address, RECIPIENT());
    s.paved.transfer(ALICE(), 100_000 * PAVED);
    s.paved.transfer(BOB(), 100_000 * PAVED);
    s.paved.transfer(CAROL(), 100_000 * PAVED);
    s.paved.approve(vault_address, DEAD_ASSETS);
    stop_cheat_caller_address(paved_address);
    start_cheat_caller_address(vault_address, RECIPIENT());
    s.vault.deposit(DEAD_ASSETS, vault_address);
    stop_cheat_caller_address(vault_address);
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

/// PAVED reaching the Vault without shares, as `Economy` sends the margin.
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
    // The dead shares: 1,000 vPAVED held by the Vault, backed by 1,000 PAVED, at a rate of 1
    assert_eq!(s.vault.balance_of(s.vault.contract_address), DEAD_ASSETS);
    assert_eq!(s.vault.total_supply(), DEAD_ASSETS);
    assert_eq!(s.vault.total_assets(), DEAD_ASSETS);
    assert_eq!(rate(s), PAVED);
}

#[test]
fn test_vault_constructor_refuses_a_fee_above_the_ceiling() {
    let paved = deploy_token(RECIPIENT());
    let class = declare("Vault").unwrap().contract_class();
    let fee: felt252 = (MAX_EXIT_FEE_BPS + 1).into();
    match class.deploy(@array![OWNER().into(), paved.into(), fee]) {
        Result::Ok(_) => panic!("a fee of 1,001 bps was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Vault: fee too high'),
    }
    // The ceiling itself passes
    deploy_vault(paved, MAX_EXIT_FEE_BPS);
}

#[test]
#[should_panic]
fn test_vault_constructor_refuses_a_zero_owner() {
    let paved = deploy_token(RECIPIENT());
    deploy("Vault", array![0, paved.into(), 0]);
}

#[test]
#[should_panic]
fn test_vault_constructor_refuses_a_zero_asset() {
    deploy_vault(Zero::zero(), 0);
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

/// PAVED that reaches the Vault without shares (the margin) raises the rate by exactly that amount
/// over the shares, and a later depositor buys in at the new rate: none of it is theirs.
#[test]
fn test_vault_margin_raises_the_rate_for_the_holders_of_the_time() {
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
    // Alice's 1,000 shares hold half the margin (the dead shares the other half)
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
/// shares and the dead ones share what she left behind.
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

/// The classic attack, with the dead shares in place: Alice deposits one base unit, then donates
/// 10,000 PAVED to inflate the share; Bob's 1,000 PAVED deposit still gets shares worth his
/// deposit to the rounding, and Alice loses nearly all her donation to the dead shares.
#[test]
fn test_vault_inflation_attack_fails_with_the_dead_shares() {
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

/// Every holder but the dead shares leaves while the margin keeps coming: the next depositor still
/// gets shares worth their deposit, since the dead shares hold the pile.
#[test]
fn test_vault_margin_while_only_the_dead_shares_remain_is_not_taken_by_the_next_depositor() {
    let s = setup();
    let shares = deposit(s, ALICE(), 5_000 * PAVED);
    redeem(s, ALICE(), shares);
    assert_eq!(s.vault.total_supply(), DEAD_ASSETS);
    donate(s, 3_000 * PAVED);
    let got = deposit(s, BOB(), 2_000 * PAVED);
    let worth = s.vault.convert_to_assets(got);
    assert!(worth <= 2_000 * PAVED && 2_000 * PAVED - worth <= 4, "worth {}", worth);
}

// Transfers

/// The share is a plain ERC20: a transfer, an approved `transfer_from`, a transfer to the Vault
/// itself (allowed: the Vault earns nothing a holder could miss) all move the PAVED behind it.
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
    assert_eq!(s.vault.balance_of(s.vault.contract_address), DEAD_ASSETS + 100 * PAVED);
    // Bob redeems what Alice sent him at the rate: 3,000 PAVED over 2,000 shares
    assert_eq!(redeem(s, BOB(), 400 * PAVED), 600 * PAVED - 1);
}

/// A seeded random walk of deposits, mints, withdraws, redeems, transfers, margins and fee changes
/// among three accounts. After every step the PAVED the Vault holds covers what all its shares
/// convert to, and the dead shares never lose value. At the end every holder redeems: the three
/// took out no more than they put in plus the margins, and the Vault keeps at least the dead
/// shares' 1,000 PAVED.
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
        // [Check] The Vault holds what every share converts to, the dead shares included
        let total = s.vault.total_supply();
        assert!(s.vault.total_assets() >= s.vault.convert_to_assets(total), "step {}", step);
        assert!(s.vault.convert_to_assets(DEAD_ASSETS) >= DEAD_ASSETS - 1, "dead {}", step);
        step += 1;
    }
    // Everyone leaves
    for account in accounts.span() {
        let shares = s.vault.balance_of(*account);
        if shares != 0 {
            redeem(s, *account, shares);
        }
    }
    assert_eq!(s.vault.total_supply(), DEAD_ASSETS);
    let held = s.paved.balance_of(ALICE())
        + s.paved.balance_of(BOB())
        + s.paved.balance_of(CAROL());
    assert!(held <= 300_000 * PAVED + margins, "the holders took more than they gave");
    assert!(s.vault.total_assets() >= DEAD_ASSETS, "the dead shares are backed");
    // Every PAVED is accounted for: the holders', the Vault's, the margins'
    assert_eq!(held + s.vault.total_assets(), 300_000 * PAVED + DEAD_ASSETS + margins);
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
    // A margin moves the rate, never a vote
    donate(s, 10_000 * PAVED);
    assert_eq!(v.get_votes(ALICE()), 500 * PAVED);
    // The dead shares are never delegated
    assert_eq!(v.delegates(s.vault.contract_address), Zero::zero());
    assert_eq!(v.get_votes(s.vault.contract_address), 0);
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
    // The total supply counts every share, the dead ones and the undelegated ones
    assert_eq!(v.get_past_total_supply(T0), DEAD_ASSETS);
    assert_eq!(v.get_past_total_supply(T0 + 15), DEAD_ASSETS + 1_000 * PAVED);
    assert_eq!(v.get_past_total_supply(T0 + 20), DEAD_ASSETS + 600 * PAVED);
    assert_eq!(v.get_past_total_supply(T0 + 35), DEAD_ASSETS + 650 * PAVED);
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
