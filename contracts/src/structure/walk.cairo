//! The walk of a closed structure's nodes (D-19b): one walker for the forest scan
//! (`forest.cairo`) and for the majority count of a road or a city (`owners.cairo`).
//!
//! A node is an area of a tile. From a node, the walk follows the moves of its area (the oriented
//! rows, `oriented.cairo`) to the area they land on, so it visits exactly the nodes of the
//! structure. The structure must be closed (`open == 0` on its root): every position a move looks
//! at is taken. Each tile is read once (its slot is kept by position) and each node is visited
//! once. The tile the move builds is not in storage yet (`Structures::flush` writes it): the walk
//! takes it from the cache of the move.
//!
//! G7a (C3): a walk from the tile a move builds can be seeded with the move's neighbourhood
//! (`WalkerTrait::seeded`). The move has already read its four side tiles and their refs, which
//! storage still holds as read (the move writes nothing to them before `flush`): a node on a side
//! tile is taken from there instead of reading its position and its slot again.

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::tile::Tile;
use paved::store::StoreImpl;
use paved::structure::placement::{Neighborhood, NeighborhoodTrait};
use paved::structure::state::Structures;
use paved::structure::{oriented, tables};

pub mod errors {
    pub const OPEN_STRUCTURE: felt252 = 'Walk: open structure';
}

#[derive(Destruct)]
pub struct Walker {
    game_id: u32,
    /// The nodes visited, by `node_key`.
    visited: Felt252Dict<bool>,
    /// The slots of the tiles read, by position: a tile next to several nodes is read once.
    slots: Felt252Dict<felt252>,
    /// The nodes to visit, with their tile's refs.
    nodes: Array<(Tile, u128, u8)>,
    /// The position of the built tile, whose side tiles `sides` holds.
    x: u32,
    y: u32,
    /// The side tiles of the built tile and their refs, by direction, as the move read them; its
    /// `taken` bits say which are there (0 for a walk that is not seeded).
    sides: Neighborhood,
}

#[generate_trait]
pub impl WalkerImpl of WalkerTrait {
    /// A walk from `area` of `tile` (of refs `refs`), in the game of `structures`, whose built tile
    /// it reads from there.
    fn new(tile: Tile, refs: u128, area: u8, ref structures: Structures) -> Walker {
        let none = Neighborhood {
            tiles: array![].span(),
            refs: array![].span(),
            rows: array![].span(),
            wonders: 0,
            taken: 0,
        };
        Self::seeded(tile, refs, area, ref structures, @none)
    }

    /// `new`, for a walk from the tile the move built (`tile`), with the neighbourhood the move
    /// read around it: the side tiles it holds are not read again.
    fn seeded(
        tile: Tile, refs: u128, area: u8, ref structures: Structures, around: @Neighborhood,
    ) -> Walker {
        let mut slots: Felt252Dict<felt252> = Default::default();
        if structures.built.id != 0 {
            let built = structures.built;
            slots
                .insert(
                    position_key(built.x, built.y),
                    StoreImpl::tile_slot(built, structures.built_refs),
                );
        }
        let mut visited: Felt252Dict<bool> = Default::default();
        visited.insert(node_key(tile.id, area), true);
        Walker {
            game_id: structures.game_id,
            visited,
            slots,
            nodes: array![(tile, refs, area)],
            x: tile.x,
            y: tile.y,
            sides: *around,
        }
    }

    /// The next node of the walk, its tile's refs and its area; `None` once every node is visited.
    /// The caller passes it to `expand` to go on from it.
    #[inline(always)]
    fn pop(ref self: Walker) -> Option<(Tile, u128, u8)> {
        self.nodes.pop_front()
    }

    /// Adds the nodes that the moves of `area` of `tile` land on, those not visited yet. Inlined
    /// in its two callers, as the forest scan's loop was before the walker.
    #[inline(always)]
    fn expand(ref self: Walker, tile: Tile, area: u8) {
        let row = oriented::area_row(tile.plan, tile.orientation, area);
        let mut moves = tables::row_moves(row);
        let mut count = tables::row_move_count(row);
        while count > 0 {
            let (direction, at, rest) = oriented::next_move(moves);
            moves = rest;
            count -= 1;
            if at == 0 {
                continue;
            }
            let (x, y) = toward(tile.x, tile.y, direction);
            let side = self.side_at(x, y);
            let (next, next_refs) = if side != 0 {
                (self.sides.tile(side), *self.sides.refs.at(side.into()))
            } else {
                let key = position_key(x, y);
                let mut slot = self.slots.get(key);
                if slot == 0 {
                    slot = StoreImpl::tile_slot_at(self.game_id, x, y);
                    // [Check] A closed structure has every position it needs taken
                    assert(slot != 0, errors::OPEN_STRUCTURE);
                    self.slots.insert(key, slot);
                }
                StoreImpl::tile_of_slot(self.game_id, slot)
            };
            let landing = oriented::area_of(oriented::plan_row(next.plan, next.orientation), at);
            let key = node_key(next.id, landing);
            if !self.visited.get(key) {
                self.visited.insert(key, true);
                self.nodes.append((next, next_refs, landing));
            }
        }
    }
}

#[generate_trait]
impl SidesImpl of SidesTrait {
    /// The direction (2, 4, 6 or 8) of `(x, y)` from the built tile when it is a side position
    /// whose tile the walk holds, 0 otherwise.
    #[inline(always)]
    fn side_at(self: @Walker, x: u32, y: u32) -> u8 {
        let taken = *self.sides.taken;
        if taken == 0 {
            return 0;
        }
        let (cx, cy) = (*self.x, *self.y);
        let direction = if x == cx {
            if y == cy + 1 {
                tables::NORTH
            } else if y + 1 == cy {
                tables::SOUTH
            } else {
                0
            }
        } else if y == cy {
            if x == cx + 1 {
                tables::EAST
            } else if x + 1 == cx {
                tables::WEST
            } else {
                0
            }
        } else {
            0
        };
        if direction != 0 && taken & side_bit(direction) != 0 {
            direction
        } else {
            0
        }
    }
}

/// The bit of a side direction in `Neighborhood::taken`.
#[inline(always)]
fn side_bit(direction: u8) -> u16 {
    match direction {
        2 => 0x4,
        4 => 0x10,
        6 => 0x40,
        _ => 0x100,
    }
}

/// The key of a node (an area of a tile) in the sets of a walk.
#[inline(always)]
fn node_key(tile_id: u32, area: u8) -> felt252 {
    (tile_id * 16 + area.into()).into()
}

/// The key of a position in the sets of a walk.
#[inline(always)]
fn position_key(x: u32, y: u32) -> felt252 {
    x.into() * 0x100000000 + y.into()
}

/// The position next to `(x, y)` in `direction` (1 north-west, 2 north, 3 north-east, 4 east,
/// 5 south-east, 6 south, 7 south-west, 8 west).
#[inline(always)]
pub fn toward(x: u32, y: u32, direction: u8) -> (u32, u32) {
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
