//! `Setup`, the system that holds the quests and the achievements (D-24, P-51 ruling 3, named by
//! D-25; `docs/architecture/quests.md`, `leaderboard.md` "D-24").
//!
//! The mode contracts report to it: an allowlisted reporter (Challenge, today `Daily`) sends one
//! `report` per game over, with the entries its own tally gives (`paved::quests`); `Setup` knows
//! tasks, not games. It trusts the reporter for whom the report is: it cannot read a game's player
//! without calling the reporter back. The guarantee is the reporter's code (`Daily` reports only
//! for the caller of the move that ended the game, who must be the game's player).
//!
//! The tutorial is off chain (D-21): its achievement is claimed here by the player, once, with no
//! check (P-49 ruling 2).
//!
//! Step E (D-25) adds the wiring `Account` holds today (the economy and collection addresses) as
//! new storage members: none of the members below moves.

use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::batch::TaskProgress as QuestProgress;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use starknet::ContractAddress;

#[starknet::interface]
pub trait ISetup<TContractState> {
    /// The definitions of the quests and of the achievements: owner only. A definition is created
    /// once and cannot be edited; a retired id cannot be defined again (`quiver_quest` and
    /// `quiver_achievement` rules).
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
    /// Allows or revokes a reporter, in both components: owner only. Emits `QuestReporterSet` and
    /// `AchievementReporterSet`.
    fn set_reporter(ref self: TContractState, reporter: ContractAddress, allowed: bool);
    /// The progress of `player_id`, from an allowlisted reporter only (`'Quest: not reporter'`
    /// otherwise): one `QuestProgressed` per quest entry and one `AchievementProgressed` per
    /// achievement entry (quiver merges repeated task ids).
    fn report(
        ref self: TContractState,
        player_id: felt252,
        quests: Span<QuestProgress>,
        achievements: Span<AchievementProgress>,
    );
    /// The caller's claim of the tutorial achievement (task 10, First Stone): the first call emits
    /// `AchievementProgressed { player_id: caller, task_id: 10, count: 1 }`; any later call does
    /// nothing and does not revert.
    fn claim_tutorial(ref self: TContractState);
    fn is_reporter(self: @TContractState, reporter: ContractAddress) -> bool;
    fn tutorial_claimed(self: @TContractState, player_id: felt252) -> bool;
}

