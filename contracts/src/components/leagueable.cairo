//! Leagueable component: each village's league record (#644, `docs/architecture/leagues.md`,
//! section 5). A system embeds it, rolls a village into the current season before its crowns move,
//! and reports what they became; this component returns what a roll or a climb owes (the reset
//! crowns, the season reward, the leagues reached) and the system sets the crowns, credits the
//! Cobbles and reports the groups reached (#917). It knows leagues and seasons, not crowns'
//! storage, buckets or Cobble balances.
//!
//! - **The roll** closes the village's last season (its league at the season's end, its reward if
//!   it settled `MIN_SEASON_ATTACKS` attacks) and resets its crowns to at most `RESET_CROWNS`.
//!   Season 0 (before the clock) closes nothing; its crowns are reset once a real season has
//!   ended (a roll from season 0 into season 2 or later).
//! - **The climb**: a league above the record's peak, reached in a season, is reached for the
//!   first time in it; the peak starts each season at the league the village starts it in.
//!
//! Storage, flat: `league_records` (a new name only, `docs/architecture/upgrades.md`, "Storage
//! layout discipline").

use starknet::ContractAddress;

/// A village's league record: the season it was last rolled into, the highest league it reached
/// in that season, and the attacks it settled in it. One felt: `season` [0, 32) · `peak` [32, 40)
/// ·
/// `attacks` [40, 56).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct LeagueRecord {
    pub season: u32,
    pub peak: u8,
    pub attacks: u16,
}

/// What a roll did: `closed` the season it closed (0: none), the village's `league` at that
/// season's end and its `reward`, and the `crowns` after the reset.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Roll {
    pub closed: u32,
    pub league: u8,
    pub reward: u8,
    pub crowns: u32,
}

/// A league reached for the first time in `season`.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Reach {
    pub season: u32,
    pub league: u8,
}

const TWO_POW_32: u64 = 0x100000000;
const TWO_POW_40: u64 = 0x10000000000;
const MASK_8: u64 = 0xff;
const MASK_32: u64 = 0xffffffff;

pub impl LeagueRecordPacking of starknet::storage_access::StorePacking<LeagueRecord, felt252> {
    fn pack(value: LeagueRecord) -> felt252 {
        let word: u64 = value.season.into()
            + value.peak.into() * TWO_POW_32
            + value.attacks.into() * TWO_POW_40;
        word.into()
    }

    fn unpack(value: felt252) -> LeagueRecord {
        let word: u64 = value.try_into().unwrap();
        LeagueRecord {
            season: (word & MASK_32).try_into().unwrap(),
            peak: ((word / TWO_POW_32) & MASK_8).try_into().unwrap(),
            attacks: (word / TWO_POW_40).try_into().unwrap(),
        }
    }
}

/// The roll of `record` into `season` at `crowns`, with no write: what `roll` would do. A record of
/// a real season closes it (its league, its reward) and resets the crowns. A record of season 0 (a
/// village not yet touched in a real season) closes nothing and pays nothing, but if it rolls
/// past season 1, at least one season ended while it held these crowns, so they are reset too.
pub fn roll_of(record: LeagueRecord, crowns: u32, season: u32) -> (LeagueRecord, Roll) {
    let none = Roll { closed: 0, league: 0, reward: 0, crowns };
    if record.season >= season {
        return (record, none);
    }
    let mut outcome = none;
    if record.season != 0 {
        let league = paved::matchmaker::leagues::league_of(crowns);
        let reward = if record.attacks >= paved::matchmaker::leagues::MIN_SEASON_ATTACKS {
            paved::matchmaker::leagues::reward_of(league)
        } else {
            0
        };
        outcome =
            Roll {
                closed: record.season,
                league,
                reward,
                crowns: paved::matchmaker::leagues::reset(crowns),
            };
    } else if season > 1 {
        outcome.crowns = paved::matchmaker::leagues::reset(crowns);
    }
    let peak = paved::matchmaker::leagues::league_of(outcome.crowns);
    (LeagueRecord { season, peak, attacks: 0 }, outcome)
}

