//! The village (`systems/village.cairo`, `docs/architecture/village-territory.md`, #640): founding,
//! the parcels (adjacent, at most 38 cells, the level gate, the price debited on `Setup`'s ledger),
//! placement on owned cells with the game's matching and scoring, the views, the events, the
//! storage pins, and the parity with the off-chain engine: `parity_steps` are the steps of
//! `packages/game-core/__tests__/fixtures/village-parity.json`, which `village.test.ts` replays on
//! the engine and checks against this file.

use core::num::traits::Zero;
use core::testing::get_available_gas;
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::constants::CENTER;
use paved::mocks::levels::{IMockLevelsDispatcher, IMockLevelsDispatcherTrait};
use paved::systems::setup::Setup::{Event as SetupEvent, ParcelPaid};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupVillageDispatcher, ISetupVillageDispatcherTrait,
};
use paved::systems::village::Village::{
    Event as VillageEvent, ParcelBought, TilePlaced, VillageFounded,
};
use paved::systems::village::{
    IVillageAdminDispatcher, IVillageAdminDispatcherTrait, IVillageDispatcher,
    IVillageDispatcherTrait, IVillageSafeDispatcher, IVillageSafeDispatcherTrait, MAX_CELLS,
    MAX_PARCELS, VillageCell, VillageTile, is_start_cell, parcel_level, parcel_price,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, load,
    map_entry_address, spy_events, start_cheat_caller_address, stop_cheat_caller_address, store,
};
use starknet::ContractAddress;

// Ceilings of the L2 gas of `found`, `buy_parcel` and `place` (the test profile): the figure
// measured on the VPS + 5 %, rounded up (`test_village_gas_*`).
pub const CEILING_FOUND: u128 = 1;
pub const CEILING_BUY_PARCEL: u128 = 1;
pub const CEILING_PLACE_OPEN: u128 = 1;
pub const CEILING_PLACE_CLOSING: u128 = 1;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn PLACER() -> ContractAddress {
    'PLACER'.try_into().unwrap()
}

