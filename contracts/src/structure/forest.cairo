//! Assessment of forests from their roots (phase P5, PR P5-5; D-18): the forest arm of step 4 of
//! the update algorithm, which `ForestCount` walked.
//!
//! A forest is a structure like the others (size, own open half-edges). What a root cannot keep is
//! the set of distinct roads and cities adjacent to the forest: it is computed by a scan, on the
//! move that closes the forest's own half-edges (`open == 0`).
//!
//! The scan walks the nodes of the forest (the walker of `walk.cairo`: one tile read per node,
//! every position is taken since `open == 0`) and, for each adjacent road or city area of a node,
//! takes the root of its record:
//! - an adjacent road whose root still has open half-edges keeps the forest open (2024 rule):
//!   nothing scores;
//! - otherwise the forest scores the distinct closed road roots plus the distinct closed city
//!   roots (D-18, P-45: what a Woodsman and a Herdsman scored, together). A city whose root is open
//!   is not counted (P-15, the correction of the 2024 walk, which could count an open city that a
//!   forest touched twice).
//!
//! D-19: the scan also counts the forest's own tiles per seat as it walks them (ruling 2: not the
//! tiles of the roads and cities around it), and the forest's points go to the seat of the most
//! tiles (`owners.cairo`). In a game with one player the scan is given no tally (`None`): it counts
//! nothing, builds no set, and the winner is the player.
//!
//! G7a (C3): the move's scan starts from the built tile with the side tiles the move has read
//! (`WalkerTrait::seeded`): it reads none of them again.

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::game::{Game, GameImpl};
use paved::models::tile::Tile;
use paved::store::{Store, StoreImpl};
use paved::structure::owners::{Tally, TallyTrait, player_of};
use paved::structure::placement::Neighborhood;
use paved::structure::record::{open_of, ref_of, size_of};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::tables;
use paved::structure::walk::{Walker, WalkerTrait};
use paved::types::category::{Category, CategoryImpl};

/// Scores the forest of `area` of the built `tile` (of refs `refs`), whose root `record` is closed,
/// unless an adjacent road is open: points `(roads + cities) x base x bonus(size)` to the owner of
/// the most forest tiles, one `Scored`, even with 0 points (the unit of the quests is the forest
/// closure). On a tie nobody scores: no points, `Scored` with player 0 and points 0, and the
/// forest still counts. `solo`: the game has one player, whose forest it is; nothing is counted.
/// `around`: the neighbourhood the move read around `tile`.
pub fn assess_forest(
    ref game: Game,
    tile: Tile,
    refs: u128,
    area: u8,
    record: u64,
    solo: bool,
    around: @Neighborhood,
    ref structures: Structures,
    ref store: Store,
) {
    // [Compute] The roads and cities around the forest, and its tiles per seat
    let mut tally: Option<Tally> = if solo {
        Option::None
    } else {
        Option::Some(TallyTrait::new())
    };
    let mut walker = WalkerTrait::seeded(tile, refs, area, ref structures, around);
    let (open_road, roads, cities) = scan_with(ref walker, ref structures, ref tally);
    if open_road {
        return;
    }

    // [Effect] Score the forest for its winner (the game's player in a game with one player)
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

    // [Event] Forest scored
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

/// Walks the forest of `area` of `tile` and returns whether an adjacent road is still open, the
/// number of distinct closed roads and the number of distinct closed cities adjacent to it; it
/// counts the forest's tiles in `tally` (nothing for `None`). The forest must be closed
/// (`open == 0` on its root), so that every position it needs is taken.
pub fn scan(
    tile: Tile, refs: u128, area: u8, ref structures: Structures, ref tally: Option<Tally>,
) -> (bool, u32, u32) {
    let mut walker = WalkerTrait::new(tile, refs, area, ref structures);
    scan_with(ref walker, ref structures, ref tally)
}

/// `scan`, its walk seeded with the side tiles of `around` (G7a, C3): a neighbourhood read in this
/// move, whose tiles storage still holds (`WalkerTrait::seeded`).
pub fn scan_seeded(
    tile: Tile,
    refs: u128,
    area: u8,
    around: @Neighborhood,
    ref structures: Structures,
    ref tally: Option<Tally>,
) -> (bool, u32, u32) {
    let mut walker = WalkerTrait::seeded(tile, refs, area, ref structures, around);
    scan_with(ref walker, ref structures, ref tally)
}

/// The scan of `scan`, on a walker made for it.
fn scan_with(
    ref walker: Walker, ref structures: Structures, ref tally: Option<Tally>,
) -> (bool, u32, u32) {
    let mut road_roots: Felt252Dict<bool> = Default::default();
    let mut city_roots: Felt252Dict<bool> = Default::default();
    let mut roads: u32 = 0;
    let mut cities: u32 = 0;
    let mut open_road = false;
    while let Option::Some((node, node_refs, node_area)) = walker.pop() {
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

        // [Compute] The node's tile for its seat, then the next nodes of the forest
        tally = match tally {
            Option::Some(mut counted) => {
                counted.add(node);
                Option::Some(counted)
            },
            Option::None => Option::None,
        };
        walker.expand(node, node_area);
    }
    (open_road, roads, cities)
}
