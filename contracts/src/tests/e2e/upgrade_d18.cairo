//! Games that stay open across the D-18 upgrade (PM, 2026-10-13): how they end.
//!
//! A game is played with the build of 07aab8a (`tests/legacy.cairo`, `DailyBeforeD18`), which
//! places characters, then the contract is upgraded to the D-18 class (`upgrade`, owner only) and
//! the game is finished. The answer: such a game is **scored under the new rules from the
//! upgrade on**. What it scored before stays (a structure closed before the upgrade is closed: no
//! later tile joins it, so it never scores again, whether it scored with a character or not).
//! Every structure that closes after the upgrade scores once by the D-18 formula; the characters
//! left on the board are ignored: the `chars` of their roots, the `Characters` word, the tiles'
//! occupied spots and the roles bits of `GameState` are dead (the latter written 0 by the first
//! move under the new class). No spot can be blocked: the new `build` has no character and no
//! idle check.
//!
//! The deploy of the class of 07aab8a is emulated: snforge declares only this package's classes,
//! so the game contract is deployed with the D-18 class, spawns the game (a spawn writes the same
//! storage under both classes: no character exists yet), and is then given the frozen build of
//! 07aab8a by its owner's `upgrade`, before any build. From there on, the moves before the upgrade
//! run the code of 07aab8a, and the upgrade to D-18 is the owner's `upgrade` of that class (two
//! real `replace_class`, no cheat).
//!
//! The checks, after the upgrade: each build scores exactly what the oracle's walks give for it
//! (`oracle::check::assert_move_scored`: nothing double-scores, no closed structure is left
//! unscored), and across the whole end of the game the points of the board's finished structures
//! grow by exactly the points the game gained (`score::board_points`, before and after: what was
//! closed before the upgrade is not scored again).

use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::events::{Event as PavedEvent, Scored};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::systems::daily::{Daily, IDailyDispatcher};
use paved::systems::tutorial::{ITutorialDispatcher, ITutorialDispatcherTrait};
use paved::tests::legacy::role::Role;
use paved::tests::legacy::store::StoreImpl as LegacyStore;
use paved::tests::legacy::{IDailyBeforeD18Dispatcher, IDailyBeforeD18DispatcherTrait};
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, OWNER, PLAYER, TestStore, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::spot::Spot;
use paved::views::{BuilderView, IGameViewDispatcher, IGameViewDispatcherTrait};
use snforge_std::{
    DeclareResultTrait, EventSpyAssertionsTrait, declare, get_class_hash, interact_with_state,
    spy_events, start_cheat_caller_address,
};
use starknet::{ClassHash, ContractAddress};

/// Gives `contract` the frozen class of 07aab8a, by its owner's `upgrade`; returns the class it
/// had (the D-18 class).
fn install_before_d18(contract: ContractAddress) -> ClassHash {
    let current = get_class_hash(contract);
    let frozen = *declare("DailyBeforeD18").unwrap().contract_class().class_hash;
    start_cheat_caller_address(contract, OWNER());
    IUpgradeableDispatcher { contract_address: contract }.upgrade(frozen);
    start_cheat_caller_address(contract, PLAYER());
    assert_eq!(get_class_hash(contract), frozen);
    current
}

