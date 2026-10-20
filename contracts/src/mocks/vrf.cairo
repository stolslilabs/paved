// TEST AND DEVNET ONLY: never deploy this contract on Sepolia or mainnet, where Cartridge's
// provider serves. Its random is public: anyone computes it from the source. The constructor
// refuses SN_MAIN (starknet-devnet runs as SN_SEPOLIA, so Sepolia cannot be refused here).

//! The devnet and test stand-in for Cartridge's VRF provider (#638,
//! `docs/architecture/vrf-draws.md`, section 4). Ported to a native contract from Glitchbomb's
//! Dojo mock (cartridge-gg/glitchbomb `contracts/src/mocks/vrf.cairo` at `5efcbcec`, MIT,
//! cartridge-gg), with the interface of Cartridge's provider (`paved::vrf`, cartridge-gg/vrf,
//! MIT). As Glitchbomb's, `request_random` and `assert_consumed` do nothing and nothing is proved.
//!
//! Unlike Glitchbomb's, which returns the transaction hash, `consume_random` derives its value
//! from the source: it computes the provider's seed (Poseidon of the salt, the caller and the
//! chain id; for a nonce, the address's nonce, incremented, first) and returns Poseidon of the
//! seed and `MOCK_VRF`. So a draw's random is fixed by its source here as on chain, and the tests
//! show that a retried draw gets the same tile without cheating the transaction hash.

#[starknet::contract]
pub mod MockVrfProvider {
    use core::poseidon::poseidon_hash_span;
    use paved::systems::faucet::MAINNET_CHAIN_ID;
    use paved::vrf::{IVrfProvider, Source};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    pub const MOCK_TAG: felt252 = 'MOCK_VRF';

    pub mod errors {
        pub const MAINNET: felt252 = 'MockVrf: not on mainnet';
    }

    #[storage]
    struct Storage {
        nonces: Map<ContractAddress, felt252>,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        // [Check] Never on mainnet
        let chain_id = starknet::get_execution_info().tx_info.unbox().chain_id;
        assert(chain_id != MAINNET_CHAIN_ID, errors::MAINNET);
    }

    #[abi(embed_v0)]
    impl VrfProviderImpl of IVrfProvider<ContractState> {
        fn request_random(self: @ContractState, caller: ContractAddress, source: Source) {}

        fn consume_random(ref self: ContractState, source: Source) -> felt252 {
            let caller: felt252 = get_caller_address().into();
            let chain_id = starknet::get_tx_info().unbox().chain_id;
            let seed = match source {
                Source::Nonce(addr) => {
                    let nonce = self.nonces.read(addr);
                    self.nonces.write(addr, nonce + 1);
                    poseidon_hash_span(array![nonce, addr.into(), caller, chain_id].span())
                },
                Source::Salt(salt) => poseidon_hash_span(array![salt, caller, chain_id].span()),
            };
            poseidon_hash_span(array![seed, MOCK_TAG].span())
        }

        fn assert_consumed(ref self: ContractState, seed: felt252) {}
    }
}
