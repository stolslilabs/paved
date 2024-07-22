// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[dojo::interface]
trait ITutorial {
    fn spawn(ref world: IWorldDispatcher) -> u32;
    fn surrender(ref world: IWorldDispatcher, game_id: u32,);
    fn build(ref world: IWorldDispatcher, game_id: u32,);
}

#[dojo::contract]
mod tutorial {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::{ContractAddress, ClassHash};
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address
    };

    // Component imports

    use paved::components::emitter::EmitterComponent;
    use paved::components::ownable::OwnableComponent;
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
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
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
        ownable: OwnableComponent::Storage,
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
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(ref world: IWorldDispatcher) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable._spawn(world, Mode::Tutorial);
            // [Return] Game ID
            game_id
        }

        fn surrender(ref world: IWorldDispatcher, game_id: u32) {
            // [Effect] Surrender game
            self.tutoriable._surrender(world, game_id);
        }

        fn build(ref world: IWorldDispatcher, game_id: u32,) {
            // [Effect] Build a tile
            self.tutoriable._build(world, game_id);
        }
    }
}