/// The owner upgrades `contract` from the frozen class to `class_hash`.
fn upgrade(contract: ContractAddress, class_hash: ClassHash) {
    start_cheat_caller_address(contract, OWNER());
    IDailyBeforeD18Dispatcher { contract_address: contract }.upgrade(class_hash);
    // [Setup] The player is the caller again, as `setup::spawn_game` leaves it
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

/// A build of 07aab8a, with a character.
fn old(
    store: TestStore,
    game_id: u32,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
    role: Role,
    spot: Spot,
) {
    force(store, game_id, plan);
    IDailyBeforeD18Dispatcher { contract_address: store.contract }
        .build(game_id, orientation, x, y, role, spot);
}

/// A build of the D-18 class, checked against the oracle.
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

/// The bit of `role` in the roles placed.
fn role_bit(role: Role) -> u16 {
    paved::tests::legacy::placement::role_bit(role.into())
}

/// The roles placed, read as 07aab8a reads them (the bits 72 to 88 of `GameState`).
fn roles_placed(store: TestStore, game_id: u32) -> u16 {
    interact_with_state(store.contract, || LegacyStore::new().live_game(game_id).characters)
}

/// The roles that stand on the board, from the `Characters` word as 07aab8a keeps it.
fn standing(store: TestStore, game_id: u32, role: Role) -> (u32, u8) {
    interact_with_state(
        store.contract,
        || {
            let s = LegacyStore::new();
            let game = s.live_game(game_id);
            let character = s.character(game, PLAYER().into(), role);
            (character.tile_id, character.spot)
        },
    )
}

fn scored(game_id: u32, category: Category, size: u32, points: u32) -> Daily::Event {
    Daily::Event::PavedEvent(
        PavedEvent::Scored(
            Scored { game_id, player_id: PLAYER().into(), category: category.into(), size, points },
        ),
    )
}

/// A Daily game with characters on an open city (Lady), an open road (Adventurer), an open forest
/// (Woodsman) and an open wonder (Pilgrim), and a city scored before the upgrade with its Lord
/// (its `chars` cleared). The upgrade lands; the game is finished under the D-18 class: the road,
/// the city, the forest and the wonder close and score by the D-18 formula, once each; the city
/// scored before the upgrade does not score again; the roles bits of `GameState` are written 0.
///
/// ```text
///   y=+3                  cap
///   y=+2  field  field    corridor (Lady)
///   y=+1  field  field    caps (Lord, scored)
///   y= 0  field  wonder   starter   straight (Adventurer)   stop
///   y=-1  field  field    curve (Woodsman)  curve
///   y=-2                  curve     curve
///         x=-2   x=-1     x=0       x=+1                    x=+2     (relative to CENTER)
/// ```
///
/// By hand, the closures after the upgrade (bonus(3) = 10721, bonus(4) = 10972):
/// - the last curve closes the loop of road, 4 x 100 x 10972 / 10000 = 438, and the forest inside
///   it, which held the Woodsman, 1 road x 300 x 10972 / 10000 = 329;
/// - the stop closes the road that held the Adventurer: the wonder's stub, the starter, the
///   straight and the stop's west arm, 4 nodes, 438;
/// - the cap closes the city that held the Lady: the north cap of the caps tile, the corridor and
///   the cap, 3 nodes, 3 x 200 x 10721 / 10000 = 643;
/// - the fifth field closes the ring around the wonder that held the Pilgrim: 900.
#[test]
#[available_gas(l2_gas: 3000000000)]
fn test_upgrade_d18_daily_game_open_across_the_upgrade() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let g = context.game_id;
    let daily = systems.daily;
    let contract = daily.contract_address;
    // The game ends on the last move below (spawn draws 2 tiles, 7 old and 8 new builds follow)
    let mut game = store.game(g);
    game.tile_limit = 16;
    store.set_game(game);
    let class_d18 = install_before_d18(contract);

    // [Before the upgrade] the build of 07aab8a, with characters
    // A Lord closes the starter's city: it scores 2 x 200 x 10475 / 10000 = 419, the Lord is back
    old(store, g, Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::South);
    assert_eq!(store.game(g).score, 419);
    old(store, g, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2, Role::Lady, Spot::Center);
    old(
        store,
        g,
        Plan::RFFFRFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER,
        Role::Adventurer,
        Spot::Center,
    );
    old(
        store,
        g,
        Plan::RFRFFFFFR,
        Orientation::South,
        CENTER,
        CENTER - 1,
        Role::Woodsman,
        Spot::SouthEast,
    );
    old(
        store,
        g,
        Plan::RFRFFFFFR,
        Orientation::West,
        CENTER + 1,
        CENTER - 1,
        Role::None,
        Spot::None,
    );
    old(
        store,
        g,
        Plan::RFRFFFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER - 2,
        Role::None,
        Spot::None,
    );
    old(
        store,
        g,
        Plan::WFFFFFFFR,
        Orientation::South,
        CENTER - 1,
        CENTER,
        Role::Pilgrim,
        Spot::Center,
    );
    // Four characters stand on open structures; the Lord is back
    let before = store.game(g).score;
    assert_eq!(before, 419);
    let standing_roles = role_bit(Role::Lady)
        | role_bit(Role::Adventurer)
        | role_bit(Role::Woodsman)
        | role_bit(Role::Pilgrim);
    assert_eq!(roles_placed(store, g), standing_roles);
    let (lord_tile, _) = standing(store, g, Role::Lord);
    assert_eq!(lord_tile, 0);
    let (pilgrim_tile, pilgrim_spot) = standing(store, g, Role::Pilgrim);
    assert!(pilgrim_tile != 0 && pilgrim_spot == Spot::Center.into());

    // [Upgrade]
    upgrade(contract, class_d18);
    let board_before = check::board_points(store, g);

    // [After the upgrade] the D-18 class finishes the game
    let mut spy = spy_events();
    // The last curve: the loop of road and the forest of the Woodsman
    new(store, daily, g, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    // The first move under the new class writes the dead roles bits as 0
    assert_eq!(roles_placed(store, g), 0);
    // The stop: the road of the Adventurer
    new(store, daily, g, Plan::SFRFRFFFR, Orientation::North, CENTER + 2, CENTER);
    // The cap: the city of the Lady, a structure whose root still holds her bit (no spot blocked)
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 3);
    // The fields around the wonder of the Pilgrim (city caps that stay open)
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::South, CENTER - 1, CENTER + 1);
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::South, CENTER - 2, CENTER + 1);
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::East, CENTER - 2, CENTER);
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::East, CENTER - 2, CENTER - 1);
    new(store, daily, g, Plan::FFFFFFCFF, Orientation::North, CENTER - 1, CENTER - 1);
    spy
        .assert_emitted(
            @array![
                (contract, scored(g, Category::Road, 4, 438)),
                (contract, scored(g, Category::Forest, 4, 329)),
                (contract, scored(g, Category::City, 3, 643)),
                (contract, scored(g, Category::Wonder, 0, 900)),
            ],
        );

    // [Game over] the game ended on its last tile, under the new class
    let game = store.game(g);
    assert!(game.over);
    // What the game gained after the upgrade is what the board's finished structures gained:
    // nothing closed before the upgrade scored again, nothing that closed after was left out
    let board_after = check::board_points(store, g);
    assert_eq!(board_after - board_before, game.score - before);
    // The builder view of the D-18 class: four fields
    let views = IGameViewDispatcher { contract_address: contract };
    assert_eq!(
        views.builder(g, PLAYER().into()),
        BuilderView { game_id: g, player_id: PLAYER().into(), tile_id: 0, plan: 0 },
    );
}