#[starknet::interface]
pub trait ILeagueable<TContractState> {
    /// A village's record as stored (rolled lazily: it may name a past season).
    fn league_record(self: @TContractState, village: ContractAddress) -> LeagueRecord;
}

#[starknet::component]
pub mod LeagueableComponent {
    use core::num::traits::Bounded;
    use paved::matchmaker::leagues::league_of;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{ILeagueable, LeagueRecord, Reach, Roll, roll_of};

    #[storage]
    pub struct Storage {
        /// Each village's record (`super::LeagueRecord`).
        pub league_records: Map<ContractAddress, LeagueRecord>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        LeagueReached: LeagueReached,
        SeasonClosed: SeasonClosed,
    }

    /// `village` reached `league` for the first time in `season` (no bonus since #917: a group
    /// reached for the first time in a lifetime is a mission, `Setup`'s `report_league`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct LeagueReached {
        #[key]
        pub village: ContractAddress,
        pub season: u32,
        pub league: u8,
    }

    /// `village`'s season `season` closed: it ended it in `league` at `crowns`, with `attacks`
    /// settled, for `reward` Cobbles; its crowns were reset to `reset`.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SeasonClosed {
        #[key]
        pub village: ContractAddress,
        pub season: u32,
        pub league: u8,
        pub attacks: u16,
        pub reward: u8,
        pub crowns: u32,
        pub reset: u32,
    }

    #[embeddable_as(LeagueableImpl)]
    pub impl Leagueable<
        TContractState, +HasComponent<TContractState>,
    > of ILeagueable<ComponentState<TContractState>> {
        fn league_record(
            self: @ComponentState<TContractState>, village: ContractAddress,
        ) -> LeagueRecord {
            self.league_records.read(village)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn record_of(
            self: @ComponentState<TContractState>, village: ContractAddress,
        ) -> LeagueRecord {
            self.league_records.read(village)
        }

        /// Rolls `village`, at `crowns`, into `season`: a no-op if its record is there already.
        /// Closes its last season (not season 0) and returns the crowns after the reset, which the
        /// system sets.
        fn roll(
            ref self: ComponentState<TContractState>,
            village: ContractAddress,
            crowns: u32,
            season: u32,
        ) -> Roll {
            let record = self.league_records.read(village);
            if record.season >= season {
                return Roll { closed: 0, league: 0, reward: 0, crowns };
            }
            let (next, outcome) = roll_of(record, crowns, season);
            self.league_records.write(village, next);
            if outcome.closed != 0 {
                self
                    .emit(
                        SeasonClosed {
                            village,
                            season: outcome.closed,
                            league: outcome.league,
                            attacks: record.attacks,
                            reward: outcome.reward,
                            crowns,
                            reset: outcome.crowns,
                        },
                    );
            }
            outcome
        }

        /// Records that `village`, rolled into the current season, is now at `crowns`: one more
        /// attack if `attack`, and every league above its peak up to `crowns`' league reached.
        /// Returns the leagues reached. In season 0 nothing is reached.
        fn climb(
            ref self: ComponentState<TContractState>,
            village: ContractAddress,
            crowns: u32,
            attack: bool,
        ) -> Array<Reach> {
            let mut record = self.league_records.read(village);
            let mut reached: Array<Reach> = array![];
            if record.season == 0 {
                return reached;
            }
            let mut changed = false;
            if attack && record.attacks < Bounded::<u16>::MAX {
                record.attacks += 1;
                changed = true;
            }
            let league = league_of(crowns);
            while record.peak < league {
                record.peak += 1;
                let season = record.season;
                self.emit(LeagueReached { village, season, league: record.peak });
                reached.append(Reach { season, league: record.peak });
                changed = true;
            }
            if changed {
                self.league_records.write(village, record);
            }
            reached
        }
    }
}
