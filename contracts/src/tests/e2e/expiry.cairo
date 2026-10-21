//! S1 (the PM's ruling on the client specification, `docs/architecture/client-spec-core.md`): a
//! Challenge game takes moves for 24 h from its start. From `start_time + 24 h` on, `build` and
//! `discard` revert with `'Game: expired'`; `surrender` stays open, so an expired game still ends,
//! is recorded by `Economy` as expired (no reward, no mean, as before S1) and is settled.
//! `GameView.expires_at` gives the deadline, `initial_seed` the seed the client replays the draws
//! from.

use core::num::traits::Zero;
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::constants;
use paved::mocks::token::IERC20Dispatcher;
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::models::game::{GameImpl, GameTrait};
use paved::models::tile::{CENTER, Tile};
use paved::seed::{SeedSource, TokenSeed};
use paved::systems::challenge::Challenge::{MOVE_KIND, SPAWN_KIND};
use paved::systems::challenge::{IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait};
use paved::systems::economy::{
    DAY, IEconomyDispatcherTrait, IEconomySafeDispatcher, IEconomySafeDispatcherTrait,
};
use paved::tests::legacy_g1::{IChallengeBeforeG1Dispatcher, IChallengeBeforeG1DispatcherTrait};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IChallengeDispatcherTrait, IERC20DispatcherTrait, OWNER, PLAYER, Systems, TestStore,
    TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::views::{
    IGameViewDispatcher, IGameViewDispatcherTrait, IGameViewSafeDispatcher,
    IGameViewSafeDispatcherTrait, TILE_HELD, TILE_PLACED,
};
use paved::vrf::draw_salt;
use snforge_std::{
    DeclareResultTrait, declare, get_class_hash, start_cheat_block_timestamp_global,
    start_cheat_caller_address,
};

/// The spawn time of every game below: an hour into day 10.
const START: u64 = 10 * 86400 + 3600;

/// A Challenge game of `PLAYER` spawned at `START`.
fn spawn_at_start() -> (TestStore, Systems, setup::Context) {
    start_cheat_block_timestamp_global(START);
    setup::spawn_game(Mode::Challenge)
}

fn views(systems: @Systems) -> IGameViewDispatcher {
    IGameViewDispatcher { contract_address: *systems.challenge.contract_address }
}

fn safe(systems: @Systems) -> IChallengeSafeDispatcher {
    IChallengeSafeDispatcher { contract_address: *systems.challenge.contract_address }
}

/// Sets the plan of the tile in hand, so the next build is known.
fn force_plan(store: TestStore, game_id: u32, plan: Plan) {
    let game = store.game(game_id);
    let builder = store.builder(game, PLAYER().into());
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
}

/// Builds tile 2 north of the starter tile: it closes the starter's city (a score above 0).
fn build_city(store: TestStore, systems: @Systems, game_id: u32) {
    force_plan(store, game_id, Plan::FFCFFFCFF);
    (*systems.challenge).build(game_id, Orientation::North, CENTER, CENTER + 1);
}

#[test]
fn test_expiry_validity_is_the_economy_day() {
    assert(constants::GAME_VALIDITY == DAY, 'Expiry: not the economy day');
}

#[test]
fn test_expiry_game_view_gives_start_plus_24h() {
    let (store, systems, context) = spawn_at_start();
    let view = views(@systems).game(context.game_id);
    assert(view.start_time == START, 'Expiry: start');
    assert(view.expires_at == START + 86400, 'Expiry: expires_at');
    // Unchanged by a move, and after the game is over
    build_city(store, @systems, context.game_id);
    systems.challenge.surrender(context.game_id);
    assert(views(@systems).game(context.game_id).expires_at == START + 86400, 'Expiry: over');
}

/// The boundary: the last second before `expires_at` takes a build and a discard; from
/// `expires_at` on, both revert and leave the game as it was.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_boundary_second() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    // [Before] the last second: a build, then a discard
    start_cheat_block_timestamp_global(START + 86400 - 1);
    build_city(store, @systems, game_id);
    systems.challenge.discard(game_id);
    let before = store.game(game_id);
    assert(before.built == 1 && before.discarded == 1, 'Expiry: moves before');
    // [At] expires_at: both revert
    start_cheat_block_timestamp_global(START + 86400);
    force_plan(store, game_id, Plan::FFCFFFCFF);
    let reason = *safe(@systems)
        .build(game_id, Orientation::North, CENTER, CENTER - 1)
        .unwrap_err()
        .at(0);
    assert(reason == 'Game: expired', 'Expiry: build at expiry');
    let reason = *safe(@systems).discard(game_id).unwrap_err().at(0);
    assert(reason == 'Game: expired', 'Expiry: discard at expiry');
    // Nothing moved
    let after = store.game(game_id);
    assert(after.built == before.built && after.discarded == before.discarded, 'Expiry: moved');
    assert(after.seed == before.seed && after.score == before.score, 'Expiry: state changed');
    assert(after.tile_count == before.tile_count && !after.over, 'Expiry: tiles changed');
}

