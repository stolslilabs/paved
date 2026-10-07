//! Move-local cache of the structure records (phase P5, PR P5-4).
//!
//! A move reads each page slot it needs once, keeps its four records in a `Felt252Dict` keyed by
//! structure id, and writes each slot it changed once, at the end (`flush`). A page slot is named
//! by `sid / 4` (`tile_id * 4 + slot`): the four records of a slot share it. The union-find runs on
//! the cache, on packed records (`record.cairo`): `find` follows parents to the root, `merge` joins
//! roots by size.
//!
//! The same cache holds what the assessment changes outside the pages, so that each slot of a move
//! is read once and written once: the `Characters` word of the game (read at the first character,
//! written by `flush` if a character was placed or recovered) and the built tile (written by
//! `flush`
//! with its position, after the assessment, which a recovered character on it changes).

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::character::Char;
use paved::models::tile::{Tile, ZeroableTile};
use paved::store::{Store, StoreImpl};
use paved::structure::record::{
    Record, RecordTrait, chars_of, child_of, grow, open_of, pack_slot, parent_of, root_of, size_of,
    unpack_slot,
};

// Constants

/// Marks a cached record as read (a record whose 48 bits are 0 is a valid "no record"). The
/// readers of `record.cairo` ignore it.
const LOADED: u64 = 0x1000000000000;
/// Marks a cached record as changed by the move.
const DIRTY: u64 = 0x2000000000000;
const MASK_48: u64 = 0xffffffffffff;

pub mod errors {
    pub const NO_STRUCTURE: felt252 = 'Structure: none';
}

#[derive(Destruct)]
pub struct Structures {
    pub game_id: u32,
    /// Packed record by structure id, with `LOADED` once read or written and `DIRTY` once
    /// written.
    records: Felt252Dict<u64>,
    /// Page slots already in `records`.
    loaded: Felt252Dict<bool>,
    /// The page slots in `records`, in the order they came in: `flush` writes those that hold a
    /// changed record.
    slots: Array<u32>,
    /// The `Characters` word of the game, once read (`characters_state` 1) or changed (2).
    characters: u128,
    characters_state: u8,
    /// The tile built by the move (id 0 for none) and its refs: `flush` writes it with its
    /// position.
    pub built: Tile,
    pub built_refs: u128,
}

#[generate_trait]
pub impl StructuresImpl of StructuresTrait {
    #[inline(always)]
    fn new(game_id: u32) -> Structures {
        Structures {
            game_id,
            records: Default::default(),
            loaded: Default::default(),
            slots: array![],
            characters: 0,
            characters_state: 0,
            built: ZeroableTile::zero(),
            built_refs: 0,
        }
    }

    /// Declares the tile the move built. It is written by `flush`, once, after the assessment: a
    /// character recovered from it is cleared here, and a scan that reaches it reads it from here.
    #[inline(always)]
    fn track(ref self: Structures, tile: Tile, refs: u128) {
        self.built = tile;
        self.built_refs = refs;
    }

    /// The `Characters` word of the game, read the first time.
    fn characters_word(ref self: Structures) -> u128 {
        if self.characters_state == 0 {
            self.characters = StoreImpl::characters_word(self.game_id);
            self.characters_state = 1;
        }
        self.characters
    }

    /// The character of `role` (zero, `tile_id` 0, when it is not placed).
    fn character(ref self: Structures, player_id: felt252, role: u8) -> Char {
        let word = self.characters_word();
        StoreImpl::unpack_character(self.game_id, player_id, role, word)
    }

    /// Writes a character in the cached `Characters` word; `flush` writes the slot.
    fn put_character(ref self: Structures, character: Char) {
        let word = self.characters_word();
        self.characters = StoreImpl::with_character(word, character);
        self.characters_state = 2;
    }

    /// Declares the page of a tile that has just been placed, of one slot or two: it holds no
    /// record in storage, so its slots are never read.
    #[inline(always)]
    fn fresh(ref self: Structures, tile_id: u32, two_slots: bool) {
        let key = tile_id * 4;
        self.loaded.insert(key.into(), true);
        self.slots.append(key);
        if two_slots {
            self.loaded.insert((key + 1).into(), true);
            self.slots.append(key + 1);
        }
    }

