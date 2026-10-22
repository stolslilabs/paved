//! An item of the avatar's catalogue (#627): its settings and its packing in one storage slot.
//! Pure: no storage, no system (`avatar::catalogue` stores it).

/// The states of an item: never listed, listed (on sale, or free), withdrawn from sale.
pub const UNLISTED: u8 = 0;
pub const LISTED: u8 = 1;
pub const WITHDRAWN: u8 = 2;

/// An item, one slot per `(part, id)`: `state` [0, 8) · `cobbles` [8, 24) (0: free) · `sold`
/// [32, 64) · `supply` [64, 96) (0: no limit) · `until` [128, 192) (0: no end; otherwise sales
/// stop at that block time). Bits [24, 32), [96, 128) and from 192 are free for a later field.
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct AvatarItem {
    pub state: u8,
    pub cobbles: u16,
    pub sold: u32,
    pub supply: u32,
    pub until: u64,
}

const TWO_POW_8: u128 = 0x100;
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_8: u128 = 0xff;
const MASK_16: u128 = 0xffff;
const MASK_32: u128 = 0xffffffff;
/// The `state` and `cobbles` bits of an item word.
const FREE_MASK: u128 = 0xffffff;

pub fn item_word(item: AvatarItem) -> felt252 {
    let low: u128 = item.state.into()
        + item.cobbles.into() * TWO_POW_8
        + item.sold.into() * TWO_POW_32
        + item.supply.into() * TWO_POW_64;
    let word = u256 { low, high: item.until.into() };
    word.try_into().unwrap()
}

pub fn item_of(word: felt252) -> AvatarItem {
    let word: u256 = word.into();
    AvatarItem {
        state: (word.low & MASK_8).try_into().unwrap(),
        cobbles: ((word.low / TWO_POW_8) & MASK_16).try_into().unwrap(),
        sold: ((word.low / TWO_POW_32) & MASK_32).try_into().unwrap(),
        supply: (word.low / TWO_POW_64).try_into().unwrap(),
        until: word.high.try_into().unwrap(),
    }
}

/// True when the item of this word is listed and free (`state` LISTED, `cobbles` 0), read from the
/// low bits alone.
pub fn is_free_word(word: felt252) -> bool {
    let word: u256 = word.into();
    word.low & FREE_MASK == LISTED.into()
}
