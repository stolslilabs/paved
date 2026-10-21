//! The Challenge on the VRF, with a queue of three tiles (#645, D-30,
//! `docs/architecture/challenge-vrf.md`), over the devnet mock `MockVrfProvider`.
//!
//! Every expected draw is computed here from the mock's formula and the salt the design gives, and
//! replayed on an in-memory `Game` (`GameImpl::start` and `GameImpl::advance`), so the tests check
//! where each random comes from and what it draws, not only that something was drawn.

use core::num::traits::Zero;
use core::poseidon::poseidon_hash_span;
use paved::components::drawable::DrawableComponent::VrfProviderSet;
use paved::components::drawable::{DrawableComponent, IDrawableDispatcher, IDrawableDispatcherTrait};
use paved::events::{Event as PavedEvent, Queued};
use paved::helpers::random_deck::popcount;
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::models::game::{Game, GameImpl, GameTrait};
use paved::models::tile::CENTER;
use paved::systems::challenge::Challenge::{MOVE_KIND, SPAWN_KIND};
use paved::systems::challenge::{
    Challenge, IChallengeDispatcherTrait as RawChallengeTrait, IChallengeDrawDispatcher,
    IChallengeDrawDispatcherTrait, IChallengeGuardianDispatcher, IChallengeGuardianDispatcherTrait,
    IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait,
};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IChallengeDispatcherTrait, OWNER, PLAYER, Systems, TestStore, TestStoreTrait, next_tx,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::views::IGameViewDispatcherTrait;
use paved::vrf::{IVrfProviderDispatcher, IVrfProviderDispatcherTrait, draw_salt};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait, declare,
    spy_events, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

/// What the mock's first consume of a transaction returns for `salt` to `consumer`: Poseidon of
/// the seed's random and the count 0 (`mocks::vrf`).
fn mock_random(salt: felt252, consumer: ContractAddress) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = poseidon_hash_span(array![seed, MOCK_TAG].span());
    poseidon_hash_span(array![random, 0].span())
}

/// The random of `player`'s spawn `index` on `challenge`.
fn spawn_random(challenge: ContractAddress, player: ContractAddress, index: u32) -> felt252 {
    mock_random(draw_salt(SPAWN_KIND, player.into(), index), challenge)
}

/// The random of the draw `index` of `game_id` on `challenge`.
fn move_random(challenge: ContractAddress, game_id: u32, index: u32) -> felt252 {
    mock_random(draw_salt(MOVE_KIND, game_id.into(), index), challenge)
}

fn draws(systems: @Systems) -> IChallengeDrawDispatcher {
    IChallengeDrawDispatcher { contract_address: *systems.challenge.contract_address }
}

/// The plan of the tile in hand.
fn hand(store: TestStore, game_id: u32) -> u8 {
    let game = store.game(game_id);
    store.tile(game, game.held_tile).plan
}

/// The game a spawn of `player` (its spawn `index`) at `time` holds, replayed in memory.
fn expected_spawn(
    challenge: ContractAddress, game_id: u32, player: ContractAddress, index: u32, time: u64,
) -> (Game, u8) {
    let random = spawn_random(challenge, player, index);
    let mut game = GameImpl::new(game_id, time, Mode::Challenge, player.into());
    game.start(time, random);
    let (_, plan, _) = game.advance(Option::Some(random));
    (game, plan.into())
}

/// The same state fields of two games: what the draws decide.
fn assert_same_draws(got: Game, expected: Game) {
    assert_eq!(got.seed, expected.seed);
    assert_eq!(got.tiles, expected.tiles);
    assert_eq!(got.tile_count, expected.tile_count);
    assert_eq!(got.held_tile, expected.held_tile);
    assert_eq!(got.queue, expected.queue);
}

/// Discards the tile in hand of `game_id` (a move that reads no board).
fn discard(systems: @Systems, game_id: u32) {
    (*systems.challenge).discard(game_id);
}

