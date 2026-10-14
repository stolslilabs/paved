//! The assessment and the forest scan before G7a (main at 82193903), frozen as the reference of
//! `differential_g7a.cairo`.
//!
//! G7a changed three things on the build path: the move runs `Game::assess` only when
//! `placement::place_move` says a root it reached is closed (C1), the move's forest scan starts
//! with the side tiles the move has read (C3, `WalkerTrait::seeded`), and the fit check reads one
//! edge word per tile (C5, proved in `placement.cairo`). `assess_before_g7a` is `Game::assess_with`
//! of 82193903, always run, and its forest arm `assess_forest` of 82193903 on `scan_before_g7a`,
//! the scan of 82193903 with its walker inlined (every tile it reaches read from storage, or from
//! the move's cache for the built tile). The scoring arms, the tallies and the tables they call are
//! the shared ones: G7a left them alone.

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::game::{Game, GameImpl};
use paved::models::tile::Tile;
use paved::store::{Store, StoreImpl};
use paved::structure::assessment::{score_generic, score_wonder};
use paved::structure::owners::{Tally, TallyTrait, player_of, structure_tally, wonder_tally};
use paved::structure::placement::{self, Neighborhood, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of, size_of};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::walk::toward;
use paved::structure::{oriented, tables};
use paved::types::category::{Category, CategoryImpl};

/// `Game::assess_with` of 82193903.
pub fn assess_before_g7a(
    ref game: Game,
    solo: bool,
    tile: Tile,
    refs: u128,
    around: @Neighborhood,
    ref structures: Structures,
    ref store: Store,
) {
    // [Info] The roots assessed by this move
    let mut done: Array<u32> = array![];

    // [Compute] The start spots of the tile
    let row = oriented::plan_row(tile.plan, tile.orientation);
    let mut count = oriented::start_count(row);
    let mut starts = oriented::starts(row);
    while count > 0 {
        let (_, area, rest) = oriented::next_start(starts);
        starts = rest;
        count -= 1;
        let area_row = oriented::area_row(tile.plan, tile.orientation, area);
        let category: Category = tables::row_category(area_row).into();
        let scorable = match category {
            Category::Road | Category::City | Category::Wonder | Category::Forest => true,
            _ => false,
        };
        if !scorable {
            continue;
        }
        let (root, record) = structures.find(ref_of(refs, area));
        if open_of(record) != 0 || placement::contains(done.span(), root) {
            continue;
        }
        done.append(root);
        match category {
            Category::Wonder => {
                let winner = if solo {
                    game.player_id
                } else {
                    let mut tally = wonder_tally(tile, ref structures);
                    player_of(game.player_id, tally.winner())
                };
                score_wonder(ref game, ref store, winner);
            },
            Category::Forest => assess_forest(
                ref game, tile, refs, area, record, solo, ref structures, ref store,
            ),
            _ => {
                let winner = if solo {
                    game.player_id
                } else {
                    let mut tally = structure_tally(tile, refs, area, ref structures);
                    player_of(game.player_id, tally.winner())
                };
                score_generic(ref game, ref store, record, category, winner);
            },
        }
    }

    // [Compute] The wonders of the neighbours
    let mut directions = array![
        tables::NORTH, tables::EAST, tables::SOUTH, tables::WEST, tables::NORTH_WEST,
        tables::NORTH_EAST, tables::SOUTH_EAST, tables::SOUTH_WEST,
    ]
        .span();
    while let Option::Some(direction) = directions.pop_front() {
        if *around.wonders & placement::bit(*direction) != 0 {
            let wonder = oriented::wonder_area(around.tile(*direction).plan);
            let (root, record) = structures.find(around.reference(*direction, wonder));
            if open_of(record) == 0 && !placement::contains(done.span(), root) {
                done.append(root);
                let winner = if solo {
                    game.player_id
                } else {
                    let mut tally = wonder_tally(around.tile(*direction), ref structures);
                    player_of(game.player_id, tally.winner())
                };
                score_wonder(ref game, ref store, winner);
            }
        }
    }
}

