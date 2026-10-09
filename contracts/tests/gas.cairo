//! Gas baseline of one `Daily.build` call on five scenarios (phase P0).
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

use core::testing::get_available_gas;
use paved::constants::{self, CENTER};
use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Submission};
use paved::models::game::{GameImpl, GameTrait};
use paved::models::tournament::TournamentTrait;
use paved::structure::placement::role_bit;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::views::{ITournamentViewDispatcher, ITournamentViewDispatcherTrait};
use snforge_std::{interact_with_state, start_cheat_block_timestamp_global};
use crate::setup::setup;
use crate::setup::setup::{ANYONE, IDailyDispatcherTrait, Systems, TestStore, TestStoreTrait};

// Ceilings: measured figure + 5 %, rounded up (see docs/measures/baseline.md).
pub const CEILING_OPEN: u128 = 5869212;
pub const CEILING_SIMPLE: u128 = 5329081;
pub const CEILING_CHARACTER: u128 = 6350300;
pub const CEILING_CLOSE_LARGE: u128 = 6392332;
pub const CEILING_WORST_CASE: u128 = 7325796;
pub const CEILING_FOREST: u128 = 9756082;
pub const CEILING_FOREST_WORST: u128 = 19956685;
// g, h, i: a surrender runs in the `Lobby` class, one library call (+146,730 in this profile, S1).
// g to l: a Daily game over records its score in `Economy` (P8 E3): the `Account.economy` read and
// `Economy.record` add about 1.46M (1.11M on i).
pub const CEILING_CLOSING_PLACES: u128 = 3700987;
pub const CEILING_CLOSING_NOT_PLACED: u128 = 3277673;
pub const CEILING_CLOSING_AFTER: u128 = 2718591;
pub const CEILING_VIEW: u128 = 388740;
pub const CEILING_CLOSING_FULL_REPORT: u128 = 4046311;
pub const CEILING_GAME_OVER_ON_BUILD: u128 = 7961200;
// m, n, o: spawns (P8 E3). A Daily spawn pays `Economy.purchase` (swap, burn, Vault).
pub const CEILING_SPAWN_DAILY: u128 = 51829666;
pub const CEILING_SPAWN_DAILY_REFERRED: u128 = 52906871;
pub const CEILING_SPAWN_TUTORIAL: u128 = 4530165;

#[derive(Drop)]
struct Scenario {
    systems: Systems,
    store: TestStore,
    game_id: u32,
    player_id: felt252,
}

#[generate_trait]
impl ScenarioImpl of ScenarioTrait {
    fn new() -> Scenario {
        let (store, systems, context) = setup::spawn_game(Mode::Daily);
        Scenario { systems, store, game_id: context.game_id, player_id: context.player_id }
    }

    /// Overwrites the plan of the tile held by the builder, then builds it. Returns the L2 gas
    /// consumed by the `build` call alone.
    fn build(
        self: @Scenario,
        plan: Plan,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    ) -> u128 {
        let game = self.store.game(*self.game_id);
        let builder = self.store.builder(game, *self.player_id);
        let mut tile = self.store.tile(game, builder.tile_id);
        tile.plan = plan.into();
        self.store.set_tile(tile);

        let before = get_available_gas();
        self.systems.daily.build(*self.game_id, orientation, x, y, role, spot);
        let after = get_available_gas();
        before - after
    }

    /// Builds a tile without a character.
    fn step(self: @Scenario, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        self.build(plan, orientation, x, y, Role::None, Spot::None);
    }
}

fn report(name: ByteArray, gas: u128, ceiling: u128) {
    println!("GAS {}: {}", name, gas);
    assert(gas <= ceiling, 'Gas: above ceiling');
}

/// a0. Open simple move: a road tile east of the starter tile; it closes nothing, no character.
#[test]
fn test_gas_a0_open_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, Role::None, Spot::None);
    report("a0_open_simple_move", gas, CEILING_OPEN);
}

/// a. Simple move that closes a 2-tile city: the new tile's S cap meets the starter's N cap (the
/// city is scored only if a character is in it, none here), no character.
#[test]
fn test_gas_a_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
    report("a_simple_move", gas, CEILING_SIMPLE);
}

/// b. Same move as (a) with a character placed on the new tile.
#[test]
fn test_gas_b_move_with_character() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::North);
    report("b_move_with_character", gas, CEILING_CHARACTER);
}