// The spawn

#[test]
fn test_challenge_vrf_spawn_draws_the_seed_and_three_tiles() {
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let mut spy = spy_events();
    let game_id = systems.challenge.spawn(1, Zero::zero(), 0);

    let game = store.game(game_id);
    let (expected, plan) = expected_spawn(challenge, game_id, PLAYER(), 0, game.start_time);
    assert_same_draws(game, expected);
    assert_eq!(hand(store, game_id), plan);
    // [Assert] The seed is the spawn's random, and the game is a VRF game with a full queue
    assert_eq!(game.seed, spawn_random(challenge, PLAYER(), 0));
    assert!(game.is_vrf());
    assert_eq!(game.tile_count, 2);
    assert_ne!(game.next_plan(), 0);
    assert_ne!(game.after_plan(), 0);
    // [Assert] Three `Queued`, tiles 2, 3 and 4
    spy
        .assert_emitted(
            @array![
                (challenge, PavedEvent::Queued(Queued { game_id, tile_id: 2, plan })),
                (
                    challenge,
                    PavedEvent::Queued(Queued { game_id, tile_id: 3, plan: game.next_plan() }),
                ),
                (
                    challenge,
                    PavedEvent::Queued(Queued { game_id, tile_id: 4, plan: game.after_plan() }),
                ),
            ],
        );
    // [Assert] The deck: 34 tiles left out by its walk, the starter and the three drawn
    assert_eq!(popcount(game.tiles), 34 + 1 + 3);
    // [Assert] `initial_seed` reads the stored seed of a VRF game
    let view = paved::views::IGameViewDispatcher { contract_address: challenge };
    assert_eq!(view.initial_seed(game_id), game.seed);
}

#[test]
fn test_challenge_vrf_spawn_salt_counts_the_players_spawns() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let draw = draws(@systems);
    assert_eq!(draw.spawn_salt(PLAYER()), draw_salt(SPAWN_KIND, PLAYER().into(), 0));
    let first = systems.challenge.spawn(1, Zero::zero(), 0);
    assert_eq!(draw.spawn_salt(PLAYER()), draw_salt(SPAWN_KIND, PLAYER().into(), 1));
    // [Assert] Another player's count is its own
    assert_eq!(draw.spawn_salt(OWNER()), draw_salt(SPAWN_KIND, OWNER().into(), 0));
    // [Assert] The second spawn draws with index 1: another seed
    let second = systems.challenge.spawn(1, Zero::zero(), 0);
    let store = TestStoreTrait::new(challenge);
    assert_eq!(store.game(second).seed, spawn_random(challenge, PLAYER(), 1));
    assert_ne!(store.game(first).seed, store.game(second).seed);
}

#[test]
#[feature("safe_dispatcher")]
fn test_challenge_vrf_a_reverted_spawn_counts_nothing() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    // [Setup] OWNER holds no USDC: its spawn draws, then the purchase's transfer reverts
    start_cheat_caller_address(challenge, OWNER());
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    assert!(safe.spawn(1, Zero::zero(), 0).is_err());
    stop_cheat_caller_address(challenge);
    // [Assert] The count is unchanged: the retry draws with the same salt
    assert_eq!(draws(@systems).spawn_salt(OWNER()), draw_salt(SPAWN_KIND, OWNER().into(), 0));
}

// A move

