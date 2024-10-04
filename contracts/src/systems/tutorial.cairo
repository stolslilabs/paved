// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

#[starknet::interface]
trait ITutorial<TContractState> {
    fn spawn(self: @TContractState) -> u32;
    fn discard(self: @TContractState, game_id: u32,);
    fn surrender(self: @TContractState, game_id: u32,);
    fn build(self: @TContractState, game_id: u32,);
}

#[dojo::contract]
mod Tutorial {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::get_caller_address;

    // Component imports

    use paved::components::emitter::EmitterComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::mode::Mode;

    // Local imports

    use super::ITutorial;

    // Components

    component!(path: EmitterComponent, storage: emitter, event: EmitterEvent);
    impl EmitterImpl = EmitterComponent::EmitterImpl<ContractState>;
    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        emitter: EmitterComponent::Storage,
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        EmitterEvent: EmitterComponent::Event,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(self: @ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, _) = self.hostable.spawn(self.world(), Mode::Tutorial);
            // [Return] Game ID
            game_id
        }

        fn discard(self: @ContractState, game_id: u32) {
            // [Effect] Discard a tile
            self.tutoriable.discard(self.world(), game_id);
        }

        fn surrender(self: @ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.tutoriable.surrender(self.world(), game_id);
        }

        fn build(self: @ContractState, game_id: u32,) {
            // [Effect] Build a tile
            self.tutoriable.build(self.world(), game_id);
        }
    }
}
