//! The staking `Vault` (P8 E1): USDC dividends pro rata of the PAVED staked, a sync before every
//! action, the first staker, and the rounding bounds.

use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::economy::vault::{ACC_SCALE, IVaultDispatcher, IVaultDispatcherTrait};
use paved::mocks::usdc::{IMockUSDCDispatcher, IMockUSDCDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::token::{RECIPIENT, deploy_token};

fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}

fn BOB() -> ContractAddress {
    'BOB'.try_into().unwrap()
}

fn CAROL() -> ContractAddress {
    'CAROL'.try_into().unwrap()
}

/// One PAVED and one USDC, in base units.
const PAVED: u256 = 1_000_000_000_000_000_000;
const USDC: u256 = 1_000_000;

#[derive(Copy, Drop)]
struct Setup {
    vault: IVaultDispatcher,
    paved: IERC20Dispatcher,
    usdc: IERC20Dispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// The token (initial supply to `RECIPIENT`), the mock USDC and the Vault; Alice, Bob and Carol
/// receive 1,000 PAVED each.
fn setup() -> Setup {
    let paved_address = deploy_token(RECIPIENT());
    let usdc_address = deploy("MockUSDC", array![]);
    let vault_address = deploy("Vault", array![paved_address.into(), usdc_address.into()]);
    let paved = IERC20Dispatcher { contract_address: paved_address };
    start_cheat_caller_address(paved_address, RECIPIENT());
    paved.transfer(ALICE(), 1_000 * PAVED);
    paved.transfer(BOB(), 1_000 * PAVED);
    paved.transfer(CAROL(), 1_000 * PAVED);
    stop_cheat_caller_address(paved_address);
    Setup {
        vault: IVaultDispatcher { contract_address: vault_address },
        paved,
        usdc: IERC20Dispatcher { contract_address: usdc_address },
    }
}

fn stake(s: Setup, account: ContractAddress, amount: u256) {
    start_cheat_caller_address(s.paved.contract_address, account);
    s.paved.approve(s.vault.contract_address, amount);
    stop_cheat_caller_address(s.paved.contract_address);
    start_cheat_caller_address(s.vault.contract_address, account);
    s.vault.stake(amount);
    stop_cheat_caller_address(s.vault.contract_address);
}

fn unstake(s: Setup, account: ContractAddress, amount: u256) {
    start_cheat_caller_address(s.vault.contract_address, account);
    s.vault.unstake(amount);
    stop_cheat_caller_address(s.vault.contract_address);
}

fn claim(s: Setup, account: ContractAddress) -> u256 {
    start_cheat_caller_address(s.vault.contract_address, account);
    let amount = s.vault.claim();
    stop_cheat_caller_address(s.vault.contract_address);
    amount
}

/// USDC reaching the Vault by a plain transfer, as `Economy` sends the margin.
fn income(s: Setup, amount: u256) {
    IMockUSDCDispatcher { contract_address: s.usdc.contract_address }
        .mint(s.vault.contract_address, amount);
}

fn assert_pending(s: Setup, alice: u256, bob: u256, carol: u256) {
    assert_eq!(s.vault.pending(ALICE()), alice);
    assert_eq!(s.vault.pending(BOB()), bob);
    assert_eq!(s.vault.pending(CAROL()), carol);
}

/// The table of `docs/architecture/economy.md` E1: three stakers in sequence, each step's income
/// shared pro rata of the stakes at the time it arrived. Pending USDC after each step:
///
/// | # | Step                 | Stakes A / B / C | Total | Pending A / B / C |
/// |---|----------------------|------------------|-------|-------------------|
/// | 1 | A stakes 100         | 100 / 0 / 0      | 100   | 0 / 0 / 0         |
/// | 2 | income 30            |                  |       | 30 / 0 / 0        |
/// | 3 | B stakes 200         | 100 / 200 / 0    | 300   | 30 / 0 / 0        |
/// | 4 | income 60            |                  |       | 50 / 40 / 0       |
/// | 5 | C stakes 300         | 100 / 200 / 300  | 600   | 50 / 40 / 0       |
/// | 6 | income 120           |                  |       | 70 / 80 / 60      |
/// | 7 | A unstakes 100       | 0 / 200 / 300    | 500   | 70 / 80 / 60      |
/// | 8 | income 100           |                  |       | 70 / 120 / 120    |
/// | 9 | B claims (120)       |                  |       | 70 / 0 / 120      |
/// | 10| income 50            |                  |       | 70 / 20 / 150     |
/// | 11| A, B, C claim        |                  |       | 0 / 0 / 0         |
///
/// The income of steps 2, 4 and 6 is synced by the stake or unstake that follows it, before the
/// stakes change: B gets nothing of step 2, C nothing of step 4, and A keeps their share of step 6.
#[test]
fn test_vault_dividends_pro_rata_over_stakers_in_sequence() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    assert_pending(s, 0, 0, 0);
    income(s, 30 * USDC);
    assert_pending(s, 30 * USDC, 0, 0);
    stake(s, BOB(), 200 * PAVED);
    assert_pending(s, 30 * USDC, 0, 0);
    income(s, 60 * USDC);
    assert_pending(s, 50 * USDC, 40 * USDC, 0);
    stake(s, CAROL(), 300 * PAVED);
    assert_eq!(s.vault.total_staked(), 600 * PAVED);
    assert_pending(s, 50 * USDC, 40 * USDC, 0);
    income(s, 120 * USDC);
    assert_pending(s, 70 * USDC, 80 * USDC, 60 * USDC);
    unstake(s, ALICE(), 100 * PAVED);
    assert_eq!(s.vault.total_staked(), 500 * PAVED);
    assert_eq!(s.vault.staked(ALICE()), 0);
    assert_eq!(s.paved.balance_of(ALICE()), 1_000 * PAVED);
    assert_pending(s, 70 * USDC, 80 * USDC, 60 * USDC);
    income(s, 100 * USDC);
    assert_pending(s, 70 * USDC, 120 * USDC, 120 * USDC);
    assert_eq!(claim(s, BOB()), 120 * USDC);
    assert_eq!(s.usdc.balance_of(BOB()), 120 * USDC);
    assert_pending(s, 70 * USDC, 0, 120 * USDC);
    income(s, 50 * USDC);
    assert_pending(s, 70 * USDC, 20 * USDC, 150 * USDC);
    assert_eq!(claim(s, ALICE()), 70 * USDC);
    assert_eq!(claim(s, BOB()), 20 * USDC);
    assert_eq!(claim(s, CAROL()), 150 * USDC);
    assert_pending(s, 0, 0, 0);
    // Every USDC unit that came in went out: 360 in, 70 + 140 + 150 out
    assert_eq!(s.usdc.balance_of(ALICE()), 70 * USDC);
    assert_eq!(s.usdc.balance_of(BOB()), 140 * USDC);
    assert_eq!(s.usdc.balance_of(CAROL()), 150 * USDC);
    assert_eq!(s.usdc.balance_of(s.vault.contract_address), 0);
    assert_eq!(s.vault.accounted(), 0);
    // The stakes are still there
    assert_eq!(s.paved.balance_of(s.vault.contract_address), 500 * PAVED);
}

