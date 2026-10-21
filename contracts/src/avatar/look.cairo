//! The avatar's look (#627), in the format AVATAR-LOOK states (#626 PR 1,
//! `packages/renderer/src/core/avatar/avatar-format.ts`): one `u128`, byte 0 the format's version
//! (1), byte `p + 1` the item id of part `p` (0 skin, 1 hair colour, 2 eyes, 3 eyebrows, 4 mouth,
//! 5 hair, 6 beard, 7 headwear, 8 accessory, 9 background), the bytes past the parts 0. A look of 0
//! is no avatar (the client draws its default). Pure: no storage, no system.
//!
//! The parts in use are a count the owner sets on `Avatar` (`set_parts`), which only grows: a new
//! part takes the next byte, which an older look leaves at 0, read as item 0 (each part's default,
//! free), so a stored look keeps its meaning. A wider id or another packing is a new version.

/// The version of the format this code reads (byte 0 of a look).
pub const FORMAT_VERSION: u8 = 1;
/// The most parts a look holds: the 15 bytes after the version.
pub const MAX_PARTS: u8 = 15;

const BYTE: NonZero<u128> = 0x100;

/// The item id of each of the first `parts` parts of a look, part 0 first; `None` when the look is
/// not of version 1 or has a byte set past them (0, no avatar, is `None` too).
pub fn look_ids(look: u128, parts: u8) -> Option<Array<u8>> {
    let (mut rest, version) = DivRem::div_rem(look, BYTE);
    if version != FORMAT_VERSION.into() {
        return None;
    }
    let mut ids: Array<u8> = array![];
    for _ in 0..parts {
        let (next, id) = DivRem::div_rem(rest, BYTE);
        ids.append(id.try_into().unwrap());
        rest = next;
    }
    if rest == 0 {
        Some(ids)
    } else {
        None
    }
}

/// The look of version 1 of one item id per part, part 0 first (at most `MAX_PARTS` ids).
pub fn look_of(ids: Span<u8>) -> u128 {
    let mut look: u128 = FORMAT_VERSION.into();
    let mut unit: u128 = 0x100;
    for id in ids {
        look += (*id).into() * unit;
        unit *= 0x100;
    }
    look
}
