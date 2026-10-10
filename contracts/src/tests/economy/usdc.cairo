//! `MockUSDC`'s bounded faucet (S-1, D-16): the per-call cap, the cumulative per-address cap, and
//! the constructor's premint of the launch pool's USDC to the deploying account, the only way past
//! the caps.

use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use paved::mocks::usdc::{
    IMockUSDCDispatcher, IMockUSDCDispatcherTrait, MINT_CAP_PER_ADDRESS, MINT_CAP_PER_CALL, PREMINT,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_account_contract_address_global,
    start_cheat_caller_address, stop_cheat_account_contract_address_global,
};
use starknet::ContractAddress;

fn DEPLOYER() -> ContractAddress {
    'DEPLOYER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

const USDC: u256 = 1_000_000;

/// Deployed outside a transaction's account, as the other tests deploy it: no premint.
fn setup() -> (IMockUSDCDispatcher, IERC20Dispatcher) {
    let class = declare("MockUSDC").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    (
        IMockUSDCDispatcher { contract_address: address },
        IERC20Dispatcher { contract_address: address },
    )
}

/// Deployed by `DEPLOYER`'s transaction, as `scripts/deploy.sh` does: the premint.
fn setup_deployed() -> (IMockUSDCDispatcher, IERC20Dispatcher) {
    start_cheat_account_contract_address_global(DEPLOYER());
    let deployed = setup();
    stop_cheat_account_contract_address_global();
    deployed
}

#[test]
fn test_usdc_caps_are_the_decided_figures() {
    assert_eq!(MINT_CAP_PER_CALL, 10_000 * USDC);
    assert_eq!(MINT_CAP_PER_ADDRESS, 20_000 * USDC);
    assert_eq!(PREMINT, 10_000 * USDC);
}

/// The deploying account holds the launch pool's 10,000 USDC from the constructor, and nobody else.
#[test]
fn test_usdc_premint_goes_to_the_deploying_account() {
    let (usdc, erc20) = setup_deployed();
    assert_eq!(erc20.balance_of(DEPLOYER()), PREMINT);
    assert_eq!(erc20.total_supply(), PREMINT);
    assert_eq!(usdc.minted(DEPLOYER()), 0);
}

#[test]
fn test_usdc_no_premint_without_an_account() {
    let (_, erc20) = setup();
    assert_eq!(erc20.total_supply(), 0);
}

/// The premint counts against no cap: the deployer may still take the whole per-address cap from
/// the faucet (the smoke takes 2 USDC), and holds the premint on top.
#[test]
fn test_usdc_premint_is_not_counted_by_the_faucet() {
    let (usdc, erc20) = setup_deployed();
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(DEPLOYER(), MINT_CAP_PER_ADDRESS - MINT_CAP_PER_CALL);
    assert_eq!(usdc.minted(DEPLOYER()), MINT_CAP_PER_ADDRESS);
    assert_eq!(erc20.balance_of(DEPLOYER()), PREMINT + MINT_CAP_PER_ADDRESS);
}

/// Somebody filling the deployer's faucet cap does not take the premint away: the pool is still
/// funded (the griefing of S-1's audit, note 2).
#[test]
fn test_usdc_a_full_faucet_cap_leaves_the_premint() {
    let (usdc, erc20) = setup_deployed();
    start_cheat_caller_address(usdc.contract_address, PLAYER());
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(DEPLOYER()), PREMINT + MINT_CAP_PER_ADDRESS);
}

/// The premint is the only way past the caps: once the faucet has given the deployer its cap, a
/// further mint reverts like anyone's.
#[test]
#[should_panic(expected: 'MockUSDC: over the address cap')]
fn test_usdc_premint_is_the_only_way_past_the_caps() {
    let (usdc, _) = setup_deployed();
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    usdc.mint(DEPLOYER(), 1);
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

/// The per-call cap holds below the address cap too, for an address that has received nothing.
#[test]
#[should_panic(expected: 'MockUSDC: over the call cap')]
fn test_usdc_call_cap_holds_with_room_left() {
    let (usdc, _) = setup();
    usdc.mint(PLAYER(), 1);
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

/// The cap is cumulative (S-1's audit, finding 1): mint, spend it all, mint again is refused once
/// the address has received its cap, whatever its balance.
#[test]
#[should_panic(expected: 'MockUSDC: over the address cap')]
fn test_usdc_address_cap_ignores_transfers_out() {
    let (usdc, erc20) = setup();
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    start_cheat_caller_address(usdc.contract_address, PLAYER());
    erc20.transfer(DEPLOYER(), MINT_CAP_PER_ADDRESS);
    assert_eq!(erc20.balance_of(PLAYER()), 0);
    assert_eq!(usdc.minted(PLAYER()), MINT_CAP_PER_ADDRESS);
    usdc.mint(PLAYER(), 1);
}

/// USDC received by transfer is not counted: the cap is on what the faucet gave.
#[test]
fn test_usdc_address_cap_ignores_transfers_in() {
    let (usdc, erc20) = setup();
    usdc.mint(DEPLOYER(), MINT_CAP_PER_CALL);
    start_cheat_caller_address(usdc.contract_address, DEPLOYER());
    erc20.transfer(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    usdc.mint(PLAYER(), MINT_CAP_PER_CALL);
    assert_eq!(erc20.balance_of(PLAYER()), 3 * MINT_CAP_PER_CALL);
    assert_eq!(usdc.minted(PLAYER()), MINT_CAP_PER_ADDRESS);
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
