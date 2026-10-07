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
    fn spawn(ref self: TContractState) -> u32;
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

/// The definitions of the quests and of the achievements: owner only. A definition is created once
/// and cannot be edited; a retired id cannot be defined again (`quiver_quest` and
/// `quiver_achievement` rules). Progress has no entrypoint: only a game over reports it.
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
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::constants;
    use paved::events::Event as PavedEvent;
    use paved::quests::{achievement_entries, decode, quest_entries};
    use paved::store::{StoreImpl, StoreTrait};
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
    use quiver_quest::types::mode::Mode as QuestMode;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    // Local imports

    use super::{AchievementTask, AchievementWindow, IDaily, IDailyQuests, QuestSchedule, QuestTask};

    // Errors

    pub mod errors {
        pub const ZERO_ACCOUNT_ADDRESS: felt252 = 'Daily: account is zero';
        pub const ZERO_TOKEN_ADDRESS: felt252 = 'Daily: token is zero';
        pub const MISALIGNED_QUEST: felt252 = 'Daily: quest not on UTC day';
    }

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;
    // [Info] Quests and achievements (docs/architecture/quests.md): event mode, the trusted
    // internal layer only (no view: the class is at the Starknet size cap, see
    // `scripts/class-sizes.sh`). No `progress` entrypoint exists: a game over reports its own.
    // The indexer reads the definitions from `QuestDefined` and `AchievementDefined`: TrackAll.
    component!(path: QuestComponent, storage: quest, event: QuestEvent);
    impl QuestInternalImpl = QuestComponent::InternalImpl<ContractState>;
    impl QuestTracking = quiver_quest::store::tracking::TrackAll<ContractState>;
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);
    impl AchievementInternalImpl = AchievementComponent::InternalImpl<ContractState>;
    impl AchievementTracking = quiver_achievement::store::tracking::TrackAll<ContractState>;

    // Used by the external implementations only, which are not embedded: nobody is admin there
    impl QuestHooks of QuestComponent::QuestHooksTrait<ContractState> {
        fn authorize_admin(
            self: @QuestComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            false
        }
        fn authorize_player(
            self: @QuestComponent::ComponentState<ContractState>,
            caller: ContractAddress,
            player_id: felt252,
        ) -> bool {
            false
        }
        fn on_quest_complete(
            ref self: QuestComponent::ComponentState<ContractState>,
            player_id: felt252,
            quest_id: u32,
            interval_id: u64,
            completions: u64,
        ) {}
        fn on_quest_claim(
            ref self: QuestComponent::ComponentState<ContractState>,
            player_id: felt252,
            quest_id: u32,
            interval_id: u64,
            claim_index: u64,
        ) {}
    }

    impl AchievementHooks of AchievementComponent::AchievementHooksTrait<ContractState> {
        fn authorize_admin(
            self: @AchievementComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            false
        }
    }

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
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        account_address: ContractAddress,
        token_address: ContractAddress,
    ) {
        // [Check] Addresses are set
        assert(account_address.is_non_zero(), errors::ZERO_ACCOUNT_ADDRESS);
        assert(token_address.is_non_zero(), errors::ZERO_TOKEN_ADDRESS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.payable.initialize(token_address);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(ref self: ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable.spawn(Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Claim the reward
            let reward = self.hostable.claim(tournament_id, rank, Mode::Daily);
            // [Interaction] Pay the reward out of the prize pool
            let caller = get_caller_address();
            self.payable.refund(caller, reward);
        }

        fn sponsor(ref self: ContractState, amount: felt252) {
            // [Effect] Add to the prize pool
            let amount = self.hostable.sponsor(amount, Mode::Daily);
            // [Interaction] Pay the amount
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile
            let over = self.playable.discard(game_id);
            self.report(over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.playable.surrender(game_id);
            self.report(over);
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
            self.report(over);
        }
    }
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// A Daily game over reports its tally to the quests and to the achievements, once each,
        /// after the ranking is written and the `GameOver` emitted. Entries come from constants
        /// (`paved::quests`), so the calls cannot revert and the game over cannot fail.
        fn report(ref self: ContractState, over: u128) {
            if over != 0 {
                let player_id: felt252 = get_caller_address().into();
                let tally = decode(over, player_id);
                self.quest.progress_many(player_id, quest_entries(tally).span(), QuestMode::Event);
                self.achievement.progress_many(player_id, achievement_entries(tally).span());
            }
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

    // [Info] Declared last: the entrypoints of the game come first in the dispatch of the contract
    #[abi(embed_v0)]
    impl DailyQuestsImpl of IDailyQuests<ContractState> {
        fn define_quest(
            ref self: ContractState,
            quest_id: u32,
            schedule: QuestSchedule,
            tasks: Span<QuestTask>,
            conditions: Span<u32>,
        ) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Check] A recurring quest rolls over at 00:00 UTC, where the tournament id does
            if schedule.interval != 0 {
                assert(schedule.start % 86400 == 0, errors::MISALIGNED_QUEST);
            }
            // [Effect] Define the quest
            self.quest.define(quest_id, schedule, tasks, conditions);
        }

        fn retire_quest(ref self: ContractState, quest_id: u32) {
            self.ownable.assert_only_owner();
            self.quest.retire(quest_id);
        }

        fn define_achievement(
            ref self: ContractState,
            achievement_id: u32,
            window: AchievementWindow,
            tasks: Span<AchievementTask>,
            points: u16,
        ) {
            self.ownable.assert_only_owner();
            self.achievement.define(achievement_id, window, tasks, points);
        }

        fn retire_achievement(ref self: ContractState, achievement_id: u32) {
            self.ownable.assert_only_owner();
            self.achievement.retire(achievement_id);
        }
    }
}
