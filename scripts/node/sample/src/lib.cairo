#[starknet::interface]
pub trait ISample<T> {
    fn set_value(ref self: T, value: felt252);
    fn get_value(self: @T) -> felt252;
}

#[starknet::contract]
pub mod Sample {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        value: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ValueSet: ValueSet,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ValueSet {
        pub value: felt252,
    }

    #[abi(embed_v0)]
    impl SampleImpl of super::ISample<ContractState> {
        fn set_value(ref self: ContractState, value: felt252) {
            self.value.write(value);
            self.emit(ValueSet { value });
        }

        fn get_value(self: @ContractState) -> felt252 {
            self.value.read()
        }
    }
}
