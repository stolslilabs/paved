// TEST AND DEVNET OR SEPOLIA ONLY: never deploy this contract on mainnet. `mint` is open to anyone,
// within the caps below.

//! A stand-in for USDC on devnet, on Sepolia and in tests (P8, `docs/architecture/economy.md`
//! section 5; S-1, D-16): an OpenZeppelin ERC20 with 6 decimals, like Starknet's USDC, and a
//! bounded faucet. A call mints at most `MINT_CAP_PER_CALL`, and never past a balance of
//! `MINT_CAP_PER_ADDRESS` for its recipient. The address cap is on the balance, not on a count of
//! what the faucet gave: a count would cost a storage write on every mint, past the gas budgets of
//! the tests that fund their players through the faucet. For the same reason `mint` writes the
//! balance itself, from the one read the cap needs (OpenZeppelin's `mint` reads it again).
//!
//! The deployer funds the launch pool's 10,000 USDC with one call, within both caps: the per-call
//! cap is exactly that, and the per-address cap leaves the deployer room for the smoke's purchase.

// Starknet imports

use starknet::ContractAddress;

// Constants

pub const DECIMALS: u8 = 6;
/// The most one `mint` call mints: 10,000 USDC, the launch pool's USDC.
pub const MINT_CAP_PER_CALL: u256 = 10_000_000_000;
/// The faucet mints nothing that would take its recipient's balance past 20,000 USDC.
pub const MINT_CAP_PER_ADDRESS: u256 = 20_000_000_000;

pub mod errors {
    pub const OVER_CALL_CAP: felt252 = 'MockUSDC: over the call cap';
    pub const OVER_ADDRESS_CAP: felt252 = 'MockUSDC: over the address cap';
    pub const MINT_TO_ZERO: felt252 = 'MockUSDC: mint to 0';
}

#[starknet::interface]
pub trait IMockUSDC<TContractState> {
    /// Faucet: mints `amount` (base units, 6 decimals) to `recipient`. Anyone may call it, for at
    /// most `MINT_CAP_PER_CALL` per call, and only while the recipient's balance stays at most
    /// `MINT_CAP_PER_ADDRESS`.
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockUSDC {
    // Component imports


    // Starknet imports

    use core::num::traits::Zero;
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use starknet::ContractAddress;
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    // Local imports

    use super::{DECIMALS, IMockUSDC, MINT_CAP_PER_ADDRESS, MINT_CAP_PER_CALL, errors};

    // Components

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    impl ERC20Config of ERC20Component::ImmutableConfig {
        const DECIMALS: u8 = DECIMALS;
    }

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.erc20.initializer("USD Coin (mock)", "USDC");
    }

    // Implementations

    #[abi(embed_v0)]
    impl MockUSDCImpl of IMockUSDC<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            // [Check] The recipient and the caps
            assert(recipient.is_non_zero(), errors::MINT_TO_ZERO);
            assert(amount <= MINT_CAP_PER_CALL, errors::OVER_CALL_CAP);
            let balance = self.erc20.ERC20_balances.read(recipient) + amount;
            assert(balance <= MINT_CAP_PER_ADDRESS, errors::OVER_ADDRESS_CAP);
            // [Effect] OpenZeppelin's `update` from the zero address (its hooks are empty), with
            // the balance already read
            let total_supply = self.erc20.ERC20_total_supply.read();
            self.erc20.ERC20_total_supply.write(total_supply + amount);
            self.erc20.ERC20_balances.write(recipient, balance);
            self
                .emit(
                    ERC20Component::Event::Transfer(
                        ERC20Component::Transfer {
                            from: Zero::zero(), to: recipient, value: amount,
                        },
                    ),
                );
        }
    }
}
