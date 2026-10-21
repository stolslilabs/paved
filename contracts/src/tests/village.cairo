//! The village (`systems/village.cairo`, `docs/architecture/village-territory.md`, #640): founding,
//! the parcels (adjacent, up to the owner's cap of cells, the level gate, the price debited on
//! `Setup`'s ledger), placement on owned cells with the game's matching and scoring, the views, the
//! events, the storage pins, and the parity with the off-chain engine: `parity_steps` are the steps
//! of `packages/game-core/__tests__/fixtures/village-parity.json`, which `village.test.ts` replays
//! on the engine and checks against this file.

use core::num::traits::Zero;
use core::testing::get_available_gas;
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::constants::CENTER;
use paved::systems::setup::Setup::{CobblesSpent, Event as SetupEvent};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupSpendDispatcher, ISetupSpendDispatcherTrait, level_floor,
};
use paved::systems::village::Village::{
    Event as VillageEvent, MaxCellsSet, ParcelBought, TileDemolished, TilePlaced, VillageFounded,
};
use paved::systems::village::{
    DemolitionOffer, IVillageAdminDispatcher, IVillageAdminDispatcherTrait, IVillageDispatcher,
    IVillageDispatcherTrait, IVillageSafeDispatcher, IVillageSafeDispatcherTrait, MAX_CELLS_LIMIT,
    VillageCell, VillageTile, demolition_price, is_start_cell, parcel_level, parcel_price,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, load,
    map_entry_address, spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address, store,
};
use starknet::ContractAddress;

// Ceilings of the L2 gas of `found`, `buy_parcel`, `place` and `demolish` (the test profile): the
// figure measured in CI (the `Test game` job of PR #669, run 39600293782; the contracts' test build
// does not fit the VPS's cap) + 5 %, rounded up (`test_village_gas_*`).
pub const CEILING_FOUND: u128 = 1444400;
pub const CEILING_BUY_PARCEL: u128 = 1879821;
pub const CEILING_PLACE_OPEN: u128 = 4345131;
pub const CEILING_PLACE_CLOSING: u128 = 7080036;
pub const CEILING_DEMOLISH_4: u128 = 10999464;
pub const CEILING_DEMOLISH_FULL: u128 = 122980384;

