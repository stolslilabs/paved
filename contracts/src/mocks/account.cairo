//! A mock of the `Account` registry that left the systems at D-25 E (P-53 ruling 5: the Account
//! belongs in the mocks): a registration and the player view, nothing else. No deployed contract
//! reads it and `scripts/deploy.sh` never deploys it. Its one user,
//! `tests::e2e::access::test_access_a_registration_changes_nothing`, shows that `Challenge` plays and
//! pays a referrer the same whether the address registered or not.

#[starknet::interface]
pub trait IMockAccount<TContractState> {
    /// Registers the caller under `name` (non-zero), once.
    fn register(ref self: TContractState, name: felt252);
    /// The name of `player_id`, 0 if it never registered.
    fn player(self: @TContractState, player_id: felt252) -> felt252;
}

#[starknet::contract]
pub mod MockAccount {
    use starknet::get_caller_address;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        names: Map<felt252, felt252>,
    }

    #[abi(embed_v0)]
    impl MockAccountImpl of super::IMockAccount<ContractState> {
        fn register(ref self: ContractState, name: felt252) {
            assert(name != 0, 'MockAccount: name is zero');
            let player_id: felt252 = get_caller_address().into();
            assert(self.names.read(player_id) == 0, 'MockAccount: registered');
            self.names.write(player_id, name);
        }

        fn player(self: @ContractState, player_id: felt252) -> felt252 {
            self.names.read(player_id)
        }
    }
}
