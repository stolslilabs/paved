// What does not run on an ordinary move: spawn, claim, sponsor, discard and surrender of `Daily`
// and `Tutorial`, as one class those two run through `library_call_syscall`
// (`docs/architecture/class-headroom.md`, option e). Under a library call the storage, the caller
// and the address that emits the events stay the calling contract's. The components use flat
// storage (`substorage(v0)`) and the game state lives in the `paved` storage node
// (`store.cairo`), so this code reads and writes the same addresses as the caller's own code
// (`tests::e2e::lobby` pins that).
//
// `Lobby` is declared, never deployed: its constructor reverts, so no instance of it exists and
// its entry points only run as `Daily` or `Tutorial`, through their wrappers.

use paved::types::mode::Mode;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;

#[starknet::interface]
pub trait ILobby<TContractState> {
    fn spawn(ref self: TContractState, mode: Mode) -> u32;
    fn claim(ref self: TContractState, tournament_id: u64, rank: u8);
    fn sponsor(ref self: TContractState, amount: felt252);
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn tutorial_discard(ref self: TContractState, game_id: u32);
    fn tutorial_surrender(ref self: TContractState, game_id: u32);
    /// The report of a Daily game that ended on a `build` (the tally of `paved::quests::encode`).
    fn report(ref self: TContractState, over: u128);
    /// The report of a Tutorial game that ended on a `build`.
    fn tutorial_report(ref self: TContractState);
    /// The definitions of the quests and of the achievements: owner only, checked here against
    /// the `Ownable` storage of the caller (`Daily`), whose wrappers are the only way in.
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
pub mod Lobby {
    // Component imports

    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::constants;
    use paved::quests::{achievement_entries, decode, quest_entries};
    use paved::types::mode::Mode;
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use quiver_quest::types::mode::Mode as QuestMode;
    use starknet::{ContractAddress, get_caller_address};

    // Local imports

    use super::{AchievementTask, AchievementWindow, ILobby, QuestSchedule, QuestTask};

    // Errors

    pub mod errors {
        pub const NOT_DEPLOYABLE: felt252 = 'Lobby: declared only';
        pub const MISALIGNED_QUEST: felt252 = 'Daily: quest not on UTC day';
    }

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;
    // [Info] Quests and achievements (docs/architecture/quests.md): event mode, the trusted
    // internal layer only, no view. The indexer reads the definitions from `QuestDefined` and
    // `AchievementDefined`: TrackAll.
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
        tutoriable: TutoriableComponent::Storage,
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
        HostableEvent: HostableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
        #[flat]
        QuestEvent: QuestComponent::Event,
        #[flat]
        AchievementEvent: AchievementComponent::Event,
    }

    // Constructor

    /// A deploy of the class always reverts: `Lobby` only runs by library call.
    #[constructor]
    fn constructor(ref self: ContractState) {
        core::panic_with_felt252(errors::NOT_DEPLOYABLE);
    }

    // Implementations

    #[abi(embed_v0)]
    impl LobbyImpl of ILobby<ContractState> {
        fn spawn(ref self: ContractState, mode: Mode) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable.spawn(mode);
            // [Interaction] Pay entry price (a Tutorial game is free)
            if mode == Mode::Daily {
                self.payable.pay(get_caller_address(), amount);
            }
            // [Return] Game ID
            game_id
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Claim the reward
            let reward = self.hostable.claim(tournament_id, rank, Mode::Daily);
            // [Interaction] Pay the reward out of the prize pool
            self.payable.refund(get_caller_address(), reward);
        }

        fn sponsor(ref self: ContractState, amount: felt252) {
            // [Effect] Add to the prize pool
            let amount = self.hostable.sponsor(amount, Mode::Daily);
            // [Interaction] Pay the amount
            self.payable.pay(get_caller_address(), amount);
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile
            let over = self.playable.discard(game_id);
            self.finish(over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.playable.surrender(game_id);
            self.finish(over);
        }

        fn tutorial_discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile
            let over = self.tutoriable.discard(game_id);
            self.finish_tutorial(over);
        }

        fn tutorial_surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.tutoriable.surrender(game_id);
            self.finish_tutorial(over);
        }

        fn report(ref self: ContractState, over: u128) {
            self.finish(over);
        }

        fn tutorial_report(ref self: ContractState) {
            self.finish_tutorial(true);
        }

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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// A Daily game over reports its tally to the quests and to the achievements, once each,
        /// after the ranking is written and the `GameOver` emitted. Entries come from constants
        /// (`paved::quests`), so the calls cannot revert and the game over cannot fail.
        fn finish(ref self: ContractState, over: u128) {
            if over != 0 {
                let player_id: felt252 = get_caller_address().into();
                let tally = decode(over, player_id);
                self.quest.progress_many(player_id, quest_entries(tally).span(), QuestMode::Event);
                self.achievement.progress_many(player_id, achievement_entries(tally).span());
            }
        }

        /// A Tutorial game over reports one unit of task 10 for its player.
        fn finish_tutorial(ref self: ContractState, over: bool) {
            if over {
                let player_id: felt252 = get_caller_address().into();
                self.achievement.progress(player_id, constants::TASK_TUTORIAL_FINISHED, 1);
            }
        }
    }
}
