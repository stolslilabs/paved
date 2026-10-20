//! Cartridge's VRF per draw (#638, `docs/architecture/vrf-draws.md`): `DrawableComponent` in the
//! test harness `DrawHarness`, over the devnet mock `MockVrfProvider`.
//!
//! The component refuses a second draw in one transaction by the transaction's hash, so every
//! draw below runs under a cheated hash (`with_tx`); snforge's default hash is 0, the stored
//! hash's default too.

use core::poseidon::poseidon_hash_span;
use paved::components::drawable::DrawableComponent::VrfProviderSet;
use paved::components::drawable::{DrawableComponent, IDrawableDispatcher, IDrawableDispatcherTrait};
use paved::mocks::drawer::DrawHarness::HARNESS_KIND;
use paved::mocks::drawer::{
    IDrawHarnessDispatcher, IDrawHarnessDispatcherTrait, IDrawHarnessSafeDispatcher,
};
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::vrf::{
    DRAW_DOMAIN, IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source, draw_salt,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, start_cheat_chain_id_global, start_cheat_transaction_hash_global,
    stop_cheat_caller_address, stop_cheat_chain_id_global,
};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn OTHER() -> ContractAddress {
    'OTHER'.try_into().unwrap()
}

const GAME: felt252 = 7;

#[derive(Copy, Drop)]
struct World {
    provider: ContractAddress,
    harness: IDrawHarnessDispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> Result<ContractAddress, Array<felt252>> {
    let class = declare(name).unwrap().contract_class();
    match class.deploy(@calldata) {
        Result::Ok((address, _)) => Result::Ok(address),
        Result::Err(error) => Result::Err(error),
    }
}

fn deploy_world() -> World {
    let provider = deploy("MockVrfProvider", array![]).unwrap();
    let harness = deploy("DrawHarness", array![OWNER().into(), provider.into()]).unwrap();
    World { provider, harness: IDrawHarnessDispatcher { contract_address: harness } }
}

/// Runs what follows in the transaction `tx`.
fn with_tx(tx: felt252) {
    start_cheat_transaction_hash_global(tx);
}

fn safe(world: World) -> IDrawHarnessSafeDispatcher {
    IDrawHarnessSafeDispatcher { contract_address: world.harness.contract_address }
}

/// What the mock's first consume of a transaction returns for a salt and `consumer`, on
/// snforge's chain (SN_SEPOLIA by default): Poseidon of the seed's random and the count 0.
fn mock_random(salt: felt252, consumer: ContractAddress) -> felt252 {
    mock_consume(salt, consumer, 0)
}

/// What the mock returns for a salt and `consumer` as the transaction's consume `count`.
fn mock_consume(salt: felt252, consumer: ContractAddress, count: u32) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = poseidon_hash_span(array![seed, MOCK_TAG].span());
    poseidon_hash_span(array![random, count.into()].span())
}

// The salt

/// Pinned for the client's mirror (`vrfSalt` in `@paved/chain`, `test/vrf.test.ts`).
#[test]
fn test_vrf_draw_salt_is_the_pinned_poseidon() {
    assert_eq!(
        draw_salt('HARNESS', 7, 3),
        0x78ba0793b93212b3136621ba381892ab3481825db0d2e7b81285b0cf59a3d14,
    );
    assert_eq!(
        draw_salt('HARNESS', 7, 3), poseidon_hash_span(array![DRAW_DOMAIN, 'HARNESS', 7, 3].span()),
    );
}

/// Two draws that differ in their kind, their game or their index never share a salt.
#[test]
#[fuzzer(runs: 64, seed: 638)]
fn test_fuzz_vrf_draw_salts_differ_by_kind_game_and_index(game_id: felt252, index: u32) {
    let salt = draw_salt(HARNESS_KIND, game_id, index);
    assert_ne!(salt, draw_salt('OTHER_KIND', game_id, index));
    assert_ne!(salt, draw_salt(HARNESS_KIND, game_id + 1, index));
    let next = if index == 0xffffffff {
        0
    } else {
        index + 1
    };
    assert_ne!(salt, draw_salt(HARNESS_KIND, game_id, next));
}

// A draw

#[test]
fn test_vrf_draw_consumes_the_salt_of_the_game_and_index() {
    let world = deploy_world();
    with_tx('TX1');
    let random = world.harness.draw(GAME);
    assert_eq!(
        random, mock_random(draw_salt(HARNESS_KIND, GAME, 0), world.harness.contract_address),
    );
    assert_eq!(world.harness.draw_count(GAME), 1);
    with_tx('TX2');
    let second = world.harness.draw(GAME);
    assert_eq!(
        second, mock_random(draw_salt(HARNESS_KIND, GAME, 1), world.harness.contract_address),
    );
    assert_ne!(random, second);
    assert_eq!(world.harness.draw_count(GAME), 2);
}

