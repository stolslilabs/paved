#[starknet::interface]
trait ITutorial<TContractState> {
    fn spawn(self: @TContractState) -> u32;
    fn discard(self: @TContractState, game_id: u32,);
    fn surrender(self: @TContractState, game_id: u32,);
    fn build(self: @TContractState, game_id: u32,);
}

#[dojo::contract]
mod Tutorial {
    // Component imports

    use paved::components::playable::PlayableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::types::mode::Mode;

    // Local imports

    use super::ITutorial;

    // Components

    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(self: @ContractState) -> u32 {
            // [Effect] Spawn a game
            self.tutoriable.spawn(self.world(), Mode::Tutorial)
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
