//! Gas baseline of one `Challenge.build` call on five scenarios (phase P0), and of the spawns and
//! the Vault's calls since.
//!
//! Each test plays a deterministic sequence of moves and isolates the L2 (Sierra) gas of the LAST
//! `build` call only: the gas available to the test is read right before and right after that
//! call, so the setup, the spawn and the preparatory moves are excluded. Every scenario asserts a
//! ceiling set 5 % above the figure measured on the pinned toolchain, so a regression fails CI.
//!
//! The tile held by the builder is overwritten with the plan we want (same technique as the e2e
//! tests), so the sequences do not depend on the random draw. Plans are kept within the
//! composition of the deck: no plan is used more often than the Base deck contains it.
//!
//! Plans are written `Center, NW, N, NE, E, SE, S, SW, W` (see `types/plan.cairo`). Used below:
//! - `RFFFRFFFR`: a straight W-E road.
//! - `FFCFFFCFF`: two separate city caps, on the N and S edges.
//! - `CFFFCFFFC`: a city corridor, W-E when facing North, N-S when facing East.
//! - `FFFFCCCFF`: a city corner, E+S when facing North, S+W East, W+N South, N+E West.
//! - `CCCCCFFFC`: a city T-junction, N+E+W when facing North, S+E+W when facing South.
//! - `FFFFFFCFF`: a city cap on the S edge, facing North; W edge facing East, N edge facing South.
//! - `RFRFFFFFR`: a road curve N+W facing North, E+N East, S+E South, W+S West; one forest in the
//!   corner between the roads and one around the outside.
//! - `RFFFRFFFR`: a straight road, W-E facing North, N-S facing East, forests on both sides.
//! - `WFFFFFFFF`: a wonder (its centre) in a ring of forest on every edge.
//! The starter tile (`RFFFRFCFR`, facing South) is a city cap on its N edge with a W-E road.

use core::hash::HashStateTrait;
use core::num::traits::Zero;
use core::poseidon::PoseidonTrait;
use core::testing::get_available_gas;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_interfaces::erc4626::{ERC4626ABIDispatcher, ERC4626ABIDispatcherTrait};
use openzeppelin_interfaces::votes::{IVotesDispatcher, IVotesDispatcherTrait};
use paved::constants::{self, CENTER};
use paved::mocks::drawer::{IDrawHarnessDispatcher, IDrawHarnessDispatcherTrait};
use paved::models::game::{GameImpl, GameTrait};
use paved::seed::SeedSource;
use paved::systems::challenge::Challenge;
use paved::systems::challenge::Challenge::InternalTrait;
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcherTrait,
    ISetupPacksDispatcher, ISetupPacksDispatcherTrait, ISetupSkinsDispatcher,
    ISetupSkinsDispatcherTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare,
    interact_with_state, start_cheat_block_timestamp_global, start_cheat_caller_address,
    start_cheat_transaction_hash_global, stop_cheat_caller_address, test_address,
};
use starknet::ContractAddress;
use crate::setup::setup;
use crate::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, OWNER, PAVED, PLAYER, Systems, TestStore, TestStoreTrait,
};