/// Long after its expiry, a game still refuses a move.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_a_move_long_after_reverts() {
    let (_, systems, context) = spawn_at_start();
    start_cheat_block_timestamp_global(START + 30 * 86400);
    let reason = *safe(@systems).discard(context.game_id).unwrap_err().at(0);
    assert(reason == 'Game: expired', 'Expiry: discard');
}

/// Long after its expiry, a build refuses too (`discard` is tried above): the game and its tile in
/// hand stay as they were.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_a_build_long_after_reverts() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    start_cheat_block_timestamp_global(START + 30 * 86400);
    force_plan(store, game_id, Plan::FFCFFFCFF);
    let before = store.game(game_id);
    let reason = *safe(@systems)
        .build(game_id, Orientation::North, CENTER, CENTER + 1)
        .unwrap_err()
        .at(0);
    assert(reason == 'Game: expired', 'Expiry: build long after');
    let after = store.game(game_id);
    assert(after.built == before.built && after.score == before.score, 'Expiry: moved');
    assert(after.tile_count == before.tile_count && !after.over, 'Expiry: tiles changed');
}

/// A surrender 30 days after the expiry, once its day has closed: it passes, the game is recorded
/// expired with the score it froze at its expiry, and the closed day and the EMA do not move.
#[test]
fn test_expiry_a_surrender_long_after_is_recorded_expired() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    build_city(store, @systems, game_id);
    let score = store.game(game_id).score;
    assert(score > 0, 'Expiry: no score');
    // [Day closed] a second game of the day ends in time and settles, which closes the day
    let other = systems.challenge.spawn(1, Zero::zero(), 0);
    systems.challenge.surrender(other);
    let day = START / 86400;
    let long_after = START + 30 * 86400;
    start_cheat_block_timestamp_global(long_after);
    systems.economy.settle(array![other].span());
    let closed = systems.economy.day(day);
    assert(closed.closed, 'Expiry: day not closed');
    let ema = systems.economy.ema();

    // [Surrender] long after the expiry
    systems.challenge.surrender(game_id);
    let game = store.game(game_id);
    assert(game.over && game.score == score, 'Expiry: score not frozen');
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded && terms.expired, 'Expiry: not recorded expired');
    assert(terms.score == score && !terms.settled, 'Expiry: recorded score');
    assert(systems.economy.day(day) == closed, 'Expiry: closed day moved');
    assert(systems.economy.ema() == ema, 'Expiry: ema moved');
}

/// An expired game with no move at all surrenders at score 0, is recorded expired, and settles for
/// 0.
#[test]
fn test_expiry_an_expired_game_with_no_move_surrenders_at_zero() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    start_cheat_block_timestamp_global(START + 86400);
    systems.challenge.surrender(game_id);
    let game = store.game(game_id);
    assert(game.over && game.score == 0 && game.built == 0, 'Expiry: not zero');
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded && terms.expired && terms.score == 0, 'Expiry: not recorded expired');
    let day = START / 86400;
    start_cheat_block_timestamp_global((day + 2) * 86400);
    assert(systems.economy.settle(array![game_id].span()) == 0, 'Expiry: paid');
    let terms = systems.economy.terms(game_id);
    assert(terms.settled && terms.reward == 0, 'Expiry: not settled');
    let closed = systems.economy.day(day);
    assert(closed.closed && closed.weight == 0 && closed.sum == 0, 'Expiry: day not empty');
}

