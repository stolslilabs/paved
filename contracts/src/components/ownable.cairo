//! Ownable component: an owner set at deployment, who hands the ownership over in two steps. It is
//! the gate of OpenZeppelin's `UpgradeableComponent` in every contract that embeds both
//! (`docs/architecture/upgrades.md`): the owner may replace the class, so has full control of the
//! contract and of the funds it holds.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IOwnable<TContractState> {
    fn owner(self: @TContractState) -> ContractAddress;
    fn pending_owner(self: @TContractState) -> ContractAddress;
    fn transfer_ownership(ref self: TContractState, new_owner: ContractAddress);
    fn accept_ownership(ref self: TContractState);
}

#[starknet::component]
pub mod OwnableComponent {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::IOwnable;

    pub mod errors {
        pub const NOT_OWNER: felt252 = 'Ownable: caller is not owner';
        pub const NOT_PENDING_OWNER: felt252 = 'Ownable: caller not pending';
        pub const ZERO_OWNER: felt252 = 'Ownable: new owner is zero';
    }

    #[storage]
    pub struct Storage {
        pub owner: ContractAddress,
        pub pending_owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        OwnershipTransferStarted: OwnershipTransferStarted,
        OwnershipTransferred: OwnershipTransferred,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OwnershipTransferStarted {
        pub previous_owner: ContractAddress,
        pub new_owner: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OwnershipTransferred {
        pub previous_owner: ContractAddress,
        pub new_owner: ContractAddress,
    }

    #[embeddable_as(OwnableImpl)]
    pub impl Ownable<
        TContractState, +HasComponent<TContractState>,
    > of IOwnable<ComponentState<TContractState>> {
        fn owner(self: @ComponentState<TContractState>) -> ContractAddress {
            self.owner.read()
        }

        fn pending_owner(self: @ComponentState<TContractState>) -> ContractAddress {
            self.pending_owner.read()
        }

        fn transfer_ownership(
            ref self: ComponentState<TContractState>, new_owner: ContractAddress,
        ) {
            // [Check] Caller is the owner
            self.assert_only_owner();
            // [Check] New owner is not zero
            assert(new_owner.is_non_zero(), errors::ZERO_OWNER);
            // [Effect] Propose the new owner, replacing any earlier proposal
            self.pending_owner.write(new_owner);
            self.emit(OwnershipTransferStarted { previous_owner: self.owner.read(), new_owner });
        }

        fn accept_ownership(ref self: ComponentState<TContractState>) {
            // [Check] Caller is the pending owner
            let caller = get_caller_address();
            assert(caller == self.pending_owner.read(), errors::NOT_PENDING_OWNER);
            // [Effect] Complete the handover
            self.pending_owner.write(Zero::zero());
            self.set_owner(caller);
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn initialize(ref self: ComponentState<TContractState>, owner: ContractAddress) {
            self.set_owner(owner);
        }

        fn assert_only_owner(self: @ComponentState<TContractState>) {
            assert(get_caller_address() == self.owner.read(), errors::NOT_OWNER);
        }

        fn set_owner(ref self: ComponentState<TContractState>, new_owner: ContractAddress) {
            assert(new_owner.is_non_zero(), errors::ZERO_OWNER);
            let previous_owner = self.owner.read();
            self.owner.write(new_owner);
            self.emit(OwnershipTransferred { previous_owner, new_owner });
        }
    }
}
