//! Assessment of forests from their roots (phase P5, PR P5-5): the forest arm of step 4 of the
//! update algorithm, which `ForestCount` walked.
//!
//! A forest is a structure like the others (size, own open half-edges, characters). What a root
//! cannot keep is the set of distinct roads and cities adjacent to the forest: it is computed by a
//! scan, only past the O(1) gate (`open == 0` and a Woodsman or a Herdsman on it).
//!
//! The scan walks the nodes of the forest (one tile read per node, every position is taken since
//! `open == 0`) and, for each adjacent road or city area of a node, takes the root of its record:
//! - an adjacent road whose root still has open half-edges keeps the forest open (2024 rule):
//!   nothing scores;
//! - the Woodsman scores the distinct closed road roots, the Herdsman the distinct closed city
//!   roots. A city whose root is open is not counted (P-15, the correction of the 2024 walk, which
//!   could count an open city that a forest touched twice).

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::builder::BuilderImpl;
use paved::models::game::{Game, GameImpl};
use paved::models::tile::Tile;
use paved::store::{Store, StoreImpl};
use paved::structure::assessment::recover;
use paved::structure::placement::role_bit;
use paved::structure::record::{chars_of, open_of, ref_of, size_of, without_chars};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::{oriented, tables};
use paved::types::category::{Category, CategoryImpl};
use paved::types::role::Role;

/// Scores the forest of `area` of the built `tile` (of refs `refs`) if it is closed and holds a
/// Woodsman or a Herdsman: one `Scored` per character (the Woodsman first), even with 0 points, and
/// the characters recovered. Returns whether it scored.
pub fn assess_forest(
    ref game: Game, tile: Tile, refs: u128, area: u8, ref structures: Structures, ref store: Store,
) -> bool {
    // [Check] The gate: no half-edge of the forest points to an empty position, and a character
    // stands on it (the only roles a forest takes are the Woodsman and the Herdsman)
    let (root, record) = structures.find(ref_of(refs, area));
    let chars = chars_of(record);
    if open_of(record) != 0 || chars == 0 {
        return false;
    }

    // [Compute] The roads and cities around the forest
    let (open_road, roads, cities) = scan(game.id, tile, refs, area, ref structures);
    if open_road {
        return false;
    }

    // [Effect] Solve and collect the characters, the Woodsman first
    let size: u32 = size_of(record).into();
    let mut recovered: u16 = 0;
    let woodsman: u8 = Role::Woodsman.into();
    if chars & role_bit(woodsman) != 0 {
        solve(ref game, size, roads, woodsman, ref structures, ref store);
        recovered = recovered | role_bit(woodsman);
    }
    let herdsman: u8 = Role::Herdsman.into();
    if chars & role_bit(herdsman) != 0 {
        solve(ref game, size, cities, herdsman, ref structures, ref store);
        recovered = recovered | role_bit(herdsman);
    }
    if recovered == 0 {
        return false;
    }
    structures.set(root, without_chars(record, recovered));
    true
}

/// Walks the forest of `area` of `tile` and returns whether an adjacent road is still open, the
/// number of distinct closed roads and the number of distinct closed cities adjacent to it. The
/// forest must be closed (`open == 0` on its root), so that every position it needs is taken.
pub fn scan(
    game_id: u32, tile: Tile, refs: u128, area: u8, ref structures: Structures,
) -> (bool, u32, u32) {
    let mut visited: Felt252Dict<bool> = Default::default();
    let mut road_roots: Felt252Dict<bool> = Default::default();
    let mut city_roots: Felt252Dict<bool> = Default::default();
    let mut roads: u32 = 0;
    let mut cities: u32 = 0;
    let mut open_road = false;
    let mut nodes: Array<(Tile, u128, u8)> = array![(tile, refs, area)];
    visited.insert(node_key(tile.id, area), true);
    while let Option::Some((node, node_refs, node_area)) = nodes.pop_front() {
        // [Compute] The roads around the node: each must be closed, and counts once
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

        // [Compute] The cities around the node: only a closed one counts, once
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

        // [Compute] The next nodes of the forest
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
            let (next, next_refs) = StoreImpl::tile_at(game_id, x, y);
            // [Check] The gate guarantees that every position the forest needs is taken
            assert(next.id != 0, 'Forest scan: open forest');
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

/// The points of the characters of `role` standing on a forest of `size` nodes with `distinct`
/// closed roads or cities around it: `distinct x base x bonus(size)`, one `Scored`, the character
/// recovered.
fn solve(
    ref game: Game,
    size: u32,
    distinct: u32,
    role: u8,
    ref structures: Structures,
    ref store: Store,
) {
    let (num, den) = compute_multiplier(size);
    let points = distinct * Category::Forest.base_points() * num / den;
    recover(ref game, ref structures, role);
    game.add_score(points);

    // [Event] Forest scored
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id,
                    player_id: game.player_id,
                    category: Category::Forest.into(),
                    size,
                    points,
                },
            ),
        );
}

/// The key of a node (an area of a tile) in the sets of a scan.
#[inline(always)]
fn node_key(tile_id: u32, area: u8) -> felt252 {
    (tile_id * 16 + area.into()).into()
}

/// The position next to `(x, y)` in `direction` (1 north-west, 2 north, 3 north-east, 4 east,
/// 5 south-east, 6 south, 7 south-west, 8 west).
#[inline(always)]
fn toward(x: u32, y: u32, direction: u8) -> (u32, u32) {
    match direction {
        1 => (x - 1, y + 1),
        2 => (x, y + 1),
        3 => (x + 1, y + 1),
        4 => (x + 1, y),
        5 => (x + 1, y - 1),
        6 => (x, y - 1),
        7 => (x - 1, y - 1),
        _ => (x - 1, y),
    }
}
