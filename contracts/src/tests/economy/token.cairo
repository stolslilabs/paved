//! `PavedToken` (P8 E1): metadata, the initial supply, the one minter set once, burn.

use openzeppelin_interfaces::erc20::{IERC20MixinDispatcher, IERC20MixinDispatcherTrait};
use paved::systems::token::PavedToken::{Event, MinterSet};
use paved::systems::token::{INITIAL_SUPPLY, IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

pub fn RECIPIENT() -> ContractAddress {
    'RECIPIENT'.try_into().unwrap()
}

pub fn ADMIN() -> ContractAddress {
    'ADMIN'.try_into().unwrap()
}

pub fn MINTER() -> ContractAddress {
    'MINTER'.try_into().unwrap()
}

pub fn SOMEONE() -> ContractAddress {
    'SOMEONE'.try_into().unwrap()
}

const ONE: u256 = 1_000_000_000_000_000_000;

/// Deploys `PavedToken` with the initial supply to `recipient` and `ADMIN` as the admin.
pub fn deploy_token(recipient: ContractAddress) -> ContractAddress {
    let class = declare("PavedToken").unwrap().contract_class();
    let (address, _) = class.deploy(@array![recipient.into(), ADMIN().into()]).unwrap();
    address
}

fn setup() -> (IPavedTokenDispatcher, IERC20MixinDispatcher) {
    let address = deploy_token(RECIPIENT());
    (
        IPavedTokenDispatcher { contract_address: address },
        IERC20MixinDispatcher { contract_address: address },
    )
}

fn set_minter(token: IPavedTokenDispatcher, caller: ContractAddress, minter: ContractAddress) {
    start_cheat_caller_address(token.contract_address, caller);
    token.set_minter(minter);
    stop_cheat_caller_address(token.contract_address);
}

#[test]
fn test_token_metadata_and_initial_supply() {
    let (token, erc20) = setup();
    assert_eq!(erc20.name(), "Paved Token");
    assert_eq!(erc20.symbol(), "PAVED");
    assert_eq!(erc20.decimals(), 18);
    assert_eq!(INITIAL_SUPPLY, 1_000_000 * ONE);
    assert_eq!(erc20.total_supply(), 1_000_000 * ONE);
    assert_eq!(erc20.balance_of(RECIPIENT()), 1_000_000 * ONE);
    assert_eq!(erc20.balanceOf(RECIPIENT()), 1_000_000 * ONE);
    assert_eq!(token.admin(), ADMIN());
    assert_eq!(token.minter(), 0.try_into().unwrap());
}

#[test]
fn test_token_minter_mints_and_total_supply_follows() {
    let (token, erc20) = setup();
    let mut spy = spy_events();
    set_minter(token, ADMIN(), MINTER());
    spy
        .assert_emitted(
            @array![(token.contract_address, Event::MinterSet(MinterSet { minter: MINTER() }))],
        );
    assert_eq!(token.minter(), MINTER());
    // The admin is gone once the minter is set
    assert_eq!(token.admin(), 0.try_into().unwrap());
    start_cheat_caller_address(token.contract_address, MINTER());
    token.mint(SOMEONE(), 5 * ONE);
    stop_cheat_caller_address(token.contract_address);
    assert_eq!(erc20.balance_of(SOMEONE()), 5 * ONE);
    assert_eq!(erc20.total_supply(), 1_000_005 * ONE);
}

#[test]
#[should_panic(expected: 'PavedToken: not minter')]
fn test_token_mint_reverts_before_a_minter_is_set() {
    let (token, _) = setup();
    start_cheat_caller_address(token.contract_address, ADMIN());
    token.mint(ADMIN(), 1);
}

#[test]
#[should_panic(expected: 'PavedToken: not minter')]
fn test_token_mint_reverts_for_the_admin() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), MINTER());
    start_cheat_caller_address(token.contract_address, ADMIN());
    token.mint(ADMIN(), 1);
}

#[test]
#[should_panic(expected: 'PavedToken: not minter')]
fn test_token_mint_reverts_for_a_holder() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), MINTER());
    start_cheat_caller_address(token.contract_address, RECIPIENT());
    token.mint(RECIPIENT(), 1);
}

#[test]
#[should_panic(expected: 'PavedToken: not admin')]
fn test_token_set_minter_reverts_a_second_time() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), MINTER());
    set_minter(token, ADMIN(), SOMEONE());
}

#[test]
#[should_panic(expected: 'PavedToken: not admin')]
fn test_token_set_minter_reverts_for_the_minter() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), MINTER());
    set_minter(token, MINTER(), SOMEONE());
}

#[test]
#[should_panic(expected: 'PavedToken: not admin')]
fn test_token_set_minter_reverts_for_anyone_but_the_admin() {
    let (token, _) = setup();
    set_minter(token, RECIPIENT(), MINTER());
}

#[test]
#[should_panic(expected: 'PavedToken: zero minter')]
fn test_token_set_minter_refuses_zero() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), 0.try_into().unwrap());
}

#[test]
fn test_token_burn_of_own_balance_lowers_total_supply() {
    let (token, erc20) = setup();
    start_cheat_caller_address(token.contract_address, RECIPIENT());
    token.burn(400_000 * ONE);
    stop_cheat_caller_address(token.contract_address);
    assert_eq!(erc20.balance_of(RECIPIENT()), 600_000 * ONE);
    assert_eq!(erc20.total_supply(), 600_000 * ONE);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient balance')]
fn test_token_burn_reverts_above_own_balance() {
    let (token, _) = setup();
    start_cheat_caller_address(token.contract_address, SOMEONE());
    token.burn(1);
}

// Coverage T1 (docs/measures/coverage.md): the zero operands of the guards

fn zero() -> ContractAddress {
    0.try_into().unwrap()
}

/// A zero recipient and a zero admin are each refused, with their own reason (a zero admin could
/// never set the minter, and the reason is the admin's).
#[test]
fn test_token_constructor_refuses_zero_recipient_and_zero_admin() {
    let class = declare("PavedToken").unwrap().contract_class();
    match class.deploy(@array![0, ADMIN().into()]) {
        Result::Ok(_) => panic!("a zero recipient was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'PavedToken: zero recipient'),
    }
    match class.deploy(@array![RECIPIENT().into(), 0]) {
        Result::Ok(_) => panic!("a zero admin was accepted"),
        Result::Err(data) => assert_eq!(*data.at(0), 'PavedToken: not admin'),
    }
}

/// Before a minter is set, the minter is the zero address, and the zero caller is not it.
#[test]
#[should_panic(expected: 'PavedToken: not minter')]
fn test_token_mint_reverts_for_zero_before_a_minter_is_set() {
    let (token, _) = setup();
    assert_eq!(token.minter(), zero());
    start_cheat_caller_address(token.contract_address, zero());
    token.mint(SOMEONE(), 1);
}

/// Once the minter is set the admin is the zero address, and the zero caller is not it.
#[test]
#[should_panic(expected: 'PavedToken: not admin')]
fn test_token_set_minter_reverts_for_zero_after_the_admin_is_cleared() {
    let (token, _) = setup();
    set_minter(token, ADMIN(), MINTER());
    assert_eq!(token.admin(), zero());
    set_minter(token, zero(), SOMEONE());
}
