//! Bucketable component: the matchmaker's pool of villages in crown buckets (#639,
//! `docs/architecture/matchmaker.md`, sections 4 and 5), ported from the owner's POC
//! (bal7hazar/matchmaker at 8639f232, `models/registry.cairo`, `models/league.cairo`,
//! `store.cairo`). A system embeds it and decides who enters and leaves; this component knows
//! only places and crown counts, not shields or matches.
//!
//! - Buckets of `BUCKET_WIDTH` crowns, with a registry: bit `b` of one felt is set iff bucket `b`
//!   is non-empty. The registry is read and written only when a bucket fills or empties.
//! - A bucket is a dense array of slots; a removal moves the last slot into the hole (O(1)).
//! - The draw takes the nearest non-empty bucket (`Bitmap::nearest_significant_bit`), so someone is
//!   always found while anyone else is listed, and never the attacker itself.
//!
//! Invariants (fuzzed in `paved::tests::matchmaker_system`): the slot `(b, i)` of `i < size(b)`
//! holds a village whose place says `b`, `i`, listed; bit `b` of the registry is set iff
//! `size(b) > 0`.
//!
//! Storage, flat: `bucket_registry`, `bucket_sizes`, `bucket_slots`, `bucket_places` (new names
//! only, `docs/architecture/upgrades.md`, "Storage layout discipline").

use starknet::ContractAddress;

/// The crowns of one bucket.
pub const BUCKET_WIDTH: u32 = 100;
/// The highest bucket: 251 buckets (0 to 250) fit the 251 bits of the registry's felt.
pub const TOP_BUCKET: u8 = 250;

/// The bucket of a crown count: `crowns / BUCKET_WIDTH`, at most `TOP_BUCKET`.
pub fn bucket_of(crowns: u32) -> u8 {
    let bucket = crowns / BUCKET_WIDTH;
    if bucket >= TOP_BUCKET.into() {
        TOP_BUCKET
    } else {
        bucket.try_into().unwrap()
    }
}

/// A village's place in the pool: slot `index` of bucket `bucket` while `listed`. One felt:
/// `bucket` [0, 8) · `index` [8, 40) · `listed` [40].
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Place {
    pub bucket: u8,
    pub index: u32,
    pub listed: bool,
}

const TWO_POW_8: u64 = 0x100;
const TWO_POW_40: u64 = 0x10000000000;
const MASK_8: u64 = 0xff;
const MASK_32: u64 = 0xffffffff;

pub impl PlacePacking of starknet::storage_access::StorePacking<Place, felt252> {
    fn pack(value: Place) -> felt252 {
        let listed: u64 = if value.listed {
            TWO_POW_40
        } else {
            0
        };
        let word: u64 = value.bucket.into() + value.index.into() * TWO_POW_8 + listed;
        word.into()
    }

    fn unpack(value: felt252) -> Place {
        let word: u64 = value.try_into().unwrap();
        Place {
            bucket: (word & MASK_8).try_into().unwrap(),
            index: ((word / TWO_POW_8) & MASK_32).try_into().unwrap(),
            listed: word / TWO_POW_40 == 1,
        }
    }
}

#[starknet::interface]
pub trait IBucketable<TContractState> {
    /// Bit `b` set iff bucket `b` is non-empty.
    fn registry(self: @TContractState) -> felt252;
    fn bucket_size(self: @TContractState, bucket: u8) -> u32;
    /// The village at index `index` of bucket `bucket`, meaningful for `index < bucket_size`.
    fn slot(self: @TContractState, bucket: u8, index: u32) -> ContractAddress;
    fn place(self: @TContractState, village: ContractAddress) -> Place;
}

#[starknet::component]
pub mod BucketableComponent {
    use paved::helpers::bitmap::Bitmap;
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use super::{IBucketable, Place, bucket_of};

    pub mod errors {
        pub const LISTED: felt252 = 'Buckets: already listed';
        pub const NOT_LISTED: felt252 = 'Buckets: not listed';
    }

    #[storage]
    pub struct Storage {
        /// Bit `b` set iff bucket `b` is non-empty (bits 0 to 250).
        pub bucket_registry: felt252,
        /// The villages in bucket `b`.
        pub bucket_sizes: Map<u8, u32>,
        /// The village at index `i` of bucket `b`, for `i < bucket_sizes[b]`.
        pub bucket_slots: Map<(u8, u32), ContractAddress>,
        /// Each village's place.
        pub bucket_places: Map<ContractAddress, Place>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        BucketEntered: BucketEntered,
        BucketLeft: BucketLeft,
    }