// Ceilings: measured figure + 5 %, rounded up (see docs/measures/baseline.md).
pub const CEILING_OPEN: u128 = 4805849;
pub const CEILING_SIMPLE: u128 = 5172772;
// G5 cut the draw that follows each build (a table of bits, popcount by one product) and reset
// a0 to e, m and n to measured + 5 % (`docs/measures/baseline.md`, "After G5"). c and e had been
// raised by G1 (the draw read another deck on the same seed). f's measured + 5 % (19,032,185)
// would be above its ceiling, which is kept.
// G7a (P-59) reset a0, d, e, f, l, m and n to measured + 5 % (`docs/measures/baseline.md`, "After
// G7a"); a's and c's measured + 5 % would be above their ceilings, which are kept.
pub const CEILING_CLOSE_LARGE: u128 = 5602221;
pub const CEILING_WORST_CASE: u128 = 5448875;
pub const CEILING_FOREST: u128 = 8744784;
pub const CEILING_FOREST_WORST: u128 = 18714365;
// g, i, k: a surrender runs in `Daily` since D-24 (no library call); every game over makes one
// external call to `Setup.report` (D-24, `docs/measures/baseline.md`, "After D-21/24").
// g to l: a Daily game over records its score in `Economy` (P8 E3): the economy read (from
// `Account` then, from `Setup.wiring` since D-25 E) and `Economy.record` add about 1.46M (1.11M on
// i). D-20 took the ranking out of g, k and l, and h (the closing move that did not rank) and j
// (the `tournament` view) out with it; the ceilings are those set when the ranking was there
// (`docs/measures/baseline.md`, "After D-20").
pub const CEILING_CLOSING_IN_DAY: u128 = 4011404;
// i: raised at D-24 to measured + 5 % (2,712,368; CORE's decision, reversed if the PM asks for
// savings): the external `Setup.report` call at game over that D-24 chose costs +181,280 over D-20
// (2,531,088).
pub const CEILING_CLOSING_AFTER: u128 = 3530987;
pub const CEILING_CLOSING_FULL_REPORT: u128 = 4547964;
pub const CEILING_GAME_OVER_ON_BUILD: u128 = 7588501;
// s: the game over on the last `discard` (D-24: measured 3,360,103 + 5 %; no figure before D-24).
pub const CEILING_GAME_OVER_ON_DISCARD: u128 = 4243648;
// m, n: spawns (P8 E3); o (the Tutorial spawn) left with the Tutorial (D-21). A Daily spawn pays
// `Economy.purchase` (swap, burn, Vault). G1 cut the deck walk of the spawn (about 32M).
pub const CEILING_SPAWN_DAILY: u128 = 16869631;
pub const CEILING_SPAWN_DAILY_REFERRED: u128 = 17765302;
// t to w: the Vault, vPAVED (P-56), each call by a holder who delegated to themselves (the votes'
// checkpoints included), after a paid spawn (its margin in the Vault, so the rate is above 1).
pub const CEILING_VAULT_DEPOSIT: u128 = 3903711;
pub const CEILING_VAULT_REDEEM: u128 = 3809165;
pub const CEILING_VAULT_WITHDRAW: u128 = 5499165;
pub const CEILING_VAULT_TRANSFER: u128 = 1583287;
// Cobbles v1, part 1 (P-61): every paid game over writes Setup's ledger (the day's and the
// account's slots, and the week's from week 0 on), so g, i, k, l and s are reset to measured + 5 %
// (`docs/measures/baseline.md`, "After cobbles v1, part 1"): +645,916 each, +722,746 on k. x and y
// are g and k in a week (+940,298 on x); z1 to z6, the claims, the free spawn and a free game over.
pub const CEILING_CLOSING_IN_A_WEEK: u128 = 4320505;
pub const CEILING_FULL_REPORT_IN_A_WEEK: u128 = 4874485;
pub const CEILING_CLAIM_QUEST: u128 = 949842;
pub const CEILING_CLAIM_ACHIEVEMENT: u128 = 578407;
pub const CEILING_CLAIM_DAILY_CREDIT: u128 = 2438641;
pub const CEILING_CLAIM_WEEKLY_CREDIT: u128 = 1545317;
pub const CEILING_SPAWN_FREE: u128 = 6891797;
pub const CEILING_FREE_GAME_OVER: u128 = 1848236;
// Cobbles v1, part 2 (P-61): z7 and z8, `buy_pack` with no referrer and with one; z9, `set_pack`
// (measured + 5 %, `docs/measures/baseline.md`, "After cobbles v1, part 2").
pub const CEILING_BUY_PACK: u128 = 9897659;
pub const CEILING_BUY_PACK_REFERRED: u128 = 10814792;
pub const CEILING_SET_PACK: u128 = 327873;
// Cobbles v1, part 3 (P-61): z10, `buy_pack` as the first sale of a block; z11 `buy_skin`, z12 and
// z13 `set_skins` (1 and 19 changes), z14 `set_skin_price` (measured + 5 %,
// `docs/measures/baseline.md`, "After cobbles v1, part 3").
pub const CEILING_BUY_PACK_FIRST_OF_BLOCK: u128 = 10264035;
pub const CEILING_BUY_SKIN: u128 = 697961;
pub const CEILING_SET_SKINS_1: u128 = 479549;
pub const CEILING_SET_SKINS_19: u128 = 2789690;
pub const CEILING_SET_SKIN_PRICE: u128 = 317636;
// VRF-DRAWS (#638): z15, one draw of `DrawableComponent` in the test harness over the devnet mock
// (the consumer's side: the one-draw check, the provider's consume count, the salt, the provider's
// call, the count). Cartridge's
// part of a real draw (`submit_random`'s proof check, `assert_consumed`) is measured on Sepolia
// (`docs/architecture/vrf-draws.md`, section 6). Measured in CI 986,461, + 5 % (599,559 before the
// first-consume check and the mock's count of the transaction's consumes, two slots written).
pub const CEILING_VRF_DRAW: u128 = 1035785;
/// Monday 1970-01-12 00:00 UTC: the start of week 1 of the cobbles' calendar.
pub const WEEK_1: u64 = 950400;
// p, q, r (sponsor, claim, reclaim) left with the prize (D-20).
// The scores of the forest scenarios after their last move, checked against the oracle's walks by
// `src/tests/differential.cairo` (D-18b).
pub const SCORE_E: u32 = 767;
pub const SCORE_F: u32 = 5618;

#[derive(Drop)]
struct Scenario {
    systems: Systems,
    store: TestStore,
    game_id: u32,
    player_id: felt252,
}

#[generate_trait]
impl ScenarioImpl of ScenarioTrait {
    /// A Challenge game of `PLAYER` on the seed the ceilings were measured with: the day seed of
    /// the spawn's time, Poseidon(0, day id), which D-23 replaced by the token's (`DaySeed`). The
    /// plans are forced, but the draw that follows each build reads the seed, and its cost moves
    /// with it (scenario a: 6,551,754 on Poseidon(0, game id), the token seed before the contract
    /// address joined it, 5,129,292 on the day seed).
    fn new() -> Scenario {
        let (store, systems, context) = setup::spawn_game(Mode::None);
        let game_id = spawn_on_the_day_seed(@systems, context.token.contract_address, PLAYER());
        Scenario { systems, store, game_id, player_id: context.player_id }
    }

