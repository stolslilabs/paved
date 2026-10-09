//! Seed source: where the initial seed of a game comes from.
//!
//! `HostableComponent::spawn` takes the initial seed from a `SeedSource` and passes it to
//! `GameImpl::start`. The only implementation today is `DailySeed`, the predictable daily seed
//! (D-13); a VRF or a seed revealed after the purchase can replace it without touching the game.
//! The reseeds of `build` and `discard` derive from this seed and do not go through here.

use paved::types::mode::{Mode, ModeTrait};

pub trait SeedSource<T> {
    /// The initial seed of the game `game_id` of `mode`, spawned at `time`, from the game's `salt`.
    fn seed(self: @T, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252;
}

/// Today's seed: Poseidon of the salt and the tournament id for a Daily game, 0 for the Tutorial.
#[derive(Copy, Drop)]
pub struct DailySeed {}

pub impl DailySeedImpl of SeedSource<DailySeed> {
    #[inline]
    fn seed(self: @DailySeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        mode.seed(time, game_id, salt)
    }
}