#[test]
fn test_challenge_vrf_a_move_shifts_the_queue_and_draws_tile_n_plus_two() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    let before = store.game(game_id);
    // [Assert] The view tells the client what the move draws
    let view = draws(@systems).draw(game_id);
    assert!(view.draws);
    assert_eq!(view.salt, draw_salt(MOVE_KIND, game_id.into(), before.tile_count + 3));
    assert_eq!(view.next, before.next_plan());
    assert_eq!(view.after, before.after_plan());
    assert_eq!(view.tiles, before.tiles);
    assert!(view.vrf);

    let mut spy = spy_events();
    discard(@systems, game_id);

    let mut expected = before;
    let (_, plan, first) = expected
        .advance(Option::Some(move_random(challenge, game_id, before.tile_count + 3)));
    let game = store.game(game_id);
    assert_same_draws(game, expected);
    // [Assert] The next tile came into the hand, the one after it moved up, one tile drawn
    assert_eq!(hand(store, game_id), before.next_plan());
    assert_eq!(plan.into(), before.next_plan());
    assert_eq!(game.next_plan(), before.after_plan());
    assert_eq!(first, game.held_tile + 2);
    spy
        .assert_emitted(
            @array![
                (
                    challenge,
                    PavedEvent::Queued(
                        Queued { game_id, tile_id: game.held_tile + 2, plan: game.after_plan() },
                    ),
                ),
            ],
        );
}

#[test]
fn test_challenge_vrf_a_build_draws_as_a_discard_does() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    // [Setup] A tile that fits north of the starter, written over the tile in hand
    let game = store.game(game_id);
    let mut tile = store.tile(game, game.held_tile);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    let before = store.game(game_id);
    systems.challenge.build(game_id, Orientation::North, CENTER, CENTER + 1);
    let mut expected = before;
    expected.advance(Option::Some(move_random(challenge, game_id, before.tile_count + 3)));
    assert_same_draws(store.game(game_id), expected);
}

#[test]
#[feature("safe_dispatcher")]
fn test_challenge_vrf_a_retried_move_draws_the_same_tile() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    let before = store.game(game_id);
    // [Setup] A build that draws, then reverts: the position is taken by the starter
    next_tx();
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    assert!(safe.build(game_id, Orientation::North, CENTER, CENTER).is_err());
    assert_eq!(store.game(game_id), before);
    // [Assert] The move sent again draws the same tile: the salt is the draw's, nothing else
    discard(@systems, game_id);
    let mut expected = before;
    expected.advance(Option::Some(move_random(challenge, game_id, before.tile_count + 3)));
    assert_same_draws(store.game(game_id), expected);
}

// The end of the deck

/// Discards the tile in hand of `game_id` in a transaction of its own, and returns how many
/// randoms the transaction consumed from `provider`.
fn discard_counting(systems: @Systems, provider: IVrfProviderDispatcher, game_id: u32) -> u32 {
    next_tx();
    (*systems.challenge).dispatcher().discard(game_id);
    provider.get_consume_count()
}

#[test]
fn test_challenge_vrf_the_last_moves_draw_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    // [Setup] A deck of 5 tiles: the starter, the hand (2) and the queue (3, 4)
    let mut game = store.game(game_id);
    game.tile_limit = 5;
    store.set_game(game);
    let provider = IVrfProviderDispatcher {
        contract_address: IDrawableDispatcher { contract_address: challenge }.vrf_provider(),
    };
    // [Assert] Tile 2 played: tile 5 is the last one drawn
    assert!(draws(@systems).draw(game_id).draws);
    assert_eq!(discard_counting(@systems, provider, game_id), 1);
    let game = store.game(game_id);
    assert_eq!((game.held_tile, game.next_plan() != 0, game.after_plan() != 0), (3, true, true));
    // [Assert] Tile 3 played: tile 6 is beyond the deck, nothing drawn
    let view = draws(@systems).draw(game_id);
    assert!(!view.draws);
    assert_eq!(view.salt, 0);
    assert_eq!(discard_counting(@systems, provider, game_id), 0);
    let game = store.game(game_id);
    assert_eq!((game.held_tile, game.next_plan() != 0, game.after_plan()), (4, true, 0));
    // [Assert] Tile 4 played: tile 5 comes into the hand, the queue is empty
    assert_eq!(discard_counting(@systems, provider, game_id), 0);
    let game = store.game(game_id);
    assert_eq!((game.held_tile, game.next_plan(), game.after_plan()), (5, 0, 0));
    // [Assert] Tile 5 played: the game is over, nothing drawn
    assert_eq!(discard_counting(@systems, provider, game_id), 0);
    assert!(store.game(game_id).is_over());
    assert!(!draws(@systems).draw(game_id).draws);
}