/// `forest::assess_forest` of 82193903.
fn assess_forest(
    ref game: Game,
    tile: Tile,
    refs: u128,
    area: u8,
    record: u64,
    solo: bool,
    ref structures: Structures,
    ref store: Store,
) {
    let mut tally: Option<Tally> = if solo {
        Option::None
    } else {
        Option::Some(TallyTrait::new())
    };
    let (open_road, roads, cities) = scan_before_g7a(tile, refs, area, ref structures, ref tally);
    if open_road {
        return;
    }
    let winner = match tally {
        Option::Some(mut counted) => player_of(game.player_id, counted.winner()),
        Option::None => game.player_id,
    };
    let size: u32 = size_of(record).into();
    let points = if winner == 0 {
        0
    } else {
        let (num, den) = compute_multiplier(size);
        let points = (roads + cities) * Category::Forest.base_points() * num / den;
        game.add_score(points);
        points
    };
    game.count_forest();
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id,
                    player_id: winner,
                    category: Category::Forest.into(),
                    size,
                    points,
                },
            ),
        );
}

/// `forest::scan` of 82193903, with `WalkerTrait::new`, `pop` and `expand` of 82193903 inlined.
pub fn scan_before_g7a(
    tile: Tile, refs: u128, area: u8, ref structures: Structures, ref tally: Option<Tally>,
) -> (bool, u32, u32) {
    let game_id = structures.game_id;
    let mut slots: Felt252Dict<felt252> = Default::default();
    if structures.built.id != 0 {
        let built = structures.built;
        slots
            .insert(
                position_key(built.x, built.y), StoreImpl::tile_slot(built, structures.built_refs),
            );
    }
    let mut visited: Felt252Dict<bool> = Default::default();
    visited.insert(node_key(tile.id, area), true);
    let mut nodes: Array<(Tile, u128, u8)> = array![(tile, refs, area)];
    let mut road_roots: Felt252Dict<bool> = Default::default();
    let mut city_roots: Felt252Dict<bool> = Default::default();
    let mut roads: u32 = 0;
    let mut cities: u32 = 0;
    let mut open_road = false;
    while let Option::Some((node, node_refs, node_area)) = nodes.pop_front() {
        let north = tables::area_row(node.plan, node_area);
        let mut adjacent = tables::row_adjacent_roads(north);
        let mut other: u8 = 1;
        while adjacent != 0 {
            if adjacent & 1 != 0 {
                let (road, record) = structures.find(ref_of(node_refs, other));
                if open_of(record) != 0 {
                    open_road = true;
                    break;
                }
                if !road_roots.get(road.into()) {
                    road_roots.insert(road.into(), true);
                    roads += 1;
                }
            }
            adjacent = adjacent / 2;
            other += 1;
        }
        if open_road {
            break;
        }
        let mut adjacent = tables::row_adjacent_cities(north);
        let mut other: u8 = 1;
        while adjacent != 0 {
            if adjacent & 1 != 0 {
                let (city, record) = structures.find(ref_of(node_refs, other));
                if open_of(record) == 0 && !city_roots.get(city.into()) {
                    city_roots.insert(city.into(), true);
                    cities += 1;
                }
            }
            adjacent = adjacent / 2;
            other += 1;
        }
        tally = match tally {
            Option::Some(mut counted) => {
                counted.add(node);
                Option::Some(counted)
            },
            Option::None => Option::None,
        };
        let row = oriented::area_row(node.plan, node.orientation, node_area);
        let mut moves = tables::row_moves(row);
        let mut count = tables::row_move_count(row);
        while count > 0 {
            let (direction, at, rest) = oriented::next_move(moves);
            moves = rest;
            count -= 1;
            if at == 0 {
                continue;
            }
            let (x, y) = toward(node.x, node.y, direction);
            let key = position_key(x, y);
            let mut slot = slots.get(key);
            if slot == 0 {
                slot = StoreImpl::tile_slot_at(game_id, x, y);
                assert(slot != 0, 'Walk: open structure');
                slots.insert(key, slot);
            }
            let (next, next_refs) = StoreImpl::tile_of_slot(game_id, slot);
            let landing = oriented::area_of(oriented::plan_row(next.plan, next.orientation), at);
            let key = node_key(next.id, landing);
            if !visited.get(key) {
                visited.insert(key, true);
                nodes.append((next, next_refs, landing));
            }
        }
    }
    (open_road, roads, cities)
}

#[inline(always)]
fn node_key(tile_id: u32, area: u8) -> felt252 {
    (tile_id * 16 + area.into()).into()
}

#[inline(always)]
fn position_key(x: u32, y: u32) -> felt252 {
    x.into() * 0x100000000 + y.into()
}