    /// Overwrites the plan of the tile held by the builder, then builds it. Returns the L2 gas
    /// consumed by the `build` call alone.
    fn build(self: @Scenario, plan: Plan, orientation: Orientation, x: u32, y: u32) -> u128 {
        let game = self.store.game(*self.game_id);
        let builder = self.store.builder(game, *self.player_id);
        let mut tile = self.store.tile(game, builder.tile_id);
        tile.plan = plan.into();
        self.store.set_tile(tile);

        let before = get_available_gas();
        self.systems.challenge.build(*self.game_id, orientation, x, y);
        let after = get_available_gas();
        before - after
    }

    /// Builds a tile, the gas not kept.
    fn step(self: @Scenario, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        self.build(plan, orientation, x, y);
    }
}

/// The seed of a Challenge game before D-23: Poseidon of the salt and the day id.
#[derive(Copy, Drop)]
struct DaySeed {}

impl DaySeedImpl of SeedSource<DaySeed> {
    fn seed(self: @DaySeed, mode: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        // As the removed `Mode::seed`, and `src/tests/seed.cairo`'s copy: 0 for any other mode
        match mode {
            Mode::Challenge => PoseidonTrait::new()
                .update(salt)
                .update((time / constants::CHALLENGE_DURATION).into())
                .finalize(),
            _ => 0,
        }
    }
}

/// Spawns a paid Challenge game (stake 1, no referrer) for `player` through `Challenge`'s own path
/// (`spawn_from`) with `DaySeed`, as `src/tests/golden/harness.cairo` does: the path runs in
/// Challenge's state, so its caller is cheated on the test's address, and USDC, `Economy` and
/// `Collection` are told, for one call each, that Challenge calls them.
fn spawn_on_the_day_seed(
    systems: @Systems, token: ContractAddress, player: ContractAddress,
) -> u32 {
    let challenge = *systems.challenge.contract_address;
    start_cheat_caller_address(test_address(), player);
    for callee in array![
        token, *systems.economy.contract_address, *systems.collection.contract_address,
    ] {
        cheat_caller_address(callee, challenge, CheatSpan::TargetCalls(1));
    }
    let game_id = interact_with_state(
        challenge,
        || {
            let mut state = Challenge::contract_state_for_testing();
            state.spawn_from(@DaySeed {}, 1, Zero::zero(), 0)
        },
    );
    stop_cheat_caller_address(test_address());
    game_id
}

fn report(name: ByteArray, gas: u128, ceiling: u128) {
    println!("GAS {}: {}", name, gas);
    assert(gas <= ceiling, 'Gas: above ceiling');
}

/// a0. Open simple move: a road tile east of the starter tile; it closes nothing.
#[test]
fn test_gas_a0_open_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s.build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER);
    report("a0_open_simple_move", gas, CEILING_OPEN);
}

/// a. Simple move that closes a 2-tile city: the new tile's S cap meets the starter's N cap. Since
/// D-18 the city scores (before, it scored only with a character in it, none here).
#[test]
fn test_gas_a_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s.build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1);
    report("a_simple_move", gas, CEILING_SIMPLE);
}

/// c. Closes a 6-tile city (scoring included; before D-18 a character on it was recovered too).
///
/// starter (cap N) - corridor - corridor - corridor - corner - cap, going north then east.
#[test]
fn test_gas_c_close_large_city() {
    let s = ScenarioTrait::new();
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    // The cap closes the city: it scores.
    let gas = s.build(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4);
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: city not scored');
    report("c_close_large_city", gas, CEILING_CLOSE_LARGE);
}

/// d. Worst case of the walks of P0: the last tile of a 12-tile city tree (placed with a character
/// before D-18).
///
/// The city is a tree rooted on the starter tile: two corridors and a T-junction going north, then
/// two arms of four and three tiles that stay open until the last move. The last tile (a cap)
/// closes the second arm and therefore the whole tree. Under P0's walks this move walked the 11
/// existing tiles for the conflict check and the 12 of the closed tree for the assessment; under
/// the structure state it is a counter reaching 0 and one `Scored`.
#[test]
fn test_gas_d_worst_case() {
    let s = ScenarioTrait::new();
    // [Spine] going north from the starter tile, ending on a T-junction
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 3);
    // [West arm] corridor, corner, corner, cap
    s.step(Plan::CFFFCFFFC, Orientation::North, CENTER - 1, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER - 2, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::South, CENTER - 2, CENTER + 2);
    s.step(Plan::FFFFFFCFF, Orientation::West, CENTER - 3, CENTER + 2);
    // [East arm] corner, corner, corner, then the closing cap
    s.step(Plan::FFFFCCCFF, Orientation::South, CENTER + 1, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER + 1, CENTER + 4);
    s.step(Plan::FFFFCCCFF, Orientation::East, CENTER + 2, CENTER + 4);
    let gas = s.build(Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3);
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: tree not scored');
    report("d_worst_case", gas, CEILING_WORST_CASE);
}

