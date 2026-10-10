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
    /// A Daily spawn is paid: `stake x entry price` USDC go from the player to `Economy`, which
    /// then runs its purchase (`referrer` and `min_out` are passed on). A Tutorial spawn is free
    /// and passes zeros.
    fn spawn(
        ref self: TContractState,
        mode: Mode,
        stake: u8,
        referrer: starknet::ContractAddress,
        min_out: u256,
    ) -> u32;
    fn claim(ref self: TContractState, tournament_id: u64, rank: u8);
    fn sponsor(ref self: TContractState, amount: felt252);
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn tutorial_discard(ref self: TContractState, game_id: u32);
    fn tutorial_surrender(ref self: TContractState, game_id: u32);
    /// The report of a Daily game that ended on a `build` (the tally of `paved::quests::encode`).
    fn report(ref self: TContractState, game_id: u32, over: u128);
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

/// The `Lobby` class a game contract runs by library call: the owner of `Daily` or `Tutorial` sets
/// it (P-42, which reverses P-26's "written by the constructors only").
#[starknet::interface]
pub trait ILobbyClass<TContractState> {
    /// Sets the `Lobby` class run from now on: the owner only, never zero. Emits `LobbyClassSet`.
    fn set_lobby_class(ref self: TContractState, class_hash: starknet::ClassHash);
}

/// Emitted by `Daily` or `Tutorial` when its owner sets the `Lobby` class.
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct LobbyClassSet {
    pub class_hash: starknet::ClassHash,
}

#[starknet::contract]
pub mod Lobby {
    // Imports

    use core::num::traits::Zero;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::{IERC20Dispatcher, IERC20DispatcherTrait, PayableComponent};
    use paved::components::playable::PlayableComponent;
    use paved::components::tutoriable::TutoriableComponent;
    use paved::constants;
    use paved::economy::economy::{DAY, IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::models::player::ZeroablePlayerTrait;
    use paved::quests::{achievement_entries, decode, quest_entries};
    use paved::store::{PavedStorage, StoreImpl, StoreTrait};
    use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::collection::{
        ICollectionDispatcher, ICollectionDispatcherTrait, TUTORIAL_OFFSET,
    };
    use paved::types::mode::Mode;
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use quiver_quest::types::mode::Mode as QuestMode;
    use starknet::storage::{StorageAsPath, StorageBase, StoragePointerReadAccess};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    // Local imports

    use super::{AchievementTask, AchievementWindow, ILobby, QuestSchedule, QuestTask};

    // Errors

    pub mod errors {
        pub const NOT_DEPLOYABLE: felt252 = 'Lobby: declared only';
        pub const NO_ECONOMY: felt252 = 'Lobby: economy not set';
        pub const NO_COLLECTION: felt252 = 'Lobby: collection not set';
        pub const PAY_FAILED: felt252 = 'ERC20: pay failed';
        pub const MISALIGNED_QUEST: felt252 = 'Daily: quest not on UTC day';
        pub const TASK_TOTAL_ZERO: felt252 = 'Daily: task total is zero';
        pub const TASK_REPEATED: felt252 = 'Daily: task id repeated';
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
        Reclaimed: Reclaimed,
    }

    /// A sponsor took back what it put in a day nobody ranked in (P-37b); emitted from
    /// `Daily`'s address, as every event of this class.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Reclaimed {
        #[key]
        pub tournament_id: u64,
        #[key]
        pub sponsor: ContractAddress,
        pub amount: u256,
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
        fn spawn(
            ref self: ContractState,
            mode: Mode,
            stake: u8,
            referrer: ContractAddress,
            min_out: u256,
        ) -> u32 {
            // [Effect] Spawn a game
            let (game_id, unit) = self.hostable.spawn(mode);
            // [Interaction] A Daily game is purchased (a Tutorial game is free)
            if mode == Mode::Daily {
                self.purchase(game_id, unit, stake, referrer, min_out);
            }
            // [Interaction] The game is minted to its player, under its own id and no other
            self.mint(mode, game_id);
            // [Return] Game ID
            game_id
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Rank 0 is a sponsor's reclaim of a day nobody ranked in (P-37b); 1 to 3 a
            // reward
            let caller = get_caller_address();
            let amount = if rank == 0 {
                let amount = self.hostable.reclaim(tournament_id, Mode::Daily);
                self.emit(Reclaimed { tournament_id, sponsor: caller, amount });
                amount
            } else {
                self.hostable.claim(tournament_id, rank, Mode::Daily)
            };
            // [Interaction] Pay it out of the prize pool
            self.payable.refund(caller, amount);
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
            self.finish(game_id, over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.playable.surrender(game_id);
            self.finish(game_id, over);
        }

        fn tutorial_discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile
            let over = self.tutoriable.discard(game_id);
            self.finish_tutorial(over);
        }

        fn tutorial_surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game: nothing to report, a surrender never credits First Stone
            // (P-28)
            self.tutoriable.surrender(game_id);
        }