    /// Returns the packed record of a structure id, reading its page slot the first time.
    fn record(ref self: Structures, sid: u32) -> u64 {
        let value = self.records.get(sid.into());
        if value != 0 {
            return value;
        }
        let key = sid / 4;
        if self.loaded.get(key.into()) {
            return 0;
        }
        let word = StoreImpl::new()
            .structure_slot(self.game_id, key / 4, (key % 4).try_into().unwrap());
        let (r0, r1, r2, r3) = unpack_slot(word);
        let first = key * 4;
        self.records.insert(first.into(), r0 | LOADED);
        self.records.insert((first + 1).into(), r1 | LOADED);
        self.records.insert((first + 2).into(), r2 | LOADED);
        self.records.insert((first + 3).into(), r3 | LOADED);
        self.loaded.insert(key.into(), true);
        self.slots.append(key);
        self.records.get(sid.into())
    }

    /// The record of a structure id, unpacked (for the checks and the tests).
    fn unpacked(ref self: Structures, sid: u32) -> Record {
        RecordTrait::unpack(self.record(sid) & MASK_48)
    }

    /// Writes a packed record of a slot in the cache (read before, or of a fresh page); its page
    /// slot is written by `flush`.
    #[inline(always)]
    fn set(ref self: Structures, sid: u32, record: u64) {
        self.records.insert(sid.into(), record | LOADED | DIRTY);
    }

    /// Returns the root of a structure id and its packed record.
    fn find(ref self: Structures, sid: u32) -> (u32, u64) {
        assert(sid != 0, errors::NO_STRUCTURE);
        let mut current = sid;
        let mut record = self.record(current);
        let mut parent = parent_of(record);
        while parent != 0 {
            current = parent;
            record = self.record(current);
            parent = parent_of(record);
        }
        (current, record)
    }

    /// Joins distinct roots and a new node with `open` half-edges to empty positions into one
    /// structure. The root of the largest size stays root (the lowest id on a tie, so the result
    /// does not depend on the order of `roots`); the others point at it. Returns the root.
    fn merge(ref self: Structures, roots: Span<u32>, open: u16) -> u32 {
        let mut root: u32 = *roots.at(0);
        if roots.len() == 1 {
            // [Effect] The node joins one structure
            let record = self.record(root);
            self.set(root, grow(record, open));
            return root;
        }
        let best = self.record(root);
        // [Compute] The root that stays
        let mut best_size = size_of(best);
        let mut index = 1;
        while index < roots.len() {
            let candidate = *roots.at(index);
            let size = size_of(self.record(candidate));
            if size > best_size || (size == best_size && candidate < root) {
                root = candidate;
                best_size = size;
            }
            index += 1;
        }
        // [Effect] The others point at it, their sizes, opens and characters go to it
        let mut size: u16 = 1;
        let mut opens: u16 = open;
        let mut chars: u16 = 0;
        for other in roots {
            let record = self.record(*other);
            size += size_of(record);
            opens += open_of(record);
            chars = chars | chars_of(record);
            if *other != root {
                self.set(*other, child_of(record, root));
            }
        }
        self.set(root, root_of(size, opens, chars));
        root
    }