// A game spawned before #645

#[test]
fn test_challenge_vrf_a_game_without_queue_fills_it_from_one_draw() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    // [Setup] The state an older class left: no queue, no mark, the drawn tiles back in the deck
    let mut game = store.game(game_id);
    game.queue = 0;
    store.set_game(game);
    let before = store.game(game_id);
    let view = draws(@systems).draw(game_id);
    assert!(!view.vrf);
    assert!(view.draws);
    assert_eq!(view.salt, draw_salt(MOVE_KIND, game_id.into(), before.tile_count + 1));

    let mut spy = spy_events();
    discard(@systems, game_id);

    let random = move_random(challenge, game_id, before.tile_count + 1);
    let mut expected = before;
    let (tile_id, plan, first) = expected.advance(Option::Some(random));
    let game = store.game(game_id);
    assert_same_draws(game, expected);
    assert!(game.is_vrf());
    assert_eq!(first, tile_id);
    assert_eq!(hand(store, game_id), plan.into());
    // [Assert] Its seed is kept; three tiles are drawn, three `Queued`
    assert_eq!(game.seed, before.seed);
    spy
        .assert_emitted(
            @array![
                (challenge, PavedEvent::Queued(Queued { game_id, tile_id, plan: plan.into() })),
                (
                    challenge,
                    PavedEvent::Queued(
                        Queued { game_id, tile_id: tile_id + 1, plan: game.next_plan() },
                    ),
                ),
                (
                    challenge,
                    PavedEvent::Queued(
                        Queued { game_id, tile_id: tile_id + 2, plan: game.after_plan() },
                    ),
                ),
            ],
        );
}

// The provider's rules

#[test]
#[feature("safe_dispatcher")]
fn test_challenge_vrf_one_draw_per_transaction() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    next_tx();
    systems.challenge.dispatcher().discard(context.game_id);
    // [Assert] A second drawing move in the same transaction is refused
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    let reason = *safe.discard(context.game_id).unwrap_err().at(0);
    assert_eq!(reason, DrawableComponent::errors::ONE_DRAW_PER_TX);
    // [Assert] So is a spawn
    let reason = *safe.spawn(1, Zero::zero(), 0).unwrap_err().at(0);
    assert_eq!(reason, DrawableComponent::errors::ONE_DRAW_PER_TX);
}

/// A `Challenge` upgraded in place reads no provider until its owner sets one: no spawn, free or
/// paid, and no move that draws.
#[test]
#[feature("safe_dispatcher")]
fn test_challenge_vrf_nothing_draws_without_a_provider() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    snforge_std::store(challenge, selector!("vrf_provider"), array![0].span());
    assert!(IDrawableDispatcher { contract_address: challenge }.vrf_provider().is_zero());
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    let no_provider = DrawableComponent::errors::NO_PROVIDER;
    assert_eq!(*safe.spawn(1, Zero::zero(), 0).unwrap_err().at(0), no_provider);
    assert_eq!(*safe.spawn_free().unwrap_err().at(0), no_provider);
    assert_eq!(*safe.discard(context.game_id).unwrap_err().at(0), no_provider);
    // [Assert] A move that draws nothing still plays: surrender
    systems.challenge.surrender(context.game_id);
}

