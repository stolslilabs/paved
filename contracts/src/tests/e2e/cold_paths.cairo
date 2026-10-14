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
use paved::systems::challenge::{
    IChallengeDispatcher, IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait,
};
use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
use paved::systems::setup::Wiring;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, OWNER, PLAYER, TestStore, TestStoreTrait,
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
    /// The spy `Setup` whose report count `record` reads, to pin the order of a game over.
    fn watch_setup(ref self: TContractState, setup: ContractAddress);
    /// The spy `Setup`'s report count when the last `record` ran.
    fn reports_at_record(self: @TContractState) -> u32;
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
    use super::{ISpyEconomy, ISpySetupDispatcher, ISpySetupDispatcherTrait, Purchase};

    #[storage]
    struct Storage {
        purchase: Purchase,
        records: u32,
        setup: ContractAddress,
        reports_at_record: u32,
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
            let setup = self.setup.read();
            let watched: felt252 = setup.into();
            if watched != 0 {
                let (reports, _, _, _) = ISpySetupDispatcher { contract_address: setup }.reported();
                self.reports_at_record.write(reports);
            }
            self.records.write(self.records.read() + 1);
            self.recorded_game.write(game_id);
            self.recorded_score.write(score);
        }

        fn purchased(self: @ContractState) -> Purchase {
            self.purchase.read()
        }

        fn watch_setup(ref self: ContractState, setup: ContractAddress) {
            self.setup.write(setup);
        }

        fn reports_at_record(self: @ContractState) -> u32 {
            self.reports_at_record.read()
        }

        /// The number of records, the last game id and its score.
        fn recorded(self: @ContractState) -> (u32, u32, u32) {
            (self.records.read(), self.recorded_game.read(), self.recorded_score.read())
        }
    }
}

/// A `Setup` that records each `report`: how many, who called, for whom, and the Poseidon of the
/// entries (`entries_hash`). It accepts any caller. It serves the wiring it is given (`wire`), as
/// `Setup.wiring` does.
#[starknet::interface]
pub trait ISpySetup<TContractState> {
    fn wire(ref self: TContractState, economy: ContractAddress, collection: ContractAddress);
    fn wiring(self: @TContractState) -> Wiring;
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
    use super::{ISpySetup, Wiring, entries_hash};

    #[storage]
    struct Storage {
        economy: ContractAddress,
        collection: ContractAddress,
        count: u32,
        caller: ContractAddress,
        player_id: felt252,
        entries: felt252,
    }

    #[abi(embed_v0)]
    impl SpySetupImpl of ISpySetup<ContractState> {
        fn wire(ref self: ContractState, economy: ContractAddress, collection: ContractAddress) {
            self.economy.write(economy);
            self.collection.write(collection);
        }