/// A game that never ends does not block its day: at `(d + 2) x DAY` the other game settles and
/// closes the day, while the game never ended stays unrecorded and cannot be settled.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_a_game_that_never_ends_does_not_block_its_day() {
    let (store, systems, context) = spawn_at_start();
    let ended = context.game_id;
    let never = systems.challenge.spawn(1, Zero::zero(), 0);
    build_city(store, @systems, ended);
    // A score above the day's threshold (the prior mean, 3,980 points), so that the game earns
    let mut game = store.game(ended);
    game.score = 10_000;
    store.set_game(game);
    systems.challenge.surrender(ended);
    let terms = systems.economy.terms(ended);
    assert(terms.recorded && !terms.expired && terms.score == 10_000, 'Expiry: not recorded');
    let day = START / 86400;
    start_cheat_block_timestamp_global((day + 2) * 86400);
    let paved = IERC20Dispatcher { contract_address: systems.economy.addresses().paved };
    let before = paved.balance_of(PLAYER());
    let minted = systems.economy.settle(array![ended].span());
    let terms = systems.economy.terms(ended);
    assert(terms.settled && terms.reward > 0, 'Expiry: not paid');
    assert(minted == terms.reward.into(), 'Expiry: minted');
    assert(paved.balance_of(PLAYER()) - before == terms.reward.into(), 'Expiry: balance');
    let closed = systems.economy.day(day);
    assert(closed.closed && closed.weight > 0, 'Expiry: day not closed');
    // [Never ended] unrecorded, and refused by `settle`
    assert(!store.game(never).over, 'Expiry: never ended');
    assert(!systems.economy.terms(never).recorded, 'Expiry: recorded');
    let economy = IEconomySafeDispatcher { contract_address: systems.economy.contract_address };
    let reason = *economy.settle(array![never].span()).unwrap_err().at(0);
    assert(reason == 'Economy: not recorded', 'Expiry: settled unrecorded');
}

/// An expired game ends by `surrender` (the PM's ruling, 2026-10-14), its score frozen at its
/// expiry, since no move lands after it: `Economy` records it
/// as expired (no mean), and settles it for 0, as it did before S1 for a game over after 24 h.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_an_expired_game_records_and_settles() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    build_city(store, @systems, game_id);
    let score = store.game(game_id).score;
    assert(score > 0, 'Expiry: no score');
    start_cheat_block_timestamp_global(START + 86400);
    assert(safe(@systems).discard(game_id).is_err(), 'Expiry: a move');
    systems.challenge.surrender(game_id);
    let game = store.game(game_id);
    assert(game.over && game.score == score, 'Expiry: not over');
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded && terms.expired, 'Expiry: not recorded expired');
    assert(terms.score == score, 'Expiry: recorded score');
    let day = START / 86400;
    start_cheat_block_timestamp_global((day + 2) * 86400);
    let minted = systems.economy.settle(array![game_id].span());
    assert(minted == 0, 'Expiry: an expired game paid');
    let terms = systems.economy.terms(game_id);
    assert(terms.settled && terms.reward == 0, 'Expiry: not settled');
    let closed = systems.economy.day(day);
    assert(closed.weight == 0 && closed.sum == 0, 'Expiry: in the mean');
}

/// A game that ends on the last second before its expiry is recorded unexpired: the game's
/// deadline and `Economy`'s are the same second.
#[test]
fn test_expiry_a_game_over_on_the_last_second_is_not_expired() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    let mut game = store.game(game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    start_cheat_block_timestamp_global(START + 86400 - 1);
    systems.challenge.discard(game_id);
    assert(store.game(game_id).over, 'Expiry: not over');
    let terms = systems.economy.terms(game_id);
    assert(terms.recorded && !terms.expired, 'Expiry: recorded expired');
}