        fn report(ref self: ContractState, game_id: u32, over: u128) {
            self.finish(game_id, over);
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

    /// The `Economy` of the paid Daily games, from the `Account` registry that keeps the players
    /// (`docs/architecture/economy.md`, section 6): set once, never zero after that.
    fn economy() -> IEconomyDispatcher {
        let base: StorageBase<PavedStorage> = StorageBase { __base_address__: selector!("paved") };
        let account = IAccountDispatcher { contract_address: base.as_path().account.read() };
        let economy = account.economy();
        assert(economy.is_non_zero(), errors::NO_ECONOMY);
        IEconomyDispatcher { contract_address: economy }
    }

    /// The `Collection` of the game NFTs, from the `Account` registry: set once, never zero after
    /// that.
    fn collection() -> ICollectionDispatcher {
        let base: StorageBase<PavedStorage> = StorageBase { __base_address__: selector!("paved") };
        let account = IAccountDispatcher { contract_address: base.as_path().account.read() };
        let collection = account.collection();
        assert(collection.is_non_zero(), errors::NO_COLLECTION);
        ICollectionDispatcher { contract_address: collection }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// A game is a token (economy.md section 9): its id for a Daily game, `TUTORIAL_OFFSET`
        /// plus its id for a Tutorial game, minted to the caller, who is the player (`spawn` checks
        /// that they are registered). `Collection` accepts it from `Daily` or `Tutorial` only, a
        /// plain mint with no receiver callback. The id is never an input: it is the id the
        /// spawn just drew, so no entry point lets a caller mint another one.
        fn mint(ref self: ContractState, mode: Mode, game_id: u32) {
            let token_id: u256 = if mode == Mode::Tutorial {
                TUTORIAL_OFFSET + game_id.into()
            } else {
                game_id.into()
            };
            collection().mint(get_caller_address(), token_id);
        }

        /// The purchase of a Daily game (economy.md section 1, P-31): `stake x unit` USDC go
        /// from the player straight to `Economy`, then `Economy.purchase` splits them, in the same
        /// call, for this game's own id. `Economy` checks the stake (1 to 10) and the price. A
        /// referrer counts only if it is a registered player other than the payer; any other is
        /// ignored (no referral).
        fn purchase(
            ref self: ContractState,
            game_id: u32,
            unit: u256,
            stake: u8,
            referrer: ContractAddress,
            min_out: u256,
        ) {
            let player = get_caller_address();
            let economy = economy();
            let referred = referrer.is_non_zero()
                && referrer != player
                && StoreImpl::new().player(referrer.into()).is_non_zero();
            let referrer = if referred {
                referrer
            } else {
                Zero::zero()
            };
            let price = stake.into() * unit;
            let token = IERC20Dispatcher { contract_address: self.payable.token_address.read() };
            assert(token.transferFrom(player, economy.contract_address, price), errors::PAY_FAILED);
            economy
                .purchase(
                    game_id, player, get_block_timestamp() / DAY, stake, price, referrer, min_out,
                );
        }

        /// A Daily game over reports its tally to the quests and to the achievements, once each,
        /// after the ranking is written and the `GameOver` emitted. Entries come from constants
        /// (`paved::quests`), so the calls cannot revert and the game over cannot fail. Its score
        /// is then recorded by `Economy` (P-34).
        fn finish(ref self: ContractState, game_id: u32, over: u128) {
            if over != 0 {
                let player_id: felt252 = get_caller_address().into();
                let tally = decode(over, player_id);
                self.quest.progress_many(player_id, quest_entries(tally).span(), QuestMode::Event);
                self.achievement.progress_many(player_id, achievement_entries(tally).span());
                economy().record(game_id, tally.score);
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