/// The random of a draw depends on its game, its index and the consuming system only: not on the
/// transaction, not on who sends it. So a retry (any new transaction) draws the same, and no
/// player choice steers it.
#[test]
#[fuzzer(runs: 32, seed: 638)]
fn test_fuzz_vrf_draw_is_fixed_by_its_source(tx: felt252, game_id: felt252) {
    let tx = if tx == 0 {
        1
    } else {
        tx
    };
    let world = deploy_world();
    let other = deploy_world();
    let salt = draw_salt(HARNESS_KIND, game_id, 0);
    with_tx(tx);
    start_cheat_caller_address(world.harness.contract_address, PLAYER());
    assert_eq!(world.harness.draw(game_id), mock_random(salt, world.harness.contract_address));
    stop_cheat_caller_address(world.harness.contract_address);
    // Another system (another consumer) gets another random for the same salt
    start_cheat_caller_address(other.harness.contract_address, OTHER());
    let random = other.harness.draw(game_id);
    stop_cheat_caller_address(other.harness.contract_address);
    assert_eq!(random, mock_random(salt, other.harness.contract_address));
    assert_ne!(random, mock_random(salt, world.harness.contract_address));
}

// The rules against replaying a draw

/// Both dispatcher traits are generic over their dispatcher, so their calls are named in full here.
mod reverted {
    use paved::mocks::drawer::{IDrawHarnessDispatcherTrait, IDrawHarnessSafeDispatcherTrait};
    use super::{GAME, deploy_world, safe, with_tx};

    /// A transaction that fails after its draw leaves nothing: the count and the one-draw record
    /// roll back, and the draw sent again gets the same random.
    #[test]
    #[feature("safe_dispatcher")]
    fn test_vrf_reverted_draw_sent_again_gets_the_same_random() {
        let world = deploy_world();
        with_tx('TX1');
        let reason: Array<felt252> = IDrawHarnessSafeDispatcherTrait::draw_then_fail(
            safe(world), GAME,
        )
            .unwrap_err();
        let peeked = *reason[0];
        assert_eq!(IDrawHarnessDispatcherTrait::draw_count(world.harness, GAME), 0);
        // The same transaction may draw: the failed draw's record rolled back
        assert_eq!(IDrawHarnessDispatcherTrait::draw(world.harness, GAME), peeked);
        with_tx('TX2');
        assert_eq!(IDrawHarnessDispatcherTrait::draw_count(world.harness, GAME), 1);
        assert_ne!(IDrawHarnessDispatcherTrait::draw(world.harness, GAME), peeked);
    }
}

#[test]
#[should_panic(expected: 'VRF: one draw per tx')]
fn test_vrf_two_draws_in_one_transaction_are_refused() {
    let world = deploy_world();
    with_tx('TX1');
    world.harness.draw(GAME);
    world.harness.draw(GAME);
}

/// The rule is contract-wide: one transaction cannot draw in two games either.
#[test]
#[should_panic(expected: 'VRF: one draw per tx')]
fn test_vrf_two_draws_in_two_games_of_one_transaction_are_refused() {
    let world = deploy_world();
    with_tx('TX1');
    world.harness.draw(GAME);
    world.harness.draw(GAME + 1);
}

/// Random sequences of draws over a few games, one per transaction: each game's draws are its
/// salts in order, whatever the interleaving.
#[test]
#[fuzzer(runs: 8, seed: 638)]
fn test_fuzz_vrf_interleaved_draws_follow_each_games_indexes(seed: u64) {
    let world = deploy_world();
    let consumer = world.harness.contract_address;
    let mut state: u64 = seed + 1;
    let mut i: u32 = 0;
    let mut a: u32 = 0;
    let mut b: u32 = 0;
    let mut c: u32 = 0;
    while i < 24 {
        state = (state % 2147483648 * 1103515245 + 12345) % 2147483648;
        let game: u32 = ((state / 16) % 3).try_into().unwrap();
        with_tx(1000 + i.into());
        let index = if game == 0 {
            a += 1;
            a - 1
        } else if game == 1 {
            b += 1;
            b - 1
        } else {
            c += 1;
            c - 1
        };
        let random = world.harness.draw(game.into());
        assert_eq!(random, mock_random(draw_salt(HARNESS_KIND, game.into(), index), consumer));
        i += 1;
    }
    assert_eq!(world.harness.draw_count(0), a);
    assert_eq!(world.harness.draw_count(1), b);
    assert_eq!(world.harness.draw_count(2), c);
}