fn ANYONE() -> ContractAddress {
    'ANYONE'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct World {
    village: IVillageDispatcher,
    admin: IVillageAdminDispatcher,
    setup: ISetupDispatcher,
    levels: IMockLevelsDispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup` and `Village`, `Village` allowlisted as a reporter, `PLACER` as a placer, the mock
/// levels wired (every player level 0 until a test sets it: `levels` 0 is not the unwired 1).
fn world() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let village = deploy("Village", array![OWNER().into(), setup.into()]);
    let levels = deploy("MockLevels", array![]);
    let world = World {
        village: IVillageDispatcher { contract_address: village },
        admin: IVillageAdminDispatcher { contract_address: village },
        setup: ISetupDispatcher { contract_address: setup },
        levels: IMockLevelsDispatcher { contract_address: levels },
    };
    start_cheat_caller_address(setup, OWNER());
    world.setup.set_reporter(village, true);
    stop_cheat_caller_address(setup);
    start_cheat_caller_address(village, OWNER());
    world.admin.set_placer(PLACER(), true);
    world.admin.set_levels(levels);
    stop_cheat_caller_address(village);
    world
}

/// `world()`, `PLAYER`'s village founded, its level and cobbles set.
fn founded(level: u32, cobbles: u64) -> World {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    world.village.found();
    stop_cheat_caller_address(world.village.contract_address);
    world.levels.set_level(PLAYER().into(), level);
    fund(world, PLAYER(), cobbles);
    world
}

/// Writes `cobbles` as the whole account of `who` on `Setup` (the cobbles are its low 64 bits).
fn fund(world: World, who: ContractAddress, cobbles: u64) {
    let slot = map_entry_address(selector!("accounts"), array![who.into()].span());
    store(world.setup.contract_address, slot, array![cobbles.into()].span());
}

fn cobbles_of(world: World, who: ContractAddress) -> u64 {
    ISetupCobblesDispatcher { contract_address: world.setup.contract_address }
        .account(who.into())
        .cobbles
}

/// A coordinate relative to the starter, in the game's.
fn at(d: i32) -> u32 {
    if d >= 0 {
        CENTER + d.try_into().unwrap()
    } else {
        CENTER - (-d).try_into().unwrap()
    }
}

fn buy_cell(world: World, x: i32, y: i32) -> u8 {
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let parcel = world.village.buy_parcel(at(x), at(y));
    stop_cheat_caller_address(world.village.contract_address);
    parcel
}

fn place_tile(world: World, plan: u8, orientation: u8, x: i32, y: i32) -> u32 {
    start_cheat_caller_address(world.village.contract_address, PLACER());
    let points = world.village.place(PLAYER().into(), plan, orientation, at(x), at(y));
    stop_cheat_caller_address(world.village.contract_address);
    points
}

// Plan codes (`types/plan.cairo`): 1 CCCCCCCCC, 5 FFCFFFCFF, 8 FFFFFFCFF, 10 RFFFRFFFR,
// 13 RFRFFFFFR, 17 SFRFRFRFR, 18 WFFFFFFFF. Orientations: 1 North, 2 East, 3 South, 4 West. The
// starter (`RFFFRFCFR` facing South): a city cap on its N edge, a W-E road.

// Founding

#[test]
fn test_village_found() {
    let world = world();
    let mut spy = spy_events();
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let game_id = world.village.found();
    let info = world.village.village(PLAYER().into());
    assert_eq!(info.game_id, game_id);
    assert_eq!((info.cells, info.tiles, info.score), (9, 0, 0));
    assert_eq!((info.next_parcel, info.next_price, info.next_level), (1, 10, 1));
    let cells = world.village.cells(PLAYER().into());
    assert_eq!(cells.len(), 9);
    assert_eq!(*cells.at(0), VillageCell { x: CENTER - 1, y: CENTER - 1 });
    assert_eq!(*cells.at(8), VillageCell { x: CENTER + 1, y: CENTER + 1 });
    let tiles = world.village.tiles(PLAYER().into());
    assert_eq!(tiles.len(), 1);
    assert_eq!(*tiles.at(0), VillageTile { id: 1, plan: 9, orientation: 3, x: CENTER, y: CENTER });
    spy
        .assert_emitted(
            @array![
                (
                    world.village.contract_address,
                    VillageEvent::VillageFounded(
                        VillageFounded { player_id: PLAYER().into(), game_id },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Village: already founded')]
fn test_village_found_once() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    world.village.found();
    world.village.found();
}

#[test]
fn test_village_views_without_village() {
    let world = world();
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.game_id, info.cells, info.tiles, info.score), (0, 0, 0, 0));
    assert_eq!((info.next_parcel, info.next_price, info.next_level), (1, 10, 1));
    assert_eq!(world.village.cells(PLAYER().into()).len(), 0);
    assert_eq!(world.village.tiles(PLAYER().into()).len(), 0);
    assert!(!world.village.is_owned(PLAYER().into(), CENTER, CENTER));
}

#[test]
#[should_panic(expected: 'Village: no village')]
fn test_village_buy_needs_a_village() {
    let world = world();
    fund(world, PLAYER(), 100);
    world.levels.set_level(PLAYER().into(), 1);
    buy_cell(world, 2, 0);
}

#[test]
#[should_panic(expected: 'Village: no village')]
fn test_village_place_needs_a_village() {
    let world = world();
    place_tile(world, 10, 1, 1, 0);
}

// Parcels

#[test]
fn test_village_buy_parcel() {
    let world = founded(1, 100);
    let mut spy = spy_events();
    assert_eq!(buy_cell(world, 2, 0), 1);
    assert_eq!(cobbles_of(world, PLAYER()), 90);
    assert!(world.village.is_owned(PLAYER().into(), at(2), at(0)));
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.cells, info.next_parcel, info.next_price, info.next_level), (10, 2, 20, 2));
    let cells = world.village.cells(PLAYER().into());
    assert_eq!(cells.len(), 10);
    assert_eq!(*cells.at(9), VillageCell { x: at(2), y: at(0) });
    spy
        .assert_emitted(
            @array![
                (
                    world.village.contract_address,
                    VillageEvent::ParcelBought(
                        ParcelBought {
                            player_id: PLAYER().into(),
                            parcel: 1,
                            x: at(2),
                            y: at(0),
                            cells: 10,
                            cobbles: 10,
                            level: 1,
                        },
                    ),
                ),
            ],
        );
    spy
        .assert_emitted(
            @array![
                (
                    world.setup.contract_address,
                    SetupEvent::ParcelPaid(
                        ParcelPaid {
                            player_id: PLAYER().into(), parcel: 1, cobbles: 10, balance: 90,
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Village: cell owned')]
fn test_village_buy_a_start_cell() {
    let world = founded(1, 100);
    buy_cell(world, 1, 1);
}

#[test]
#[should_panic(expected: 'Village: cell owned')]
fn test_village_buy_twice() {
    let world = founded(2, 100);
    buy_cell(world, 2, 0);
    buy_cell(world, 2, 0);
}

#[test]
#[should_panic(expected: 'Village: not adjacent')]
fn test_village_buy_diagonal() {
    let world = founded(1, 100);
    buy_cell(world, 2, 2);
}

#[test]
#[should_panic(expected: 'Village: not adjacent')]
fn test_village_buy_far() {
    let world = founded(1, 100);
    buy_cell(world, 3, 0);
}

#[test]
#[should_panic(expected: 'Village: level too low')]
fn test_village_level_gate() {
    // Level 4 buys parcels 1 to 4, never the 5th, whatever its cobbles (the owner's example)
    let world = founded(4, 10_000);
    let mut x: i32 = 2;
    while x <= 5 {
        buy_cell(world, x, 0);
        x += 1;
    }
    assert_eq!(cobbles_of(world, PLAYER()), 10_000 - 100);
    buy_cell(world, 6, 0);
}

#[test]
#[should_panic(expected: 'Village: level too low')]
fn test_village_level_zero() {
    let world = founded(0, 100);
    buy_cell(world, 2, 0);
}

#[test]
fn test_village_level_unwired_is_one() {
    let world = founded(0, 100);
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_levels(Zero::zero());
    stop_cheat_caller_address(world.village.contract_address);
    assert_eq!(buy_cell(world, 2, 0), 1);
}

#[test]
#[should_panic(expected: 'Village: level too low')]
fn test_village_level_unwired_stops_at_two() {
    let world = founded(0, 100);
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_levels(Zero::zero());
    stop_cheat_caller_address(world.village.contract_address);
    buy_cell(world, 2, 0);
    buy_cell(world, 3, 0);
}

#[test]
#[should_panic(expected: 'Setup: not enough cobbles')]
fn test_village_buy_short_of_cobbles() {
    let world = founded(1, 9);
    buy_cell(world, 2, 0);
}

#[test]
fn test_village_territory_full() {
    // 29 parcels in a line east: 38 cells, the sum of the curve paid
    let world = founded(MAX_PARCELS.into(), 5_000);
    let mut parcel: u8 = 1;
    while parcel <= MAX_PARCELS {
        let x: i32 = 1 + parcel.into();
        assert_eq!(buy_cell(world, x, 0), parcel);
        parcel += 1;
    }
    assert_eq!(cobbles_of(world, PLAYER()), 5_000 - 4_350);
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.cells, info.next_parcel, info.next_price, info.next_level), (38, 0, 0, 0));
    assert_eq!(world.village.cells(PLAYER().into()).len(), MAX_CELLS.into());
}

#[test]
#[should_panic(expected: 'Village: territory full')]
fn test_village_territory_full_refuses() {
    let world = founded(MAX_PARCELS.into(), 5_000);
    let mut x: i32 = 2;
    while x <= 30 {
        buy_cell(world, x, 0);
        x += 1;
    }
    buy_cell(world, -2, 0);
}

#[test]
#[should_panic(expected: 'Village: invalid position')]
fn test_village_buy_invalid_position() {
    let world = founded(1, 100);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    world.village.buy_parcel(0, CENTER);
}

/// A buyer's parcel is its own: another player's village keeps its 9 cells.
#[test]
fn test_village_parcels_per_player() {
    let world = founded(1, 100);
    buy_cell(world, 2, 0);
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    world.village.found();
    stop_cheat_caller_address(world.village.contract_address);
    assert!(!world.village.is_owned(ANYONE().into(), at(2), at(0)));
    assert_eq!(world.village.village(ANYONE().into()).cells, 9);
}

/// Fuzz: a walk of parcel attempts from a seed keeps the territory connected (each cell bought has
/// a side neighbour bought before it or in the start), within 38 cells, and the cobbles paid are
/// the sum of the curve over the parcels bought.
#[test]
#[fuzzer(runs: 12, seed: 640)]
fn test_village_fuzz_territory(seed: u64) {
    let world = founded(MAX_PARCELS.into(), 10_000);
    let mut state: u128 = seed.into();
    let mut bought: u8 = 0;
    let mut paid: u64 = 0;
    let mut tries: u32 = 0;
    while tries < 60 && bought < MAX_PARCELS {
        state = (state * 6364136223846793005 + 1442695040888963407) % 0x10000000000000000;
        let pick = (state / 0x100000000) % 4;
        let cells = world.village.cells(PLAYER().into());
        // A cell next to a random owned one, in a random direction
        let index: u32 = (state % cells.len().into()).try_into().unwrap();
        let base = *cells.at(index);
        let (x, y) = if pick == 0 {
            (base.x + 1, base.y)
        } else if pick == 1 {
            (base.x - 1, base.y)
        } else if pick == 2 {
            (base.x, base.y + 1)
        } else {
            (base.x, base.y - 1)
        };
        if !world.village.is_owned(PLAYER().into(), x, y) {
            start_cheat_caller_address(world.village.contract_address, PLAYER());
            let parcel = world.village.buy_parcel(x, y);
            stop_cheat_caller_address(world.village.contract_address);
            bought += 1;
            assert_eq!(parcel, bought);
            paid += parcel_price(parcel).into();
        }
        tries += 1;
    }
    let cells = world.village.cells(PLAYER().into());
    assert_eq!(cells.len(), 9 + bought.into());
    assert!(cells.len() <= MAX_CELLS.into());
    assert_eq!(cobbles_of(world, PLAYER()), 10_000 - paid);
    // Connected: every parcel touches a cell listed before it
    let mut i = 9;
    while i < cells.len() {
        let cell = *cells.at(i);
        let mut j = 0;
        let mut touches = false;
        while j < i {
            let other = *cells.at(j);
            let dx = if cell.x > other.x {
                cell.x - other.x
            } else {
                other.x - cell.x
            };
            let dy = if cell.y > other.y {
                cell.y - other.y
            } else {
                other.y - cell.y
            };
            if dx + dy == 1 {
                touches = true;
            }
            j += 1;
        }
        assert!(touches, "parcel {} not connected", i);
        i += 1;
    }
}

// The curve

#[test]
fn test_village_curve() {
    assert_eq!((parcel_price(1), parcel_level(1)), (10, 1));
    assert_eq!((parcel_price(5), parcel_level(5)), (50, 5));
    assert_eq!((parcel_price(29), parcel_level(29)), (290, 29));
    assert_eq!(
        (parcel_price(0), parcel_level(0), parcel_price(30), parcel_level(30)), (0, 0, 0, 0),
    );
    assert!(is_start_cell(CENTER - 1, CENTER + 1));
    assert!(!is_start_cell(CENTER + 2, CENTER));
}

// Placement

#[test]
#[should_panic(expected: 'Village: not placer')]
fn test_village_place_not_placer() {
    let world = founded(1, 100);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    world.village.place(PLAYER().into(), 10, 1, at(1), at(0));
}

#[test]
#[should_panic(expected: 'Village: not placer')]
fn test_village_placer_removed() {
    let world = founded(1, 100);
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_placer(PLACER(), false);
    stop_cheat_caller_address(world.village.contract_address);
    assert!(!world.admin.is_placer(PLACER()));
    place_tile(world, 10, 1, 1, 0);
}

#[test]
#[should_panic(expected: 'Village: cell not owned')]
fn test_village_place_outside() {
    let world = founded(1, 100);
    place_tile(world, 10, 1, 1, 0);
    place_tile(world, 17, 1, 2, 0);
}

#[test]
#[should_panic(expected: 'Village: invalid plan')]
fn test_village_place_invalid_plan() {
    let world = founded(1, 100);
    place_tile(world, 20, 1, 1, 0);
}

#[test]
#[should_panic(expected: 'Village: invalid plan')]
fn test_village_place_plan_zero() {
    let world = founded(1, 100);
    place_tile(world, 0, 1, 1, 0);
}

#[test]
#[should_panic(expected: 'Village: invalid orientation')]
fn test_village_place_invalid_orientation() {
    let world = founded(1, 100);
    place_tile(world, 10, 5, 1, 0);
}

#[test]
fn test_village_place_events() {
    let world = founded(1, 100);
    place_tile(world, 10, 1, 1, 0);
    place_tile(world, 17, 1, -1, 0);
    buy_cell(world, 2, 0);
    let mut spy = spy_events();
    assert_eq!(place_tile(world, 17, 1, 2, 0), 438);
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.tiles, info.score), (3, 438));
    let tiles = world.village.tiles(PLAYER().into());
    assert_eq!(tiles.len(), 4);
    assert_eq!(*tiles.at(3), VillageTile { id: 4, plan: 17, orientation: 1, x: at(2), y: at(0) });
    spy
        .assert_emitted(
            @array![
                (
                    world.village.contract_address,
                    VillageEvent::TilePlaced(
                        TilePlaced {
                            player_id: PLAYER().into(),
                            game_id: info.game_id,
                            tile_id: 4,
                            plan: 17,
                            orientation: 1,
                            x: at(2),
                            y: at(0),
                            points: 438,
                            score: 438,
                        },
                    ),
                ),
            ],
        );
}

/// No border rule: the wonder of the 3 x 3's south row has neighbours outside the territory and
/// stays open until they are bought and built; a forest facing out is not closed either.
#[test]
fn test_village_no_border_rule() {
    let world = founded(5, 1_000);
    assert_eq!(place_tile(world, 18, 1, 0, -1), 0);
    assert_eq!(place_tile(world, 17, 1, -1, 0), 0);
    assert_eq!(place_tile(world, 10, 1, 1, 0), 0);
    assert_eq!(place_tile(world, 13, 1, -1, -1), 0);
    assert_eq!(place_tile(world, 8, 1, 1, -1), 0);
    assert_eq!(world.village.village(PLAYER().into()).score, 0);
}

// Parity with the off-chain engine

#[derive(Copy, Drop)]
enum Step {
    Place: (u8, u8, i32, i32, u32, u32),
    Refused: (u8, u8, i32, i32, felt252),
    Buy: (i32, i32, u8),
    BuyRefused: (i32, i32, felt252),
}

fn place(code: u8, o: u8, x: i32, y: i32, points: u32, score: u32) -> Step {
    Step::Place((code, o, x, y, points, score))
}

fn refused(code: u8, o: u8, x: i32, y: i32, reason: felt252) -> Step {
    Step::Refused((code, o, x, y, reason))
}

fn buy(x: i32, y: i32, parcel: u8) -> Step {
    Step::Buy((x, y, parcel))
}

fn buy_refused(x: i32, y: i32, reason: felt252) -> Step {
    Step::BuyRefused((x, y, reason))
}

/// The steps of `village-parity.json`, in order: `place(code, orientation, x, y, points, score)`,
/// `refused(code, orientation, x, y, reason)`, `buy(x, y, parcel)`, `buy_refused(x, y, reason)`
/// (`village.test.ts` reads these calls back from this function).
fn parity_steps() -> Array<Step> {
    array![
        place(10, 1, 1, 0, 0, 0), place(17, 1, -1, 0, 0, 0),
        refused(17, 1, 2, 0, 'Village: cell not owned'), buy(2, 0, 1), place(17, 1, 2, 0, 438, 438),
        place(5, 1, 0, 1, 419, 857), place(18, 1, 0, -1, 0, 857), buy(0, 2, 2),
        place(8, 1, 0, 2, 419, 1276), place(8, 3, 1, 1, 0, 1276), place(13, 4, -1, 1, 0, 1276),
        place(8, 1, 1, -1, 0, 1276), place(13, 1, -1, -1, 0, 1276),
        buy_refused(3, 3, 'Village: not adjacent'), buy_refused(0, 0, 'Village: cell owned'),
        buy(0, -2, 3), buy(-1, -2, 4), buy(1, -2, 5), place(8, 1, 0, -2, 0, 1276),
        place(8, 1, -1, -2, 0, 1276), place(8, 3, 1, -2, 1319, 2595),
        refused(8, 1, 0, 0, 'Tile: already exists'), buy(3, 0, 6), buy(4, 0, 7),
        refused(1, 1, 3, 0, 'Tile: cannot place'), refused(17, 1, 4, 0, 'Tile: no neighbors'),
        place(17, 1, 3, 0, 209, 2804),
    ]
}
// End of parity_steps

/// A step expected to revert, run through the safe dispatchers: its reason.
#[feature("safe_dispatcher")]
fn refusal_of(world: World, step: Step) -> felt252 {
    let reason = match step {
        Step::Refused((
            code, o, x, y, _,
        )) => {
            start_cheat_caller_address(world.village.contract_address, PLACER());
            let result = IVillageSafeDispatcher { contract_address: world.village.contract_address }
                .place(PLAYER().into(), code, o, at(x), at(y));
            stop_cheat_caller_address(world.village.contract_address);
            let panic: Array<felt252> = result.unwrap_err();
            *panic.at(0)
        },
        Step::BuyRefused((
            x, y, _,
        )) => {
            start_cheat_caller_address(world.village.contract_address, PLAYER());
            let result = IVillageSafeDispatcher { contract_address: world.village.contract_address }
                .buy_parcel(at(x), at(y));
            stop_cheat_caller_address(world.village.contract_address);
            let panic: Array<felt252> = result.unwrap_err();
            *panic.at(0)
        },
        _ => 0,
    };
    reason
}

#[test]
#[feature("safe_dispatcher")]
fn test_village_parity() {
    let world = founded(MAX_PARCELS.into(), 1_000);
    for step in parity_steps() {
        match step {
            Step::Place((
                code, o, x, y, points, score,
            )) => {
                assert_eq!(place_tile(world, code, o, x, y), points);
                assert_eq!(world.village.village(PLAYER().into()).score, score);
            },
            Step::Refused((_, _, _, _, reason)) => assert_eq!(refusal_of(world, step), reason),
            Step::Buy((x, y, parcel)) => assert_eq!(buy_cell(world, x, y), parcel),
            Step::BuyRefused((_, _, reason)) => assert_eq!(refusal_of(world, step), reason),
        }
    }
}

// Admin

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_village_set_placer_owner_only() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    world.admin.set_placer(ANYONE(), true);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_village_set_levels_owner_only() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    world.admin.set_levels(ANYONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_village_set_setup_owner_only() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    world.admin.set_setup(ANYONE());
}

#[test]
#[should_panic(expected: 'Village: setup is zero')]
fn test_village_set_setup_never_zero() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_setup(Zero::zero());
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_village_upgrade_owner_only() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    IUpgradeableDispatcher { contract_address: world.village.contract_address }
        .upgrade('CLASS'.try_into().unwrap());
}

#[test]
#[should_panic(expected: 'Quest: not reporter')]
fn test_village_spend_parcel_reporter_only() {
    let world = world();
    fund(world, PLAYER(), 100);
    start_cheat_caller_address(world.setup.contract_address, PLAYER());
    ISetupVillageDispatcher { contract_address: world.setup.contract_address }
        .spend_parcel(PLAYER().into(), 1, 10);
}

#[test]
fn test_village_wiring_views() {
    let world = world();
    assert_eq!(world.admin.setup(), world.setup.contract_address);
    assert_eq!(world.admin.levels(), world.levels.contract_address);
    assert!(world.admin.is_placer(PLACER()));
    assert!(!world.admin.is_placer(ANYONE()));
}

// Storage pins (`docs/architecture/upgrades.md`): each variable at the raw address of its name.

fn raw(village: ContractAddress, address: felt252) -> felt252 {
    *load(village, address, 1).at(0)
}

#[test]
fn test_village_pins_its_storage_variables_by_name() {
    let world = founded(1, 100);
    let village = world.village.contract_address;
    assert_eq!(raw(village, selector!("owner")), OWNER().into());
    assert_eq!(raw(village, selector!("setup")), world.setup.contract_address.into());
    assert_eq!(raw(village, selector!("levels")), world.levels.contract_address.into());
    assert_eq!(
        raw(village, map_entry_address(selector!("placers"), array![PLACER().into()].span())), 1,
    );
    let game_id = world.village.village(PLAYER().into()).game_id;
    // `villages`: game id [0, 32) · cells [32, 40) · tiles [40, 48)
    let header = map_entry_address(selector!("villages"), array![PLAYER().into()].span());
    assert_eq!(raw(village, header), game_id.into() + 9 * 0x100000000);
    buy_cell(world, 2, 0);
    assert_eq!(raw(village, header), game_id.into() + 10 * 0x100000000);
    let parcel = map_entry_address(selector!("parcels"), array![PLAYER().into(), 1].span());
    assert_eq!(raw(village, parcel), at(2).into() + at(0).into() * 0x100000000);
    let owned = map_entry_address(
        selector!("owned"), array![PLAYER().into(), at(2).into(), at(0).into()].span(),
    );
    assert_eq!(raw(village, owned), 1);
}

// Gas (the test profile): the L2 gas of each new call, against its ceiling.

fn report(name: ByteArray, gas: u128, ceiling: u128) {
    println!("gas {}: {}", name, gas);
    assert!(gas <= ceiling, "gas {} above its ceiling: {} > {}", name, gas, ceiling);
}

#[test]
fn test_village_gas_found() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let before = get_available_gas();
    world.village.found();
    let after = get_available_gas();
    report("village_found", before - after, CEILING_FOUND);
}

#[test]
fn test_village_gas_buy_parcel() {
    let world = founded(2, 100);
    buy_cell(world, 2, 0);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let before = get_available_gas();
    world.village.buy_parcel(at(3), at(0));
    let after = get_available_gas();
    report("village_buy_parcel", before - after, CEILING_BUY_PARCEL);
}

#[test]
fn test_village_gas_place_open() {
    let world = founded(1, 100);
    start_cheat_caller_address(world.village.contract_address, PLACER());
    let before = get_available_gas();
    world.village.place(PLAYER().into(), 10, 1, at(1), at(0));
    let after = get_available_gas();
    report("village_place_open", before - after, CEILING_PLACE_OPEN);
}

#[test]
fn test_village_gas_place_closing() {
    let world = founded(1, 100);
    place_tile(world, 10, 1, 1, 0);
    place_tile(world, 17, 1, -1, 0);
    buy_cell(world, 2, 0);
    start_cheat_caller_address(world.village.contract_address, PLACER());
    let before = get_available_gas();
    world.village.place(PLAYER().into(), 17, 1, at(2), at(0));
    let after = get_available_gas();
    report("village_place_closing", before - after, CEILING_PLACE_CLOSING);
}
