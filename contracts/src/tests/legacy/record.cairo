//! Structure records and record pages (phase P5, PR P5-4).
//!
//! A record is the node of the union-find that holds a structure (a connected set of tile areas of
//! one category). It is created for a node only when the node founds a structure, and it is named
//! by its structure id `sid = tile_id * 16 + record_index`, where `record_index` is the rank of the
//! founding area among the areas of its plan that have moves (`tables::record_index`). The id says
//! where the record lives without reading the tile: page of `tile_id`, slot `record_index / 4`,
//! position `record_index % 4`. Tile ids stay below 256 (`tile_count` is a `u8` in storage), so an
//! id fits in 12 bits, and 0 is no structure.
//!
//! Record, 48 bits (low bits first):
//!
//! | Bits | Field | Meaning |
//! |---|---|---|
//! | 0..12 | `parent` | `sid` of the parent; 0 for a root |
//! | 12..22 | `size` | nodes of the structure (a root only) |
//! | 22..32 | `open` | half-edges of its nodes that point to an empty position (a root only) |
//! | 32..48 | `chars` | role bitmap of the characters on it, bit `r` for role `r` (a root only) |
//!
//! Refs (`u128`, kept in the high bits of the tile's slot): for each area 1..=9 of a placed tile,
//! 12 bits at `12 (area - 1)`, the structure id the node was given when the tile was placed; 0 for
//! an area without moves. `find` from there gives the current root.
//!
//! Page slot (`felt252`): four records, two in each 128-bit half (positions 0 and 1 in the low
//! half, 2 and 3 in the high half, 48 bits apart). A plan has at most 8 areas with moves, so a page
//! is one slot, or two for the plans of more than 4 such areas (the three crossings `sfrfrf*`).

// Constants

pub const RECORDS_PER_SLOT: u8 = 4;
pub const MAX_PARENT: u16 = 0xfff;
pub const MAX_SIZE: u16 = 0x3ff;
pub const MAX_OPEN: u16 = 0x3ff;

const TWO_POW_12: u64 = 0x1000;
const TWO_POW_22: u64 = 0x400000;
const TWO_POW_32: u64 = 0x100000000;
const TWO_POW_48: u128 = 0x1000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const MASK_10: u64 = 0x3ff;
const OPEN_MASK: u64 = 0xffc00000;
const MASK_12: u64 = 0xfff;
const MASK_16: u64 = 0xffff;
const MASK_48: u128 = 0xffffffffffff;
const MASK_12_U128: u128 = 0xfff;

pub mod errors {
    pub const OUT_OF_RANGE: felt252 = 'Record: out of range';
    pub const INVALID_AREA: felt252 = 'Record: invalid area';
    pub const NOT_OPEN: felt252 = 'Record: no open half-edge';
}

#[derive(Copy, Drop, Debug, PartialEq)]
pub struct Record {
    pub parent: u16,
    pub size: u16,
    pub open: u16,
    pub chars: u16,
}

#[generate_trait]
pub impl RecordImpl of RecordTrait {
    /// The record of a node that founds a structure.
    #[inline(always)]
    fn found(open: u16) -> Record {
        Record { parent: 0, size: 1, open, chars: 0 }
    }

    #[inline(always)]
    fn is_root(self: Record) -> bool {
        self.parent == 0
    }

    /// Returns whether the structure is closed: no half-edge of it points to an empty position.
    #[inline(always)]
    fn is_closed(self: Record) -> bool {
        self.open == 0
    }

    /// Packs the record in its 48 bits.
    #[inline(always)]
    fn pack(self: Record) -> u64 {
        assert(self.parent <= MAX_PARENT, errors::OUT_OF_RANGE);
        assert(self.size <= MAX_SIZE && self.open <= MAX_OPEN, errors::OUT_OF_RANGE);
        self.parent.into()
            + self.size.into() * TWO_POW_12
            + self.open.into() * TWO_POW_22
            + self.chars.into() * TWO_POW_32
    }

    /// Unpacks a record from its 48 bits (higher bits are ignored).
    #[inline(always)]
    fn unpack(value: u64) -> Record {
        Record {
            parent: (value & MASK_12).try_into().unwrap(),
            size: ((value / TWO_POW_12) & MASK_10).try_into().unwrap(),
            open: ((value / TWO_POW_22) & MASK_10).try_into().unwrap(),
            chars: ((value / TWO_POW_32) & MASK_16).try_into().unwrap(),
        }
    }
}

// Packed records: the hot path of a move works on the 48 bits (and the cache's flag above them)
// without unpacking, every field read being one constant-shift read.

/// One half-edge in the `open` field of a packed record.
pub const OPEN_ONE: u64 = TWO_POW_22;

/// The packed record of a node that founds a structure.
#[inline(always)]
pub fn founded(open: u16) -> u64 {
    assert(open <= MAX_OPEN, errors::OUT_OF_RANGE);
    TWO_POW_12 + open.into() * TWO_POW_22
}

/// The packed record of a root.
#[inline(always)]
pub fn root_of(size: u16, open: u16, chars: u16) -> u64 {
    assert(size <= MAX_SIZE && open <= MAX_OPEN, errors::OUT_OF_RANGE);
    size.into() * TWO_POW_12 + open.into() * TWO_POW_22 + chars.into() * TWO_POW_32
}

