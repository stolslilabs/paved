//! `SeedSource`: the initial seed of a game comes only through the source given to `spawn`.
//! Since #645 (D-30) the source of every spawn is `VrfSeed`, the random of the spawn's VRF draw.
//! `TokenSeed` (D-23, with the contract's address since the PM's addition of 2026-10-14) was the
//! source before it, and stays the `initial_seed` of the games spawned then; `DaySeed` is the
//! source before that (the seed of the day, D-13), kept here for its own tests.

use core::hash::HashStateTrait;
use core::poseidon::{PoseidonTrait, poseidon_hash_span};
use paved::day::day_id;
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::models::game::{Game, GameImpl, GameTrait};
use paved::seed::{SeedSource, TokenSeed};
use paved::systems::challenge::Challenge::SPAWN_KIND;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::plan::Plan;
use paved::vrf::draw_salt;
use starknet::ContractAddress;

/// A source that ignores the mode, the time and the salt.
#[derive(Copy, Drop)]
struct StubSeed {
    value: felt252,
}

impl StubSeedImpl of SeedSource<StubSeed> {
    fn seed(self: @StubSeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        *self.value
    }
}

/// Test only: the seed of a Challenge game before D-23, Poseidon of the salt and the day id, the
/// same for every game of a day. The golden games were recorded with it until #645, which spawns
/// them on the VRF mock (`golden::harness`).
#[derive(Copy, Drop)]
pub struct DaySeed {}

pub impl DaySeedImpl of SeedSource<DaySeed> {
    fn seed(self: @DaySeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match mode {
            Mode::Challenge => PoseidonTrait::new()
                .update(salt)
                .update(day_id(time, 86400).into())
                .finalize(),
            _ => 0,
        }
    }
}

const TIME: u64 = 1_000_000;
const GAME_ID: u32 = 7;
const PLAYER_ID: felt252 = 'PLAYER';

fn started(mode: Mode, seed: felt252) -> Game {
    let mut game = GameImpl::new(GAME_ID, TIME, mode, PLAYER_ID);
    game.start(TIME, seed);
    game
}

fn poseidon(salt: felt252, id: felt252) -> felt252 {
    PoseidonTrait::new().update(salt).update(id).finalize()
}

fn token(salt: felt252, contract: ContractAddress, id: felt252) -> felt252 {
    let contract: felt252 = contract.into();
    PoseidonTrait::new().update(salt).update(contract).update(id).finalize()
}

fn A() -> ContractAddress {
    'CHALLENGE_A'.try_into().unwrap()
}

fn B() -> ContractAddress {
    'CHALLENGE_B'.try_into().unwrap()
}

#[test]
fn test_token_seed_is_poseidon_of_the_salt_the_contract_and_the_token_id() {
    let seed = TokenSeed { contract: A() };
    assert_eq!(seed.seed(Mode::Challenge, TIME, GAME_ID, 0), token(0, A(), 7));
    assert_eq!(seed.seed(Mode::Challenge, TIME, GAME_ID, 'SALT'), token('SALT', A(), 7));
    // [Assert] Neither the mode nor the time is read
    assert_eq!(seed.seed(Mode::None, TIME + 86400, GAME_ID, 0), token(0, A(), 7));
    // [Assert] Not the two-input seed of the token id alone
    assert!(seed.seed(Mode::Challenge, TIME, GAME_ID, 0) != poseidon(0, 7));
}

/// Two games of one day: the same day id, two token ids, two seeds (the day seed gave one).
#[test]
fn test_token_seed_two_games_of_one_day_differ() {
    let seed = TokenSeed { contract: A() };
    let first = seed.seed(Mode::Challenge, TIME, 1, 0);
    let second = seed.seed(Mode::Challenge, TIME + 60, 2, 0);
    assert_eq!(day_id(TIME, 86400), day_id(TIME + 60, 86400));
    assert_eq!(first, token(0, A(), 1));
    assert_eq!(second, token(0, A(), 2));
    assert!(first != second);
    let day = DaySeed {}.seed(Mode::Challenge, TIME, 1, 0);
    assert_eq!(DaySeed {}.seed(Mode::Challenge, TIME + 60, 2, 0), day);
}

/// Game 1 of two deployments: two contracts, two seeds (PM, 2026-10-14).
#[test]
fn test_token_seed_same_id_of_two_contracts_differ() {
    let a = TokenSeed { contract: A() }.seed(Mode::Challenge, TIME, 1, 0);
    let b = TokenSeed { contract: B() }.seed(Mode::Challenge, TIME, 1, 0);
    assert_eq!(b, token(0, B(), 1));
    assert!(a != b);
}

