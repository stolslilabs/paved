// Starknet imports

use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;

#[starknet::interface]
pub trait IDaily<TContractState> {
    /// A paid game: approve `Daily` on USDC for `stake x entry_price().amount` first (stake 1 to
    /// 10). `referrer`: a registered player other than the caller, or zero; `min_out`: the least
    /// PAVED the burn's swap must buy (`docs/architecture/economy.md`, section 5).
    fn spawn(
        ref self: TContractState, stake: u8, referrer: starknet::ContractAddress, min_out: u256,
    ) -> u32;
    fn claim(ref self: TContractState, tournament_id: u64, rank: u8);
    fn sponsor(ref self: TContractState, amount: felt252);
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(
        ref self: TContractState,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

/// The definitions of the quests and of the achievements: owner only (checked in `Lobby`, which
/// runs them). A definition is created once and cannot be edited; a retired id cannot be defined
/// again (`quiver_quest` and `quiver_achievement` rules). Progress has no entrypoint: only a game
/// over reports it.
#[starknet::interface]
pub trait IDailyQuests<TContractState> {
    fn define_quest(
        ref self: TContractState,
        quest_id: u32,
        schedule: QuestSchedule,
        tasks: Span<QuestTask>,
        conditions: Span<u32>,
    );
    fn retire_quest(ref self: TContractState, quest_id: u32);
    fn define_achievement(
        ref self: TContractState,
        achievement_id: u32,
        window: AchievementWindow,
        tasks: Span<AchievementTask>,
        points: u16,
    );
    fn retire_achievement(ref self: TContractState, achievement_id: u32);
}

#[starknet::contract]
pub mod Daily {
    // Component imports

    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::systems::lobby::{
        ILobbyClass, ILobbyDispatcherTrait, ILobbyLibraryDispatcher, LobbyClassSet,
    };
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::views::{
        BuilderView, CharacterView, GameView, IGameView, ITournamentView, PriceView, TileView,
        TournamentView, ViewsImpl,
    };
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ClassHash, ContractAddress, get_block_timestamp};

    // Local imports

    use super::{AchievementTask, AchievementWindow, IDaily, IDailyQuests, QuestSchedule, QuestTask};

    // Errors

    pub mod errors {
        pub const ZERO_ACCOUNT_ADDRESS: felt252 = 'Daily: account is zero';
        pub const ZERO_TOKEN_ADDRESS: felt252 = 'Daily: token is zero';
        pub const ZERO_LOBBY_CLASS: felt252 = 'Daily: lobby class is zero';
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
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;
    // Quests and achievements run in the lobby class; declared here so the storage and the events
    // (`QuestDefined`, `AchievementProgressed`, ...) are those of the interface
    component!(path: QuestComponent, storage: quest, event: QuestEvent);
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
        #[substorage(v0)]
        playable: PlayableComponent::Storage,
        #[substorage(v0)]
        quest: QuestComponent::Storage,
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
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
        #[flat]
        QuestEvent: QuestComponent::Event,
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
        token_address: ContractAddress,
        lobby_class: ClassHash,
    ) {
        // [Check] Addresses are set
        assert(account_address.is_non_zero(), errors::ZERO_ACCOUNT_ADDRESS);
        assert(token_address.is_non_zero(), errors::ZERO_TOKEN_ADDRESS);
        assert(lobby_class.is_non_zero(), errors::ZERO_LOBBY_CLASS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.payable.initialize(token_address);
        self.lobby_class.write(lobby_class);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(
            ref self: ContractState, stake: u8, referrer: ContractAddress, min_out: u256,
        ) -> u32 {
            // [Effect] Spawn a game and purchase it, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .spawn(Mode::Daily, stake, referrer, min_out)
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Claim the reward and pay it, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .claim(tournament_id, rank);
        }

        fn sponsor(ref self: ContractState, amount: felt252) {
            // [Effect] Add to the prize pool and pay it, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.sponsor(amount);
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.discard(game_id);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.surrender(game_id);
        }

        fn build(
            ref self: ContractState,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            // [Effect] Build a tile
            let over = self.playable.build(game_id, orientation, x, y, role, spot);
            // [Effect] A game that ends reports to the quests, in the lobby class (one call)
            if over != 0 {
                ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                    .report(game_id, over);
            }
        }
    }
    #[abi(embed_v0)]
    impl DailyQuestsImpl of IDailyQuests<ContractState> {
        fn define_quest(
            ref self: ContractState,
            quest_id: u32,
            schedule: QuestSchedule,
            tasks: Span<QuestTask>,
            conditions: Span<u32>,
        ) {
            // [Effect] Owner check and definition, in the lobby class
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .define_quest(quest_id, schedule, tasks, conditions);
        }

        fn retire_quest(ref self: ContractState, quest_id: u32) {
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }.retire_quest(quest_id);
        }

        fn define_achievement(
            ref self: ContractState,
            achievement_id: u32,
            window: AchievementWindow,
            tasks: Span<AchievementTask>,
            points: u16,
        ) {
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .define_achievement(achievement_id, window, tasks, points);
        }

        fn retire_achievement(ref self: ContractState, achievement_id: u32) {
            ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }
                .retire_achievement(achievement_id);
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

    #[abi(embed_v0)]
    impl TournamentViewImpl of ITournamentView<ContractState> {
        fn tournament(self: @ContractState, id: u64) -> TournamentView {
            ViewsImpl::tournament(StoreImpl::new(), id, get_block_timestamp())
        }

        fn current_tournament_id(self: @ContractState) -> u64 {
            ViewsImpl::current_tournament_id(get_block_timestamp())
        }

        fn entry_price(self: @ContractState) -> PriceView {
            ViewsImpl::entry_price(self.payable.token_address.read())
        }
    }
}
