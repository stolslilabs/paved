//! Ownable component: an owner set at deployment, who may upgrade the contract class and hand the
//! ownership over. The owner has no power over games, players, tournaments or funds.

use starknet::{ClassHash, ContractAddress};

#[starknet::interface]
pub trait IOwnable<TContractState> {
    fn owner(self: @TContractState) -> ContractAddress;
    fn transfer_ownership(ref self: TContractState, new_owner: ContractAddress);
    fn upgrade(ref self: TContractState, class_hash: ClassHash);
}

#[starknet::component]
pub mod OwnableComponent {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ClassHash, ContractAddress, SyscallResultTrait, get_caller_address};
    use super::IOwnable;

    pub mod errors {
        pub const NOT_OWNER: felt252 = 'Ownable: caller is not owner';
        pub const ZERO_OWNER: felt252 = 'Ownable: new owner is zero';
        pub const ZERO_CLASS_HASH: felt252 = 'Ownable: class hash is zero';
    }

    #[storage]
    pub struct Storage {
        pub owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        OwnershipTransferred: OwnershipTransferred,
        Upgraded: Upgraded,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OwnershipTransferred {
        pub previous_owner: ContractAddress,
        pub new_owner: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Upgraded {
        pub class_hash: ClassHash,
    }

    #[embeddable_as(OwnableImpl)]
    pub impl Ownable<
        TContractState, +HasComponent<TContractState>,
    > of IOwnable<ComponentState<TContractState>> {
        fn owner(self: @ComponentState<TContractState>) -> ContractAddress {
            self.owner.read()
        }

        fn transfer_ownership(ref self: ComponentState<TContractState>, new_owner: ContractAddress) {
            // [Check] Caller is the owner
            self.assert_only_owner();
            // [Effect] Hand the ownership over
            self.set_owner(new_owner);
        }

        fn upgrade(ref self: ComponentState<TContractState>, class_hash: ClassHash) {
            // [Check] Caller is the owner
            self.assert_only_owner();
            // [Check] Class hash is not zero
            assert(class_hash.is_non_zero(), errors::ZERO_CLASS_HASH);
            // [Interaction] Replace the class
            starknet::syscalls::replace_class_syscall(class_hash).unwrap_syscall();
            self.emit(Upgraded { class_hash });
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
