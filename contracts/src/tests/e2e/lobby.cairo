//! The `Lobby` class (S1, `docs/architecture/class-headroom.md` option e): spawn, discard and
//! surrender of `Daily` and `Tutorial` run in it by library call. These tests pin the
//! conditions of ruling P-26: `lobby_class` is written by the constructors and, since P-42, by the
//! owner's `set_lobby_class` only (`tests::e2e::upgrades`), `Lobby` and the game contracts agree on
//! the storage layout, `Lobby` cannot be deployed, and the token paths write their state before the
//! transfer (checks, effects, interactions) under the library call.

use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::constants;
use paved::day::day_id;
use paved::models::tile::CENTER;
use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
use paved::systems::daily::IDailyDispatcher;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, OWNER, PLAYER, PLAYER_NAME,
    TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, load, start_cheat_block_timestamp_global,
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

/// An `Economy` that records what `Lobby` passes to `purchase` and `record`, and whether the
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

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

fn lobby_class() -> felt252 {
    (*declare("Lobby").unwrap().contract_class().class_hash).into()
}

/// The `lobby_class` storage variable of a game contract, read at its raw address.
fn stored_lobby_class(contract: ContractAddress) -> felt252 {
    *load(contract, selector!("lobby_class"), 1).at(0)
}

/// `Daily` paid in the spy token into the spy `Economy`, with PLAYER registered and calling
/// `Daily`.
pub fn spied_daily() -> (IDailyDispatcher, ISpyTokenDispatcher, ISpyEconomyDispatcher) {
    let (daily, token, economy) = daily_paid_in("SpyToken");
    (daily, ISpyTokenDispatcher { contract_address: token }, economy)
}

/// The same `Daily`, paid in the token contract called `token_name` (no constructor arguments).
pub fn daily_paid_in(
    token_name: ByteArray,
) -> (IDailyDispatcher, ContractAddress, ISpyEconomyDispatcher) {
    let owner: felt252 = OWNER().into();
    let token = deploy(token_name, array![]);
    let economy = deploy("SpyEconomy", array![]);
    let account = deploy("Account", array![owner]);
    let daily = deploy("Daily", array![owner, account.into(), token.into(), lobby_class()]);
    start_cheat_caller_address(account, OWNER());
    IAccountDispatcher { contract_address: account }.set_economy(economy);
    let collection = deploy("Collection", array![owner]);
    IAccountDispatcher { contract_address: account }.set_collection(collection);
    stop_cheat_caller_address(account);
    start_cheat_caller_address(collection, OWNER());
    ICollectionDispatcher { contract_address: collection }
        .set_minters(daily, 'TUTORIAL'.try_into().unwrap());
    stop_cheat_caller_address(collection);
    start_cheat_caller_address(account, PLAYER());
    IAccountDispatcher { contract_address: account }.create(PLAYER_NAME, PLAYER());
    stop_cheat_caller_address(account);
    start_cheat_caller_address(daily, PLAYER());
    (
        IDailyDispatcher { contract_address: daily },
        token,
        ISpyEconomyDispatcher { contract_address: economy },
    )
}

// Condition 3: `Lobby` is declared, never deployed

#[test]
#[available_gas(l2_gas: 298925)]
fn test_lobby_cannot_be_deployed() {
    let class = declare("Lobby").unwrap().contract_class();
    let panic = class.deploy(@array![]).unwrap_err();
    assert(*panic.at(0) == 'Lobby: declared only', 'Lobby: deployable');
}

// Condition 1: `lobby_class` is written by the constructors and `set_lobby_class` only

#[test]
#[available_gas(l2_gas: 60416000)]
fn test_lobby_class_is_set_by_the_constructors() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let lobby = lobby_class();
    assert(stored_lobby_class(systems.daily.contract_address) == lobby, 'Lobby: daily class');
    assert(stored_lobby_class(systems.tutorial.contract_address) == lobby, 'Lobby: tutorial class');
}