#[test]
fn test_challenge_vrf_the_owner_sets_the_provider() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let provider: ContractAddress = 'PROVIDER'.try_into().unwrap();
    let mut spy = spy_events();
    start_cheat_caller_address(challenge, OWNER());
    draws(@systems).set_vrf_provider(provider);
    stop_cheat_caller_address(challenge);
    assert_eq!(IDrawableDispatcher { contract_address: challenge }.vrf_provider(), provider);
    spy
        .assert_emitted(
            @array![
                (
                    challenge,
                    Challenge::Event::DrawableEvent(
                        DrawableComponent::Event::VrfProviderSet(VrfProviderSet { provider }),
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_challenge_vrf_only_the_owner_sets_the_provider() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    start_cheat_caller_address(systems.challenge.contract_address, PLAYER());
    draws(@systems).set_vrf_provider('PROVIDER'.try_into().unwrap());
}

#[test]
#[should_panic(expected: 'VRF: provider is zero')]
fn test_challenge_vrf_the_provider_is_never_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    start_cheat_caller_address(systems.challenge.contract_address, OWNER());
    draws(@systems).set_vrf_provider(Zero::zero());
}

#[test]
fn test_challenge_vrf_surrender_draws_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let before = store.game(context.game_id);
    systems.challenge.surrender(context.game_id);
    let game = store.game(context.game_id);
    assert!(game.is_over());
    assert_eq!(game.queue, before.queue);
    assert_eq!(game.tiles, before.tiles);
    let view = draws(@systems).draw(context.game_id);
    assert!(!view.draws);
}

/// A move that cannot be played draws nothing: the caller is not the game's player.
#[test]
fn test_challenge_vrf_the_view_draws_for_the_player_only() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    assert_eq!(game.move_draw('OTHER', game.start_time), Option::None);
    assert_eq!(game.move_draw(0, game.start_time), Option::None);
    assert_eq!(game.move_draw(game.player_id, game.expires_at()), Option::None);
    assert_eq!(
        game.move_draw(game.player_id, game.start_time), Option::Some(game.tile_count + 3),
    );
    let _ = systems;
}

// Fuzz: the queue's invariants over a whole game

/// A game cut at `limit` tiles (4 to 38: the spawn draws tiles 2 to 4 on the whole deck), played
/// to its end by discards: the queue never holds a tile beyond the limit and is full while it can
/// be, every tile of the game is drawn once (a `Queued` each), and each draw is the one its salt
/// gives.
#[test]
#[fuzzer(runs: 8, seed: 645)]
fn test_fuzz_challenge_vrf_queue_invariants(limit: u8) {
    let limit: u32 = 4 + (limit % 35).into();
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let game_id = context.game_id;
    let mut game = store.game(game_id);
    game.tile_limit = limit.try_into().unwrap();
    store.set_game(game);
    let mut spy = spy_events();
    // [Info] The spawn drew tiles 2 to 4
    let mut drawn: u32 = 3;
    let mut moves: u32 = 0;
    loop {
        let game = store.game(game_id);
        if game.is_over() {
            break;
        }
        let hand_id = game.held_tile;
        assert_eq!(game.next_plan() != 0, hand_id + 1 <= limit);
        assert_eq!(game.after_plan() != 0, hand_id + 2 <= limit);
        let view = draws(@systems).draw(game_id);
        assert_eq!(view.draws, hand_id + 3 <= limit);
        let mut expected = game;
        discard(@systems, game_id);
        moves += 1;
        if !store.game(game_id).is_over() {
            let random = if view.draws {
                drawn += 1;
                Option::Some(move_random(challenge, game_id, hand_id + 3))
            } else {
                Option::None
            };
            expected.advance(random);
            assert_same_draws(store.game(game_id), expected);
        }
    }
    // [Assert] Tiles 2 to `limit` were drawn, each once, and each was played
    let game = store.game(game_id);
    assert_eq!(game.tile_count, limit);
    assert_eq!(drawn, limit - 1);
    assert_eq!(moves, limit - 1);
    // [Assert] One `Queued` per tile a move drew, none for a move that drew nothing
    let events = spy.get_events().events;
    let mut queued: u32 = 0;
    for (from, event) in events.span() {
        if *from == challenge && *event.keys[0] == selector!("Queued") {
            queued += 1;
        }
    }
    assert_eq!(queued, drawn - 3);
}