/// c. Closes a 6-tile city that holds one character (scoring and character recovery included).
///
/// starter (cap N) - corridor - corridor - corridor - corner - cap, going north then east.
#[test]
fn test_gas_c_close_large_city() {
    let s = ScenarioTrait::new();
    // The character sits on the first corridor, which is idle when it is placed.
    s.build(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, Role::Lord, Spot::Center);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    // The cap closes the city: the character is scored and recovered.
    let gas = s
        .build(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: city not scored');
    report("c_close_large_city", gas, CEILING_CLOSE_LARGE);
}

/// d. Worst case we can build: the last tile of a 12-tile city tree, placed with a character.
///
/// The city is a tree rooted on the starter tile: two corridors and a T-junction going north, then
/// two arms of four and three tiles that stay open until the last move. The last tile (a cap)
/// closes the second arm and therefore the whole tree. On this single move:
/// - the conflict check (`assert_structure_idle`) walks the 11 existing tiles, none of them holds
///   a character, so the walk is not short-circuited;
/// - the assessment walks the whole closed tree again (12 tiles), finds the new character, solves
///   it, recovers it and scores the structure.
/// Every earlier closing attempt stops at the first open end, so only the last move pays for the
/// whole tree.
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
    // [East arm] corner, corner, corner, then the closing cap with a character
    s.step(Plan::FFFFCCCFF, Orientation::South, CENTER + 1, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER + 1, CENTER + 4);
    s.step(Plan::FFFFCCCFF, Orientation::East, CENTER + 2, CENTER + 4);
    let gas = s
        .build(
            Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3, Role::Lord, Spot::North,
        );
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: tree not scored');
    report("d_worst_case", gas, CEILING_WORST_CASE);
}