/// Every entry point of `Daily` and `Tutorial` but `upgrade` (which replaces the whole class) and
/// `set_lobby_class` (the owner's, P-42) is run, each with the stored class hash read back after
/// it.
#[test]
#[available_gas(l2_gas: 216623000)]
fn test_lobby_class_is_never_written_after_construction() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let daily = systems.daily.contract_address;
    let tutorial = systems.tutorial.contract_address;
    let lobby = lobby_class();

    // [Daily] build, discard, surrender
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    systems.daily.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
    assert(stored_lobby_class(daily) == lobby, 'Lobby: written by build');
    systems.daily.discard(context.game_id);
    assert(stored_lobby_class(daily) == lobby, 'Lobby: written by discard');
    systems.daily.surrender(context.game_id);
    assert(stored_lobby_class(daily) == lobby, 'Lobby: written by surrender');

    // [Tutorial] spawn, build, discard (the script discards the 8th tile), surrender
    let game_id = systems.tutorial.spawn();
    assert(stored_lobby_class(tutorial) == lobby, 'Lobby: written by t.spawn');
    for _ in 0..7_u8 {
        systems.tutorial.build(game_id);
        assert(stored_lobby_class(tutorial) == lobby, 'Lobby: written by t.build');
    }
    systems.tutorial.discard(game_id);
    assert(stored_lobby_class(tutorial) == lobby, 'Lobby: written by t.discard');
    systems.tutorial.surrender(game_id);
    assert(stored_lobby_class(tutorial) == lobby, 'Lobby: written by t.surrender');

    // [Ownable] transfer and accept, on both
    stop_cheat_caller_address(daily);
    stop_cheat_caller_address(tutorial);
    let contracts: Array<ContractAddress> = array![daily, tutorial];
    for contract in contracts {
        let ownable = IOwnableDispatcher { contract_address: contract };
        start_cheat_caller_address(contract, OWNER());
        ownable.transfer_ownership(ANYONE());
        start_cheat_caller_address(contract, ANYONE());
        ownable.accept_ownership();
        stop_cheat_caller_address(contract);
        assert(stored_lobby_class(contract) == lobby, 'Lobby: written by ownable');
    }
}

// Condition 2: the storage layout of `Lobby` and of the game contracts agree

/// What `Lobby`'s code writes (game, tile in hand, the day of its end) reads back through `Daily`'s
/// views; what `Daily`'s code writes (account and token at construction, the game state of a build)
/// is what `Lobby`'s code reads (it finds the player, pays the token `Daily` stores, and discards
/// on the state the build left).
#[test]
#[available_gas(l2_gas: 163829000)]
fn test_lobby_and_daily_share_the_storage_layout() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let views = IGameViewDispatcher { contract_address: daily };
    let price: u256 = constants::DAILY_PRICE.into();

    // [Daily -> Lobby] the token stored by `Daily`'s constructor at its raw address, paid by
    // `Lobby`
    assert(
        *load(daily, selector!("token_address"), 1).at(0) == context.token.contract_address.into(),
        'Lobby: token address',
    );
    let player_before = context.token.balance_of(PLAYER());

    // [Lobby -> Daily] spawn, paid by the player into `Economy`, which keeps nothing
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    assert(player_before - context.token.balance_of(PLAYER()) == price, 'Lobby: paid');
    assert(context.token.balance_of(daily) == 0, 'Lobby: nothing to daily');
    let game = views.game(game_id);
    assert(game.id == game_id, 'Lobby: game id');
    assert(game.player_id == context.player_id, 'Lobby: game player');
    assert(game.mode == Mode::Daily.into(), 'Lobby: game mode');
    assert(game.start_time == 100, 'Lobby: game start');
    assert(game.tile_count == 2, 'Lobby: game tiles');
    assert(game.tile_id != 0, 'Lobby: tile in hand');
    let day = day_id(views.game(game_id).start_time, constants::DAILY_DURATION);

    // [Daily -> Lobby] a build by `Daily`, then a discard by `Lobby` on the state it left
    let builder = store.builder(store.game(game_id), context.player_id);
    let mut tile = store.tile(store.game(game_id), builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    systems.daily.build(game_id, Orientation::North, CENTER, CENTER + 1);
    let built = views.game(game_id);
    systems.daily.discard(game_id);
    let discarded = views.game(game_id);
    assert(discarded.placed_count == built.placed_count, 'Lobby: placed kept');
    assert(discarded.discarded_count == built.discarded_count + 1, 'Lobby: discarded');
    assert(discarded.tile_count == built.tile_count + 1, 'Lobby: drawn');

    // [Lobby -> Daily] surrender: the day and the end time `Lobby` wrote (`GameEnd`)
    systems.daily.surrender(game_id);
    let over = views.game(game_id);
    assert(over.over, 'Lobby: over');
    assert(over.day_id == day, 'Lobby: game day');
    assert(over.end_time == 100, 'Lobby: game end');
}

