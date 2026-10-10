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
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::systems::lobby::{
        ILobbyClass, ILobbyDispatcherTrait, ILobbyLibraryDispatcher, LobbyClassSet,
    };
    use paved::types::mode::Mode;
    use paved::views::{BuilderView, CharacterView, GameView, IGameView, TileView, ViewsImpl};
    use quiver_achievement::component::AchievementComponent;
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

    // Hostable runs in the lobby class; declared here so the storage and event layout stay
    // those of the published interface
    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;
    // Achievements run in the lobby class (task 10); declared here so the storage and the events
    // are those of the interface
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
        #[substorage(v0)]
        achievement: AchievementComponent::Storage,
        /// The `Lobby` class run by library call; written by the constructor and `set_lobby_class`.
        lobby_class: ClassHash,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
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
        #[flat]
        AchievementEvent: AchievementComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        LobbyClassSet: LobbyClassSet,
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
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .spawn(Mode::Tutorial, 0, Zero::zero(), 0)
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
            let over = self.tutoriable.build(game_id);
            // [Effect] A game that ends reports task 10, in the lobby class (one call)
            if over {
                ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.tutorial_report();
            }
        }
    }
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        /// Replaces the class, keeping the storage (OpenZeppelin's `Upgraded`). The owner only.
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    #[abi(embed_v0)]
    impl LobbyClassImpl of ILobbyClass<ContractState> {
        fn set_lobby_class(ref self: ContractState, class_hash: ClassHash) {
            // [Check] The owner, a real class
            self.ownable.assert_only_owner();
            assert(class_hash.is_non_zero(), errors::ZERO_LOBBY_CLASS);
            // [Effect] Run it from the next call on
            self.lobby_class.write(class_hash);
            self.emit(LobbyClassSet { class_hash });
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