/// e. Closes a forest of 4 tiles (the forest scan included).
///
/// Four road curves under the starter close a loop of road around one corner; their inner corners
/// are one forest. The fourth curve closes the loop of road and the forest: the golden
/// `daily_forest_woodsman_ring` (its expected score comes from the oracle). Before D-18 a Woodsman
/// waited on the first curve; the same move without it is scenario e0 of `baseline.md`, whose
/// figure before D-18 is measured on the frozen class (`src/tests/e2e/upgrade_d18.cairo`): without
/// a forest character nothing was scanned. Since D-18 every forest closure is scanned, so e is the
/// figure of both.
#[test]
fn test_gas_e_close_forest() {
    let s = ScenarioTrait::new();
    s.step(Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1);
    s.step(Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1);
    s.step(Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2);
    let gas = s.build(Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    let game = s.store.game(s.game_id);
    assert(game.score == SCORE_E, 'Gas: forest not scored');
    report("e_close_forest", gas, CEILING_FOREST);
}

/// f. Worst forest scan we can build: the last tile closes a forest of 16 nodes inside a loop of 12
/// road tiles (before D-18, a Woodsman waited on it).
///
/// The starter tile is the top edge of the loop (its south forest is the inside). The loop goes
/// east along the top, down the right column, west along the bottom, up the left column; four
/// wonder tiles (`WFFFFFFFF`, every edge forest) fill the 2 x 2 inside. The last tile is the
/// top-left curve: it closes the loop of road and the forest, and the scan walks the 16 nodes (the
/// four wonder tiles, the eight inner sides of the straights, the four inner corners), every tile
/// of the inside read from its position.
///
/// ```text
///   y=0    curve*  starter  straight  curve
///   y=-1   straight  wonder  wonder   straight
///   y=-2   straight  wonder  wonder   straight
///   y=-3   curve   straight  straight curve        (* the last tile)
///          x=-1    x=0      x=1       x=2
/// ```
#[test]
fn test_gas_f_worst_forest_scan() {
    let s = ScenarioTrait::new();
    let straight = Plan::RFFFRFFFR;
    let curve = Plan::RFRFFFFFR;
    // [Top and right]
    s.step(straight, Orientation::North, CENTER + 1, CENTER);
    s.step(curve, Orientation::West, CENTER + 2, CENTER);
    s.step(straight, Orientation::East, CENTER + 2, CENTER - 1);
    s.step(straight, Orientation::East, CENTER + 2, CENTER - 2);
    s.step(curve, Orientation::North, CENTER + 2, CENTER - 3);
    // [Bottom and left]
    s.step(straight, Orientation::North, CENTER + 1, CENTER - 3);
    s.step(straight, Orientation::North, CENTER, CENTER - 3);
    s.step(curve, Orientation::East, CENTER - 1, CENTER - 3);
    s.step(straight, Orientation::East, CENTER - 1, CENTER - 2);
    s.step(straight, Orientation::East, CENTER - 1, CENTER - 1);
    // [Inside] the four wonders
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 1);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 2);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 2);
    // [Last tile] the top-left curve closes the loop and the forest
    let gas = s.build(curve, Orientation::South, CENTER - 1, CENTER);
    let game = s.store.game(s.game_id);
    // The game scores exactly this (the oracle's figure, `differential.cairo`)
    assert_eq!(game.score, SCORE_F);
    println!("SCORE f_worst_forest_scan: {}", game.score);
    report("f_worst_forest_scan", gas, CEILING_FOREST_WORST);
}

/// The closing moves (P6, then D-20). A closing move (`surrender` of a game of score 1379, a 6-tile
/// city closed) ends the game in its day, which writes its `GameEnd`. Each figure is the L2 gas of
/// one external call, read right before and right after it. Until D-20 the closing move also
/// ranked the game on chain (g: rank 1, h: not placed); since D-20 nothing ranks, so g is the one
/// closing move in its day and h, the same move, is gone.
/// The game of scenario c, one tile later: a 6-tile city closed and scored, the game not over.
fn scored_game() -> Scenario {
    let s = ScenarioTrait::new();
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    s.step(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4);
    s
}

fn surrender(s: @Scenario) -> u128 {
    let before = get_available_gas();
    s.systems.challenge.surrender(*s.game_id);
    let after = get_available_gas();
    before - after
}

/// g. Closing move in its day: the game gets its day id and end time (rank 1 before D-20).
#[test]
fn test_gas_g_closing_move_in_its_day() {
    let s = scored_game();
    let gas = surrender(@s);
    let game = s.store.game(s.game_id);
    // [Info] The scenario runs on day 0 (time 0), so its day id is 0 here too
    assert(game.is_over() && game.score == 1379, 'Gas: not over');
    report("g_closing_move_in_its_day", gas, CEILING_CLOSING_IN_DAY);
}

