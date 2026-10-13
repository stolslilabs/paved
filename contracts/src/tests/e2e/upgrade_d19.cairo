//! Games that stay open across the D-19 upgrade (D-19b): they score as they would have without it.
//!
//! A Daily game is played with the D-18 class (main at 7d04872, `tests/legacy_d18.cairo`,
//! `DailyBeforeD19`), leaving a road, a city, a forest and a wonder open; the contract is
//! upgraded to the D-19 class (`upgrade`, owner only) and the game is finished. A twin game, in a
//! second deployment, plays the same moves on the D-18 class all along. The answer: the upgraded
//! game scores exactly as its twin, move by move and event by event, and its tiles read owner 0
//! (the game's player): those placed before the upgrade, which have no entry in `tile_owners`, and
//! those placed after, since a single-player build writes no owner.
//!
//! The deploy of the D-18 class is emulated as `upgrade_d18.cairo` does: the game contract is
//! deployed with the D-19 class, spawns the game (a spawn writes the same storage under both
//! classes), and is given the frozen D-18 build by its owner's `upgrade` before any build.

use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::events::{Event as PavedEvent, Scored};
use paved::models::tile::CENTER;
use paved::store::{StoreImpl, StoreTrait};
use paved::systems::daily::{Daily, IDailyDispatcher};
use paved::tests::legacy_d18::{IDailyBeforeD19Dispatcher, IDailyBeforeD19DispatcherTrait};
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, OWNER, PLAYER, TestStore, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    DeclareResultTrait, EventSpyAssertionsTrait, declare, get_class_hash, interact_with_state, load,
    map_entry_address, spy_events, start_cheat_caller_address,
};
use starknet::{ClassHash, ContractAddress};

/// Gives `contract` the frozen D-18 class, by its owner's `upgrade`; returns the class it had
/// (the D-19 class).
fn install_before_d19(contract: ContractAddress) -> ClassHash {
    let current = get_class_hash(contract);
    let frozen = *declare("DailyBeforeD19").unwrap().contract_class().class_hash;
    start_cheat_caller_address(contract, OWNER());
    IUpgradeableDispatcher { contract_address: contract }.upgrade(frozen);
    start_cheat_caller_address(contract, PLAYER());
    assert_eq!(get_class_hash(contract), frozen);
    current
}

/// The owner upgrades `contract` from the frozen class to `class_hash`.
fn upgrade(contract: ContractAddress, class_hash: ClassHash) {
    start_cheat_caller_address(contract, OWNER());
    IDailyBeforeD19Dispatcher { contract_address: contract }.upgrade(class_hash);
    start_cheat_caller_address(contract, PLAYER());
    assert_eq!(get_class_hash(contract), class_hash);
}

/// Writes `plan` over the tile in hand.
fn force(store: TestStore, game_id: u32, plan: Plan) {
    let game = store.game(game_id);
    let builder = store.builder(game, PLAYER().into());
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
}

/// A build of the D-18 class.
fn old(store: TestStore, game_id: u32, plan: Plan, orientation: Orientation, x: u32, y: u32) {
    force(store, game_id, plan);
    IDailyBeforeD19Dispatcher { contract_address: store.contract }
        .build(game_id, orientation, x, y);
}

/// A build of the D-19 class, checked against the oracle (owners included).
fn new(
    store: TestStore,
    daily: IDailyDispatcher,
    game_id: u32,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
) {
    force(store, game_id, plan);
    let game = store.game(game_id);
    let tile_id = store.builder(game, PLAYER().into()).tile_id;
    daily.build(game_id, orientation, x, y);
    check::assert_tile_agrees(store, game_id, tile_id);
    check::assert_move_scored(store, game_id, tile_id, game.score);
}

/// The moves of the game, `before` those played before the upgrade or the others. Each build
/// goes to the D-18 class (`old`) or to the D-19 class (`new`, when `daily` is given).
fn play(store: TestStore, g: u32, daily: Option<IDailyDispatcher>, before: bool) {
    let moves: Array<(Plan, Orientation, u32, u32)> = if before {
        array![
            // Closes the starter's city: 2 x 200 x 10475 / 10000 = 419
            (Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1),
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2),
            (Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER),
            (Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1),
            (Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1),
            (Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2),
            (Plan::WFFFFFFFR, Orientation::South, CENTER - 1, CENTER),
        ]
    } else {
        array![
            // The loop of road and the forest inside it
            (Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2),
            // The road of the wonder's stub, the starter and the straight
            (Plan::SFRFRFFFR, Orientation::North, CENTER + 2, CENTER),
            // The city of the corridor
            (Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 3),
            // The fields around the wonder
            (Plan::FFFFFFCFF, Orientation::South, CENTER - 1, CENTER + 1),
            (Plan::FFFFFFCFF, Orientation::South, CENTER - 2, CENTER + 1),
            (Plan::FFFFFFCFF, Orientation::East, CENTER - 2, CENTER),
            (Plan::FFFFFFCFF, Orientation::East, CENTER - 2, CENTER - 1),
            (Plan::FFFFFFCFF, Orientation::North, CENTER - 1, CENTER - 1),
        ]
    };
    for (plan, orientation, x, y) in moves {
        match daily {
            Option::Some(daily) => new(store, daily, g, plan, orientation, x, y),
            Option::None => old(store, g, plan, orientation, x, y),
        }
    }
}

