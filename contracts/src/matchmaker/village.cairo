//! A village's slot in the matchmaker (#639, `docs/architecture/matchmaker.md`, section 3): one
//! packed felt per village, read and written once per call.
//!
//! Layout, low half: `crowns` [0, 32) · `bucket` [32, 40) · `index` [40, 72) · `status` [72, 80)
//! ·
//! `queue` [80, 88) · `draws` [88, 120) · `npc` [120]; high half: `seq` [128, 192) ·
//! `shield_until` [192, 248) (a timestamp below 2^56). Bits 121..128 and 248..251 are free.

/// Not in the matchmaker: never joined, or an NPC removed.
pub const STATUS_NONE: u8 = 0;
/// In the pool: `slots[(bucket, index)]` is this village.
pub const STATUS_POOL: u8 = 1;
/// Shielded: entry `seq` of shield queue `queue` is this village, until `shield_until`.
pub const STATUS_SHIELDED: u8 = 2;

#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Village {
    pub crowns: u32,
    pub bucket: u8,
    pub index: u32,
    pub status: u8,
    pub queue: u8,
    pub draws: u32,
    pub npc: bool,
    pub seq: u64,
    pub shield_until: u64,
}

const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_40: u128 = 0x10000000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_72: u128 = 0x1000000000000000000;
const TWO_POW_80: u128 = 0x100000000000000000000;
const TWO_POW_88: u128 = 0x10000000000000000000000;
const TWO_POW_120: u128 = 0x1000000000000000000000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const MASK_8: u128 = 0xff;
const MASK_32: u128 = 0xffffffff;
const MASK_64: u128 = 0xffffffffffffffff;

pub impl VillagePacking of starknet::storage_access::StorePacking<Village, felt252> {
    fn pack(value: Village) -> felt252 {
        let npc: u128 = if value.npc {
            TWO_POW_120
        } else {
            0
        };
        let low: u128 = value.crowns.into()
            + value.bucket.into() * TWO_POW_32
            + value.index.into() * TWO_POW_40
            + value.status.into() * TWO_POW_72
            + value.queue.into() * TWO_POW_80
            + value.draws.into() * TWO_POW_88
            + npc;
        let high: u128 = value.seq.into() + value.shield_until.into() * TWO_POW_64;
        low.into() + high.into() * TWO_POW_128
    }

    fn unpack(value: felt252) -> Village {
        let word: u256 = value.into();
        let low = word.low;
        let high = word.high;
        Village {
            crowns: (low & MASK_32).try_into().unwrap(),
            bucket: ((low / TWO_POW_32) & MASK_8).try_into().unwrap(),
            index: ((low / TWO_POW_40) & MASK_32).try_into().unwrap(),
            status: ((low / TWO_POW_72) & MASK_8).try_into().unwrap(),
            queue: ((low / TWO_POW_80) & MASK_8).try_into().unwrap(),
            draws: ((low / TWO_POW_88) & MASK_32).try_into().unwrap(),
            npc: (low / TWO_POW_120) & 1 == 1,
            seq: (high & MASK_64).try_into().unwrap(),
            shield_until: (high / TWO_POW_64).try_into().unwrap(),
        }
    }
}

/// A shield queue: its live entries are the sequences `head` to `tail - 1`. One felt: `head`
/// [0, 64) · `tail` [64, 128).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Queue {
    pub head: u64,
    pub tail: u64,
}

pub impl QueuePacking of starknet::storage_access::StorePacking<Queue, felt252> {
    fn pack(value: Queue) -> felt252 {
        let word: u128 = value.head.into() + value.tail.into() * TWO_POW_64;
        word.into()
    }

    fn unpack(value: felt252) -> Queue {
        let word: u256 = value.into();
        Queue {
            head: (word.low & MASK_64).try_into().unwrap(),
            tail: (word.low / TWO_POW_64).try_into().unwrap(),
        }
    }
}
