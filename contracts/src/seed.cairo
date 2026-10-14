//! Seed source: where the initial seed of a game comes from.
//!
//! `HostableComponent::spawn` takes the initial seed from a `SeedSource` and passes it to
//! `GameImpl::start`. The only implementation today is `TokenSeed`, the seed of the game's token id
//! (D-23, P-50 ruling 2): every game draws its own deck. A VRF or a seed revealed after the
//! purchase can replace it without touching the game. The reseeds of `build` and `discard` derive
//! from this seed and do not go through here.

use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use paved::types::mode::Mode;

pub trait SeedSource<T> {
    /// The initial seed of the game `game_id` of `mode`, spawned at `time`, from the game's `salt`.
    fn seed(self: @T, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252;
}

/// The seed of a game's token: Poseidon of the salt and the token id, which is the game id
/// (`Collection` mints the game under its own id). The mode and the time are not read: two games
/// of one day get two seeds. The next id is public before a purchase, so the next deck is too.
#[derive(Copy, Drop)]
pub struct TokenSeed {}

pub impl TokenSeedImpl of SeedSource<TokenSeed> {
    #[inline]
    fn seed(self: @TokenSeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        PoseidonTrait::new().update(salt).update(game_id.into()).finalize()
    }
}