#[inline(always)]
pub fn parent_of(record: u64) -> u32 {
    (record & MASK_12).try_into().unwrap()
}

#[inline(always)]
pub fn size_of(record: u64) -> u16 {
    ((record / TWO_POW_12) & MASK_10).try_into().unwrap()
}

#[inline(always)]
pub fn open_of(record: u64) -> u16 {
    ((record / TWO_POW_22) & MASK_10).try_into().unwrap()
}

#[inline(always)]
pub fn chars_of(record: u64) -> u16 {
    ((record / TWO_POW_32) & MASK_16).try_into().unwrap()
}

/// A root record that one more node joins, with `open` half-edges to empty positions.
#[inline(always)]
pub fn grow(record: u64, open: u16) -> u64 {
    assert(size_of(record) < MAX_SIZE, errors::OUT_OF_RANGE);
    assert(open_of(record) + open <= MAX_OPEN, errors::OUT_OF_RANGE);
    record + TWO_POW_12 + open.into() * TWO_POW_22
}

/// A root record that now points at `parent` (its other fields stay, unread).
#[inline(always)]
pub fn child_of(record: u64, parent: u32) -> u64 {
    assert(parent_of(record) == 0 && parent <= MAX_PARENT.into(), errors::OUT_OF_RANGE);
    record + parent.into()
}

/// One open half-edge of a root closes.
#[inline(always)]
pub fn close_one(record: u64) -> u64 {
    assert(record & OPEN_MASK != 0, errors::NOT_OPEN);
    record - OPEN_ONE
}

/// The roles of `bits` join the characters of a root.
#[inline(always)]
pub fn with_chars(record: u64, bits: u16) -> u64 {
    record | (bits.into() * TWO_POW_32)
}

/// The roles of `bits` leave the characters of a root.
#[inline(always)]
pub fn without_chars(record: u64, bits: u16) -> u64 {
    let gone = chars_of(record) & bits;
    record - gone.into() * TWO_POW_32
}

/// The structure id of the record `index` of a tile.
#[inline(always)]
pub fn sid(tile_id: u32, index: u8) -> u32 {
    tile_id * 16 + index.into()
}

/// The tile of a structure id.
#[inline(always)]
pub fn tile_of(sid: u32) -> u32 {
    sid / 16
}

/// The page slot of a structure id (0 or 1).
#[inline(always)]
pub fn slot_of(sid: u32) -> u8 {
    ((sid % 16) / RECORDS_PER_SLOT.into()).try_into().unwrap()
}

/// `2^(12 (area - 1))`, the position of the ref of an area in the refs of a tile.
#[inline(always)]
fn ref_shift(area: u8) -> u128 {
    match area {
        1 => 0x1,
        2 => 0x1000,
        3 => 0x1000000,
        4 => 0x1000000000,
        5 => 0x1000000000000,
        6 => 0x1000000000000000,
        7 => 0x1000000000000000000,
        8 => 0x1000000000000000000000,
        9 => 0x1000000000000000000000000,
        _ => {
            assert(false, errors::INVALID_AREA);
            0
        },
    }
}

/// The structure id that the node of `area` (1..=9) was given at placement; 0 for none.
#[inline(always)]
pub fn ref_of(refs: u128, area: u8) -> u32 {
    ((refs / ref_shift(area)) & MASK_12_U128).try_into().unwrap()
}

/// Returns `refs` with the structure id `sid` added for `area` (1..=9), which had none.
#[inline(always)]
pub fn add_ref(refs: u128, area: u8, sid: u32) -> u128 {
    let sid: u128 = sid.into();
    assert(sid <= MASK_12_U128, errors::OUT_OF_RANGE);
    refs + sid * ref_shift(area)
}

/// Returns `refs` with the structure id of the node of `area` (1..=9) set to `sid`.
#[inline(always)]
pub fn with_ref(refs: u128, area: u8, sid: u32) -> u128 {
    let sid: u128 = sid.into();
    assert(sid <= MASK_12_U128, errors::OUT_OF_RANGE);
    let shift = ref_shift(area);
    let old = (refs / shift) & MASK_12_U128;
    refs - old * shift + sid * shift
}

/// Packs four packed records in a page slot, position 0 first.
pub fn pack_slot(r0: u64, r1: u64, r2: u64, r3: u64) -> felt252 {
    let low: u128 = r0.into() + r1.into() * TWO_POW_48;
    let high: u128 = r2.into() + r3.into() * TWO_POW_48;
    low.into() + high.into() * TWO_POW_128
}

/// Unpacks the four packed records of a page slot, position 0 first.
pub fn unpack_slot(word: felt252) -> (u64, u64, u64, u64) {
    let word: u256 = word.into();
    (
        (word.low & MASK_48).try_into().unwrap(),
        ((word.low / TWO_POW_48) & MASK_48).try_into().unwrap(),
        (word.high & MASK_48).try_into().unwrap(),
        ((word.high / TWO_POW_48) & MASK_48).try_into().unwrap(),
    )
}
