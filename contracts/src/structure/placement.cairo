//! Placement of a tile on the structure state (phase P5, PR P5-4): steps 1 and 2 of the update
//! algorithm of `docs/architecture/structure-state.md` (step 3, the character, left with D-18).
//!
//! The neighbourhood of a position is read once per move: the 8 tiles around it and their refs,
//! indexed by direction code (1 north-west, 2 north, 3 north-east, 4 east, 5 south-east, 6 south,
//! 7 south-west, 8 west; 0 unused), the zero tile where a position is empty. The tables read on
//! this path are the oriented rows (`oriented.cairo`): no rotation is computed.

use paved::models::tile::{Tile, TileImpl, ZeroableTile};
use paved::store::{Store, StoreImpl};
use paved::structure::record::{add_ref, close_one, founded, ref_of, sid, with_ref};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::{oriented, tables};

pub mod errors {
    pub const TILE_NO_NEIGHBORS: felt252 = 'Tile: no neighbors';
    pub const TILE_NOT_PLACED: felt252 = 'Tile: not placed';
    pub const TILE_CANNOT_PLACE: felt252 = 'Tile: cannot place';
    pub const INVALID_BIT: felt252 = 'Structure: invalid bit';
}

/// The tiles around a position, their refs and, for the sides, their oriented plan rows, by
/// direction code.
#[derive(Copy, Drop)]
pub struct Neighborhood {
    pub tiles: Span<Tile>,
    pub refs: Span<u128>,
    /// The oriented plan row of the north, east, south and west tiles (0 for the corners and the
    /// empty positions): where the moves of a new tile land.
    pub rows: Span<u128>,
    /// The directions whose tile holds a wonder (bit `direction`).
    pub wonders: u16,
    /// The directions whose position is taken (bit `direction`). A diagonal tile is read only if it
    /// holds a wonder: the other diagonal tiles are the zero tile here.
    pub taken: u16,
}

#[generate_trait]
pub impl NeighborhoodImpl of NeighborhoodTrait {
    /// Reads the 8 positions around `(x, y)` and the tile of each taken one.
    fn read(game_id: u32, x: u32, y: u32) -> Neighborhood {
        // Avoid loop for gas efficiency
        let (nw_taken, nw, nw_refs) = StoreImpl::wonder_at(game_id, x - 1, y + 1);
        let (n, n_refs) = StoreImpl::tile_at(game_id, x, y + 1);
        let (ne_taken, ne, ne_refs) = StoreImpl::wonder_at(game_id, x + 1, y + 1);
        let (e, e_refs) = StoreImpl::tile_at(game_id, x + 1, y);
        let (se_taken, se, se_refs) = StoreImpl::wonder_at(game_id, x + 1, y - 1);
        let (s, s_refs) = StoreImpl::tile_at(game_id, x, y - 1);
        let (sw_taken, sw, sw_refs) = StoreImpl::wonder_at(game_id, x - 1, y - 1);
        let (w, w_refs) = StoreImpl::tile_at(game_id, x - 1, y);
        let taken = taken_bit(nw_taken, 0x2)
            | taken_bit(n.is_non_zero(), 0x4)
            | taken_bit(ne_taken, 0x8)
            | taken_bit(e.is_non_zero(), 0x10)
            | taken_bit(se_taken, 0x20)
            | taken_bit(s.is_non_zero(), 0x40)
            | taken_bit(sw_taken, 0x80)
            | taken_bit(w.is_non_zero(), 0x100);
        let wonders = wonder_bit(nw, 0x2)
            | wonder_bit(n, 0x4)
            | wonder_bit(ne, 0x8)
            | wonder_bit(e, 0x10)
            | wonder_bit(se, 0x20)
            | wonder_bit(s, 0x40)
            | wonder_bit(sw, 0x80)
            | wonder_bit(w, 0x100);
        Neighborhood {
            tiles: array![ZeroableTile::zero(), nw, n, ne, e, se, s, sw, w].span(),
            refs: array![0, nw_refs, n_refs, ne_refs, e_refs, se_refs, s_refs, sw_refs, w_refs]
                .span(),
            rows: array![0, 0, side_row(n), 0, side_row(e), 0, side_row(s), 0, side_row(w)].span(),
            wonders,
            taken,
        }
    }