    /// Writes every page slot that holds a record the move changed, once, then the `Characters`
    /// word if the move changed it, and the built tile.
    fn flush(ref self: Structures, store: Store) {
        if self.characters_state == 2 {
            StoreImpl::set_characters_word(self.game_id, self.characters);
            self.characters_state = 1;
        }
        if self.built.id != 0 {
            store.set_placed_tile(self.built, self.built_refs);
        }
        while let Option::Some(key) = self.slots.pop_front() {
            let first = key * 4;
            let r0 = self.records.get(first.into());
            let r1 = self.records.get((first + 1).into());
            let r2 = self.records.get((first + 2).into());
            let r3 = self.records.get((first + 3).into());
            if (r0 | r1 | r2 | r3) & DIRTY != 0 {
                let word = pack_slot(r0 & MASK_48, r1 & MASK_48, r2 & MASK_48, r3 & MASK_48);
                store
                    .set_structure_slot(self.game_id, key / 4, (key % 4).try_into().unwrap(), word);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use paved::structure::record::{Record, founded, root_of, sid};
    use paved::structure::state::{Structures, StructuresTrait};
    use paved::tests::setup::setup;
    use paved::types::mode::Mode;
    use snforge_std::interact_with_state;

    /// The storage of a deployed game contract, where no game is spawned: the pages of game 7 are
    /// empty.
    fn contract() -> starknet::ContractAddress {
        let (store, _, _) = setup::spawn_game(Mode::None);
        store.contract
    }

    fn found_nodes(ref structures: Structures, tile_id: u32, count: u8) {
        structures.fresh(tile_id, count > 4);
        let mut index: u8 = 0;
        while index < count {
            structures.set(sid(tile_id, index), founded(1));
            index += 1;
        }
    }

    fn union_by_size(ref structures: Structures) {
        // Three structures founded on tile 10 (sizes 1), then a node joins the last two
        found_nodes(ref structures, 10, 3);
        let a = sid(10, 0);
        let b = sid(10, 1);
        let c = sid(10, 2);
        let bc = structures.merge(array![c, b].span(), 2);
        // A tie keeps the lowest id, whatever the order
        assert_eq!(bc, b);
        assert_eq!(structures.unpacked(b), Record { parent: 0, size: 3, open: 4, chars: 0 });
        assert_eq!(structures.unpacked(c).parent.into(), b);
        // The larger structure stays root, though its id is higher
        let abc = structures.merge(array![a, b].span(), 0);
        assert_eq!(abc, b);
        assert_eq!(structures.unpacked(a).parent.into(), b);
        let (root, _) = structures.find(c);
        assert_eq!(root, b);
        assert_eq!(structures.unpacked(b), Record { parent: 0, size: 5, open: 5, chars: 0 });
        // A node that joins one structure grows it
        let grown = structures.merge(array![b].span(), 3);
        assert_eq!(grown, b);
        assert_eq!(structures.unpacked(b), Record { parent: 0, size: 6, open: 8, chars: 0 });
    }

    #[test]
    fn test_structures_union_by_size() {
        interact_with_state(
            contract(),
            || {
                let mut structures = StructuresTrait::new(7);
                union_by_size(ref structures);
            },
        );
    }

    fn find_depth(ref structures: Structures) {
        // Merging equal sizes pairwise doubles the size at each level: 16 nodes give a depth of
        // 4, the bound log2(n) of union by size.
        let mut tile_id: u32 = 20;
        let mut level: Array<u32> = array![];
        while tile_id < 36 {
            found_nodes(ref structures, tile_id, 1);
            level.append(sid(tile_id, 0));
            tile_id += 1;
        }
        let mut depth = 0;
        while level.len() > 1 {
            let mut next: Array<u32> = array![];
            let mut span = level.span();
            while let Option::Some(first) = span.pop_front() {
                let second = span.pop_front().unwrap();
                // A union of two roots without a new node, as the tests can: the second root
                // points at the first, sizes add
                let (_, record) = structures.find(*first);
                let (_, other) = structures.find(*second);
                let size = paved::structure::record::size_of(record)
                    + paved::structure::record::size_of(other);
                structures.set(*second, paved::structure::record::child_of(other, *first));
                structures.set(*first, root_of(size, 0, 0));
                next.append(*first);
            }
            level = next;
            depth += 1;
        }
        assert_eq!(depth, 4);
        // The deepest node reaches the root in `depth` steps
        let (root, record) = structures.find(sid(35, 0));
        assert_eq!(root, sid(20, 0));
        assert_eq!(paved::structure::record::size_of(record), 16);
        let mut steps = 0;
        let mut current = sid(35, 0);
        while structures.unpacked(current).parent != 0 {
            current = structures.unpacked(current).parent.into();
            steps += 1;
        }
        assert_eq!(steps, 4);
    }

    #[test]
    fn test_structures_find_depth_of_union_by_size() {
        interact_with_state(
            contract(),
            || {
                let mut structures = StructuresTrait::new(7);
                find_depth(ref structures);
            },
        );
    }

    fn pages_round_trip(ref structures: Structures) {
        // Records of two slots of one page, written then read back from storage
        found_nodes(ref structures, 12, 6);
        structures.set(sid(12, 5), root_of(9, 3, 0x82));
        structures.flush(paved::store::StoreImpl::new());
        let mut fresh = StructuresTrait::new(7);
        assert_eq!(fresh.unpacked(sid(12, 0)), Record { parent: 0, size: 1, open: 1, chars: 0 });
        assert_eq!(fresh.unpacked(sid(12, 5)), Record { parent: 0, size: 9, open: 3, chars: 0x82 });
        assert_eq!(fresh.unpacked(sid(12, 6)), Record { parent: 0, size: 0, open: 0, chars: 0 });
        assert_eq!(fresh.unpacked(sid(13, 0)), Record { parent: 0, size: 0, open: 0, chars: 0 });
    }

    #[test]
    fn test_structures_pages_round_trip() {
        interact_with_state(
            contract(),
            || {
                let mut structures = StructuresTrait::new(7);
                pages_round_trip(ref structures);
            },
        );
    }
}