/// e. Closes a forest of 4 tiles that holds a Woodsman (scoring, character recovery and the forest
/// scan included).
///
/// Four road curves under the starter close a loop of road around one corner; their inner corners
/// are one forest. The Woodsman waits on the first curve, the fourth closes the loop and scores
/// 1 road x 300 x bonus(4) = 329 (the P4 golden `daily_forest_woodsman_ring`).
#[test]
fn test_gas_e_close_forest() {
    let s = ScenarioTrait::new();
    s
        .build(
            Plan::RFRFFFFFR,
            Orientation::South,
            CENTER,
            CENTER - 1,
            Role::Woodsman,
            Spot::SouthEast,
        );
    s.step(Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1);
    s.step(Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2);
    let gas = s
        .build(Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    assert(game.score == 329, 'Gas: forest not scored');
    report("e_close_forest", gas, CEILING_FOREST);
}

/// f. Worst forest scan we can build: the last tile closes a forest of 16 nodes that holds a
/// Woodsman, inside a loop of 12 road tiles.
///
/// The starter tile is the top edge of the loop (its south forest is the inside). The loop goes
/// east along the top, down the right column, west along the bottom, up the left column; four
/// wonder tiles (`WFFFFFFFF`, every edge forest) fill the 2 x 2 inside. The last tile is the
/// top-left curve: it closes the loop of road and the forest, and the scan walks the 16 nodes (the
/// four wonder tiles, the eight inner sides of the straights, the four inner corners), every tile
/// of the inside read from its position. The Woodsman waits on the first straight.
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
    // [Top and right] the first straight carries the Woodsman on its inner forest
    s.build(straight, Orientation::North, CENTER + 1, CENTER, Role::Woodsman, Spot::South);
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
    let gas = s.build(curve, Orientation::South, CENTER - 1, CENTER, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    // The forest scores exactly this, and its Woodsman is back in the builder's hand
    assert_eq!(game.score, 434);
    let builder = s.store.builder(game, s.player_id);
    let woodsman: u8 = Role::Woodsman.into();
    assert(builder.characters & role_bit(woodsman) == 0, 'Gas: Woodsman not recovered');
    println!("SCORE f_worst_forest_scan: {}", game.score);
    report("f_worst_forest_scan", gas, CEILING_FOREST_WORST);
}

/// Leaderboard (P6). A closing move (`surrender` of a game of score 1379, a 6-tile city closed)
/// ends the game in its tournament, which ranks it. Each figure is the L2 gas of one external call,
/// read right before and right after it; the call is the same on the code before the leaderboard
/// interface, where the closing moves (g, h) cost 1,440,588 whether they ranked or not, the move
/// after the tournament (i) 726,130 and the view (j) 384,638 (`docs/measures/baseline.md`).
///
/// The tournament holds three ranks before the move: `scores` in rank order (101, 102, 103).
fn prefill(s: @Scenario, scores: Span<u32>) {
    let id = tournament_id(s);
    interact_with_state(
        *s.store.contract,
        || {
            let mut i = 0;
            while i < 3 {
                let submission = Submission {
                    player_id: 101 + i.into(), game_id: 1, score: *scores[i], time: 0,
                };
                LeaderboardImpl::new().submit(id, submission);
                i += 1;
            }
        },
    );
}

fn tournament_id(s: @Scenario) -> u64 {
    let game = s.store.game(*s.game_id);
    TournamentTrait::compute_id(game.start_time, constants::DAILY_TOURNAMENT_DURATION)
}

/// The game of scenario c, one tile later: a 6-tile city closed and scored, the game not over.
fn scored_game() -> Scenario {
    let s = ScenarioTrait::new();
    s.build(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, Role::Lord, Spot::Center);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    s.step(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4);
    s
}

fn surrender(s: @Scenario) -> u128 {
    let before = get_available_gas();
    s.systems.daily.surrender(*s.game_id);
    let after = get_available_gas();
    before - after
}

/// g. Closing move that ranks at rank 1 and shifts the two other ranks (the worst case).
#[test]
fn test_gas_g_closing_move_places() {
    let s = scored_game();
    prefill(@s, array![30, 20, 10].span());
    let gas = surrender(@s);
    let id = tournament_id(@s);
    let top = interact_with_state(s.store.contract, || LeaderboardImpl::new().top(id));
    assert(top.first.score == 1379 && top.second.score == 30, 'Gas: not placed');
    report("g_closing_move_places", gas, CEILING_CLOSING_PLACES);
}

/// h. Closing move that does not rank (the score is below the three ranks).
#[test]
fn test_gas_h_closing_move_not_placed() {
    let s = scored_game();
    prefill(@s, array![2000, 1900, 1800].span());
    let gas = surrender(@s);
    let id = tournament_id(@s);
    let top = interact_with_state(s.store.contract, || LeaderboardImpl::new().top(id));
    assert(top.first.score == 2000 && top.third.score == 1800, 'Gas: placed');
    report("h_closing_move_not_placed", gas, CEILING_CLOSING_NOT_PLACED);
}

/// i. Game over after its tournament closed: it ranks in nothing, the leaderboard is not called.
#[test]
fn test_gas_i_closing_move_after_tournament() {
    let s = scored_game();
    let game = s.store.game(s.game_id);
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    let gas = surrender(@s);
    assert(s.store.game(s.game_id).tournament_id == 0, 'Gas: ranked');
    report("i_closing_move_after_tournament", gas, CEILING_CLOSING_AFTER);
}

/// l. Game over on the last `build`: the game of scenario c with its tile limit cut to the tiles
/// drawn, then an open road east of the starter tile (the move of a0). The game ends and ranks
/// in its empty tournament, inside `Daily`, then one library call to `Lobby.report` (P7).
#[test]
fn test_gas_l_game_over_on_build() {
    let s = scored_game();
    let mut game = s.store.game(s.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    s.store.set_game(game);
    let gas = s
        .build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, Role::None, Spot::None);
    assert(s.store.game(s.game_id).is_over(), 'Gas: not over');
    report("l_game_over_on_build", gas, CEILING_GAME_OVER_ON_BUILD);
}

/// k. Closing move with the largest report (P7): rank 1, a high score and every counter non-zero,
/// so 4 entries go to the quests and 6 to the achievements.
#[test]
fn test_gas_k_closing_move_full_report() {
    let s = scored_game();
    prefill(@s, array![30, 20, 10].span());
    let mut game = s.store.game(s.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(20, 5, 3, 4);
    s.store.set_game(game);
    let gas = surrender(@s);
    let id = tournament_id(@s);
    let top = interact_with_state(s.store.contract, || LeaderboardImpl::new().top(id));
    assert(top.first.score == 4500, 'Gas: not first');
    report("k_closing_move_full_report", gas, CEILING_CLOSING_FULL_REPORT);
}

/// j. The `tournament` view: the prize record and the three ranks.
#[test]
fn test_gas_j_view_tournament() {
    let s = scored_game();
    prefill(@s, array![30, 20, 10].span());
    let views = ITournamentViewDispatcher { contract_address: s.store.contract };
    let before = get_available_gas();
    let view = views.tournament(tournament_id(@s));
    let after = get_available_gas();
    assert(view.top3_score == 10, 'Gas: wrong view');
    report("j_view_tournament", before - after, CEILING_VIEW);
}

/// m. A Daily spawn at stake 1, no referrer: the game, then the price from the player to
/// `Economy` and its purchase (referral none, swap through the router, burn, margin to the Vault,
/// the terms). The second game of the day, so the day's prior is already written.
#[test]
fn test_gas_m_spawn_daily() {
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    let before = get_available_gas();
    systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    let after = get_available_gas();
    report("m_spawn_daily", before - after, CEILING_SPAWN_DAILY);
}

/// n. A Daily spawn at stake 10 with a registered referrer (the `Account` read and the referral
/// transfer added to m).
#[test]
fn test_gas_n_spawn_daily_referred() {
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    let before = get_available_gas();
    systems.daily.spawn(10, ANYONE(), 0);
    let after = get_available_gas();
    report("n_spawn_daily_referred", before - after, CEILING_SPAWN_DAILY_REFERRED);
}

/// o. A Tutorial spawn: free, no call to `Economy`.
#[test]
fn test_gas_o_spawn_tutorial() {
    let (_, systems, _) = setup::spawn_game(Mode::Tutorial);
    let before = get_available_gas();
    systems.tutorial.spawn();
    let after = get_available_gas();
    report("o_spawn_tutorial", before - after, CEILING_SPAWN_TUTORIAL);
}