    /// The tile in `direction`, the zero tile when the position is empty.
    #[inline(always)]
    fn tile(self: @Neighborhood, direction: u8) -> Tile {
        *(*self.tiles).at(direction.into())
    }

    /// The structure id of `area` of the tile in `direction`.
    #[inline(always)]
    fn reference(self: @Neighborhood, direction: u8, area: u8) -> u32 {
        ref_of(*(*self.refs).at(direction.into()), area)
    }

    /// The area of the side tile in `direction` (2, 4, 6 or 8) on its `spot` (0 for no tile).
    #[inline(always)]
    fn landing(self: @Neighborhood, direction: u8, spot: u8) -> u8 {
        oriented::area_of(*(*self.rows).at(direction.into()), spot)
    }
}

/// The category (`Category` code) of the middle spot of the edge of a placed tile that looks in
/// `direction` (2 north, 4 east, 6 south or 8 west): what `Layout::is_compatible` compares.
pub fn edge_category(plan: u8, orientation: u8, direction: u8) -> u8 {
    let area = oriented::area_of(oriented::plan_row(plan, orientation), direction + 1);
    tables::row_category(oriented::area_row(plan, orientation, area))
}

/// Checks that the built tile (placed: orientation and position set) fits its side neighbours, as
/// `Tile::can_place` did on the layouts: there is at least one, and each facing edge has the same
/// category on both tiles.
pub fn assert_fits(tile: Tile, around: @Neighborhood) {
    let mut found = false;
    let mut fits = true;
    let mut direction: u8 = tables::NORTH;
    while direction <= tables::WEST {
        let neighbor = around.tile(direction);
        if neighbor.is_non_zero() {
            // [Check] The tile is placed (the layout of an unplaced tile asserts it)
            assert(tile.orientation != 0, errors::TILE_NOT_PLACED);
            let opposite = if direction <= tables::EAST {
                direction + 4
            } else {
                direction - 4
            };
            if edge_category(
                tile.plan, tile.orientation, direction,
            ) != edge_category(neighbor.plan, neighbor.orientation, opposite) {
                fits = false;
            }
            found = true;
        }
        direction += 2;
    }
    assert(found, errors::TILE_NO_NEIGHBORS);
    assert(fits, errors::TILE_CANNOT_PLACE);
}

#[inline(always)]
fn taken_bit(taken: bool, bit: u16) -> u16 {
    if taken {
        bit
    } else {
        0
    }
}

#[inline(always)]
fn wonder_bit(tile: Tile, bit: u16) -> u16 {
    if oriented::wonder_area(tile.plan) != 0 {
        bit
    } else {
        0
    }
}

#[inline(always)]
fn side_row(tile: Tile) -> u128 {
    if tile.is_zero() {
        return 0;
    }
    oriented::plan_row(tile.plan, tile.orientation)
}

/// Places a tile written without a build (the starter tile at spawn, a board written by a test) on
/// the structure state, with the neighbours that are there, and writes the pages. Returns its refs
/// (0 for a plan without areas).
pub fn place_alone(tile: Tile) -> u128 {
    // [Info] A plan without areas has no structure: the storage round trips of `e2e/store.cairo`
    // write such a tile at the maximum values
    if oriented::record_areas(tile.plan) == 0 {
        return 0;
    }
    let around = NeighborhoodTrait::read(tile.game_id, tile.x, tile.y);
    let mut structures = StructuresTrait::new(tile.game_id);
    let refs = place(ref structures, tile, @around);
    structures.flush(StoreImpl::new());
    refs
}