#[starknet::contract]
pub mod Setup {
    // Imports

    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::constants;
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use quiver_quest::types::mode::Mode as QuestMode;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address};

    // Local imports

    use super::{
        AchievementProgress, AchievementTask, AchievementWindow, ISetup, QuestProgress,
        QuestSchedule, QuestTask,
    };

    // Errors

    pub mod errors {
        pub const MISALIGNED_QUEST: felt252 = 'Setup: quest not on UTC day';
        pub const TASK_TOTAL_ZERO: felt252 = 'Setup: task total is zero';
        pub const TASK_REPEATED: felt252 = 'Setup: task id repeated';
    }

    // Components

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    // [Info] Quests and achievements (docs/architecture/quests.md): event mode, the internal layer
    // only, no view. The indexer reads the definitions from `QuestDefined` and
    // `AchievementDefined`: TrackAll.
    component!(path: QuestComponent, storage: quest, event: QuestEvent);
    impl QuestInternalImpl = QuestComponent::InternalImpl<ContractState>;
    impl QuestTracking = quiver_quest::store::tracking::TrackAll<ContractState>;
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);
    impl AchievementInternalImpl = AchievementComponent::InternalImpl<ContractState>;
    impl AchievementTracking = quiver_achievement::store::tracking::TrackAll<ContractState>;

    // The external layers are not embedded; were one embedded, its admin would be the owner
    impl QuestHooks of QuestComponent::QuestHooksTrait<ContractState> {
        fn authorize_admin(
            self: @QuestComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            caller == self.get_contract().ownable.owner.read()
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
            caller == self.get_contract().ownable.owner.read()
        }
    }

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        quest: QuestComponent::Storage,
        #[substorage(v0)]
        achievement: AchievementComponent::Storage,
        /// Whether a player has claimed the tutorial achievement (one slot per player).
        tutorial_claims: Map<felt252, bool>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        QuestEvent: QuestComponent::Event,
        #[flat]
        AchievementEvent: AchievementComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initialize(owner);
    }

    // Implementations

    #[abi(embed_v0)]
    impl SetupImpl of ISetup<ContractState> {
        fn define_quest(
            ref self: ContractState,
            quest_id: u32,
            schedule: QuestSchedule,
            tasks: Span<QuestTask>,
            conditions: Span<u32>,
        ) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Check] A recurring quest rolls over at 00:00 UTC, where the day id does
            if schedule.interval != 0 {
                assert(schedule.start % 86400 == 0, errors::MISALIGNED_QUEST);
            }
            // [Check] Every task total is positive and every task id appears once
            let mut totals: Array<(u32, u32)> = array![];
            for task in tasks {
                totals.append((*task.task_id, *task.total));
            }
            assert_tasks(totals.span());
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
            // [Check] Every task total is positive and every task id appears once
            let mut totals: Array<(u32, u32)> = array![];
            for task in tasks {
                totals.append((*task.task_id, *task.total));
            }
            assert_tasks(totals.span());
            self.achievement.define(achievement_id, window, tasks, points);
        }

        fn retire_achievement(ref self: ContractState, achievement_id: u32) {
            self.ownable.assert_only_owner();
            self.achievement.retire(achievement_id);
        }

        fn set_reporter(ref self: ContractState, reporter: ContractAddress, allowed: bool) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Effect] The same allowlist in both components
            self.quest.set_reporter(reporter, allowed);
            self.achievement.set_reporter(reporter, allowed);
        }

        fn report(
            ref self: ContractState,
            player_id: felt252,
            quests: Span<QuestProgress>,
            achievements: Span<AchievementProgress>,
        ) {
            // [Check] Caller is a reporter. `set_reporter` is the only writer of both components'
            // allowlists and writes them together, so the quests' one stands for both (one read)
            self.quest.assert_reporter(get_caller_address());
            // [Effect] The progress, for the player the reporter names
            self.quest.progress_many(player_id, quests, QuestMode::Event);
            self.achievement.progress_many(player_id, achievements);
        }

        fn claim_tutorial(ref self: ContractState) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] Once per player: a later claim does nothing
            if self.tutorial_claims.read(player_id) {
                return;
            }
            // [Effect] Claimed, then First Stone's task
            self.tutorial_claims.write(player_id, true);
            self.achievement.progress(player_id, constants::TASK_TUTORIAL_FINISHED, 1);
        }

        fn is_reporter(self: @ContractState, reporter: ContractAddress) -> bool {
            reporters::allowed(self.quest, reporter)
        }

        fn tutorial_claimed(self: @ContractState, player_id: felt252) -> bool {
            self.tutorial_claims.read(player_id)
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

    /// Apart, because quiver's `StoreTrait` and the component's `InternalTrait` both name
    /// `set_reporter`.
    mod reporters {
        use quiver_quest::component::QuestComponent::ComponentState;
        use quiver_quest::store::StoreTrait;
        use starknet::ContractAddress;
        use super::ContractState;

        pub fn allowed(quest: @ComponentState<ContractState>, reporter: ContractAddress) -> bool {
            quest.get_reporter(reporter).allowed
        }
    }

    /// A definition the indexer can serve: no task total of 0 (complete before any report) and no
    /// task id twice (two entries under one key). Tasks are at most 3 (quiver `MAX_TASKS`).
    fn assert_tasks(tasks: Span<(u32, u32)>) {
        let mut i = 0;
        while i < tasks.len() {
            let (task_id, total) = *tasks.at(i);
            assert(total != 0, errors::TASK_TOTAL_ZERO);
            let mut j = i + 1;
            while j < tasks.len() {
                let (other, _) = *tasks.at(j);
                assert(other != task_id, errors::TASK_REPEATED);
                j += 1;
            }
            i += 1;
        }
    }
}