/// A Daily game, its D-18 class installed and enough tiles not to end.
fn start() -> (TestStore, IDailyDispatcher, u32, ClassHash) {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let g = context.game_id;
    let mut game = store.game(g);
    game.tile_limit = 40;
    store.set_game(game);
    let class_d19 = install_before_d19(systems.daily.contract_address);
    (store, systems.daily, g, class_d19)
}

/// The owner of each placed tile of the game, as stored.
fn owners(store: TestStore, game_id: u32) -> Array<felt252> {
    interact_with_state(
        store.contract,
        || {
            let game = StoreImpl::new().game(game_id);
            let mut owners: Array<felt252> = array![];
            let mut tile_id: u32 = 1;
            while tile_id <= game.tile_count {
                owners.append(StoreImpl::tile_owner(game_id, tile_id));
                tile_id += 1;
            }
            owners
        },
    )
}

fn assert_no_owner(store: TestStore, game_id: u32) {
    for owner in owners(store, game_id) {
        assert_eq!(owner, 0);
    }
}

fn scored(game_id: u32, category: Category, size: u32, points: u32) -> Daily::Event {
    Daily::Event::PavedEvent(
        PavedEvent::Scored(
            Scored { game_id, player_id: PLAYER().into(), category: category.into(), size, points },
        ),
    )
}

/// The game is played with a road, a city, a forest and a wonder open, upgraded to the D-19 class
/// and finished; its twin stays on the D-18 class. Both score the same, with the same events
/// (by hand, as `upgrade_d18.cairo` gives them: the loop of road 438, the forest 329, the road of
/// the stub 438, the city 643, the wonder 900), and every tile of the upgraded game reads owner 0.
#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_upgrade_d19_daily_game_open_across_the_upgrade() {
    let (store, daily, g, class_d19) = start();
    let (twin, _, tg, _) = start();

    // [Before the upgrade] the D-18 class, in both games
    play(store, g, Option::None, true);
    play(twin, tg, Option::None, true);
    assert_eq!(store.game(g).score, 419);
    assert_eq!(twin.game(tg).score, 419);

    // [Upgrade] the old tiles have no owner entry: they read 0, the game's player
    upgrade(store.contract, class_d19);
    assert_no_owner(store, g);
    let board_before = check::board_points(store, g);

    // [After the upgrade] the D-19 class finishes the game; the twin plays on with the D-18 class
    let mut spy = spy_events();
    play(store, g, Option::Some(daily), false);
    play(twin, tg, Option::None, false);
    let mut both: Array<(ContractAddress, Daily::Event)> = array![];
    for (contract, game_id) in array![(store.contract, g), (twin.contract, tg)] {
        both.append((contract, scored(game_id, Category::Road, 4, 438)));
        both.append((contract, scored(game_id, Category::Forest, 4, 329)));
        both.append((contract, scored(game_id, Category::Road, 4, 438)));
        both.append((contract, scored(game_id, Category::City, 3, 643)));
        both.append((contract, scored(game_id, Category::Wonder, 0, 900)));
    }
    spy.assert_emitted(@both);

    // The same score and the same counters as the twin
    let game = store.game(g);
    let twin_game = twin.game(tg);
    assert_eq!(game.score, twin_game.score);
    assert_eq!(game.score, 419 + 438 + 329 + 438 + 643 + 900);
    assert_eq!(game.counts, twin_game.counts);
    // Nothing closed before the upgrade scored again, nothing that closed after was left out
    let board_after = check::board_points(store, g);
    assert_eq!(board_after - board_before, game.score - 419);
    // No build of the single player wrote an owner: every tile still reads 0
    assert_no_owner(store, g);
}

/// The layout pin of `tile_owners` (D-19, `docs/architecture/upgrades.md`): the map is a member of
/// the `paved` storage node, so its entry for `(game_id, tile_id)` sits at the Pedersen chain of
/// `selector!("paved")`, `selector!("tile_owners")`, then the keys. An owner written through the
/// store is read there; a rename or a move of the map fails here.
#[test]
fn test_upgrade_d19_pins_tile_owners_by_name() {
    let (store, _, context) = setup::spawn_game(Mode::Daily);
    let g = context.game_id;
    interact_with_state(
        store.contract, || {
            let s = StoreImpl::new();
            s.set_tile_owner(s.game(g), 7, 'ALICE');
        },
    );
    let map = core::pedersen::pedersen(selector!("paved"), selector!("tile_owners"));
    let address = map_entry_address(map, array![g.into(), 7].span());
    assert_eq!(*load(store.contract, address, 1).at(0), 'ALICE');
    // The game's player is not written: its tiles read 0
    let address = map_entry_address(map, array![g.into(), 8].span());
    assert_eq!(*load(store.contract, address, 1).at(0), 0);
}