/// The provider's consume count is shared by every seed of the transaction, and what it returns
/// mixes it in. A player who consumes seeds of their own first (on chain: after replaying a proof
/// with `submit_random`) would shift the draw's value: the draw is refused unless it is the
/// transaction's first consume.
#[test]
#[should_panic(expected: 'VRF: not first consume')]
fn test_vrf_draw_after_another_consume_in_its_transaction_is_refused() {
    let world = deploy_world();
    let provider = IVrfProviderDispatcher { contract_address: world.provider };
    with_tx('TX1');
    // The test contract is the attacker's own consumer
    provider.consume_random(Source::Salt('MINE'));
    world.harness.draw(GAME);
}

/// However many consumes the player makes first, in transactions that fail or not, the draw sent
/// in a transaction of its own gets the value of its seed with the count 0.
#[test]
#[fuzzer(runs: 16, seed: 638)]
fn test_fuzz_vrf_consumes_before_the_draw_never_shift_its_value(n: u8) {
    let world = deploy_world();
    let provider = IVrfProviderDispatcher { contract_address: world.provider };
    with_tx('TX1');
    let mut i: u8 = 0;
    while i < n % 8 {
        let mine = provider.consume_random(Source::Salt('MINE'));
        assert_eq!(mine, mock_consume('MINE', starknet::get_contract_address(), i.into()));
        i += 1;
    }
    with_tx('TX2');
    assert_eq!(
        world.harness.draw(GAME),
        mock_random(draw_salt(HARNESS_KIND, GAME, 0), world.harness.contract_address),
    );
}

// The provider

#[test]
fn test_vrf_provider_is_set_at_construction_and_by_the_owner() {
    let mut spy = spy_events();
    let world = deploy_world();
    let drawable = IDrawableDispatcher { contract_address: world.harness.contract_address };
    assert_eq!(drawable.vrf_provider(), world.provider);
    let next: ContractAddress = 'NEXT_PROVIDER'.try_into().unwrap();
    start_cheat_caller_address(world.harness.contract_address, OWNER());
    world.harness.set_vrf_provider(next);
    stop_cheat_caller_address(world.harness.contract_address);
    assert_eq!(drawable.vrf_provider(), next);
    spy
        .assert_emitted(
            @array![
                (
                    world.harness.contract_address,
                    DrawableComponent::Event::VrfProviderSet(
                        VrfProviderSet { provider: world.provider },
                    ),
                ),
                (
                    world.harness.contract_address,
                    DrawableComponent::Event::VrfProviderSet(VrfProviderSet { provider: next }),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_vrf_provider_is_set_by_the_owner_only() {
    let world = deploy_world();
    start_cheat_caller_address(world.harness.contract_address, PLAYER());
    world.harness.set_vrf_provider(PLAYER());
}

#[test]
#[should_panic(expected: 'VRF: provider is zero')]
fn test_vrf_provider_zero_is_refused() {
    let world = deploy_world();
    start_cheat_caller_address(world.harness.contract_address, OWNER());
    world.harness.set_vrf_provider(0.try_into().unwrap());
}

#[test]
fn test_vrf_harness_with_no_provider_is_refused() {
    let provider: ContractAddress = 0.try_into().unwrap();
    let error = deploy("DrawHarness", array![OWNER().into(), provider.into()]).unwrap_err();
    assert_eq!(*error.at(0), 'VRF: provider is zero');
}

// The mock

#[test]
fn test_vrf_mock_salt_is_fixed_and_nonce_advances() {
    let provider = IVrfProviderDispatcher {
        contract_address: deploy("MockVrfProvider", array![]).unwrap(),
    };
    let me = starknet::get_contract_address();
    // `request_random` and `assert_consumed` do nothing
    provider.request_random(me, Source::Salt(1));
    provider.assert_consumed(0);
    with_tx('TX1');
    assert_eq!(provider.get_consume_count(), 0);
    let salt = provider.consume_random(Source::Salt(1));
    assert_eq!(salt, mock_random(1, me));
    // A second consume of the transaction mixes the count 1, as Cartridge's does
    assert_eq!(provider.get_consume_count(), 1);
    assert_eq!(provider.consume_random(Source::Salt(1)), mock_consume(1, me, 1));
    // A new transaction counts from 0: the same salt gets the same value
    with_tx('TX2');
    assert_eq!(provider.get_consume_count(), 0);
    assert_eq!(provider.consume_random(Source::Salt(1)), salt);
    // A nonce is advanced by every transaction that consumes it, whoever consumes it: why draws
    // never use one
    with_tx('TX3');
    let first = provider.consume_random(Source::Nonce(PLAYER()));
    with_tx('TX4');
    let second = provider.consume_random(Source::Nonce(PLAYER()));
    assert_ne!(first, second);
}

#[test]
fn test_vrf_mock_refuses_mainnet() {
    start_cheat_chain_id_global('SN_MAIN');
    let error = deploy("MockVrfProvider", array![]).unwrap_err();
    stop_cheat_chain_id_global();
    assert_eq!(*error.at(0), 'MockVrf: not on mainnet');
}
