//! `MockUSDC`'s bounded faucet (S-1, D-16): the per-call and per-address caps, and the deployer's
//! one-call funding of the launch pool within them.

use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::mocks::usdc::{
    IMockUSDCDispatcher, IMockUSDCDispatcherTrait, MINT_CAP_PER_ADDRESS, MINT_CAP_PER_CALL,
};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address};
use starknet::ContractAddress;

fn DEPLOYER() -> ContractAddress {
    'DEPLOYER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

const USDC: u256 = 1_000_000;

fn setup() -> (IMockUSDCDispatcher, IERC20Dispatcher) {
    let class = declare("MockUSDC").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    (
        IMockUSDCDispatcher { contract_address: address },
        IERC20Dispatcher { contract_address: address },
    )
}

#[test]
fn test_usdc_caps_are_the_decided_figures() {
    assert_eq!(MINT_CAP_PER_CALL, 10_000 * USDC);
    assert_eq!(MINT_CAP_PER_ADDRESS, 20_000 * USDC);
}

/// `scripts/deploy.sh` funds the launch pool with one call of 10,000 USDC to the deployer, then the
/// smoke mints 2 USDC more for its purchase: both within the caps.
#[test]
fn test_usdc_deployer_funds_the_pool_and_the_smoke() {
    let (usdc, erc20) = setup();
    start_cheat_caller_address(usdc.contract_address, DEPLOYER());
    usdc.mint(DEPLOYER(), 10_000 * USDC);
    usdc.mint(DEPLOYER(), 2 * USDC);
    assert_eq!(erc20.balance_of(DEPLOYER()), 10_002 * USDC);
    assert_eq!(usdc.minted(DEPLOYER()), 10_002 * USDC);
    assert_eq!(erc20.total_supply(), 10_002 * USDC);
}

#[test]
fn test_usdc_mints_up_to_the_address_cap_exactly() {
    let (usdc, erc20) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_ADDRESS - MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(PLAYER()), MINT_CAP_PER_ADDRESS);
    assert_eq!(usdc.minted(PLAYER()), MINT_CAP_PER_ADDRESS);
}

#[test]
#[should_panic(expected: 'MockUSDC: over the call cap')]
fn test_usdc_mint_reverts_over_the_call_cap() {
    let (usdc, _) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL + 1);
}

#[test]
#[should_panic(expected: 'MockUSDC: over the address cap')]
fn test_usdc_mint_reverts_over_the_address_cap() {
    let (usdc, _) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), 1);
}

/// The cap counts what an address received from the faucet, not its balance: sending the USDC away
/// does not reopen the faucet.
#[test]
#[should_panic(expected: 'MockUSDC: over the address cap')]
fn test_usdc_address_cap_ignores_transfers_out() {
    let (usdc, erc20) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    start_cheat_caller_address(usdc.contract_address, PLAYER());
    erc20.transfer(DEPLOYER(), MINT_CAP_PER_ADDRESS);
    assert_eq!(erc20.balance_of(PLAYER()), 0);
    usdc.mint(PLAYER(), 1);
}

/// The caps are per recipient: one address at its cap leaves another untouched, whoever calls.
#[test]
fn test_usdc_address_cap_is_per_recipient() {
    let (usdc, erc20) = setup();
    start_cheat_caller_address(usdc.contract_address, PLAYER());
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(DEPLOYER()), MINT_CAP_PER_CALL);
    assert_eq!(usdc.minted(DEPLOYER()), MINT_CAP_PER_CALL);
}