        fn wiring(self: @ContractState) -> Wiring {
            Wiring { economy: self.economy.read(), collection: self.collection.read() }
        }

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
/// `Setup` (which serves the wiring), with PLAYER calling `Daily`.
#[derive(Copy, Drop)]
pub struct Spied {
    pub challenge: IChallengeDispatcher,
    pub token: ISpyTokenDispatcher,
    pub economy: ISpyEconomyDispatcher,
    pub setup: ISpySetupDispatcher,
    pub store: TestStore,
}

pub fn spied_daily() -> Spied {
    let (challenge, token, economy, setup) = daily_paid_in("SpyToken");
    // [Info] The spy token reads the first game's view at each transfer
    ISpyTokenDispatcher { contract_address: token }.watch(1);
    Spied {
        challenge,
        token: ISpyTokenDispatcher { contract_address: token },
        economy,
        setup,
        store: TestStoreTrait::new(challenge.contract_address),
    }
}

/// The same `Daily`, paid in the token contract called `token_name` (no constructor arguments).
pub fn daily_paid_in(
    token_name: ByteArray,
) -> (IChallengeDispatcher, ContractAddress, ISpyEconomyDispatcher, ISpySetupDispatcher) {
    let owner: felt252 = OWNER().into();
    let token = deploy(token_name, array![]);
    let economy = deploy("SpyEconomy", array![]);
    let setup = deploy("SpySetup", array![]);
    let challenge = deploy("Challenge", array![owner, token.into(), setup.into()]);
    ISpyEconomyDispatcher { contract_address: economy }.watch_setup(setup);
    let collection = deploy("Collection", array![owner]);
    ISpySetupDispatcher { contract_address: setup }.wire(economy, collection);
    start_cheat_caller_address(collection, OWNER());
    ICollectionDispatcher { contract_address: collection }.set_minters(challenge, Zero::zero());
    stop_cheat_caller_address(collection);
    start_cheat_caller_address(challenge, PLAYER());
    (
        IChallengeDispatcher { contract_address: challenge },
        token,
        ISpyEconomyDispatcher { contract_address: economy },
        ISpySetupDispatcher { contract_address: setup },
    )
}

// The spawn: state before the transfer, the purchase and the mint

/// `spawn` pays by `transferFrom` from `Daily` to `Economy`, after the game is stored, then
/// `Economy.purchase` runs on the stored game, with the values `Lobby` passed before D-24.
#[test]
#[available_gas(l2_gas: 31295192)]
fn test_cold_paths_spawn_writes_state_before_the_transfer() {
    start_cheat_block_timestamp_global(100);
    let spied = spied_daily();
    let (challenge, spy, economy) = (spied.challenge, spied.token, spied.economy);
    let price: u256 = constants::CHALLENGE_PRICE.into();
    spy.watch(1);

    let game_id = challenge.spawn(3, Zero::zero(), 7);
    let seen = spy.seen();
    assert(game_id == 1, 'Spawn: game id');
    assert(seen.caller == challenge.contract_address, 'Spawn: payer');
    assert(seen.recipient == economy.contract_address, 'Spawn: recipient');
    assert(seen.spawned, 'Spawn: game before pay');
    let purchase = economy.purchased();
    assert(purchase.count == 1, 'Spawn: one purchase');
    assert(purchase.caller == challenge.contract_address, 'Spawn: purchase caller');
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

// The referral (D-25 E, economy lens): a non-zero address other than the payer. Any other is
// ignored, as before: the spawn goes on with no referrer.

/// Any non-zero address other than the payer is passed on to `Economy.purchase`, registered or
/// not: here ANYONE, and an address no test ever funded or used.
#[test]
#[available_gas(l2_gas: 47094387)]
fn test_cold_paths_spawn_passes_a_referrer_other_than_the_payer() {
    let spied = spied_daily();
    spied.challenge.spawn(1, ANYONE(), 0);
    assert(spied.economy.purchased().referrer == ANYONE(), 'Spawn: referrer');
    let unknown: ContractAddress = 'NEVER SEEN'.try_into().unwrap();
    spied.challenge.spawn(1, unknown, 0);
    assert(spied.economy.purchased().referrer == unknown, 'Spawn: unknown referrer');
}

/// The payer as its own referrer is ignored: the purchase goes on with no referrer.
#[test]
#[available_gas(l2_gas: 29786310)]
fn test_cold_paths_spawn_ignores_the_payer_as_referrer() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, PLAYER(), 0);
    let purchase = spied.economy.purchased();
    assert(purchase.game_id == game_id, 'Self: no purchase');
    assert(purchase.referrer.is_zero(), 'Self: referrer kept');
}

/// A zero referrer is no referral (`test_cold_paths_spawn_writes_state_before_the_transfer`
/// passes zero too): the purchase gets zero.
#[test]
#[available_gas(l2_gas: 29784126)]
fn test_cold_paths_spawn_zero_referrer_is_no_referral() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    let purchase = spied.economy.purchased();
    assert(purchase.game_id == game_id, 'Zero: no purchase');
    assert(purchase.referrer.is_zero(), 'Zero: referrer');
}