    /// A village listed in bucket `bucket` (joined the pool, or moved there by its crowns).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct BucketEntered {
        #[key]
        pub village: ContractAddress,
        pub bucket: u8,
    }

    /// A village out of bucket `bucket` (shielded, removed, or moving to another bucket).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct BucketLeft {
        #[key]
        pub village: ContractAddress,
        pub bucket: u8,
    }

    #[embeddable_as(BucketableImpl)]
    pub impl Bucketable<
        TContractState, +HasComponent<TContractState>,
    > of IBucketable<ComponentState<TContractState>> {
        fn registry(self: @ComponentState<TContractState>) -> felt252 {
            self.bucket_registry.read()
        }

        fn bucket_size(self: @ComponentState<TContractState>, bucket: u8) -> u32 {
            self.bucket_sizes.read(bucket)
        }

        fn slot(self: @ComponentState<TContractState>, bucket: u8, index: u32) -> ContractAddress {
            self.bucket_slots.read((bucket, index))
        }

        fn place(self: @ComponentState<TContractState>, village: ContractAddress) -> Place {
            self.bucket_places.read(village)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn is_listed(self: @ComponentState<TContractState>, village: ContractAddress) -> bool {
            self.bucket_places.read(village).listed
        }

        /// Lists `village` in the bucket of `crowns`, at the end of its slots.
        fn insert(ref self: ComponentState<TContractState>, village: ContractAddress, crowns: u32) {
            // [Check] Not listed yet
            assert(!self.bucket_places.read(village).listed, errors::LISTED);
            // [Effect] Append to the bucket; set its bit if it was empty
            let bucket = bucket_of(crowns);
            let size = self.bucket_sizes.read(bucket);
            self.bucket_slots.write((bucket, size), village);
            self.bucket_sizes.write(bucket, size + 1);
            if size == 0 {
                self.flip(bucket, true);
            }
            self.bucket_places.write(village, Place { bucket, index: size, listed: true });
            self.emit(BucketEntered { village, bucket });
        }

        /// Unlists `village`: the last slot of its bucket moves into its index (the POC's
        /// `remove_player_slot`). The emptied slot is past the size and never read, so not
        /// cleared.
        fn remove(ref self: ComponentState<TContractState>, village: ContractAddress) {
            // [Check] Listed
            let place = self.bucket_places.read(village);
            assert(place.listed, errors::NOT_LISTED);
            // [Effect] The last slot fills the hole; clear the bit if the bucket empties
            let bucket = place.bucket;
            let last = self.bucket_sizes.read(bucket) - 1;
            if place.index != last {
                let moved = self.bucket_slots.read((bucket, last));
                self.bucket_slots.write((bucket, place.index), moved);
                self.bucket_places.write(moved, Place { bucket, index: place.index, listed: true });
            }
            self.bucket_sizes.write(bucket, last);
            if last == 0 {
                self.flip(bucket, false);
            }
            self.bucket_places.write(village, Default::default());
            self.emit(BucketLeft { village, bucket });
        }

        /// Follows a listed village's new crown count: it moves if its bucket changes. An
        /// unlisted village is left as it is.
        fn follow(ref self: ComponentState<TContractState>, village: ContractAddress, crowns: u32) {
            let place = self.bucket_places.read(village);
            if place.listed && bucket_of(crowns) != place.bucket {
                self.remove(village);
                self.insert(village, crowns);
            }
        }

        /// The opponent of `attacker` (at `crowns`) for `random`, or None if no one else is listed.
        /// The bucket is the nearest non-empty one to the attacker's (its crowns' bucket when it is
        /// not listed), a tie broken by the random's lowest bit; the slot is the rest of the random
        /// modulo the bucket's size. The attacker is never drawn: alone in its bucket, its bit is
        /// masked out; otherwise the slot is drawn among the others.
        fn draw(
            self: @ComponentState<TContractState>,
            attacker: ContractAddress,
            crowns: u32,
            random: felt252,
        ) -> Option<ContractAddress> {
            let random: u256 = random.into();
            let place = self.bucket_places.read(attacker);
            let center = if place.listed {
                place.bucket
            } else {
                bucket_of(crowns)
            };
            let own_size = if place.listed {
                self.bucket_sizes.read(place.bucket)
            } else {
                0
            };
            let mut bits: u256 = self.bucket_registry.read().into();
            if place.listed && own_size == 1 {
                bits = Bitmap::set_bit_at(bits, place.bucket, false);
            }
            if bits == 0 {
                return Option::None;
            }
            let priority = random.low & 1 == 1;
            let bucket = Bitmap::nearest_significant_bit(bits, center, priority).unwrap();
            let pick = random / 2;
            let index = if place.listed && bucket == place.bucket {
                let others: u256 = (own_size - 1).into();
                let index: u32 = (pick % others).try_into().unwrap();
                if index >= place.index {
                    index + 1
                } else {
                    index
                }
            } else {
                let size: u256 = self.bucket_sizes.read(bucket).into();
                (pick % size).try_into().unwrap()
            };
            Option::Some(self.bucket_slots.read((bucket, index)))
        }
    }

    #[generate_trait]
    impl PrivateImpl<
        TContractState, +HasComponent<TContractState>,
    > of PrivateTrait<TContractState> {
        /// Sets bit `bucket` of the registry to `value`.
        fn flip(ref self: ComponentState<TContractState>, bucket: u8, value: bool) {
            let bits: u256 = self.bucket_registry.read().into();
            let bits = Bitmap::set_bit_at(bits, bucket, value);
            self.bucket_registry.write(bits.try_into().unwrap());
        }
    }
}
