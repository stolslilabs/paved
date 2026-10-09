// TEST AND DEVNET ONLY: never deploy this contract on a public network. `mint` is open to anyone.

//! A stand-in for USDC on devnet and in tests (P8, `docs/architecture/economy.md` section 5): an
//! OpenZeppelin ERC20 with 6 decimals, like Starknet's USDC, and an open faucet.

// Starknet imports

use starknet::ContractAddress;

// Constants

pub const DECIMALS: u8 = 6;

#[starknet::interface]
pub trait IMockUSDC<TContractState> {
    /// Faucet: mints `amount` (base units, 6 decimals) to `recipient`. Anyone may call it.
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockUSDC {
    // Component imports

    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

    // Starknet imports

    use starknet::ContractAddress;

    // Local imports

    use super::{DECIMALS, IMockUSDC};

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
            self.erc20.mint(recipient, amount);
        }
    }
}
