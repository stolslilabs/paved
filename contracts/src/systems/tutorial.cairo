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

    use core::num::traits::Zero;
    use paved::components::ownable::OwnableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::systems::lobby::{ILobbyDispatcherTrait, ILobbyLibraryDispatcher};
    use paved::types::mode::Mode;
    use paved::views::{BuilderView, CharacterView, GameView, IGameView, TileView, ViewsImpl};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ClassHash, ContractAddress};

    // Local imports

    use super::ITutorial;

    // Errors

    pub mod errors {
        pub const ZERO_ACCOUNT_ADDRESS: felt252 = 'Tutorial: account is zero';
        pub const ZERO_LOBBY_CLASS: felt252 = 'Tutorial: lobby class is zero';
    }

    // Components

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
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
        /// The `Lobby` class run by library call; written by the constructor only.
        lobby_class: ClassHash,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        account_address: ContractAddress,
        lobby_class: ClassHash,
    ) {
        // [Check] Addresses are set
        assert(account_address.is_non_zero(), errors::ZERO_ACCOUNT_ADDRESS);
        assert(lobby_class.is_non_zero(), errors::ZERO_LOBBY_CLASS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.lobby_class.write(lobby_class);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(ref self: ContractState) -> u32 {
            // [Effect] Spawn a game, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.spawn(Mode::Tutorial)
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .tutorial_discard(game_id);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .tutorial_surrender(game_id);
        }

        fn build(ref self: ContractState, game_id: u32) {
            // [Effect] Build a tile
            self.tutoriable.build(game_id);
        }
    }
    #[abi(embed_v0)]
    impl GameViewImpl of IGameView<ContractState> {
        fn game(self: @ContractState, game_id: u32) -> GameView {
            ViewsImpl::game(StoreImpl::new(), game_id)
        }

        fn tiles(self: @ContractState, game_id: u32, from: u32, count: u32) -> Array<TileView> {
            ViewsImpl::tiles(StoreImpl::new(), game_id, from, count)
        }

        fn builder(self: @ContractState, game_id: u32, player_id: felt252) -> BuilderView {
            ViewsImpl::builder(StoreImpl::new(), game_id, player_id)
        }

        fn characters(
            self: @ContractState, game_id: u32, player_id: felt252,
        ) -> Array<CharacterView> {
            ViewsImpl::characters(StoreImpl::new(), game_id, player_id)
        }
    }
}
