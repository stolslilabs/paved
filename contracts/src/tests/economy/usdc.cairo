//! `MockUSDC`'s bounded faucet (S-1, D-16): the per-call cap and the per-address cap on the
//! recipient's balance, and the deployer's one-call funding of the launch pool within them.

use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_token::erc20::ERC20Component;
use paved::mocks::usdc::{
    IMockUSDCDispatcher, IMockUSDCDispatcherTrait, MINT_CAP_PER_ADDRESS, MINT_CAP_PER_CALL,
    MockUSDC,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address,
};
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
    assert_eq!(erc20.total_supply(), 10_002 * USDC);
}

#[test]
fn test_usdc_mints_up_to_the_address_cap_exactly() {
    let (usdc, erc20) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_ADDRESS - MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(PLAYER()), MINT_CAP_PER_ADDRESS);
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

/// The address cap is on the balance: USDC received by transfer counts against it, and USDC sent
/// away makes room again (accepted: test USDC, and the caps bound each holding, not the supply).
#[test]
#[should_panic(expected: 'MockUSDC: over the address cap')]
fn test_usdc_address_cap_counts_transfers_in() {
    let (usdc, erc20) = setup();
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    start_cheat_caller_address(usdc.contract_address, DEPLOYER());
    erc20.transfer(PLAYER(), MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(PLAYER()), MINT_CAP_PER_ADDRESS);
    usdc.mint(PLAYER(), 1);
}

#[test]
fn test_usdc_address_cap_reopens_after_transfers_out() {
    let (usdc, erc20) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    start_cheat_caller_address(usdc.contract_address, PLAYER());
    erc20.transfer(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(PLAYER()), MINT_CAP_PER_ADDRESS);
}

#[test]
#[should_panic(expected: 'MockUSDC: mint to 0')]
fn test_usdc_mint_reverts_to_the_zero_address() {
    let (usdc, _) = setup();
    usdc.mint(0.try_into().unwrap(), 1);
}

/// A mint emits OpenZeppelin's `Transfer` from the zero address, and moves the total supply.
#[test]
fn test_usdc_mint_emits_transfer_and_moves_the_supply() {
    let (usdc, erc20) = setup();
    let mut spy = spy_events();
    usdc.mint(PLAYER(), 5 * USDC);
    spy
        .assert_emitted(
            @array![
                (
                    usdc.contract_address,
                    MockUSDC::Event::ERC20Event(
                        ERC20Component::Event::Transfer(
                            ERC20Component::Transfer {
                                from: 0.try_into().unwrap(), to: PLAYER(), value: 5 * USDC,
                            },
                        ),
                    ),
                ),
            ],
        );
    assert_eq!(erc20.total_supply(), 5 * USDC);
    assert_eq!(erc20.balance_of(PLAYER()), 5 * USDC);
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
}
