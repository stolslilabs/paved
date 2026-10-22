//! Seasonable component: the season clock of PvP (#644, `docs/architecture/leagues.md`, section 3).
//! Seasons of one fixed length from a start the owner sets once, before it starts; season 0 is the
//! time before the first one (or an unset clock). A system embeds it and asks it the season of
//! now; this component knows only the clock, not leagues or crowns.
//!
//! Storage, flat: `season_clock` (a new name only, `docs/architecture/upgrades.md`, "Storage layout
//! discipline").

/// The season clock: season `s >= 1` runs over `[start + (s - 1) length, start + s length)`.
/// `length` 0: unset. One felt: `start` [0, 64) · `length` [64, 128).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct SeasonClock {
    pub start: u64,
    pub length: u64,
}

const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_64: u128 = 0xffffffffffffffff;

pub impl SeasonClockPacking of starknet::storage_access::StorePacking<SeasonClock, felt252> {
    fn pack(value: SeasonClock) -> felt252 {
        let word: u128 = value.start.into() + value.length.into() * TWO_POW_64;
        word.into()
    }

    fn unpack(value: felt252) -> SeasonClock {
        let word: u256 = value.into();
        SeasonClock {
            start: (word.low & MASK_64).try_into().unwrap(),
            length: (word.low / TWO_POW_64).try_into().unwrap(),
        }
    }
}

#[starknet::interface]
pub trait ISeasonable<TContractState> {
    fn season_clock(self: @TContractState) -> SeasonClock;
    /// The season of now: 0 before the clock's start or while it is unset.
    fn current_season(self: @TContractState) -> u32;
}

#[starknet::component]
pub mod SeasonableComponent {
    use paved::matchmaker::leagues::{MIN_SEASON_LENGTH, season_of};
    use starknet::get_block_timestamp;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{ISeasonable, SeasonClock};

    pub mod errors {
        pub const STARTED: felt252 = 'Seasons: clock started';
        pub const INVALID_CLOCK: felt252 = 'Seasons: invalid clock';
    }

    #[storage]
    pub struct Storage {
        /// The clock (`super::SeasonClock`); written by `set_clock` only.
        pub season_clock: SeasonClock,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SeasonClockSet: SeasonClockSet,
    }

    /// The clock set: season 1 starts at `start`, each season lasts `length` seconds.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SeasonClockSet {
        pub start: u64,
        pub length: u64,
    }

    #[embeddable_as(SeasonableImpl)]
    pub impl Seasonable<
        TContractState, +HasComponent<TContractState>,
    > of ISeasonable<ComponentState<TContractState>> {
        fn season_clock(self: @ComponentState<TContractState>) -> SeasonClock {
            self.season_clock.read()
        }

        fn current_season(self: @ComponentState<TContractState>) -> u32 {
            self.season_now()
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn season_now(self: @ComponentState<TContractState>) -> u32 {
            let clock = self.season_clock.read();
            season_of(clock.start, clock.length, get_block_timestamp())
        }

        /// Sets the clock: `start` in the future, `length` at least `MIN_SEASON_LENGTH`. Only while
        /// no season has started: a change after that would renumber seasons that already paid.
        fn set_clock(ref self: ComponentState<TContractState>, start: u64, length: u64) {
            // [Check] Not started, a clock that starts later
            let now = get_block_timestamp();
            let clock = self.season_clock.read();
            assert(clock.length == 0 || now < clock.start, errors::STARTED);
            assert(start > now && length >= MIN_SEASON_LENGTH, errors::INVALID_CLOCK);
            // [Effect] The clock
            self.season_clock.write(SeasonClock { start, length });
            self.emit(SeasonClockSet { start, length });
        }
    }
}