/// x. g's closing move in a week (cobbles v1, P-61): the game spawned and ended on Monday
/// 1970-01-12 (`WEEK_1`, the start of week 1), so the report writes the day's, the week's and the
/// account's slots of `Setup`'s ledger. g runs at time 0, before week 0 starts (345,600), so its
/// report has no week to write.
#[test]
fn test_gas_x_closing_move_in_a_week() {
    start_cheat_block_timestamp_global(WEEK_1);
    let s = scored_game();
    let gas = surrender(@s);
    assert(s.store.game(s.game_id).is_over(), 'Gas: not over');
    report("x_closing_move_in_a_week", gas, CEILING_CLOSING_IN_A_WEEK);
}

/// i. Game over after its day closed: it gets no day id and no `GameEnd`.
#[test]
fn test_gas_i_closing_move_after_its_day() {
    let s = scored_game();
    let game = s.store.game(s.game_id);
    start_cheat_block_timestamp_global(game.start_time + constants::CHALLENGE_DURATION + 1);
    let gas = surrender(@s);
    assert(s.store.game(s.game_id).day_id == 0, 'Gas: in a day');
    report("i_closing_move_after_its_day", gas, CEILING_CLOSING_AFTER);
}

/// l. Game over on the last `build`: the game of scenario c with its tile limit cut to the tiles
/// drawn, then an open road east of the starter tile (the move of a0). The game ends in its day,
/// inside `Daily`, then one external call to `Setup.report` (D-24).
#[test]
fn test_gas_l_game_over_on_build() {
    let s = scored_game();
    let mut game = s.store.game(s.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    s.store.set_game(game);
    let gas = s.build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER);
    assert(s.store.game(s.game_id).is_over(), 'Gas: not over');
    report("l_game_over_on_build", gas, CEILING_GAME_OVER_ON_BUILD);
}

/// s. Game over on the last `discard`: the game of scenario c with its tile limit cut to the tiles
/// drawn, then a discard of the tile in hand. The game ends in its day and reports.
#[test]
fn test_gas_s_game_over_on_discard() {
    let s = scored_game();
    let mut game = s.store.game(s.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    s.store.set_game(game);
    let before = get_available_gas();
    s.systems.challenge.discard(s.game_id);
    let after = get_available_gas();
    assert(s.store.game(s.game_id).is_over(), 'Gas: not over');
    report("s_game_over_on_discard", before - after, CEILING_GAME_OVER_ON_DISCARD);
}

/// k. Closing move with the largest report (P7): a high score and every counter non-zero, so 4
/// entries go to the quests and 5 to the achievements (6 before D-20, with task 9 for rank 1).
#[test]
fn test_gas_k_closing_move_full_report() {
    let s = scored_game();
    let mut game = s.store.game(s.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(20, 5, 3, 4);
    s.store.set_game(game);
    let gas = surrender(@s);
    assert(s.store.game(s.game_id).score == 4500, 'Gas: score');
    report("k_closing_move_full_report", gas, CEILING_CLOSING_FULL_REPORT);
}

/// m. A Daily spawn at stake 1, no referrer: the wiring from `Setup` (one call, D-25 E), the game,
/// then the price from the player to `Economy` and its purchase (referral none, swap through the
/// router, burn, margin to the Vault, the terms). The second game of the day, so the day's prior is
/// already written.
#[test]
fn test_gas_m_spawn_daily() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let before = get_available_gas();
    systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    let after = get_available_gas();
    report("m_spawn_daily", before - after, CEILING_SPAWN_DAILY);
}

/// n. A Daily spawn at stake 10 with a referrer (the referral transfer added to m; since D-25 E
/// no registration is read).
#[test]
fn test_gas_n_spawn_daily_referred() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let before = get_available_gas();
    systems.challenge.spawn(10, ANYONE(), 0);
    let after = get_available_gas();
    report("n_spawn_daily_referred", before - after, CEILING_SPAWN_DAILY_REFERRED);
}

/// The Vault after a paid spawn, its owner delegated to themselves and holding 2,000 PAVED (from a
/// redeem of 2,000 shares) approved for the Vault. Returns the share, PAVED, and the owner cheated
/// as the caller of the Vault.
fn vault() -> (ERC4626ABIDispatcher, IERC20Dispatcher) {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let addresses = systems.economy.addresses();
    let share = ERC4626ABIDispatcher { contract_address: addresses.vault };
    let paved = IERC20Dispatcher { contract_address: addresses.paved };
    start_cheat_caller_address(addresses.vault, OWNER());
    IVotesDispatcher { contract_address: addresses.vault }.delegate(OWNER());
    share.redeem(2_000 * PAVED, OWNER(), OWNER());
    start_cheat_caller_address(addresses.paved, OWNER());
    paved.approve(addresses.vault, 2_000 * PAVED);
    stop_cheat_caller_address(addresses.paved);
    (share, paved)
}

/// t. A deposit of 1,000 PAVED (ERC4626: the PAVED pulled, the shares minted, the votes' two
/// checkpoints moved).
#[test]
fn test_gas_t_vault_deposit() {
    let (share, _) = vault();
    let before = get_available_gas();
    share.deposit(1_000 * PAVED, OWNER());
    let after = get_available_gas();
    report("t_vault_deposit", before - after, CEILING_VAULT_DEPOSIT);
}

