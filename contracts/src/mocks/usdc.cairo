// TEST AND DEVNET OR SEPOLIA ONLY: never deploy this contract on mainnet. `mint` is open to anyone,
// within the caps below.

//! A stand-in for USDC on devnet, on Sepolia and in tests (P8, `docs/architecture/economy.md`
//! section 5; S-1, D-16): an OpenZeppelin ERC20 with 6 decimals, like Starknet's USDC, and a
//! bounded faucet. A call mints at most `MINT_CAP_PER_CALL`, and an address receives at most
//! `MINT_CAP_PER_ADDRESS` from the faucet in total, whatever it does with the USDC (`minted`).
//!
//! The launch pool's 10,000 USDC does not come from the faucet: the constructor premints exactly
//! `PREMINT` to the account that sends the deploy transaction (`get_tx_info`'s account; through the
//! UDC, the constructor's caller is the UDC, not the deployer). Nobody can then push the deployer
//! to the faucet's caps before the pool is funded. The premint is not counted in `minted`, and it
//! is the only way past the caps. With no account (a deploy outside a transaction, as in tests),
//! there is no premint.

// Starknet imports

use starknet::ContractAddress;

// Constants

pub const DECIMALS: u8 = 6;
/// The most one `mint` call mints: 10,000 USDC.
pub const MINT_CAP_PER_CALL: u256 = 10_000_000_000;
/// The most one address receives from the faucet, over all calls: 20,000 USDC.
pub const MINT_CAP_PER_ADDRESS: u256 = 20_000_000_000;
/// The constructor's premint to the deploying account: the launch pool's 10,000 USDC.
pub const PREMINT: u256 = 10_000_000_000;

pub mod errors {
    pub const OVER_CALL_CAP: felt252 = 'MockUSDC: over the call cap';
    pub const OVER_ADDRESS_CAP: felt252 = 'MockUSDC: over the address cap';
}

#[starknet::interface]
pub trait IMockUSDC<TContractState> {
    /// Faucet: mints `amount` (base units, 6 decimals) to `recipient`. Anyone may call it, for at
    /// most `MINT_CAP_PER_CALL` per call and `MINT_CAP_PER_ADDRESS` per recipient in total.
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
    /// What `account` has received from the faucet so far (base units; the premint excluded).
    fn minted(self: @TContractState, account: ContractAddress) -> u256;
}

#[starknet::contract]
pub mod MockUSDC {
    // Component imports

    use core::num::traits::Zero;
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    // Local imports

    use super::{DECIMALS, IMockUSDC, MINT_CAP_PER_ADDRESS, MINT_CAP_PER_CALL, PREMINT, errors};

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
        minted: Map<ContractAddress, u256>,
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
        // [Effect] The launch pool's USDC to the deploying account, outside the faucet's caps
        let deployer = starknet::get_tx_info().unbox().account_contract_address;
        if deployer.is_non_zero() {
            self.erc20.mint(deployer, PREMINT);
        }
    }

    // Implementations

    #[abi(embed_v0)]
    impl MockUSDCImpl of IMockUSDC<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            // [Check] The caps: per call, and what the recipient has received from the faucet
            assert(amount <= MINT_CAP_PER_CALL, errors::OVER_CALL_CAP);
            let minted = self.minted.read(recipient) + amount;
            assert(minted <= MINT_CAP_PER_ADDRESS, errors::OVER_ADDRESS_CAP);
            // [Effect] Count it, then mint
            self.minted.write(recipient, minted);
            self.erc20.mint(recipient, amount);
        }

        fn minted(self: @ContractState, account: ContractAddress) -> u256 {
            self.minted.read(account)
        }
    }
}