/// Places the nodes of `tile` (placed, orientation and position set) on the structure state and
/// returns its refs. Step 1: the half-edges of the neighbours that point at the tile close, the
/// wonders' here (one per direction, proved by the plan tables) and every other one as the move
/// of the tile that answers it (the plan tables prove the counts equal area by area). Step 2: each
/// area with moves founds a structure, or joins the structures it reaches into one.
pub fn place(ref structures: Structures, tile: Tile, around: @Neighborhood) -> u128 {
    // [Effect] The wonders around: their half-edge towards the tile closes (it has no spot)
    if *around.wonders != 0 {
        let mut direction: u8 = 1;
        while direction <= 8 {
            if *around.wonders & bit(direction) != 0 {
                let wonder = oriented::wonder_area(around.tile(direction).plan);
                let (root, record) = structures.find(around.reference(direction, wonder));
                structures.set(root, close_one(record));
            }
            direction += 1;
        }
    }

    // [Effect] The nodes of the tile, in area order
    let mut areas = oriented::record_areas(tile.plan);
    // [Info] More than 4 areas with moves take a second slot of the page
    structures.fresh(tile.id, areas > 0xffff);
    let mut refs: u128 = 0;
    // [Info] The areas that joined structures, and whether a join made a root a child
    let mut merged: u128 = 0;
    let mut reparented = false;
    while areas != 0 {
        let area: u8 = (areas & 0xf).try_into().unwrap();
        areas = areas / 0x10;
        let row = oriented::area_row(tile.plan, tile.orientation, area);
        let mut moves = tables::row_moves(row);
        let mut count = tables::row_move_count(row);
        let mut open: u16 = 0;
        let mut roots: Array<u32> = array![];
        while count > 0 {
            let (direction, at, rest) = oriented::next_move(moves);
            moves = rest;
            count -= 1;
            if at == 0 {
                // A wonder's half-edge: it asks only for the tile
                if *around.taken & bit(direction) == 0 {
                    open += 1;
                }
                continue;
            }
            // [Info] A move with a spot crosses a side: the side's row is 0 when it is empty
            let landing = around.landing(direction, at);
            if landing == 0 {
                open += 1;
                continue;
            }
            // [Effect] The half-edge of the neighbour that answers this move closes
            let (root, record) = structures.find(around.reference(direction, landing));
            structures.set(root, close_one(record));
            if !contains(roots.span(), root) {
                roots.append(root);
            }
        }
        let reference = if roots.len() == 0 {
            let founded_sid = sid(tile.id, tables::row_record_index(row));
            structures.set(founded_sid, founded(open));
            founded_sid
        } else {
            merged = merged | area_bit(area);
            if roots.len() > 1 {
                reparented = true;
            }
            structures.merge(roots.span(), open)
        };
        refs = add_ref(refs, area, reference);
    }

    // [Effect] Every ref of the tile points at the final root: a later area may have joined the
    // structure of an earlier one into another (only joined areas can move, and only when a join
    // made a root a child)
    if reparented {
        let mut area: u8 = 1;
        while area <= tables::AREA_COUNT {
            if merged & area_bit(area) != 0 {
                let reference = ref_of(refs, area);
                let (root, _) = structures.find(reference);
                if root != reference {
                    refs = with_ref(refs, area, root);
                }
            }
            area += 1;
        }
    }
    refs
}

/// The bit `index` of a 16-bit set (of directions, of areas; 0..=15).
#[inline(always)]
pub fn bit(index: u8) -> u16 {
    match index {
        0 => 0x1,
        1 => 0x2,
        2 => 0x4,
        3 => 0x8,
        4 => 0x10,
        5 => 0x20,
        6 => 0x40,
        7 => 0x80,
        8 => 0x100,
        9 => 0x200,
        10 => 0x400,
        11 => 0x800,
        12 => 0x1000,
        13 => 0x2000,
        14 => 0x4000,
        15 => 0x8000,
        _ => {
            assert(false, errors::INVALID_BIT);
            0
        },
    }
}