/// `initial_seed` is the token's seed, and it is enough to replay the draws: from it and the
/// tiles of `tiles()` in draw order, the client's replay (here `GameImpl`) finds the chain's
/// current seed, deck bitmap and tile in hand, after a build and two discards.
#[test]
fn test_expiry_initial_seed_replays_the_draws() {
    let (store, systems, context) = spawn_at_start();
    let game_id = context.game_id;
    let contract = systems.challenge.contract_address;
    // [Info] Since #645 the seed is the random of the spawn's VRF draw, stored
    let seed = views(@systems).initial_seed(game_id);
    let salt = draw_salt(SPAWN_KIND, PLAYER().into(), 0);
    assert(seed == mock_random(salt, contract), 'Expiry: not the spawn random');

    build_city(store, @systems, game_id);
    systems.challenge.discard(game_id);
    systems.challenge.discard(game_id);

    // [Replay] the spawn: the starter tile, the deck's withdrawal, the hand and the queue
    let mut game = GameImpl::new(game_id, START, Mode::Challenge, PLAYER().into());
    game.start(START, seed);
    let (_, mut plan, _) = game.advance(Option::Some(seed));
    // [Replay] each move: the tile `held + 3` drawn from its own salt, while within the deck
    let view = views(@systems).game(game_id);
    while game.tile_count < view.tile_id {
        let index = game.tile_count + 3;
        let random = if index <= game.tile_limit.into() {
            Option::Some(mock_random(draw_salt(MOVE_KIND, game_id.into(), index), contract))
        } else {
            Option::None
        };
        let (_, next, _) = game.advance(random);
        plan = next;
    }
    assert(game.seed == view.seed, 'Expiry: replayed seed');
    assert(game.tiles == store.game(game_id).tiles, 'Expiry: replayed deck');
    assert(game.queue == store.game(game_id).queue, 'Expiry: replayed queue');
    assert(game.tile_count == view.tile_id, 'Expiry: replayed tile id');
    let plan: u8 = plan.into();
    assert(plan == view.plan, 'Expiry: replayed plan');
}

/// What the devnet mock's first consume of a transaction returns for `salt` to `consumer`.
fn mock_random(salt: felt252, consumer: starknet::ContractAddress) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = core::poseidon::poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = core::poseidon::poseidon_hash_span(array![seed, MOCK_TAG].span());
    core::poseidon::poseidon_hash_span(array![random, 0].span())
}

#[test]
#[feature("safe_dispatcher")]
fn test_expiry_initial_seed_of_no_game_reverts() {
    let (_, systems, _) = spawn_at_start();
    let safe_views = IGameViewSafeDispatcher {
        contract_address: systems.challenge.contract_address,
    };
    let reason = *safe_views.initial_seed(2).unwrap_err().at(0);
    assert(reason == 'Game: does not exist', 'Expiry: no game');
}

/// A game spawned before the upgrade that brings the expiry (here by the frozen spawn of f94c34f,
/// `legacy_g1::ChallengeBeforeG1`, as `upgrade_g4.cairo` does) gets the same 24 h, from the start
/// time it stored: no slot is added, the deadline is computed from `GameConfig.start_time`. Its
/// initial seed is the token seed that class used.
#[test]
#[feature("safe_dispatcher")]
fn test_expiry_a_game_spawned_before_the_upgrade_gets_24h_from_its_start() {
    start_cheat_block_timestamp_global(START);
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let contract = systems.challenge.contract_address;

    // [Before the upgrade] a class without the expiry spawns the game in flight
    let class_s1 = get_class_hash(contract);
    let frozen = *declare("ChallengeBeforeG1").unwrap().contract_class().class_hash;
    start_cheat_caller_address(contract, OWNER());
    IUpgradeableDispatcher { contract_address: contract }.upgrade(frozen);
    start_cheat_caller_address(contract, PLAYER());
    let in_flight = IChallengeBeforeG1Dispatcher { contract_address: contract }
        .spawn(1, Zero::zero(), 0);

    // [Upgrade] to the S1 class, an hour before the game's deadline
    start_cheat_block_timestamp_global(START + 86400 - 3600);
    start_cheat_caller_address(contract, OWNER());
    IChallengeBeforeG1Dispatcher { contract_address: contract }.upgrade(class_s1);
    start_cheat_caller_address(contract, PLAYER());

    // [After the upgrade] the deadline is its start + 24 h, and the seed its token's
    let view = views(@systems).game(in_flight);
    assert(view.expires_at == START + 86400, 'Expiry: in flight deadline');
    let token = TokenSeed { contract }.seed(Mode::Challenge, 0, in_flight, 0);
    assert(views(@systems).initial_seed(in_flight) == token, 'Expiry: in flight seed');
    // It plays until its last second, then refuses a move, and still ends and is recorded
    start_cheat_block_timestamp_global(START + 86400 - 1);
    systems.challenge.discard(in_flight);
    start_cheat_block_timestamp_global(START + 86400);
    let reason = *safe(@systems).discard(in_flight).unwrap_err().at(0);
    assert(reason == 'Game: expired', 'Expiry: in flight move');
    systems.challenge.surrender(in_flight);
    assert(store.game(in_flight).over, 'Expiry: in flight not over');
    let terms = systems.economy.terms(in_flight);
    assert(terms.recorded && terms.expired, 'Expiry: in flight not recorded');
}
