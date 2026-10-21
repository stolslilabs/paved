//! Cartridge's VRF provider, as a consumer sees it (#638, `docs/architecture/vrf-draws.md`).
//!
//! The interface and `Source` are those of Cartridge's provider (cartridge-gg/vrf, MIT,
//! `src/vrf_provider/vrf_provider_component.cairo` and `src/types.cairo`), less the calls only
//! Cartridge's server makes (`submit_random`, `set_public_key`) and the views no draw reads. Their
//! selectors and the serialization of `Source` (`0` Nonce, `1` Salt) are what the client sends, on
//! chain and to the devnet mock (`mocks::vrf::MockVrfProvider`) alike.
//!
//! A draw's source is always `Source::Salt(draw_salt(kind, game_id, draw_index))`, never a nonce:
//! a nonce is keyed by an address alone, so any contract can advance it and reroll the next draw.
//! The provider's seed is Poseidon of the salt, the consumer (the embedding system) and the chain
//! id, so a draw's random is fixed for that draw: a reverted transaction sent again draws the same.
//! What `consume_random` returns also mixes the transaction's consume count, which is shared by
//! every seed and which the player can advance (consuming a seed of their own, after replaying its
//! proof with `submit_random`). So a draw is only taken as the first consume of its transaction
//! (`DrawableComponent`): its value is then Poseidon of the seed's random and 0.

use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use starknet::ContractAddress;

/// The domain of every draw salt.
pub const DRAW_DOMAIN: felt252 = 'PAVED_DRAW';

#[derive(Drop, Copy, Clone, Serde, Debug, PartialEq)]
pub enum Source {
    Nonce: ContractAddress,
    Salt: felt252,
}

#[starknet::interface]
pub trait IVrfProvider<TContractState> {
    /// The client's first call of the multicall; does nothing on chain (the server reads it).
    fn request_random(self: @TContractState, caller: ContractAddress, source: Source);
    /// The random of `source` for the calling contract, in the transaction that requested it.
    fn consume_random(ref self: TContractState, source: Source) -> felt252;
    /// Appended by Cartridge's server after the player's calls: reverts if nothing consumed.
    fn assert_consumed(ref self: TContractState, seed: felt252);
    /// The consumes of the transaction so far, for every seed together (0 outside a VRF call).
    /// `consume_random` returns Poseidon of the seed's random and this count.
    fn get_consume_count(self: @TContractState) -> u32;
}

/// The salt of the draw `draw_index` of `game_id` in the kind of draw `kind` (an attack's tile, a
/// reward offer, an opponent): Poseidon of the domain and the three. Nothing the player chooses
/// enters it. The client computes the same (`vrfSalt` in `@paved/chain`).
pub fn draw_salt(kind: felt252, game_id: felt252, draw_index: u32) -> felt252 {
    PoseidonTrait::new()
        .update(DRAW_DOMAIN)
        .update(kind)
        .update(game_id)
        .update(draw_index.into())
        .finalize()
}
