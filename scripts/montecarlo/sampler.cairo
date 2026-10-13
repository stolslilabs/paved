//! The bot that played the games of `scores.csv` (P8 calibration, docs/architecture/economy.md section 3).
//! A reference copy, not compiled by the package. To run it, place it at
//! `contracts/src/tests/golden/sampler.cairo`, add `pub mod sampler;` to `contracts/src/tests/golden.cairo`, make
//! `edge_table`, `edge`, `key` and `fits` of `golden/full_deck.cairo` public, then, one game per run:
//!     DAY=11 STRATEGY=0 SEED=0 snforge test --ignored test_sampler --max-n-steps 200000000
//! Strategies: 0 greedy (the full-deck golden's bot), 1 random legal, 2 greedy, 3 random legal, 4 greedy
//! with random ties. SEED drives the bot's own randomness; DAY picks the deck of the day.
//!
//! D-18: characters left the game, so the bot places none. The strategies that differed only by
//! characters play the same game now: 2 is 0 (greedy) and 3 is 1 (random legal). The ids stay, so the
//! rows of `scores.csv` keep their keys. Strategy 1 no longer draws the coin that chose, on each
//! candidate, whether to try a character: its random stream is the placement's alone, so its games
//! are not those of the sample before D-18 (the deal is: the day and the seed are unchanged).
use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::tests::golden::full_deck::{edge_table, fits, key};
use paved::tests::golden::harness::day;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use snforge_std::env::var;

fn env(name: ByteArray) -> u64 {
    let value = var(name);
    let felt = *value.at(0);
    felt.try_into().unwrap()
}

fn next(ref state: u64) -> u64 {
    // xorshift-like LCG on u64 wrapping (u128 math)
    let s: u128 = state.into();
    let n: u128 = (s * 6364136223846793005 + 1442695040888963407) % 0x10000000000000000;
    state = n.try_into().unwrap();
    state / 65536
}

#[test]
#[ignore]
#[feature("safe_dispatcher")]
#[available_gas(l2_gas: 12000000000)]
fn test_sampler() {
    let day_index = env("DAY");
    let strategy = env("STRATEGY");
    let mut rng: u64 = env("SEED") * 2654435761 + day_index + 1;
    let random = strategy == 1 || strategy == 3;
    snforge_std::start_cheat_block_timestamp_global(day(day_index));
    let (store, systems, _) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    let safe = IDailySafeDispatcher { contract_address: systems.daily.contract_address };
    let table = edge_table();
    let mut board: Felt252Dict<u8> = Default::default();
    let mut seen: Felt252Dict<bool> = Default::default();
    let mut frontier: Array<(u32, u32)> = array![];
    board.insert(key(CENTER, CENTER), 9 * 8 + 3);
    let starter = array![
        (CENTER, CENTER + 1), (CENTER + 1, CENTER), (CENTER, CENTER - 1), (CENTER - 1, CENTER),
    ];
    for position in starter.span() {
        let (x, y) = *position;
        seen.insert(key(x, y), true);
        frontier.append((x, y));
    }
    let mut builds: u32 = 0;
    let mut discards: u32 = 0;
    loop {
        let game = store.game(game_id);
        if game.is_over() {
            break;
        }
        let builder = store.builder(game, PLAYER().into());
        let tile = store.tile(game, builder.tile_id);
        let plan = tile.plan;
        let mut best: u8 = 0;
        let mut best_x: u32 = 0;
        let mut best_y: u32 = 0;
        let mut best_o: u8 = 0;
        let mut candidates: Array<(u32, u32, u8)> = array![];
        let mut index: u32 = 0;
        while index < frontier.len() {
            let (x, y) = *frontier.at(index);
            index += 1;
            if board.get(key(x, y)) != 0 {
                continue;
            }
            let mut orientation: u8 = 1;
            while orientation <= 4 {
                let (fit, count) = fits(@table, ref board, plan, orientation, x, y);
                if fit && count > 0 {
                    candidates.append((x, y, orientation));
                }
                if fit && count > best {
                    best = count;
                    best_x = x;
                    best_y = y;
                    best_o = orientation;
                }
                orientation += 1;
            }
        }
        if best == 0 {
            systems.daily.discard(game_id);
            discards += 1;
            continue;
        }
        // [Order] greedy: the best first; random: a random rotation of the list
        let n = candidates.len();
        let offset: u32 = if random {
            (next(ref rng) % n.into()).try_into().unwrap()
        } else {
            0
        };
        let mut order: Array<(u32, u32, u8)> = array![];
        if strategy == 4 {
            // noisy greedy: a random one among the candidates with the most neighbours
            let mut ties: Array<(u32, u32, u8)> = array![];
            let mut t: u32 = 0;
            while t < n {
                let (tx, ty, to) = *candidates.at(t);
                let (_, count) = fits(@table, ref board, plan, to, tx, ty);
                if count == best {
                    ties.append((tx, ty, to));
                }
                t += 1;
            }
            let pick: u32 = (next(ref rng) % ties.len().into()).try_into().unwrap();
            order.append(*ties.at(pick));
        } else if !random {
            order.append((best_x, best_y, best_o));
        }
        let mut i: u32 = 0;
        while i < n {
            order.append(*candidates.at((i + offset) % n));
            i += 1;
        }
        let mut done = false;
        let mut c: u32 = 0;
        while c < order.len() && !done {
            let (cx, cy, co) = *order.at(c);
            c += 1;
            if safe.build(game_id, co.into(), cx, cy).is_ok() {
                done = true;
                best_x = cx;
                best_y = cy;
                best_o = co;
            }
        }
        if !done {
            systems.daily.discard(game_id);
            discards += 1;
            continue;
        }
        builds += 1;
        board.insert(key(best_x, best_y), plan * 8 + best_o);
        let around = array![
            (best_x, best_y + 1), (best_x + 1, best_y), (best_x, best_y - 1), (best_x - 1, best_y),
        ];
        for position in around.span() {
            let (x, y) = *position;
            if !seen.get(key(x, y)) {
                seen.insert(key(x, y), true);
                frontier.append((x, y));
            }
        }
    }
    let game = store.game(game_id);
    println!(
        "SAMPLE day {} strategy {} seed {} score {} built {} discarded {}",
        day_index,
        strategy,
        env("SEED"),
        game.score,
        builds,
        discards,
    );
}