/// u. A redeem of 1,000 shares at the exit fee (the fee left in the Vault).
#[test]
fn test_gas_u_vault_redeem() {
    let (share, _) = vault();
    let before = get_available_gas();
    share.redeem(1_000 * PAVED, OWNER(), OWNER());
    let after = get_available_gas();
    report("u_vault_redeem", before - after, CEILING_VAULT_REDEEM);
}

/// v. A withdraw of 1,000 PAVED at the exit fee (its limit read first).
#[test]
fn test_gas_v_vault_withdraw() {
    let (share, _) = vault();
    let before = get_available_gas();
    share.withdraw(1_000 * PAVED, OWNER(), OWNER());
    let after = get_available_gas();
    report("v_vault_withdraw", before - after, CEILING_VAULT_WITHDRAW);
}

/// w. A transfer of 1,000 shares to an account that never held any (the votes move off the
/// owner's delegate).
#[test]
fn test_gas_w_vault_transfer() {
    let (share, _) = vault();
    let before = get_available_gas();
    share.transfer(ANYONE(), 1_000 * PAVED);
    let after = get_available_gas();
    report("w_vault_transfer", before - after, CEILING_VAULT_TRANSFER);
}

// Cobbles v1, part 1 (P-61): the claims, the free spawn and a free game's game over. Each figure is
// one external call, read right before and right after it, on `Setup` with the fresh definitions
// and cobbles of `scripts/deploy.sh` (13 quests, 10 of them daily; 15 achievements with cobbles).

