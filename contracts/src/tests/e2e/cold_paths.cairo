//! The cold paths of `Daily` (D-24, P-51 ruling 1): spawn with its purchase and its mint, discard,
//! surrender and the game over, back in `Daily`'s own code since the `Lobby` class ended. These
//! tests pin, with spies in place of the token, `Economy` and `Setup`: the spawn writes its state
//! before the transfer (checks, effects, interactions), the purchase gets the same values as
//! through `Lobby` before, and a game over, by build, discard or surrender, makes one report to
//! `Setup` for the game's player, then `Economy.record`; any other move reports nothing.

use core::num::traits::Zero;
use paved::constants;
use paved::models::game::GameImpl;
use paved::models::tile::CENTER;
use paved::quests::{achievement_entries, quest_entries, tally};
use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
use paved::systems::daily::{IDailyDispatcher, IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::tests::setup::setup::{
    ANYONE, ANYONE_NAME, IDailyDispatcherTrait, OWNER, PLAYER, PLAYER_NAME, TestStore,
    TestStoreTrait,
};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_quest::types::batch::TaskProgress as QuestProgress;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

/// A token that records, from inside `transferFrom` and `transfer`, who calls it and what the
/// game view of that caller says at that moment. It moves no balance and always succeeds.
#[starknet::interface]
pub trait ISpyToken<TContractState> {
    fn watch(ref self: TContractState, game_id: u32);
    fn seen(self: @TContractState) -> Seen;
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Seen {
    /// The contract that called the token.
    pub caller: ContractAddress,
    /// Where the tokens go.
    pub recipient: ContractAddress,
    /// The watched game exists in the caller's view.
    pub spawned: bool,
}

#[starknet::contract]
pub mod SpyToken {
    use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::{ISpyToken, Seen};

    #[storage]
    struct Storage {
        game_id: u32,
        seen: Seen,
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn record(ref self: ContractState, recipient: ContractAddress) {
            let caller = get_caller_address();
            let game = IGameViewDispatcher { contract_address: caller }.game(self.game_id.read());
            self.seen.write(Seen { caller, recipient, spawned: game.player_id != 0 });
        }
    }

    #[abi(embed_v0)]
    impl SpyTokenImpl of ISpyToken<ContractState> {
        fn watch(ref self: ContractState, game_id: u32) {
            self.game_id.write(game_id);
        }

        fn seen(self: @ContractState) -> Seen {
            self.seen.read()
        }

        fn transferFrom(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            self.record(recipient);
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.record(recipient);
            true
        }
    }
}

/// An `Economy` that records what `Daily` passes to `purchase` and `record`, and whether the
/// game exists in the caller's view at the purchase. It moves no token and always succeeds.
#[starknet::interface]
pub trait ISpyEconomy<TContractState> {
    fn purchase(
        ref self: TContractState,
        game_id: u32,
        player: ContractAddress,
        day: u64,
        stake: u8,
        price: u256,
        referrer: ContractAddress,
        min_out: u256,
    ) -> u128;
    fn record(ref self: TContractState, game_id: u32, score: u32);
    fn purchased(self: @TContractState) -> Purchase;
    fn recorded(self: @TContractState) -> (u32, u32, u32);
}

#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Purchase {
    pub count: u32,
    pub caller: ContractAddress,
    pub game_id: u32,
    pub player: ContractAddress,
    pub day: u64,
    pub stake: u8,
    pub price: u256,
    pub referrer: ContractAddress,
    pub min_out: u256,
    /// The game exists in the caller's view when the purchase runs.
    pub spawned: bool,
}

#[starknet::contract]
pub mod SpyEconomy {
    use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::{ISpyEconomy, Purchase};

    #[storage]
    struct Storage {
        purchase: Purchase,
        records: u32,
        recorded_game: u32,
        recorded_score: u32,
    }

    #[abi(embed_v0)]
    impl SpyEconomyImpl of ISpyEconomy<ContractState> {
        fn purchase(
            ref self: ContractState,
            game_id: u32,
            player: ContractAddress,
            day: u64,
            stake: u8,
            price: u256,
            referrer: ContractAddress,
            min_out: u256,
        ) -> u128 {
            let caller = get_caller_address();
            let game = IGameViewDispatcher { contract_address: caller }.game(game_id);
            let count = self.purchase.read().count + 1;
            self
                .purchase
                .write(
                    Purchase {
                        count,
                        caller,
                        game_id,
                        player,
                        day,
                        stake,
                        price,
                        referrer,
                        min_out,
                        spawned: game.player_id == player.into(),
                    },
                );
            0
        }

        fn record(ref self: ContractState, game_id: u32, score: u32) {
            self.records.write(self.records.read() + 1);
            self.recorded_game.write(game_id);
            self.recorded_score.write(score);
        }

        fn purchased(self: @ContractState) -> Purchase {
            self.purchase.read()
        }

        /// The number of records, the last game id and its score.
        fn recorded(self: @ContractState) -> (u32, u32, u32) {
            (self.records.read(), self.recorded_game.read(), self.recorded_score.read())
        }
    }
}

/// A `Setup` that records each `report`: how many, who called, for whom, and the Poseidon of the
/// entries (`entries_hash`). It accepts any caller.
#[starknet::interface]
pub trait ISpySetup<TContractState> {
    fn report(
        ref self: TContractState,
        player_id: felt252,
        quests: Span<QuestProgress>,
        achievements: Span<AchievementProgress>,
    );
    /// The number of reports, the caller and the player of the last one, and its entries' hash.
    fn reported(self: @TContractState) -> (u32, ContractAddress, felt252, felt252);
}

/// The Poseidon of the serialized entries of a report.
pub fn entries_hash(
    quests: Span<QuestProgress>, achievements: Span<AchievementProgress>,
) -> felt252 {
    let mut data: Array<felt252> = array![];
    quests.serialize(ref data);
    achievements.serialize(ref data);
    core::poseidon::poseidon_hash_span(data.span())
}

#[starknet::contract]
pub mod SpySetup {
    use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
    use quiver_quest::types::batch::TaskProgress as QuestProgress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::{ISpySetup, entries_hash};

    #[storage]
    struct Storage {
        count: u32,
        caller: ContractAddress,
        player_id: felt252,
        entries: felt252,
    }

    #[abi(embed_v0)]
    impl SpySetupImpl of ISpySetup<ContractState> {
        fn report(
            ref self: ContractState,
            player_id: felt252,
            quests: Span<QuestProgress>,
            achievements: Span<AchievementProgress>,
        ) {
            self.count.write(self.count.read() + 1);
            self.caller.write(get_caller_address());
            self.player_id.write(player_id);
            self.entries.write(entries_hash(quests, achievements));
        }

        fn reported(self: @ContractState) -> (u32, ContractAddress, felt252, felt252) {
            (self.count.read(), self.caller.read(), self.player_id.read(), self.entries.read())
        }
    }
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Daily` with its spies: paid in the spy token into the spy `Economy`, reporting to the spy
/// `Setup`, with PLAYER and ANYONE registered and PLAYER calling `Daily`.
#[derive(Copy, Drop)]
pub struct Spied {
    pub daily: IDailyDispatcher,
    pub token: ISpyTokenDispatcher,
    pub economy: ISpyEconomyDispatcher,
    pub setup: ISpySetupDispatcher,
    pub store: TestStore,
}

pub fn spied_daily() -> Spied {
    let (daily, token, economy, setup) = daily_paid_in("SpyToken");
    // [Info] The spy token reads the first game's view at each transfer
    ISpyTokenDispatcher { contract_address: token }.watch(1);
    Spied {
        daily,
        token: ISpyTokenDispatcher { contract_address: token },
        economy,
        setup,
        store: TestStoreTrait::new(daily.contract_address),
    }
}

/// The same `Daily`, paid in the token contract called `token_name` (no constructor arguments).
pub fn daily_paid_in(
    token_name: ByteArray,
) -> (IDailyDispatcher, ContractAddress, ISpyEconomyDispatcher, ISpySetupDispatcher) {
    let owner: felt252 = OWNER().into();
    let token = deploy(token_name, array![]);
    let economy = deploy("SpyEconomy", array![]);
    let setup = deploy("SpySetup", array![]);
    let account = deploy("Account", array![owner]);
    let daily = deploy("Daily", array![owner, account.into(), token.into(), setup.into()]);
    start_cheat_caller_address(account, OWNER());
    IAccountDispatcher { contract_address: account }.set_economy(economy);
    let collection = deploy("Collection", array![owner]);
    IAccountDispatcher { contract_address: account }.set_collection(collection);
    stop_cheat_caller_address(account);
    start_cheat_caller_address(collection, OWNER());
    ICollectionDispatcher { contract_address: collection }.set_minters(daily, Zero::zero());
    stop_cheat_caller_address(collection);
    start_cheat_caller_address(account, ANYONE());
    IAccountDispatcher { contract_address: account }.create(ANYONE_NAME, ANYONE());
    start_cheat_caller_address(account, PLAYER());
    IAccountDispatcher { contract_address: account }.create(PLAYER_NAME, PLAYER());
    stop_cheat_caller_address(account);
    start_cheat_caller_address(daily, PLAYER());
    (
        IDailyDispatcher { contract_address: daily },
        token,
        ISpyEconomyDispatcher { contract_address: economy },
        ISpySetupDispatcher { contract_address: setup },
    )
}

// The spawn: state before the transfer, the purchase and the mint

/// `spawn` pays by `transferFrom` from `Daily` to `Economy`, after the game is stored, then
/// `Economy.purchase` runs on the stored game, with the values `Lobby` passed before D-24.
#[test]
#[available_gas(l2_gas: 70668000)]
fn test_cold_paths_spawn_writes_state_before_the_transfer() {
    start_cheat_block_timestamp_global(100);
    let spied = spied_daily();
    let (daily, spy, economy) = (spied.daily, spied.token, spied.economy);
    let price: u256 = constants::DAILY_PRICE.into();
    spy.watch(1);

    let game_id = daily.spawn(3, Zero::zero(), 7);
    let seen = spy.seen();
    assert(game_id == 1, 'Spawn: game id');
    assert(seen.caller == daily.contract_address, 'Spawn: payer');
    assert(seen.recipient == economy.contract_address, 'Spawn: recipient');
    assert(seen.spawned, 'Spawn: game before pay');
    let purchase = economy.purchased();
    assert(purchase.count == 1, 'Spawn: one purchase');
    assert(purchase.caller == daily.contract_address, 'Spawn: purchase caller');
    assert(purchase.game_id == game_id, 'Spawn: purchase game id');
    assert(purchase.player == PLAYER(), 'Spawn: purchase player');
    assert(purchase.day == 0, 'Spawn: purchase day');
    assert(purchase.stake == 3, 'Spawn: purchase stake');
    assert(purchase.price == 3 * price, 'Spawn: purchase price');
    assert(purchase.referrer.is_zero(), 'Spawn: purchase referrer');
    assert(purchase.min_out == 7, 'Spawn: purchase min_out');
    assert(purchase.spawned, 'Spawn: game before purchase');
    // [No report] a spawn ends no game
    let (reports, _, _, _) = spied.setup.reported();
    assert(reports == 0, 'Spawn: reported');
}

/// A registered referrer other than the payer is passed on to `Economy.purchase`.
#[test]
#[available_gas(l2_gas: 70668000)]
fn test_cold_paths_spawn_passes_a_registered_referrer() {
    let spied = spied_daily();
    spied.daily.spawn(1, ANYONE(), 0);
    assert(spied.economy.purchased().referrer == ANYONE(), 'Spawn: referrer');
}

// The game over: one report to `Setup`, then `Economy.record`

/// The game of `spied` with its tile limit cut to the tiles drawn, so that the next `build` or
/// `discard` ends it; a score and counters, so that the report has several entries.
fn almost_over(spied: @Spied, game_id: u32) {
    let store = *spied.store;
    let mut game = store.game(game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(2, 1, 0, 0);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
}

/// The game in hand of `game_id` gets `plan`, buildable east of the start tile.
fn hold(spied: @Spied, game_id: u32, plan: Plan) {
    let store = *spied.store;
    let game = store.game(game_id);
    let builder = store.builder(game, PLAYER().into());
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
}

/// The game over of `game_id` made one report, from `Daily`, for PLAYER, with the entries of the
/// game as it ended, then one record of its score.
fn assert_reported_once(spied: @Spied, game_id: u32) {
    let game = (*spied.store).game(game_id);
    assert(game.over, 'Over: not over');
    let player: felt252 = PLAYER().into();
    let (count, caller, player_id, entries) = (*spied.setup).reported();
    assert(count == 1, 'Over: one report');
    assert(caller == *spied.daily.contract_address, 'Over: reporter');
    assert(player_id == player, 'Over: player');
    let t = tally(game, player);
    let expected = entries_hash(quest_entries(t).span(), achievement_entries(t).span());
    assert(entries == expected, 'Over: entries');
    assert(quest_entries(t).len() == 4 && achievement_entries(t).len() == 3, 'Over: lists');
    let (records, recorded_game, recorded_score) = (*spied.economy).recorded();
    assert(records == 1, 'Over: one record');
    assert(recorded_game == game_id && recorded_score == game.score, 'Over: record');
}

#[test]
#[available_gas(l2_gas: 140000000)]
fn test_cold_paths_game_over_by_build_reports_once() {
    let spied = spied_daily();
    let game_id = spied.daily.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    spied.daily.build(game_id, Orientation::North, CENTER + 1, CENTER);
    assert_reported_once(@spied, game_id);
}

#[test]
#[available_gas(l2_gas: 140000000)]
fn test_cold_paths_game_over_by_discard_reports_once() {
    let spied = spied_daily();
    let game_id = spied.daily.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    spied.daily.discard(game_id);
    assert_reported_once(@spied, game_id);
}

#[test]
#[available_gas(l2_gas: 140000000)]
fn test_cold_paths_game_over_by_surrender_reports_once() {
    let spied = spied_daily();
    let game_id = spied.daily.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    spied.daily.surrender(game_id);
    assert_reported_once(@spied, game_id);
}

/// A build and a discard that do not end the game make no call to `Setup` and record nothing.
#[test]
#[available_gas(l2_gas: 140000000)]
fn test_cold_paths_moves_that_do_not_end_the_game_report_nothing() {
    let spied = spied_daily();
    let game_id = spied.daily.spawn(1, Zero::zero(), 0);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    spied.daily.build(game_id, Orientation::North, CENTER + 1, CENTER);
    spied.daily.discard(game_id);
    assert(!spied.store.game(game_id).over, 'Moves: over');
    let (reports, _, _, _) = spied.setup.reported();
    assert(reports == 0, 'Moves: reported');
    let (records, _, _) = spied.economy.recorded();
    assert(records == 0, 'Moves: recorded');
}

/// Who may report for whom (P-51 ruling 6): `Daily` reports only for the caller of the move that
/// ends the game, and that caller must be the game's player. A registered player who is not the
/// game's has no builder in it: the closing build, discard and surrender all revert
/// (`'Builder: does not exist'`) before any report or record. The player then ends it.
#[test]
#[feature("safe_dispatcher")]
#[available_gas(l2_gas: 160000000)]
fn test_cold_paths_a_move_by_another_player_reverts_before_any_report() {
    let spied = spied_daily();
    let game_id = spied.daily.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    let address = spied.daily.contract_address;
    let safe = IDailySafeDispatcher { contract_address: address };
    start_cheat_caller_address(address, ANYONE());
    let refused = array![
        safe.build(game_id, Orientation::North, CENTER + 1, CENTER), safe.discard(game_id),
        safe.surrender(game_id),
    ];
    for result in refused {
        match result {
            Result::Ok(_) => panic!("another player ended the game"),
            Result::Err(panic) => assert(*panic.at(0) == 'Builder: does not exist', 'Other: error'),
        }
    }
    let (reports, _, _, _) = spied.setup.reported();
    assert(reports == 0, 'Other: reported');
    let (records, _, _) = spied.economy.recorded();
    assert(records == 0, 'Other: recorded');
    assert(!spied.store.game(game_id).over, 'Other: over');
    // [Player] the game's player ends it, and the report is theirs
    start_cheat_caller_address(address, PLAYER());
    spied.daily.surrender(game_id);
    assert_reported_once(@spied, game_id);
}