#[test]
fn test_vault_sync_before_stake_keeps_earlier_income_from_the_new_staker() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    income(s, 10 * USDC);
    // Bob stakes 9 times Alice's stake right after the income: none of it is his
    stake(s, BOB(), 900 * PAVED);
    assert_eq!(s.vault.accounted(), 10 * USDC);
    assert_eq!(s.vault.acc(), 10 * USDC * ACC_SCALE / (100 * PAVED));
    assert_pending(s, 10 * USDC, 0, 0);
}

#[test]
fn test_vault_sync_before_unstake_pays_the_leaver_its_share() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    stake(s, BOB(), 100 * PAVED);
    income(s, 10 * USDC);
    // Alice leaves right after the income: half of it is hers, and stays claimable
    unstake(s, ALICE(), 100 * PAVED);
    income(s, 10 * USDC);
    assert_pending(s, 5 * USDC, 15 * USDC, 0);
    assert_eq!(claim(s, ALICE()), 5 * USDC);
}

#[test]
fn test_vault_income_before_any_staker_waits_for_the_first() {
    let s = setup();
    income(s, 7 * USDC);
    assert_eq!(s.vault.acc(), 0);
    assert_eq!(s.vault.accounted(), 0);
    stake(s, ALICE(), 100 * PAVED);
    // The stake did not sync it to nobody; the next sync gives it to Alice
    assert_eq!(s.vault.accounted(), 0);
    assert_pending(s, 7 * USDC, 0, 0);
    stake(s, BOB(), 100 * PAVED);
    assert_pending(s, 7 * USDC, 0, 0);
    assert_eq!(claim(s, ALICE()), 7 * USDC);
}