#[inline(always)]
fn area_bit(area: u8) -> u128 {
    bit(area).into()
}

/// Whether `roots` holds `root`.
#[inline(always)]
pub fn contains(roots: Span<u32>, root: u32) -> bool {
    let mut found = false;
    for candidate in roots {
        if *candidate == root {
            found = true;
            break;
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use paved::constants::CENTER;
    use paved::models::index::Tile;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::structure::tables;
    use paved::tests::setup::setup;
    use paved::types::category::Category;
    use paved::types::layout::LayoutImpl;
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::edge_category;

    /// The category of every edge of every placed plan is the one the layout gives: `assert_fits`
    /// (equal categories on the facing edges) answers as `Layout::is_compatible` did.
    #[test]
    fn test_placement_edge_categories_equal_the_layouts() {
        let mut plan: u8 = 1;
        while plan <= tables::PLAN_COUNT {
            let mut orientation: u8 = 1;
            while orientation <= 4 {
                let layout = LayoutImpl::from(plan.into(), orientation.into());
                let mut direction: u8 = tables::NORTH;
                while direction <= tables::WEST {
                    let spot: Spot = (direction + 1).into();
                    let expected: Category = layout.get_category(spot);
                    let expected: u8 = expected.into();
                    assert_eq!(edge_category(plan, orientation, direction), expected);
                    direction += 2;
                }
                orientation += 1;
            }
            plan += 1;
        }
    }

    /// A tile written alone is placed, and written again as it is.
    #[test]
    fn test_placement_a_tile_written_alone_is_placed_and_kept() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let tile = Tile {
                    game_id,
                    id: 90,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 10,
                    y: CENTER + 10,
                };
                let s = StoreImpl::new();
                s.set_tile(tile);
                let (_, refs) = StoreImpl::tile_with_refs(game_id, tile.id);
                assert!(refs != 0);
                // Written again, it keeps its refs
                s.set_tile(tile);
                let (kept, kept_refs) = StoreImpl::tile_with_refs(game_id, tile.id);
                assert_eq!(kept, tile);
                assert_eq!(kept_refs, refs);
            },
        );
    }

    /// The plan, the orientation and the position of a placed tile are the ones its records were
    /// built from: writing it with another one fails.
    #[test]
    #[should_panic(expected: 'Tile: placement is fixed')]
    fn test_placement_a_placed_tile_keeps_its_plan() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let s = StoreImpl::new();
                let (starter, _) = StoreImpl::tile_with_refs(game_id, 1);
                s.set_tile(Tile { plan: Plan::CCCCCCCCC.into(), ..starter });
            },
        );
    }

    #[test]
    #[should_panic(expected: 'Tile: placement is fixed')]
    fn test_placement_a_placed_tile_keeps_its_orientation() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let s = StoreImpl::new();
                let (starter, _) = StoreImpl::tile_with_refs(game_id, 1);
                s.set_tile(Tile { orientation: Orientation::North.into(), ..starter });
            },
        );
    }

    #[test]
    #[should_panic(expected: 'Tile: placement is fixed')]
    fn test_placement_a_placed_tile_keeps_its_x() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let s = StoreImpl::new();
                let (starter, _) = StoreImpl::tile_with_refs(game_id, 1);
                s.set_tile(Tile { x: starter.x + 1, ..starter });
            },
        );
    }

    #[test]
    #[should_panic(expected: 'Tile: placement is fixed')]
    fn test_placement_a_placed_tile_keeps_its_y() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let s = StoreImpl::new();
                let (starter, _) = StoreImpl::tile_with_refs(game_id, 1);
                s.set_tile(Tile { y: starter.y + 1, ..starter });
            },
        );
    }
}
