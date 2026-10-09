//! Prototype for the P8 calibration (not committed): plays one whole Daily game with a bot and
//! prints its final score. DAY (day index), STRATEGY (0 greedy, 1 random legal, 2 greedy without
//! characters, 3 random legal without characters, 4 greedy with random ties), SEED (bot randomness) come from the environment.
use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::structure::{oriented, placement, tables};
use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::tests::golden::full_deck::{edge_table, fits, key};
use paved::tests::golden::harness::day;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::role::Role;
use paved::types::spot::Spot;
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
    let use_characters = strategy == 0 || strategy == 1 || strategy == 4;
    let random = strategy == 1 || strategy == 3;
    snforge_std::start_cheat_block_timestamp_global(day(day_index));
    let (store, systems, _) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let game_id = systems.daily.spawn();
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
            let mut attempts: u8 = 0;
            let mut tried: u16 = 0;
            let row = oriented::plan_row(plan, co);
            let mut at: u8 = 1;
            let try_character = use_characters && (!random || next(ref rng) % 2 == 0);
            while try_character && at <= 9 && !done && attempts < 2 {
                let area = oriented::area_of(row, at);
                if area != 0 && tried & placement::role_bit(area) == 0 {
                    tried = tried | placement::role_bit(area);
                    let category: Category = tables::row_category(
                        oriented::area_row(plan, co, area),
                    )
                        .into();
                    let candidate: Role = match category {
                        Category::Wonder => Role::Pilgrim,
                        Category::City => Role::Paladin,
                        Category::Road => Role::Adventurer,
                        Category::Forest => Role::Woodsman,
                        _ => Role::None,
                    };
                    let bit: u8 = candidate.into();
                    let placed = builder.characters & placement::role_bit(bit);
                    if candidate != Role::None && placed == 0 {
                        attempts += 1;
                        let s: Spot = at.into();
                        if safe.build(game_id, co.into(), cx, cy, candidate, s).is_ok() {
                            done = true;
                        }
                    }
                }
                at += 1;
            }
            if !done {
                if safe.build(game_id, co.into(), cx, cy, Role::None, Spot::None).is_ok() {
                    done = true;
                }
            }
            if done {
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