#[test]
fn test_vault_partial_unstake_and_restake() {
    let s = setup();
    stake(s, ALICE(), 300 * PAVED);
    stake(s, BOB(), 100 * PAVED);
    income(s, 40 * USDC);
    unstake(s, ALICE(), 200 * PAVED);
    income(s, 40 * USDC);
    stake(s, ALICE(), 200 * PAVED);
    income(s, 40 * USDC);
    // 30 + 20 + 30 for Alice, 10 + 20 + 10 for Bob
    assert_pending(s, 80 * USDC, 40 * USDC, 0);
    assert_eq!(s.vault.staked(ALICE()), 300 * PAVED);
    assert_eq!(s.paved.balance_of(ALICE()), 700 * PAVED);
}

#[test]
fn test_vault_claim_with_nothing_owed_pays_nothing() {
    let s = setup();
    assert_eq!(claim(s, ALICE()), 0);
    stake(s, ALICE(), 100 * PAVED);
    assert_eq!(claim(s, ALICE()), 0);
    assert_eq!(s.usdc.balance_of(ALICE()), 0);
}

/// The rounding: a sync loses less than 1e-36 USDC base unit per staked unit (`acc` is scaled by
/// 1e36 and rounded down), and a settlement less than one base unit per staker.
#[test]
fn test_vault_dust_bound() {
    let s = setup();
    let a = 1 * PAVED + 1;
    let b = 3 * PAVED + 7;
    let c = 7;
    stake(s, ALICE(), a);
    stake(s, BOB(), b);
    stake(s, CAROL(), c);
    let total = a + b + c;
    let amount = 1_000_001;
    income(s, amount);
    stake(s, CAROL(), 1); // a sync
    let acc = s.vault.acc();
    // The sync's loss, in units of 1e-36 USDC: below one per staked unit
    let lost = amount * ACC_SCALE - acc * total;
    assert!(lost < total, "a sync lost {} / 1e36 for {} staked", lost, total);
    // Each staker gets their exact share, rounded down by less than one base unit
    let pa = s.vault.pending(ALICE());
    let pb = s.vault.pending(BOB());
    let pc = s.vault.pending(CAROL());
    assert!(pa * total <= amount * a && amount * a - pa * total < total + total, "alice");
    assert!(pb * total <= amount * b && amount * b - pb * total < total + total, "bob");
    assert!(pc * total <= amount * c && amount * c - pc * total < total + total, "carol");
    // What the stakers cannot claim is less than one base unit each
    let unpaid = amount - (pa + pb + pc);
    assert!(unpaid < 3, "unpaid {}", unpaid);
    assert_eq!(s.vault.accounted(), amount);
}

/// A tiny income over a large stake: the share per unit rounds to a few 1e-36, and the loss stays
/// under 1e-36 per unit.
#[test]
fn test_vault_dust_bound_tiny_income_large_stake() {
    let s = setup();
    stake(s, ALICE(), 999 * PAVED);
    income(s, 1);
    stake(s, BOB(), 1);
    let total = 999 * PAVED;
    let lost = 1 * ACC_SCALE - s.vault.acc() * total;
    assert!(lost < total, "lost {}", lost);
    assert_eq!(s.vault.acc(), ACC_SCALE / total);
}

#[test]
#[should_panic(expected: 'Vault: not enough staked')]
fn test_vault_unstake_more_than_staked_reverts() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    unstake(s, ALICE(), 100 * PAVED + 1);
}

#[test]
#[should_panic(expected: 'Vault: not enough staked')]
fn test_vault_unstake_of_another_stake_reverts() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    unstake(s, BOB(), 1);
}

#[test]
#[should_panic(expected: 'Vault: zero amount')]
fn test_vault_stake_zero_reverts() {
    let s = setup();
    stake(s, ALICE(), 0);
}

#[test]
#[should_panic(expected: 'Vault: zero amount')]
fn test_vault_unstake_zero_reverts() {
    let s = setup();
    stake(s, ALICE(), 100 * PAVED);
    unstake(s, ALICE(), 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn test_vault_stake_without_approval_reverts() {
    let s = setup();
    start_cheat_caller_address(s.vault.contract_address, ALICE());
    s.vault.stake(1);
}

#[test]
fn test_vault_tokens() {
    let s = setup();
    assert_eq!(s.vault.tokens(), (s.paved.contract_address, s.usdc.contract_address));
}

#[test]
#[should_panic]
fn test_vault_constructor_refuses_the_same_token_twice() {
    let paved = deploy_token(RECIPIENT());
    deploy("Vault", array![paved.into(), paved.into()]);
}
