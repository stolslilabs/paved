//! Games that stay open across the G1 upgrade: a game spawned before it keeps its deck.
//!
//! G1 changes how the spawn builds the deck (`DeckTrait::tiles`, the walk). The deck is built once,
//! at the spawn, and stored as the game's bitmap (`Game.tiles`); every later draw
//! (`Game::draw_plan`, after a build or a discard) reads that bitmap and the game's seed, never the
//! walk. So a game spawned by the class before G1 keeps the deck that class built.
//!
//! The test: `Challenge` is given the frozen spawn of f94c34f (`legacy_g1::ChallengeBeforeG1`, by
//! its owner's `upgrade`, as `upgrade_d19.cairo` emulates the deploy of its old class), spawns a
//! game (paid and minted, as on chain), and is upgraded back to the G1 class; the game is then
//! played to its end under the G1 class, one discard per tile (a discard draws the next tile as a
//! build does: `reseed` then `draw_plan`). The deck after the spawn is the old walk's, which
//! differs from the one the new walk would have built on the same seed; every one of the 37 tiles
//! drawn is a tile of the old deck, each once, so the 37 plans drawn are exactly the old deck's.

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::num::traits::{Pow, Zero};
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::helpers::random_deck::popcount;
use paved::models::game::GameTrait;
use paved::seed::{SeedSource, TokenSeed};
use paved::tests::legacy_g1::{
    IChallengeBeforeG1Dispatcher, IChallengeBeforeG1DispatcherTrait, tiles_before_g1,
};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, OWNER, PLAYER, TestStoreTrait};
use paved::types::deck::{Deck, DeckImpl};
use paved::types::mode::Mode;
use paved::types::plan::Plan;
use snforge_std::{DeclareResultTrait, declare, get_class_hash, start_cheat_caller_address};

/// How many tiles of each plan `plans` holds, by plan id (0 to 63).
fn counts(plans: Span<u8>) -> Array<u32> {
    let mut by_plan: Felt252Dict<u32> = Default::default();
    for plan in plans {
        by_plan.insert((*plan).into(), by_plan.get((*plan).into()) + 1);
    }
    let mut counts: Array<u32> = array![];
    let mut plan: felt252 = 0;
    while plan != 64 {
        counts.append(by_plan.get(plan));
        plan += 1;
    }
    counts
}

/// The plans of the free indexes (clear bits) of `bitmap`: the bit `i` is the card `i + 1`, as
/// `Game::draw_plan` reads it.
fn plans_of_free(bitmap: u128) -> Array<u8> {
    let deck = Deck::Simple;
    let mut plans: Array<u8> = array![];
    let mut mask: u128 = 1;
    let mut index: u8 = 0;
    while index < deck.total_count() {
        if bitmap & mask == 0 {
            plans.append(deck.plan((index + 1).into()).into());
        }
        mask *= 2;
        index += 1;
    }
    plans
}

#[test]
#[available_gas(l2_gas: 473572161)]
fn test_upgrade_g1_game_spawned_before_keeps_its_deck() {
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let contract = systems.challenge.contract_address;

    // [Before the upgrade] the frozen class of f94c34f spawns the game (`PLAYER` is the caller)
    let class_g1 = get_class_hash(contract);
    let frozen = *declare("ChallengeBeforeG1").unwrap().contract_class().class_hash;
    start_cheat_caller_address(contract, OWNER());
    IUpgradeableDispatcher { contract_address: contract }.upgrade(frozen);
    start_cheat_caller_address(contract, PLAYER());
    let g = IChallengeBeforeG1Dispatcher { contract_address: contract }.spawn(1, Zero::zero(), 0);

    // The deck is the old walk's, on the token's seed; the new walk would have built another
    let deck = Deck::Simple;
    let mut indexes = deck.indexes(Plan::RFFFRFCFR);
    let starter: u128 = 2_u128.pow(indexes.pop_front().unwrap().into());
    let seed = TokenSeed { contract }.seed(Mode::Challenge, 0, g, 0);
    let old = tiles_before_g1(deck, starter, seed);
    let new = deck.tiles(starter, seed);
    assert_eq!(popcount(old), 35);
    assert_eq!(popcount(new), 35);
    assert(old != new, 'G1: same deck');
    let game = store.game(g);
    // The spawn drew one tile from the old deck: the bitmap is the old deck and that tile
    assert_eq!(game.tiles & old, old);
    assert_eq!(popcount(game.tiles), 36);

    // [Upgrade] to the G1 class
    start_cheat_caller_address(contract, OWNER());
    IChallengeBeforeG1Dispatcher { contract_address: contract }.upgrade(class_g1);
    start_cheat_caller_address(contract, PLAYER());
    assert_eq!(get_class_hash(contract), class_g1);

    // [After the upgrade] every tile is discarded until the game ends; each draw comes from the
    // old deck, once. Since #645 the first move fills the hand and the queue (three tiles from
    // one VRF draw), then each move queues one tile while one is left to queue
    let mut drawn: Array<u8> = array![];
    let mut tiles = game.tiles;
    let mut first = true;
    loop {
        let game = store.game(g);
        let builder = store.builder(game, PLAYER().into());
        drawn.append(store.tile(game, builder.tile_id).plan);
        systems.challenge.discard(g);
        let after = store.game(g);
        if after.is_over() {
            break;
        }
        if after.tiles != 0 {
            // The tiles drawn are out, and they were in the old deck
            let queued: u32 = if first {
                3
            } else if after.held_tile + 2 <= 38 {
                1
            } else {
                0
            };
            assert_eq!(popcount(after.tiles), popcount(tiles) + queued);
            assert_eq!((after.tiles - tiles) & old, 0);
        }
        first = false;
        tiles = after.tiles;
    }
    let game = store.game(g);
    assert_eq!(game.tile_count, 38);
    assert_eq!(game.discarded, 37);
    assert_eq!(drawn.len(), 37);

    // The 37 plans drawn are the old deck's 37 tiles, plan by plan, and not the new deck's
    let drawn = counts(drawn.span());
    assert_eq!(drawn, counts(plans_of_free(old).span()));
    assert(drawn != counts(plans_of_free(new).span()), 'G1: same plans');
}