/// The Tutorial's build has its own path (`tutoriable`, the scripted roles and spots of 07aab8a):
/// a Tutorial game whose first two steps placed the Adventurer (on a road) and the Paladin (on a
/// city) under the class of 07aab8a is finished under the D-18 class. Every build after the
/// upgrade scores what the walks give, and the board check holds as for Daily.
#[test]
#[available_gas(l2_gas: 2000000000)]
fn test_upgrade_d18_tutorial_game_open_across_the_upgrade() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let g = context.game_id;
    let tutorial: ITutorialDispatcher = systems.tutorial;
    let contract = tutorial.contract_address;
    let class_d18 = install_before_d18(contract);

    // [Before the upgrade] the first two scripted steps, with their characters
    let frozen = IDailyBeforeD18Dispatcher { contract_address: contract };
    frozen.build_tutorial(g);
    frozen.build_tutorial(g);
    let (adventurer_tile, _) = standing(store, g, Role::Adventurer);
    let (paladin_tile, _) = standing(store, g, Role::Paladin);
    assert!(adventurer_tile != 0 && paladin_tile != 0, "two characters stand");
    assert_eq!(roles_placed(store, g), role_bit(Role::Adventurer) | role_bit(Role::Paladin));
    let before = store.game(g).score;

    // [Upgrade]
    upgrade(contract, class_d18);
    let board_before = check::board_points(store, g);

    // [After the upgrade] the rest of the script, each build checked against the walks
    let mut penalties: u32 = 0;
    loop {
        let game = store.game(g);
        if game.over {
            break;
        }
        let tile_id = store.builder(game, PLAYER().into()).tile_id;
        let mode: Mode = game.mode.into();
        let (orientation, _, _) = mode.parameters(game.tiles);
        if orientation == Orientation::None {
            tutorial.discard(g);
            penalties += game.score - store.game(g).score;
        } else {
            tutorial.build(g);
            check::assert_tile_agrees(store, g, tile_id);
            check::assert_move_scored(store, g, tile_id, game.score);
        }
    }
    assert_eq!(roles_placed(store, g), 0);
    let game = store.game(g);
    // The discard of the script (step 8) takes its penalty, which the board does not see
    let board_after = check::board_points(store, g);
    assert_eq!(board_after - board_before, game.score + penalties - before);
}

/// Gas of scenario e (`contracts/tests/gas.cairo`) on the class of 07aab8a, with and without its
/// Woodsman: the figure before D-18 of e0, the move that closes a forest that held no character
/// (no scan before D-18), for `docs/measures/baseline.md`. The run with the Woodsman calibrates the
/// frozen class against the figure of e measured on main (9,357,939).
fn gas_e_before_d18(woodsman: bool) -> u128 {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let g = context.game_id;
    install_before_d18(systems.daily.contract_address);
    let (role, spot) = if woodsman {
        (Role::Woodsman, Spot::SouthEast)
    } else {
        (Role::None, Spot::None)
    };
    old(store, g, Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1, role, spot);
    old(
        store,
        g,
        Plan::RFRFFFFFR,
        Orientation::West,
        CENTER + 1,
        CENTER - 1,
        Role::None,
        Spot::None,
    );
    old(
        store,
        g,
        Plan::RFRFFFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER - 2,
        Role::None,
        Spot::None,
    );
    force(store, g, Plan::RFRFFFFFR);
    let frozen = IDailyBeforeD18Dispatcher { contract_address: store.contract };
    let before = core::testing::get_available_gas();
    frozen.build(g, Orientation::East, CENTER, CENTER - 2, Role::None, Spot::None);
    let after = core::testing::get_available_gas();
    before - after
}

#[test]
fn test_upgrade_d18_gas_e_and_e0_before_d18() {
    let e = gas_e_before_d18(true);
    let e0 = gas_e_before_d18(false);
    println!("GAS e_close_forest (07aab8a, frozen class): {}", e);
    println!("GAS e0_close_forest_without_character (07aab8a, frozen class): {}", e0);
}
