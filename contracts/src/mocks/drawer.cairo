// TEST ONLY: never deploy this contract. It embeds `DrawableComponent` the way a drawing system
// will (#643 is the first), for the snforge tests and the size and gas measures of a draw (#638).

#[starknet::interface]
pub trait IDrawHarness<TContractState> {
    /// Draws the next random of `game_id` (kind `HARNESS_KIND`) and counts the draw.
    fn draw(ref self: TContractState, game_id: felt252) -> felt252;
    /// Draws as `draw` does, then reverts with the random as the reason: a transaction that fails
    /// after its draw.
    fn draw_then_fail(ref self: TContractState, game_id: felt252);
    fn draw_count(self: @TContractState, game_id: felt252) -> u32;
    fn set_vrf_provider(ref self: TContractState, provider: starknet::ContractAddress);
}

#[starknet::contract]
pub mod DrawHarness {
    use paved::components::drawable::DrawableComponent;
    use paved::components::ownable::OwnableComponent;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::IDrawHarness;

    pub const HARNESS_KIND: felt252 = 'HARNESS';

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: DrawableComponent, storage: drawable, event: DrawableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl DrawableImpl = DrawableComponent::DrawableImpl<ContractState>;
    impl DrawableInternalImpl = DrawableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        draw_counts: Map<felt252, u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        DrawableEvent: DrawableComponent::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, provider: ContractAddress) {
        self.ownable.initialize(owner);
        self.drawable.set_provider(provider);
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        fn next_random(ref self: ContractState, game_id: felt252) -> felt252 {
            let index = self.draw_counts.read(game_id);
            let random = self.drawable.draw_random(HARNESS_KIND, game_id, index);
            self.draw_counts.write(game_id, index + 1);
            random
        }
    }

    #[abi(embed_v0)]
    impl DrawHarnessImpl of IDrawHarness<ContractState> {
        fn draw(ref self: ContractState, game_id: felt252) -> felt252 {
            self.next_random(game_id)
        }

        fn draw_then_fail(ref self: ContractState, game_id: felt252) {
            let random = self.next_random(game_id);
            panic(array![random]);
        }

        fn draw_count(self: @ContractState, game_id: felt252) -> u32 {
            self.draw_counts.read(game_id)
        }

        fn set_vrf_provider(ref self: ContractState, provider: ContractAddress) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Effect] Set the provider
            self.drawable.set_provider(provider);
        }
    }
}
