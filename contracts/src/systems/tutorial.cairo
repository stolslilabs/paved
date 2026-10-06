// Starknet imports

#[starknet::interface]
pub trait ITutorial<TContractState> {
    fn spawn(ref self: TContractState) -> u32;
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(ref self: TContractState, game_id: u32);
}

#[starknet::contract]
pub mod Tutorial {
    // Component imports

    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::types::mode::Mode;
    use starknet::ContractAddress;

    // Local imports

    use super::ITutorial;

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, account_address: ContractAddress,
    ) {
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(ref self: ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, _) = self.hostable.spawn(Mode::Tutorial);
            // [Return] Game ID
            game_id
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile
            self.tutoriable.discard(game_id);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.tutoriable.surrender(game_id);
        }

        fn build(ref self: ContractState, game_id: u32) {
            // [Effect] Build a tile
            self.tutoriable.build(game_id);
        }
    }
}
