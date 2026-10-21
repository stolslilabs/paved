// TEST ONLY: never deploy this contract. A stand-in for the player's level of #641, read by
// `Village`'s parcel gate (`IPlayerLevel`): the tests set the level of a player.

#[starknet::interface]
pub trait IMockLevels<TContractState> {
    fn set_level(ref self: TContractState, player_id: felt252, level: u32);
}

#[starknet::contract]
pub mod MockLevels {
    use paved::systems::village::IPlayerLevel;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::IMockLevels;

    #[storage]
    struct Storage {
        levels: Map<felt252, u32>,
    }

    #[abi(embed_v0)]
    impl MockLevelsImpl of IMockLevels<ContractState> {
        fn set_level(ref self: ContractState, player_id: felt252, level: u32) {
            self.levels.write(player_id, level);
        }
    }

    #[abi(embed_v0)]
    impl PlayerLevelImpl of IPlayerLevel<ContractState> {
        fn level(self: @ContractState, player_id: felt252) -> u32 {
            self.levels.read(player_id)
        }
    }
}
