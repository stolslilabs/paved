//! Seasonable component: the season clock of PvP (#644, `docs/architecture/leagues.md`, section 3).
//! The seasons are the calendar's (the owner's ruling: three months, the real seasons, from 1
//! March, 1 June, 1 September and 1 December at 00:00 UTC; `paved::matchmaker::leagues`). The
//! owner sets once, before it starts, the first second of season 1, a season's first second;
//! season 0 is the time before it (or an unset clock). A system embeds it and asks it the season
//! of now; this component knows only the clock, not leagues or crowns.
//!
//! Storage, flat: `season_clock` (a new name only, `docs/architecture/upgrades.md`, "Storage layout
//! discipline").

#[starknet::interface]
pub trait ISeasonable<TContractState> {
    /// The first second of season 1; 0 while unset.
    fn season_clock(self: @TContractState) -> u64;
    /// The season of now: 0 before the clock's start or while it is unset.
    fn current_season(self: @TContractState) -> u32;
    /// The first second of season `season` (at least 1) on the clock.
    fn season_start(self: @TContractState, season: u32) -> u64;
}

#[starknet::component]
pub mod SeasonableComponent {
    use paved::matchmaker::leagues::{is_season_start, season_of, season_start};
    use starknet::get_block_timestamp;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::ISeasonable;

    pub mod errors {
        pub const STARTED: felt252 = 'Seasons: clock started';
        pub const INVALID_CLOCK: felt252 = 'Seasons: invalid clock';
        pub const INVALID_SEASON: felt252 = 'Seasons: invalid season';
    }

    #[storage]
    pub struct Storage {
        /// The first second of season 1 (0: unset); written by `set_clock` only.
        pub season_clock: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SeasonClockSet: SeasonClockSet,
    }

    /// The clock set: season 1 starts at `start`, each season is a calendar season.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SeasonClockSet {
        pub start: u64,
    }

    #[embeddable_as(SeasonableImpl)]
    pub impl Seasonable<
        TContractState, +HasComponent<TContractState>,
    > of ISeasonable<ComponentState<TContractState>> {
        fn season_clock(self: @ComponentState<TContractState>) -> u64 {
            self.season_clock.read()
        }

        fn current_season(self: @ComponentState<TContractState>) -> u32 {
            self.season_now()
        }

        fn season_start(self: @ComponentState<TContractState>, season: u32) -> u64 {
            let start = self.season_clock.read();
            assert(start != 0 && season != 0, errors::INVALID_SEASON);
            season_start(start, season)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn season_now(self: @ComponentState<TContractState>) -> u32 {
            season_of(self.season_clock.read(), get_block_timestamp())
        }

        /// Sets the clock: `start` in the future and the first second of a calendar season. Only
        /// while no season has started: a change after that would renumber seasons that paid.
        fn set_clock(ref self: ComponentState<TContractState>, start: u64) {
            // [Check] Not started, a season's first second later than now
            let now = get_block_timestamp();
            let clock = self.season_clock.read();
            assert(clock == 0 || now < clock, errors::STARTED);
            assert(start > now && is_season_start(start), errors::INVALID_CLOCK);
            // [Effect] The clock
            self.season_clock.write(start);
            self.emit(SeasonClockSet { start });
        }
    }
}