/// The protocol addresses `Daily` knows, `Economy` and `Daily` itself, are ignored as referrers,
/// like the payer (economy audit N2 of #350): paid to `Economy`, the 5 % would be swept back into
/// the margin and counted twice by `Purchased`; paid to `Daily`, it would be stranded.
#[test]
#[available_gas(l2_gas: 46660412)]
fn test_cold_paths_spawn_ignores_a_protocol_address_as_referrer() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, spied.economy.contract_address, 0);
    let purchase = spied.economy.purchased();
    assert(purchase.game_id == game_id, 'Protocol: no purchase');
    assert(purchase.referrer.is_zero(), 'Protocol: economy kept');
    let game_id = spied.challenge.spawn(1, spied.challenge.contract_address, 0);
    let purchase = spied.economy.purchased();
    assert(purchase.game_id == game_id, 'Protocol: no second purchase');
    assert(purchase.referrer.is_zero(), 'Protocol: challenge kept');
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
    assert(caller == *spied.challenge.contract_address, 'Over: reporter');
    assert(player_id == player, 'Over: player');
    let t = tally(game, player);
    let expected = entries_hash(quest_entries(t).span(), achievement_entries(t).span());
    assert(entries == expected, 'Over: entries');
    assert(quest_entries(t).len() == 4 && achievement_entries(t).len() == 3, 'Over: lists');
    let (records, recorded_game, recorded_score) = (*spied.economy).recorded();
    assert(records == 1, 'Over: one record');
    assert(recorded_game == game_id && recorded_score == game.score, 'Over: record');
    // [Order] `Setup.report`, then `Economy.record`: the report was in when the record ran
    assert((*spied.economy).reports_at_record() == 1, 'Over: record before report');
}

#[test]
#[available_gas(l2_gas: 47010751)]
fn test_cold_paths_game_over_by_build_reports_once() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    spied.challenge.build(game_id, Orientation::North, CENTER + 1, CENTER);
    assert_reported_once(@spied, game_id);
}

#[test]
#[available_gas(l2_gas: 39596480)]
fn test_cold_paths_game_over_by_discard_reports_once() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    spied.challenge.discard(game_id);
    assert_reported_once(@spied, game_id);
}

#[test]
#[available_gas(l2_gas: 39354712)]
fn test_cold_paths_game_over_by_surrender_reports_once() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    spied.challenge.surrender(game_id);
    assert_reported_once(@spied, game_id);
}

/// A build and a discard that do not end the game make no call to `Setup` and record nothing.
#[test]
#[available_gas(l2_gas: 41847255)]
fn test_cold_paths_moves_that_do_not_end_the_game_report_nothing() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    spied.challenge.build(game_id, Orientation::North, CENTER + 1, CENTER);
    spied.challenge.discard(game_id);
    assert(!spied.store.game(game_id).over, 'Moves: over');
    let (reports, _, _, _) = spied.setup.reported();
    assert(reports == 0, 'Moves: reported');
    let (records, _, _) = spied.economy.recorded();
    assert(records == 0, 'Moves: recorded');
}

/// Who may report for whom (P-51 ruling 6): `Daily` reports only for the caller of the move that
/// ends the game, and that caller must be the game's player. Another player, who is not the
/// game's, has no builder in it: the closing build, discard and surrender all revert
/// (`'Builder: does not exist'`) before any report or record. The player then ends it.
#[test]
#[feature("safe_dispatcher")]
#[available_gas(l2_gas: 55191176)]
fn test_cold_paths_a_move_by_another_player_reverts_before_any_report() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    hold(@spied, game_id, Plan::RFFFRFFFR);
    let address = spied.challenge.contract_address;
    let safe = IChallengeSafeDispatcher { contract_address: address };
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
    spied.challenge.surrender(game_id);
    assert_reported_once(@spied, game_id);
}