/// The same agreement for `Tutorial`: `Lobby` spawns, discards and surrenders, `Tutorial` builds,
/// and each reads what the other wrote.
#[test]
#[available_gas(l2_gas: 134567000)]
fn test_lobby_and_tutorial_share_the_storage_layout() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let views = IGameViewDispatcher { contract_address: systems.tutorial.contract_address };

    let game_id = systems.tutorial.spawn();
    let spawned = views.game(game_id);
    assert(spawned.player_id == context.player_id, 'Lobby: tutorial player');
    assert(spawned.mode == Mode::Tutorial.into(), 'Lobby: tutorial mode');
    assert(spawned.tile_id != 0, 'Lobby: tutorial tile in hand');

    // [Tutorial -> Lobby] seven builds, then the discard of the 8th tile the script asks for
    for _ in 0..7_u8 {
        systems.tutorial.build(game_id);
    }
    let built = views.game(game_id);
    assert(built.placed_count == spawned.placed_count + 7, 'Lobby: tutorial built');
    systems.tutorial.discard(game_id);
    let discarded = views.game(game_id);
    assert(discarded.discarded_count == built.discarded_count + 1, 'Lobby: tutorial discard');
    systems.tutorial.surrender(game_id);
    assert(views.game(game_id).over, 'Lobby: tutorial over');
}

// Condition 4: state before transfer, on the library-call path

/// `spawn` pays by `transferFrom` from `Daily` to `Economy`, after the game is stored, then
/// `Economy.purchase` runs on the stored game. Since D-20 it is the one token path of `Lobby`.
#[test]
#[available_gas(l2_gas: 70668000)]
fn test_lobby_spawn_writes_state_before_the_transfer() {
    start_cheat_block_timestamp_global(100);
    let (daily, spy, economy) = spied_daily();
    let price: u256 = constants::DAILY_PRICE.into();
    spy.watch(1);

    let game_id = daily.spawn(3, core::num::traits::Zero::zero(), 7);
    let seen = spy.seen();
    assert(game_id == 1, 'Lobby: game id');
    assert(seen.caller == daily.contract_address, 'Lobby: spawn payer');
    assert(seen.recipient == economy.contract_address, 'Lobby: spawn recipient');
    assert(seen.spawned, 'Lobby: game before pay');
    let purchase = economy.purchased();
    assert(purchase.count == 1, 'Lobby: one purchase');
    assert(purchase.caller == daily.contract_address, 'Lobby: purchase caller');
    assert(purchase.game_id == game_id, 'Lobby: purchase game id');
    assert(purchase.player == PLAYER(), 'Lobby: purchase player');
    assert(purchase.day == 0, 'Lobby: purchase day');
    assert(purchase.stake == 3, 'Lobby: purchase stake');
    assert(purchase.price == 3 * price, 'Lobby: purchase price');
    assert(purchase.min_out == 7, 'Lobby: purchase min_out');
    assert(purchase.spawned, 'Lobby: game before purchase');
}
