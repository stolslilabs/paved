//! Seed source: where the initial seed of a game comes from.
//!
//! `HostableComponent::spawn` takes the initial seed from a `SeedSource` and passes it to
//! `GameImpl::start`. The only implementation today is `TokenSeed`, the seed of the game's token id
//! in its contract (D-23, P-50 ruling 2 and the PM's addition of 2026-10-14): every game draws its
//! own deck, and each deployment has its own decks. Since #645 (D-30) `Challenge` spawns from
//! `VrfSeed`, the random of the spawn's VRF draw; `TokenSeed` stays the seed of the games spawned
//! before (`initial_seed`). A move draws its own tile from the VRF and reseeds nothing
//! (`docs/architecture/challenge-vrf.md`).

use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use paved::types::mode::Mode;
use starknet::ContractAddress;

pub trait SeedSource<T> {
    /// The initial seed of the game `game_id` of `mode`, spawned at `time`, from the game's `salt`.
    fn seed(self: @T, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252;
}

/// The seed of a game's token: Poseidon of the salt, the address of the game contract and the token
/// id, which is the game id (`Collection` mints the game under its own id). The mode and the time
/// are not read: two games of one day get two seeds, and game N of two deployments too. Three
/// inputs where the day seed had two: Poseidon pads the absorbed inputs by their count, so a
/// three-input seed equals a two-input one only through a Poseidon collision. The contract and the
/// next id are public before a purchase, so the next deck is too.
#[derive(Copy, Drop)]
pub struct TokenSeed {
    /// The contract that counts the game ids (`Challenge`, `get_contract_address()` at spawn).
    pub contract: ContractAddress,
}

pub impl TokenSeedImpl of SeedSource<TokenSeed> {
    #[inline]
    fn seed(self: @TokenSeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        let contract: felt252 = (*self.contract).into();
        PoseidonTrait::new().update(salt).update(contract).update(game_id.into()).finalize()
    }
}

/// The seed of a game spawned on the VRF (#645, D-30): the random of the spawn's draw
/// (`Challenge`, `DrawableComponent::draw_random`). It builds the game's deck and draws its first
/// three tiles (`GameImpl::advance`).
#[derive(Copy, Drop)]
pub struct VrfSeed {
    pub random: felt252,
}

pub impl VrfSeedImpl of SeedSource<VrfSeed> {
    #[inline]
    fn seed(self: @VrfSeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        *self.random
    }
}