/// The game a spawn writes from the initial seed `seed`: started, then its hand and queue drawn
/// from the same random (`HostableComponent::spawn_with`, #645); the seed is kept.
fn spawned(game_id: u32, seed: felt252) -> Game {
    let mut game = GameImpl::new(game_id, TIME, Mode::Challenge, PLAYER().into());
    game.start(TIME, seed);
    game.advance(Option::Some(seed));
    game
}

/// What the devnet mock's first consume of a transaction returns for `salt` to `consumer`.
fn mock_random(salt: felt252, consumer: ContractAddress) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = poseidon_hash_span(array![seed, MOCK_TAG].span());
    poseidon_hash_span(array![random, 0].span())
}

/// The random of `player`'s spawn `index` on `challenge`.
fn spawn_random(challenge: ContractAddress, index: u32) -> felt252 {
    mock_random(draw_salt(SPAWN_KIND, PLAYER().into(), index), challenge)
}

/// Since #645 (D-30) `Challenge.spawn` seeds each game with `VrfSeed`: the random of the spawn's
/// VRF draw, salted with the player and its spawn count, kept as the game's seed. The game is
/// replayed off chain from it and compared. It is not the token's seed; two spawns of one day
/// differ.
#[test]
#[available_gas(l2_gas: 120212619)]
fn test_token_seed_is_the_seed_of_a_challenge_spawn() {
    snforge_std::start_cheat_block_timestamp_global(TIME);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let first = store.game(context.game_id);
    let expected = spawned(context.game_id, spawn_random(challenge, 0));
    assert_eq!(first.seed, expected.seed);
    assert_eq!(first.tiles, expected.tiles);
    assert_eq!(first.queue, expected.queue);
    // [Assert] Not the token's seed, nor the day's
    assert!(first.seed != token(0, challenge, context.game_id.into()));
    assert!(first.seed != DaySeed {}.seed(Mode::Challenge, TIME, 1, 0));
    let second_id = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    let second = store.game(second_id);
    assert_eq!(second.seed, spawned(second_id, spawn_random(challenge, 1)).seed);
    assert!(first.seed != second.seed);
    assert_eq!(first.day_id, second.day_id);
    assert_eq!(first.player_id, PLAYER().into());
}

/// Game 1 of two Challenge deployments draws two seeds: one salt, two consumers.
#[test]
#[available_gas(l2_gas: 185128913)]
fn test_token_seed_game_1_of_two_deployments_differ() {
    snforge_std::start_cheat_block_timestamp_global(TIME);
    let (store_a, systems_a, context_a) = setup::spawn_game(Mode::Challenge);
    let (store_b, systems_b, context_b) = setup::spawn_game(Mode::Challenge);
    let (a, b) = (systems_a.challenge.contract_address, systems_b.challenge.contract_address);
    assert!(a != b);
    assert_eq!(context_a.game_id, context_b.game_id);
    let game_a = store_a.game(context_a.game_id);
    let game_b = store_b.game(context_b.game_id);
    assert_eq!(game_a.seed, spawn_random(a, 0));
    assert_eq!(game_b.seed, spawn_random(b, 0));
    assert!(game_a.seed != game_b.seed);
}

#[test]
fn test_day_seed_none_is_zero_and_challenge_is_not() {
    assert_eq!(DaySeed {}.seed(Mode::None, TIME, GAME_ID, 0), 0);
    assert_eq!(
        DaySeed {}.seed(Mode::Challenge, TIME, GAME_ID, 0), poseidon(0, day_id(TIME, 86400).into()),
    );
}

#[test]
fn test_start_keeps_the_seed_of_the_source() {
    let seed = TokenSeed { contract: A() }.seed(Mode::Challenge, TIME, GAME_ID, 0);
    let game = started(Mode::Challenge, seed);
    assert_eq!(game.seed, token(0, A(), GAME_ID.into()));
}

#[test]
fn test_start_stub_source_changes_the_draw() {
    let default = started(
        Mode::Challenge, TokenSeed { contract: A() }.seed(Mode::Challenge, TIME, GAME_ID, 0),
    );
    let stub = StubSeed { value: 12345 };
    let other = started(Mode::Challenge, stub.seed(Mode::Challenge, TIME, GAME_ID, 0));
    assert_eq!(other.seed, 12345);
    assert!(other.seed != default.seed);
    // [Assert] The seed decides the first tile drawn: some stub seed draws another plan
    let mut a = default;
    let (_, plan_a) = a.draw_plan();
    let mut value: felt252 = 1;
    let mut found = false;
    while value != 64 {
        let mut c = started(
            Mode::Challenge, StubSeed { value }.seed(Mode::Challenge, TIME, GAME_ID, 0),
        );
        let (_, plan_c) = c.draw_plan();
        if plan_c != plan_a {
            found = true;
            break;
        }
        value += 1;
    }
    assert!(found);
}