/// A game over uses only the economy of the wiring (review note 1 and security note 2 of #350): a
/// game in flight still ends and is recorded when its `Setup`'s collection reads zero (reachable
/// only through a re-point, `set_setup`); a spawn needs both and reverts.
#[test]
#[available_gas(l2_gas: 46502724)]
#[feature("safe_dispatcher")]
fn test_cold_paths_game_over_needs_only_the_economy() {
    let spied = spied_daily();
    let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
    almost_over(@spied, game_id);
    spied.setup.wire(spied.economy.contract_address, Zero::zero());
    let error = IChallengeSafeDispatcher { contract_address: spied.challenge.contract_address }
        .spawn(1, Zero::zero(), 0)
        .unwrap_err();
    assert(*error.at(0) == 'Challenge: collection not set', 'Collection: spawn');
    spied.challenge.surrender(game_id);
    assert(spied.store.game(game_id).over, 'Collection: not over');
    let (records, recorded_game, _) = spied.economy.recorded();
    assert(records == 1 && recorded_game == game_id, 'Collection: not recorded');
    assert_reported_once(@spied, game_id);
}

/// A `Daily` with no `Setup` (its `setup` slot zero, as after an in-place upgrade before
/// `set_setup`): since D-25 E the wiring is `Setup`'s, so nothing can be paid, minted or recorded.
/// A spawn reverts (`'Challenge: setup is zero'`) and leaves no game; a game over by build, by
/// discard and by surrender reverts too, and the game stays live, unrecorded and unreported, until
/// the owner sets the `Setup`; then the same move ends it.
#[test]
#[available_gas(l2_gas: 110115711)]
#[feature("safe_dispatcher")]
fn test_cold_paths_without_a_setup_spawn_and_game_over_revert() {
    let spied = spied_daily();
    let address = spied.challenge.contract_address;
    let safe = IChallengeSafeDispatcher { contract_address: address };
    // [Setup] Three games, almost over, spawned while the `Setup` is there
    let mut games: Array<u32> = array![];
    let mut way: u8 = 0;
    while way < 3 {
        let game_id = spied.challenge.spawn(1, Zero::zero(), 0);
        almost_over(@spied, game_id);
        games.append(game_id);
        way += 1;
    }
    hold(@spied, *games.at(0), Plan::RFFFRFFFR);
    let setup = spied.setup.contract_address;
    snforge_std::store(address, selector!("setup"), array![0].span());
    // [Spawn] reverts, no game left
    let error = safe.spawn(1, Zero::zero(), 0).unwrap_err();
    assert(*error.at(0) == 'Challenge: setup is zero', 'No setup: spawn');
    assert(spied.store.game(4).player_id == 0, 'No setup: a game was left');
    // [Game over] each way reverts, the game stays live
    let error = safe.build(*games.at(0), Orientation::North, CENTER + 1, CENTER).unwrap_err();
    assert(*error.at(0) == 'Challenge: setup is zero', 'No setup: build');
    let error = safe.discard(*games.at(1)).unwrap_err();
    assert(*error.at(0) == 'Challenge: setup is zero', 'No setup: discard');
    let error = safe.surrender(*games.at(2)).unwrap_err();
    assert(*error.at(0) == 'Challenge: setup is zero', 'No setup: surrender');
    for game_id in games.span() {
        assert(!spied.store.game(*game_id).over, 'No setup: over');
    }
    let (records, _, _) = spied.economy.recorded();
    assert(records == 0, 'No setup: recorded');
    let (reports, _, _, _) = spied.setup.reported();
    assert(reports == 0, 'No setup: reported');
    // [Set] the owner sets the `Setup` back: the same moves end the games
    start_cheat_caller_address(address, OWNER());
    paved::systems::challenge::IChallengeSetupDispatcherTrait::set_setup(
        paved::systems::challenge::IChallengeSetupDispatcher { contract_address: address }, setup,
    );
    start_cheat_caller_address(address, PLAYER());
    spied.challenge.build(*games.at(0), Orientation::North, CENTER + 1, CENTER);
    spied.challenge.discard(*games.at(1));
    spied.challenge.surrender(*games.at(2));
    for game_id in games.span() {
        assert(spied.store.game(*game_id).over, 'No setup: not over after');
    }
    let (records, _, _) = spied.economy.recorded();
    assert(records == 3, 'No setup: records after');
}