/// y. k's full report in a week: the largest paid report, writing the day's, the week's and the
/// account's slots of the ledger (k runs at time 0, before week 0).
#[test]
fn test_gas_y_closing_move_full_report_in_a_week() {
    start_cheat_block_timestamp_global(WEEK_1);
    let s = scored_game();
    let mut game = s.store.game(s.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(20, 5, 3, 4);
    s.store.set_game(game);
    let gas = surrender(@s);
    assert(s.store.game(s.game_id).score == 4500, 'Gas: score');
    report("y_closing_move_full_report_in_a_week", gas, CEILING_FULL_REPORT_IN_A_WEEK);
}

/// Wednesday 1970-01-14 (day 13, week 1), 100 s in.
const COBBLES_TIME: u64 = 13 * 86400 + 100;
const COBBLES_DAY: u64 = 13;
const COBBLES_WEEK: u64 = 1;

/// The fresh quests (`id task total start duration interval cobbles`) and achievements (`id task
/// total points`; cobbles = points, none for 9).
fn define_fresh_cobbles(systems: @Systems) {
    let setup = *systems.setup.contract_address;
    let cobbles = ISetupCobblesDispatcher { contract_address: setup };
    start_cheat_caller_address(setup, OWNER());
    let quests: Array<(u32, u32, u32, u64, u32, u32, u8)> = array![
        (1, 1, 1, 0, 86400, 86400, 5), (5, 2, 4, 0, 86400, 259200, 5),
        (6, 2, 8, 86400, 86400, 259200, 10), (7, 2, 12, 172800, 86400, 259200, 15),
        (8, 4, 2, 0, 86400, 259200, 5), (9, 4, 3, 86400, 86400, 259200, 10),
        (10, 4, 4, 172800, 86400, 259200, 15), (11, 3, 2000, 0, 86400, 259200, 5),
        (12, 3, 5000, 86400, 86400, 259200, 10), (13, 3, 8000, 172800, 86400, 259200, 15),
        (14, 4, 5, 345600, 604800, 604800, 15), (15, 2, 30, 345600, 604800, 604800, 15),
        (16, 3, 20000, 345600, 604800, 604800, 15),
    ];
    for (id, task, total, start, duration, interval, amount) in quests {
        systems
            .setup
            .define_quest(
                id,
                QuestSchedule { start, end: 0, duration, interval },
                array![QuestTask { task_id: task, total }].span(),
                array![].span(),
            );
        cobbles.set_quest_cobbles(id, amount);
    }
    let achievements: Array<(u32, u32, u32, u16)> = array![
        (1, 10, 1, 10), (2, 1, 1, 10), (3, 1, 10, 20), (4, 1, 50, 40), (5, 6, 1, 20),
        (6, 4, 10, 20), (7, 5, 1, 30), (8, 7, 1, 30), (9, 8, 1, 50), (10, 4, 50, 40),
        (11, 5, 10, 50), (12, 6, 10, 40), (13, 7, 10, 50), (14, 7, 25, 80), (15, 1, 250, 60),
        (16, 1, 1000, 80),
    ];
    for (id, task, total, points) in achievements {
        systems
            .setup
            .define_achievement(
                id,
                AchievementWindow { start: 0, end: 0 },
                array![AchievementTask { task_id: task, total }].span(),
                points,
            );
        if id != 9 {
            cobbles.set_achievement_cobbles(id, points.try_into().unwrap());
        }
    }
    stop_cheat_caller_address(setup);
}

/// `PLAYER`'s paid game on `COBBLES_TIME`, the fresh cobbles set, and the game ended on its last
/// discard with every daily and weekly target met (30 structures, 5 forests, 20,000 points).
fn cobbles_scenario() -> (Systems, TestStore, ISetupCobblesDispatcher) {
    start_cheat_block_timestamp_global(COBBLES_TIME);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    define_fresh_cobbles(@systems);
    let mut game = store.game(context.game_id);
    game.score = 20050;
    game.counts = GameImpl::counts_of(30, 5, 0, 0);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    systems.challenge.discard(context.game_id);
    let cobbles = ISetupCobblesDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(systems.setup.contract_address, PLAYER());
    (systems, store, cobbles)
}

/// z1. `claim_quest` of a daily quest (Public Works, day 13): the quest's slot, the day's slot and
/// the account read, two writes, one event.
#[test]
fn test_gas_z1_claim_quest() {
    let (_, _, cobbles) = cobbles_scenario();
    let before = get_available_gas();
    cobbles.claim_quest(6, COBBLES_DAY);
    let after = get_available_gas();
    report("z1_claim_quest", before - after, CEILING_CLAIM_QUEST);
}

/// z2. `claim_achievement` (Settler I): the achievement's slot and the account, one write.
#[test]
fn test_gas_z2_claim_achievement() {
    let (_, _, cobbles) = cobbles_scenario();
    let before = get_available_gas();
    cobbles.claim_achievement(2);
    let after = get_available_gas();
    report("z2_claim_achievement", before - after, CEILING_CLAIM_ACHIEVEMENT);
}

/// z3. `claim_daily_credit` on day 13: the daily list, its 10 quests, the day and the account.
#[test]
fn test_gas_z3_claim_daily_credit() {
    let (_, _, cobbles) = cobbles_scenario();
    let before = get_available_gas();
    cobbles.claim_daily_credit(COBBLES_DAY);
    let after = get_available_gas();
    report("z3_claim_daily_credit", before - after, CEILING_CLAIM_DAILY_CREDIT);
}

/// z4. `claim_weekly_credit` of week 1: the weekly list, its 3 quests, the week and the account.
#[test]
fn test_gas_z4_claim_weekly_credit() {
    let (_, _, cobbles) = cobbles_scenario();
    let before = get_available_gas();
    cobbles.claim_weekly_credit(COBBLES_WEEK);
    let after = get_available_gas();
    report("z4_claim_weekly_credit", before - after, CEILING_CLAIM_WEEKLY_CREDIT);
}

/// z5. `spawn_free`: the wiring, the game, `Setup.spend_credit`, the mint; against m, the paid
/// spawn.
#[test]
fn test_gas_z5_spawn_free() {
    let (systems, _, cobbles) = cobbles_scenario();
    cobbles.claim_daily_credit(COBBLES_DAY);
    stop_cheat_caller_address(systems.setup.contract_address);
    let before = get_available_gas();
    systems.challenge.spawn_free();
    let after = get_available_gas();
    report("z5_spawn_free", before - after, CEILING_SPAWN_FREE);
}

/// z6. A free game's game over (a surrender of a fresh free game): the report of its achievement
/// entries only, no `Economy.record`; against g.
#[test]
fn test_gas_z6_free_game_over() {
    let (systems, _, cobbles) = cobbles_scenario();
    cobbles.claim_daily_credit(COBBLES_DAY);
    stop_cheat_caller_address(systems.setup.contract_address);
    let game_id = systems.challenge.spawn_free();
    let before = get_available_gas();
    systems.challenge.surrender(game_id);
    let after = get_available_gas();
    report("z6_free_game_over", before - after, CEILING_FREE_GAME_OVER);
}

/// `PLAYER`'s paid game spawned (the day's prior and the guard written, as for m), `Economy`'s
/// seller `Setup`, the fresh deployment's four packs, and 70 USDC approved for `Setup` by `PLAYER`,
/// the caller of `Setup`.
fn packs_scenario() -> (Systems, ISetupPacksDispatcher) {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let setup_address = systems.setup.contract_address;
    start_cheat_caller_address(systems.economy.contract_address, OWNER());
    systems.economy.set_seller(setup_address);
    stop_cheat_caller_address(systems.economy.contract_address);
    let packs = ISetupPacksDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    packs.set_pack(1, 50, 5_000_000, true);
    packs.set_pack(2, 100, 9_000_000, true);
    packs.set_pack(3, 500, 40_000_000, true);
    packs.set_pack(4, 1000, 70_000_000, true);
    let usdc = context.token.contract_address;
    start_cheat_caller_address(usdc, PLAYER());
    IERC20Dispatcher { contract_address: usdc }.approve(setup_address, 70_000_000);
    stop_cheat_caller_address(usdc);
    start_cheat_caller_address(setup_address, PLAYER());
    (systems, packs)
}

/// z7. `buy_pack` of the 1,000-cobble pack with no referrer: the pack and the wiring read, the
/// account read and written, `Economy.addresses()`, the USDC `transferFrom` to `Economy`, then
/// `Economy.sell` (the shared money path: swap, Vault, burn, guard; `Sold`), `PackBought`.
#[test]
fn test_gas_z7_buy_pack() {
    let (_, packs) = packs_scenario();
    let before = get_available_gas();
    packs.buy_pack(4, Zero::zero(), 0);
    let after = get_available_gas();
    report("z7_buy_pack", before - after, CEILING_BUY_PACK);
}

/// z8. z7 with a referrer that counts: the referrer checks and the referral's USDC transfer.
#[test]
fn test_gas_z8_buy_pack_referred() {
    let (_, packs) = packs_scenario();
    let before = get_available_gas();
    packs.buy_pack(4, ANYONE(), 0);
    let after = get_available_gas();
    report("z8_buy_pack_referred", before - after, CEILING_BUY_PACK_REFERRED);
}

/// z9. `set_pack` by the owner, a new pack: one write, one event.
#[test]
fn test_gas_z9_set_pack() {
    let (systems, packs) = packs_scenario();
    start_cheat_caller_address(systems.setup.contract_address, OWNER());
    let before = get_available_gas();
    packs.set_pack(5, 2000, 130_000_000, true);
    let after = get_available_gas();
    report("z9_set_pack", before - after, CEILING_SET_PACK);
}

/// z10. z7 as the first sale of a block (part 2's note p4): the block's time moves on by one second
/// after the spawn, so `Economy` writes the guard's rate, which z7 (the spawn's own block) does
/// not.
#[test]
fn test_gas_z10_buy_pack_first_sale_of_a_block() {
    let (_, packs) = packs_scenario();
    start_cheat_block_timestamp_global(starknet::get_block_timestamp() + 1);
    let before = get_available_gas();
    packs.buy_pack(4, Zero::zero(), 0);
    let after = get_available_gas();
    report("z10_buy_pack_first_of_block", before - after, CEILING_BUY_PACK_FIRST_OF_BLOCK);
}

/// `PLAYER` holds the 1,000 cobbles of pack 4, theme 1 is priced 50 for the 19 plans, and `Setup`
/// is called by `PLAYER`.
fn skins_scenario() -> (Systems, ISetupSkinsDispatcher) {
    let (systems, packs) = packs_scenario();
    packs.buy_pack(4, Zero::zero(), 0);
    let skins = ISetupSkinsDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(systems.setup.contract_address, OWNER());
    for plan in 1..20_u8 {
        skins.set_skin_price(1, plan, 50);
    }
    start_cheat_caller_address(systems.setup.contract_address, PLAYER());
    (systems, skins)
}

/// z11. `buy_skin`: the price, the owned word and the account read, two writes, one event.
#[test]
fn test_gas_z11_buy_skin() {
    let (_, skins) = skins_scenario();
    let before = get_available_gas();
    skins.buy_skin(1, 7);
    let after = get_available_gas();
    report("z11_buy_skin", before - after, CEILING_BUY_SKIN);
}

/// z12. `set_skins` with 1 change: the owned word of the theme and the active word read, the
/// active word written, one event.
#[test]
fn test_gas_z12_set_skins_1() {
    let (_, skins) = skins_scenario();
    skins.buy_skin(1, 7);
    let before = get_available_gas();
    skins.set_skins(array![(7, 1)].span());
    let after = get_available_gas();
    report("z12_set_skins_1", before - after, CEILING_SET_SKINS_1);
}

/// z13. `set_skins` with 19 changes of one theme (the 19 plans owned): still one read of the
/// theme's owned word and one write of the active word.
#[test]
fn test_gas_z13_set_skins_19() {
    let (_, skins) = skins_scenario();
    let mut changes: Array<(u8, u8)> = array![];
    for plan in 1..20_u8 {
        skins.buy_skin(1, plan);
        changes.append((plan, 1));
    }
    let before = get_available_gas();
    skins.set_skins(changes.span());
    let after = get_available_gas();
    report("z13_set_skins_19", before - after, CEILING_SET_SKINS_19);
}

/// z14. `set_skin_price` by the owner, a new price: one write, one event.
#[test]
fn test_gas_z14_set_skin_price() {
    let (systems, skins) = skins_scenario();
    start_cheat_caller_address(systems.setup.contract_address, OWNER());
    let before = get_available_gas();
    skins.set_skin_price(2, 7, 75);
    let after = get_available_gas();
    report("z14_set_skin_price", before - after, CEILING_SET_SKIN_PRICE);
}

/// z15. One draw through `DrawableComponent` (the test harness over the devnet mock), the game's
/// second draw (its count already written), in a transaction of its own.
#[test]
fn test_gas_z15_vrf_draw() {
    let (provider, _) = declare("MockVrfProvider")
        .unwrap()
        .contract_class()
        .deploy(@array![])
        .unwrap();
    let (harness, _) = declare("DrawHarness")
        .unwrap()
        .contract_class()
        .deploy(@array![OWNER().into(), provider.into()])
        .unwrap();
    let harness = IDrawHarnessDispatcher { contract_address: harness };
    start_cheat_transaction_hash_global('TX1');
    harness.draw(7);
    start_cheat_transaction_hash_global('TX2');
    let before = get_available_gas();
    harness.draw(7);
    let after = get_available_gas();
    report("z15_vrf_draw", before - after, CEILING_VRF_DRAW);
}