/// The territory's cap these tests deploy with (the owner's `max_cells`; 38 is the value proposed
/// for the deployment), and the parcels it allows past the 9 of the start.
const CAP: u8 = 38;
const CAP_PARCELS: u8 = 29;

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
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup` and `Village`, `Village` allowlisted as a spender of `Setup`, `PLACER` as a placer.
fn world() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let village = deploy("Village", array![OWNER().into(), setup.into(), CAP.into()]);
    let world = World {
        village: IVillageDispatcher { contract_address: village },
        admin: IVillageAdminDispatcher { contract_address: village },
        setup: ISetupDispatcher { contract_address: setup },
    };
    start_cheat_caller_address(setup, OWNER());
    ISetupSpendDispatcher { contract_address: setup }.set_spender(village, true);
    stop_cheat_caller_address(setup);
    start_cheat_caller_address(village, OWNER());
    world.admin.set_placer(PLACER(), true);
    stop_cheat_caller_address(village);
    world
}

/// `world()`, `PLAYER`'s village founded, its level (its XP, at the level's floor) and cobbles set.
fn founded(level: u16, cobbles: u64) -> World {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    world.village.found();
    stop_cheat_caller_address(world.village.contract_address);
    fund(world, PLAYER(), cobbles, level);
    world
}

/// The unit of the XP in `Setup`'s account slot: its bits [224, 251).
const XP_UNIT: felt252 = 0x100000000000000000000000000000000000000000000000000000000;

/// Writes the whole account of `who` on `Setup`: `cobbles` (its low 64 bits) and the XP at the
/// floor of `level` (`level_floor`, #641), nothing else.
fn fund(world: World, who: ContractAddress, cobbles: u64, level: u16) {
    let slot = map_entry_address(selector!("accounts"), array![who.into()].span());
    let xp: felt252 = level_floor(level).into();
    store(world.setup.contract_address, slot, array![cobbles.into() + xp * XP_UNIT].span());
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

fn demolish_cell(world: World, x: i32, y: i32) -> u32 {
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let price = world.village.demolish(at(x), at(y));
    stop_cheat_caller_address(world.village.contract_address);
    price
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
    fund(world, PLAYER(), 100, 1);
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
                    SetupEvent::CobblesSpent(
                        CobblesSpent {
                            player_id: PLAYER().into(),
                            spender: world.village.contract_address,
                            reason: 'VILLAGE_PARCEL',
                            cobbles: 10,
                            balance: 90,
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

/// Level 1 at 0 XP (#641): parcel 1 only.
#[test]
#[should_panic(expected: 'Village: level too low')]
fn test_village_level_one_stops_at_two() {
    let world = founded(1, 100);
    assert_eq!(buy_cell(world, 2, 0), 1);
    buy_cell(world, 3, 0);
}

/// The gate reads `Setup.player_level`: XP one short of level 2 is still level 1.
#[test]
#[feature("safe_dispatcher")]
fn test_village_level_from_setup_xp() {
    let world = founded(1, 100);
    buy_cell(world, 2, 0);
    let slot = map_entry_address(selector!("accounts"), array![PLAYER().into()].span());
    let xp: felt252 = (level_floor(2) - 1).into();
    store(world.setup.contract_address, slot, array![90 + xp * XP_UNIT].span());
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let result = IVillageSafeDispatcher { contract_address: world.village.contract_address }
        .buy_parcel(at(3), at(0));
    stop_cheat_caller_address(world.village.contract_address);
    assert_eq!(*result.unwrap_err().span().at(0), 'Village: level too low');
    fund(world, PLAYER(), 90, 2);
    assert_eq!(buy_cell(world, 3, 0), 2);
}

#[test]
#[should_panic(expected: 'Setup: not enough cobbles')]
fn test_village_buy_short_of_cobbles() {
    let world = founded(1, 9);
    buy_cell(world, 2, 0);
}

#[test]
fn test_village_territory_full() {
    // 29 parcels in a line east: the cap of 38 cells, the sum of the curve paid
    let world = founded(CAP_PARCELS.into(), 5_000);
    let mut parcel: u8 = 1;
    while parcel <= CAP_PARCELS {
        let x: i32 = 1 + parcel.into();
        assert_eq!(buy_cell(world, x, 0), parcel);
        parcel += 1;
    }
    assert_eq!(cobbles_of(world, PLAYER()), 5_000 - 4_350);
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.cells, info.next_parcel, info.next_price, info.next_level), (38, 0, 0, 0));
    assert_eq!(world.village.cells(PLAYER().into()).len(), CAP.into());
}

#[test]
#[should_panic(expected: 'Village: territory full')]
fn test_village_territory_full_refuses() {
    let world = founded(CAP_PARCELS.into(), 5_000);
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
/// a side neighbour bought before it or in the start), within the cap, and the cobbles paid are
/// the sum of the curve over the parcels bought.
#[test]
#[fuzzer(runs: 12, seed: 640)]
fn test_village_fuzz_territory(seed: u64) {
    let world = founded(CAP_PARCELS.into(), 10_000);
    let mut state: u128 = seed.into();
    let mut bought: u8 = 0;
    let mut paid: u64 = 0;
    let mut tries: u32 = 0;
    while tries < 60 && bought < CAP_PARCELS {
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
    assert!(cells.len() <= CAP.into());
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

// The territory's cap (the owner's decision 1 of 2026-10-21: no size tied to a game's 38 tiles)

#[test]
fn test_village_max_cells_set_by_the_owner() {
    let world = founded(CAP_PARCELS.into(), 5_000);
    assert_eq!(world.admin.max_cells(), CAP);
    let mut x: i32 = 2;
    while x <= 30 {
        buy_cell(world, x, 0);
        x += 1;
    }
    // Full at 38; raised to 40, two more; the next one past the new cap is refused
    let mut spy = spy_events();
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(40);
    stop_cheat_caller_address(world.village.contract_address);
    spy
        .assert_emitted(
            @array![
                (
                    world.village.contract_address,
                    VillageEvent::MaxCellsSet(MaxCellsSet { max_cells: 40 }),
                ),
            ],
        );
    fund(world, PLAYER(), 5_000, 31);
    assert_eq!(world.village.village(PLAYER().into()).next_parcel, 30);
    assert_eq!(buy_cell(world, 31, 0), 30);
    assert_eq!(buy_cell(world, 32, 0), 31);
    assert_eq!(world.village.village(PLAYER().into()).next_parcel, 0);
    // Lowered under the village: it keeps its 40 cells and buys no more
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(20);
    stop_cheat_caller_address(world.village.contract_address);
    let info = world.village.village(PLAYER().into());
    assert_eq!((info.cells, info.next_parcel), (40, 0));
}

#[test]
#[should_panic(expected: 'Village: territory full')]
fn test_village_max_cells_lowered_stops_buying() {
    let world = founded(5, 1_000);
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(10);
    stop_cheat_caller_address(world.village.contract_address);
    assert_eq!(buy_cell(world, 2, 0), 1);
    buy_cell(world, 3, 0);
}

#[test]
fn test_village_max_cells_bounds() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(9);
    assert_eq!(world.admin.max_cells(), 9);
    world.admin.set_max_cells(MAX_CELLS_LIMIT);
    assert_eq!(world.admin.max_cells(), 100);
}

#[test]
#[should_panic(expected: 'Village: invalid max cells')]
fn test_village_max_cells_above_the_limit() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(MAX_CELLS_LIMIT + 1);
}

#[test]
#[should_panic(expected: 'Village: invalid max cells')]
fn test_village_max_cells_under_the_start() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, OWNER());
    world.admin.set_max_cells(8);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_village_max_cells_owner_only() {
    let world = world();
    start_cheat_caller_address(world.village.contract_address, ANYONE());
    world.admin.set_max_cells(40);
}

#[test]
fn test_village_constructor_refuses_a_bad_cap() {
    let setup = deploy("Setup", array![OWNER().into()]);
    let class = declare("Village").unwrap().contract_class();
    assert!(class.deploy(@array![OWNER().into(), setup.into(), 8]).is_err());
    assert!(class.deploy(@array![OWNER().into(), setup.into(), 101]).is_err());
}

// The curve

#[test]
fn test_village_curve() {
    assert_eq!((parcel_price(1), parcel_level(1)), (10, 1));
    assert_eq!((parcel_price(5), parcel_level(5)), (50, 5));
    assert_eq!((parcel_price(29), parcel_level(29)), (290, 29));
    // Defined to the technical limit's 91 parcels: the owner's cap decides how far a village goes
    assert_eq!((parcel_price(91), parcel_level(91)), (910, 91));
    assert_eq!(
        (parcel_price(0), parcel_level(0), parcel_price(92), parcel_level(92)), (0, 0, 0, 0),
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

// Demolition (the owner's decision of 2026-10-21: 5 cobbles, doubled after each one, reset each
// chain day, no refund)

/// The road of 4 of the parity's first steps: starter, `(1, 0)`, stops at `(-1, 0)` and `(2, 0)`.
fn road_of_four(cobbles: u64) -> World {
    let world = founded(1, cobbles);
    place_tile(world, 10, 1, 1, 0);
    place_tile(world, 17, 1, -1, 0);
    buy_cell(world, 2, 0);
    place_tile(world, 17, 1, 2, 0);
    world
}

#[test]
fn test_village_demolition_curve() {
    assert_eq!(demolition_price(0), 5);
    assert_eq!(demolition_price(1), 10);
    assert_eq!(demolition_price(4), 80);
    assert_eq!(demolition_price(29), 5 * 0x20000000);
    assert_eq!(demolition_price(30), 5 * 0x40000000);
    assert_eq!(demolition_price(31), 5 * 0x80000000);
    // Each one doubles the one before, with no cap (the review of #669: no fallback after the 30th)
    let mut count: u32 = 0;
    while count < 125 {
        assert_eq!(demolition_price(count + 1), 2 * demolition_price(count));
        count += 1;
    }
    // Past u128 it saturates, never under the price before it
    assert!(demolition_price(126) >= demolition_price(125));
    assert_eq!(demolition_price(1000), 0xffffffffffffffffffffffffffffffff);
}

#[test]
fn test_village_demolish_rebuilds() {
    let world = road_of_four(1_000);
    let before = world.village.village(PLAYER().into());
    assert_eq!(before.score, 438);
    let mut spy = spy_events();
    // The road's middle tile: the road opens again, its points go
    assert_eq!(demolish_cell(world, 1, 0), 5);
    let after = world.village.village(PLAYER().into());
    assert_eq!((after.tiles, after.score, after.cells), (2, 0, 10));
    assert!(after.game_id != before.game_id);
    // The tiles left, in their order, renumbered
    let tiles = world.village.tiles(PLAYER().into());
    assert_eq!(tiles.len(), 3);
    assert_eq!(*tiles.at(1), VillageTile { id: 2, plan: 17, orientation: 1, x: at(-1), y: at(0) });
    assert_eq!(*tiles.at(2), VillageTile { id: 3, plan: 17, orientation: 1, x: at(2), y: at(0) });
    // 1,000 - 10 (the parcel) - 5
    assert_eq!(cobbles_of(world, PLAYER()), 985);
    spy
        .assert_emitted(
            @array![
                (
                    world.village.contract_address,
                    VillageEvent::TileDemolished(
                        TileDemolished {
                            player_id: PLAYER().into(),
                            tile_id: 2,
                            plan: 10,
                            x: at(1),
                            y: at(0),
                            day: 0,
                            count: 1,
                            cobbles: 5,
                            game_id: after.game_id,
                            score: 0,
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
                    SetupEvent::CobblesSpent(
                        CobblesSpent {
                            player_id: PLAYER().into(),
                            spender: world.village.contract_address,
                            reason: 'VILLAGE_DEMOLISH',
                            cobbles: 5,
                            balance: 985,
                        },
                    ),
                ),
            ],
        );
    // The cell is free again: the same tile closes the road again
    assert_eq!(place_tile(world, 10, 1, 1, 0), 438);
}

/// 5, 10, 20, 40 in one day; the next day starts at 5 again; the counter of a day ends with it.
#[test]
fn test_village_demolition_price_doubles_and_resets() {
    let world = founded(1, 1_000);
    let mut paid: u32 = 0;
    let mut i: u32 = 0;
    while i < 4 {
        assert_eq!(world.village.next_demolition(PLAYER().into()).price, demolition_price(i));
        place_tile(world, 10, 1, 1, 0);
        paid += demolish_cell(world, 1, 0);
        i += 1;
    }
    assert_eq!(paid, 5 + 10 + 20 + 40);
    assert_eq!(
        world.village.next_demolition(PLAYER().into()),
        DemolitionOffer { day: 0, count: 4, price: 80 },
    );
    // The last second of day 0, then day 1
    start_cheat_block_timestamp_global(86399);
    assert_eq!(world.village.next_demolition(PLAYER().into()).price, 80);
    start_cheat_block_timestamp_global(86400);
    assert_eq!(
        world.village.next_demolition(PLAYER().into()),
        DemolitionOffer { day: 1, count: 0, price: 5 },
    );
    place_tile(world, 10, 1, 1, 0);
    assert_eq!(demolish_cell(world, 1, 0), 5);
    assert_eq!(demolish_cell_after_place(world), 10);
    assert_eq!(cobbles_of(world, PLAYER()), 1_000 - 75 - 15);
    // Another player's counter is its own
    assert_eq!(world.village.next_demolition(ANYONE().into()).price, 5);
}

fn demolish_cell_after_place(world: World) -> u32 {
    place_tile(world, 10, 1, 1, 0);
    demolish_cell(world, 1, 0)
}

/// Writes `count` demolitions of day 0 in `PLAYER`'s counter.
fn demolitions_made(world: World, count: u32) {
    let slot = map_entry_address(selector!("demolitions"), array![PLAYER().into()].span());
    let word: felt252 = count.into() * 0x10000000000000000;
    store(world.village.contract_address, slot, array![word].span());
}

/// The 30th demolition of a day is paid `5 x 2^29`, the last price `Setup.spend_cobbles` takes.
#[test]
fn test_village_demolish_the_30th() {
    let world = founded(1, 3_000_000_000);
    place_tile(world, 10, 1, 1, 0);
    demolitions_made(world, 29);
    assert_eq!(world.village.next_demolition(PLAYER().into()).price, 2_684_354_560);
    assert_eq!(demolish_cell(world, 1, 0), 2_684_354_560);
    assert_eq!(cobbles_of(world, PLAYER()), 3_000_000_000 - 2_684_354_560);
    assert_eq!(
        world.village.next_demolition(PLAYER().into()),
        DemolitionOffer { day: 0, count: 30, price: 5_368_709_120 },
    );
}

/// The 31st costs `5 x 2^30`, twice the 30th: above what `spend_cobbles` takes, it is refused,
/// even for a balance that covers it, and never charged lower.
#[test]
#[should_panic(expected: 'Village: price too high')]
fn test_village_demolish_the_31st_is_refused() {
    let world = founded(1, 10_000_000_000);
    place_tile(world, 10, 1, 1, 0);
    demolitions_made(world, 30);
    assert_eq!(world.village.next_demolition(PLAYER().into()).price, 5_368_709_120);
    demolish_cell(world, 1, 0);
}

#[test]
#[should_panic(expected: 'Village: starter stays')]
fn test_village_demolish_starter() {
    let world = founded(1, 100);
    demolish_cell(world, 0, 0);
}

#[test]
#[should_panic(expected: 'Village: no tile')]
fn test_village_demolish_empty_cell() {
    let world = founded(1, 100);
    demolish_cell(world, 1, 0);
}

#[test]
#[should_panic(expected: 'Village: no village')]
fn test_village_demolish_needs_a_village() {
    let world = world();
    demolish_cell(world, 1, 0);
}

#[test]
#[should_panic(expected: 'Setup: not enough cobbles')]
fn test_village_demolish_short_of_cobbles() {
    let world = founded(1, 4);
    place_tile(world, 10, 1, 1, 0);
    demolish_cell(world, 1, 0);
}

/// A failed demolition (short of cobbles) reverts its counter with it: the price stays.
#[test]
#[feature("safe_dispatcher")]
fn test_village_demolish_refused_keeps_the_price() {
    let world = founded(1, 4);
    place_tile(world, 10, 1, 1, 0);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let result = IVillageSafeDispatcher { contract_address: world.village.contract_address }
        .demolish(at(1), at(0));
    assert!(result.is_err());
    stop_cheat_caller_address(world.village.contract_address);
    assert_eq!(world.village.next_demolition(PLAYER().into()).price, 5);
    assert_eq!(world.village.village(PLAYER().into()).tiles, 1);
}

// Parity with the off-chain engine

#[derive(Copy, Drop)]
enum Step {
    Place: (u8, u8, i32, i32, u32, u32),
    Refused: (u8, u8, i32, i32, felt252),
    Buy: (i32, i32, u8),
    BuyRefused: (i32, i32, felt252),
    Demolish: (i32, i32, u32, u32),
    DemolishRefused: (i32, i32, felt252),
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

fn demolish(x: i32, y: i32, price: u32, score: u32) -> Step {
    Step::Demolish((x, y, price, score))
}

fn demolish_refused(x: i32, y: i32, reason: felt252) -> Step {
    Step::DemolishRefused((x, y, reason))
}

/// The steps of `village-parity.json`, in order: `place(code, orientation, x, y, points, score)`,
/// `refused(code, orientation, x, y, reason)`, `buy(x, y, parcel)`, `buy_refused(x, y, reason)`,
/// `demolish(x, y, price, score)`, `demolish_refused(x, y, reason)` (`village.test.ts` reads these
/// calls back from this function).
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
        place(17, 1, 3, 0, 209, 2804), demolish_refused(0, 0, 'Village: starter stays'),
        demolish_refused(2, 2, 'Village: no tile'), demolish(1, -2, 5, 1485),
        demolish(0, 1, 10, 647), demolish_refused(1, -2, 'Village: no tile'),
        place(8, 3, 1, -2, 1319, 1966),
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
        Step::DemolishRefused((
            x, y, _,
        )) => {
            start_cheat_caller_address(world.village.contract_address, PLAYER());
            let result = IVillageSafeDispatcher { contract_address: world.village.contract_address }
                .demolish(at(x), at(y));
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
    let world = founded(CAP_PARCELS.into(), 1_000);
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
            Step::Demolish((
                x, y, price, score,
            )) => {
                assert_eq!(demolish_cell(world, x, y), price);
                assert_eq!(world.village.village(PLAYER().into()).score, score);
            },
            Step::DemolishRefused((_, _, reason)) => assert_eq!(refusal_of(world, step), reason),
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

/// `Village` spends through `Setup`'s spender allowlist: revoked, a parcel cannot be paid.
#[test]
#[should_panic(expected: 'Setup: not spender')]
fn test_village_needs_the_spender_allowlist() {
    let world = founded(1, 100);
    start_cheat_caller_address(world.setup.contract_address, OWNER());
    ISetupSpendDispatcher { contract_address: world.setup.contract_address }
        .set_spender(world.village.contract_address, false);
    stop_cheat_caller_address(world.setup.contract_address);
    buy_cell(world, 2, 0);
}

#[test]
fn test_village_wiring_views() {
    let world = world();
    assert_eq!(world.admin.setup(), world.setup.contract_address);
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
    assert_eq!(raw(village, selector!("max_cells")), CAP.into());
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
    // `demolitions`: day [0, 64) · count [64, 96)
    start_cheat_block_timestamp_global(3 * 86400);
    place_tile(world, 10, 1, 1, 0);
    demolish_cell(world, 1, 0);
    let demolitions = map_entry_address(selector!("demolitions"), array![PLAYER().into()].span());
    assert_eq!(raw(village, demolitions), 3 + 1 * 0x10000000000000000);
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

/// A demolition in the road of 4: three tiles replayed.
#[test]
fn test_village_gas_demolish_4() {
    let world = road_of_four(100);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let before = get_available_gas();
    world.village.demolish(at(1), at(0));
    let after = get_available_gas();
    report("village_demolish_4", before - after, CEILING_DEMOLISH_4);
}

/// A full demolition at the tests' cap: the first placed tile of a village of 38 tiles (the 9 of
/// the start and 29 parcels in a line east, a road along it), so 36 tiles are replayed.
#[test]
fn test_village_gas_demolish_full() {
    let world = founded(CAP_PARCELS.into(), 5_000);
    let mut x: i32 = 2;
    while x <= 30 {
        buy_cell(world, x, 0);
        x += 1;
    }
    // A straight road from (1, 0) to (30, 0), then the 8 other cells of the start
    let mut x: i32 = 1;
    while x <= 30 {
        place_tile(world, 10, 1, x, 0);
        x += 1;
    }
    place_tile(world, 17, 1, -1, 0);
    place_tile(world, 8, 3, 1, 1);
    place_tile(world, 8, 1, 1, -1);
    place_tile(world, 5, 1, 0, 1);
    place_tile(world, 18, 1, 0, -1);
    place_tile(world, 13, 4, -1, 1);
    place_tile(world, 13, 1, -1, -1);
    assert_eq!(world.village.village(PLAYER().into()).tiles, 37);
    start_cheat_caller_address(world.village.contract_address, PLAYER());
    let before = get_available_gas();
    world.village.demolish(at(1), at(0));
    let after = get_available_gas();
    report("village_demolish_full", before - after, CEILING_DEMOLISH_FULL);
}
