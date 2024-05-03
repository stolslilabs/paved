// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts for Cairo v0.12.0 (access/ownable/ownable.cairo)

// Starknet imports

use starknet::ContractAddress;

#[starknet::interface]
trait IOwnable<TState> {
    fn owner(self: @TState) -> ContractAddress;
    fn transfer_ownership(ref self: TState, new_owner: ContractAddress);
    fn renounce_ownership(ref self: TState);
}

/// # Ownable Component
///
/// The Ownable component provides a basic access control mechanism, where
/// there is an account (an owner) that can be granted exclusive access to
/// specific functions.
///
/// The initial owner can be set by using the `initializer` function in
/// construction time. This can later be changed with `transfer_ownership`.
///
/// The component also offers functionality for a two-step ownership
/// transfer where the new owner first has to accept their ownership to
/// finalize the transfer.
#[starknet::component]
mod OwnableComponent {
    // Core imports

    use core::zeroable::Zeroable;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::get_caller_address;

    // Local imports

    use super::IOwnable;

    #[storage]
    struct Storage {
        Ownable_owner: ContractAddress,
        Ownable_pending_owner: ContractAddress
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        OwnershipTransferred: OwnershipTransferred,
        OwnershipTransferStarted: OwnershipTransferStarted
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct OwnershipTransferred {
        #[key]
        previous_owner: ContractAddress,
        #[key]
        new_owner: ContractAddress,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct OwnershipTransferStarted {
        #[key]
        previous_owner: ContractAddress,
        #[key]
        new_owner: ContractAddress,
    }

    mod Errors {
        const NOT_OWNER: felt252 = 'Caller is not the owner';
        const NOT_PENDING_OWNER: felt252 = 'Caller is not the pending owner';
        const ZERO_ADDRESS_CALLER: felt252 = 'Caller is the zero address';
        const ZERO_ADDRESS_OWNER: felt252 = 'New owner is the zero address';
    }

    #[embeddable_as(OwnableImpl)]
    impl Ownable<
        TContractState, +HasComponent<TContractState>
    > of IOwnable<ComponentState<TContractState>> {
        /// Returns the address of the current owner.
        fn owner(self: @ComponentState<TContractState>) -> ContractAddress {
            self.Ownable_owner.read()
        }

        /// Transfers ownership of the contract to a new address.
        ///
        /// Requirements:
        ///
        /// - `new_owner` is not the zero address.
        /// - The caller is the contract owner.
        ///
        /// Emits an `OwnershipTransferred` event.
        fn transfer_ownership(
            ref self: ComponentState<TContractState>, new_owner: ContractAddress
        ) {
            assert(!new_owner.is_zero(), Errors::ZERO_ADDRESS_OWNER);
            self.assert_only_owner();
            self._transfer_ownership(new_owner);
        }

        /// Leaves the contract without owner. It will not be possible to call `assert_only_owner`
        /// functions anymore. Can only be called by the current owner.
        ///
        /// Requirements:
        ///
        /// - The caller is the contract owner.
        ///
        /// Emits an `OwnershipTransferred` event.
        fn renounce_ownership(ref self: ComponentState<TContractState>) {
            self.assert_only_owner();
            self._transfer_ownership(Zeroable::zero());
        }
    }

    #[generate_trait]
    impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        /// Sets the contract's initial owner.
        ///
        /// This function should be called at construction time.
        fn initializer(ref self: ComponentState<TContractState>, owner: ContractAddress) {
            self._transfer_ownership(owner);
        }

        /// Panics if called by any account other than the owner. Use this
        /// to restrict access to certain functions to the owner.
        fn assert_only_owner(self: @ComponentState<TContractState>) {
            let owner = self.Ownable_owner.read();
            let caller = get_caller_address();
            assert(!caller.is_zero(), Errors::ZERO_ADDRESS_CALLER);
            assert(caller == owner, Errors::NOT_OWNER);
        }

        /// Transfers ownership of the contract to a new address.
        ///
        /// Internal function without access restriction.
        ///
        /// Emits an `OwnershipTransferred` event.
        fn _transfer_ownership(
            ref self: ComponentState<TContractState>, new_owner: ContractAddress
        ) {
            let previous_owner: ContractAddress = self.Ownable_owner.read();
            self.Ownable_owner.write(new_owner);
            self
                .emit(
                    OwnershipTransferred { previous_owner: previous_owner, new_owner: new_owner }
                );
        }
    }
}
