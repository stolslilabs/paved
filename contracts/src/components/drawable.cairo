//! Drawable component: one random per draw from Cartridge's VRF (#638,
//! `docs/architecture/vrf-draws.md`). A system embeds it, stores its own draw counter per game,
//! and calls `draw_random` inside the entry point that draws. The client puts the provider's
//! `request_random(system, Source::Salt(salt))` first in the same multicall.
//!
//! Rules against replaying a draw:
//! - the source is `Source::Salt(draw_salt(kind, game_id, draw_index))`: fixed for that draw, so
//!   a reverted transaction sent again gets the same random, and no player choice enters it;
//! - the draw is the first consume of its transaction (the provider's `get_consume_count` is 0):
//!   Cartridge's `consume_random` returns Poseidon of the seed's random and the transaction's
//!   consume count, shared by every seed, so a player who consumed seeds of their own first would
//!   otherwise shift the draw's value;
//! - one draw per transaction, contract-wide: the transaction hash of the last draw is stored and
//!   a second draw in the same transaction is refused. Cartridge's provider refuses it too (its
//!   server proves one seed per transaction), the devnet mock does not.
//!
//! The provider's address is set by the embedding system's owner (`set_provider`, internal: the
//! system gates it). Storage, flat: `vrf_provider`, `vrf_last_draw_tx` (new names only,
//! `docs/architecture/upgrades.md`, "Storage layout discipline").

use starknet::ContractAddress;

#[starknet::interface]
pub trait IDrawable<TContractState> {
    fn vrf_provider(self: @TContractState) -> ContractAddress;
}

#[starknet::component]
pub mod DrawableComponent {
    use core::num::traits::Zero;
    use paved::vrf::{IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source, draw_salt};
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::IDrawable;

    pub mod errors {
        pub const ZERO_PROVIDER: felt252 = 'VRF: provider is zero';
        pub const NO_PROVIDER: felt252 = 'VRF: no provider';
        pub const ONE_DRAW_PER_TX: felt252 = 'VRF: one draw per tx';
        pub const NOT_FIRST_CONSUME: felt252 = 'VRF: not first consume';
    }

    #[storage]
    pub struct Storage {
        pub vrf_provider: ContractAddress,
        pub vrf_last_draw_tx: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        VrfProviderSet: VrfProviderSet,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct VrfProviderSet {
        pub provider: ContractAddress,
    }

    #[embeddable_as(DrawableImpl)]
    pub impl Drawable<
        TContractState, +HasComponent<TContractState>,
    > of IDrawable<ComponentState<TContractState>> {
        fn vrf_provider(self: @ComponentState<TContractState>) -> ContractAddress {
            self.vrf_provider.read()
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        /// Sets the provider: Cartridge's on Sepolia and mainnet, the mock on devnet. The
        /// embedding system gates it (its owner).
        fn set_provider(ref self: ComponentState<TContractState>, provider: ContractAddress) {
            // [Check] Provider is not zero
            assert(provider.is_non_zero(), errors::ZERO_PROVIDER);
            // [Effect] Store the provider
            self.vrf_provider.write(provider);
            self.emit(VrfProviderSet { provider });
        }

        /// The random of the draw `draw_index` of `game_id` in `kind`, consumed from the provider.
        /// The caller increments its own draw counter.
        fn draw_random(
            ref self: ComponentState<TContractState>,
            kind: felt252,
            game_id: felt252,
            draw_index: u32,
        ) -> felt252 {
            // [Check] A provider is set
            let provider = self.vrf_provider.read();
            assert(provider.is_non_zero(), errors::NO_PROVIDER);
            // [Check] One draw per transaction
            let tx_hash = starknet::get_tx_info().unbox().transaction_hash;
            assert(tx_hash != self.vrf_last_draw_tx.read(), errors::ONE_DRAW_PER_TX);
            // [Effect] Record the draw's transaction
            self.vrf_last_draw_tx.write(tx_hash);
            // [Check] The draw is the transaction's first consume, so its value does not depend on
            // what the transaction consumed before
            let vrf = IVrfProviderDispatcher { contract_address: provider };
            assert(vrf.get_consume_count() == 0, errors::NOT_FIRST_CONSUME);
            // [Interaction] Consume the draw's random
            vrf.consume_random(Source::Salt(draw_salt(kind, game_id, draw_index)))
        }
    }
}
