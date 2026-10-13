//! PAVED, the token of the economy (P8, `docs/architecture/economy.md`, D-10, P-31).
//!
//! An OpenZeppelin ERC20 ("Paved Token", `PAVED`, 18 decimals). The constructor mints the initial
//! 1,000,000 PAVED to a recipient. After that, only the minter (`Economy`) can create tokens. The
//! minter is set once, by the admin named in the constructor, and the admin is then cleared: no
//! admin, setter or upgrade remains. Any holder burns their own balance. The supply is the ERC20's
//! own `total_supply`.

// Starknet imports

use starknet::ContractAddress;

// Constants

pub const DECIMALS: u8 = 18;
/// 1,000,000 PAVED in base units.
pub const INITIAL_SUPPLY: u256 = 1_000_000_000_000_000_000_000_000;

#[starknet::interface]
pub trait IPavedToken<TContractState> {
    /// Sets the only minter, once, then clears the admin. Admin only.
    fn set_minter(ref self: TContractState, minter: ContractAddress);
    /// Mints `amount` to `recipient`. Minter only.
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
    /// Burns `amount` of the caller's own balance.
    fn burn(ref self: TContractState, amount: u256);
    /// The minter, zero until set.
    fn minter(self: @TContractState) -> ContractAddress;
    /// The admin allowed to set the minter, zero once it is set.
    fn admin(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod PavedToken {
    // Core imports

    use core::num::traits::Zero;

    // Component imports

    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

    // Starknet imports

    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    // Local imports

    use super::{DECIMALS, INITIAL_SUPPLY, IPavedToken};

    // Errors

    pub mod errors {
        pub const NOT_ADMIN: felt252 = 'PavedToken: not admin';
        pub const NOT_MINTER: felt252 = 'PavedToken: not minter';
        pub const ZERO_MINTER: felt252 = 'PavedToken: zero minter';
        pub const ZERO_RECIPIENT: felt252 = 'PavedToken: zero recipient';
    }

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
        admin: ContractAddress,
        minter: ContractAddress,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        MinterSet: MinterSet,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MinterSet {
        #[key]
        pub minter: ContractAddress,
    }

    // Constructor

    /// Mints the initial supply to `recipient`; `admin` may set the minter once.
    #[constructor]
    fn constructor(ref self: ContractState, recipient: ContractAddress, admin: ContractAddress) {
        // [Check] Both addresses are set
        assert(recipient.is_non_zero(), errors::ZERO_RECIPIENT);
        assert(admin.is_non_zero(), errors::NOT_ADMIN);
        // [Effect] Metadata, initial supply, admin
        self.erc20.initializer("Paved Token", "PAVED");
        self.erc20.mint(recipient, INITIAL_SUPPLY);
        self.admin.write(admin);
    }

    // Implementations

    #[abi(embed_v0)]
    impl PavedTokenImpl of IPavedToken<ContractState> {
        fn set_minter(ref self: ContractState, minter: ContractAddress) {
            // [Check] Caller is the admin, which exists only until the minter is set
            let admin = self.admin.read();
            assert(admin.is_non_zero() && get_caller_address() == admin, errors::NOT_ADMIN);
            assert(minter.is_non_zero(), errors::ZERO_MINTER);
            // [Effect] Set the minter, clear the admin
            self.minter.write(minter);
            self.admin.write(Zero::zero());
            self.emit(MinterSet { minter });
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            // [Check] Caller is the minter (a zero minter matches no caller)
            let minter = self.minter.read();
            assert(minter.is_non_zero() && get_caller_address() == minter, errors::NOT_MINTER);
            // [Effect] Mint
            self.erc20.mint(recipient, amount);
        }

        fn burn(ref self: ContractState, amount: u256) {
            // [Effect] Burn the caller's own balance
            self.erc20.burn(get_caller_address(), amount);
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter.read()
        }

        fn admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }
    }
}
