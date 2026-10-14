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
use paved::models::game::{GameImpl, GameTrait};
use paved::seed::SeedSource;
use paved::systems::challenge::Challenge;
use paved::systems::challenge::Challenge::InternalTrait;
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    CheatSpan, cheat_caller_address, interact_with_state, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address, test_address,
};
use starknet::ContractAddress;
use crate::setup::setup;
use crate::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, OWNER, PAVED, PLAYER, Systems, TestStore, TestStoreTrait,
};

// Ceilings: measured figure + 5 %, rounded up (see docs/measures/baseline.md).
pub const CEILING_OPEN: u128 = 5384523;
pub const CEILING_SIMPLE: u128 = 5172772;
// G5 cut the draw that follows each build (a table of bits, popcount by one product) and reset
// a0 to e, m and n to measured + 5 % (`docs/measures/baseline.md`, "After G5"). c and e had been
// raised by G1 (the draw read another deck on the same seed). f's measured + 5 % (19,032,185)
// would be above its ceiling, which is kept.
pub const CEILING_CLOSE_LARGE: u128 = 5602221;
pub const CEILING_WORST_CASE: u128 = 5551116;
pub const CEILING_FOREST: u128 = 9069821;
pub const CEILING_FOREST_WORST: u128 = 18923195;
// g, i, k: a surrender runs in `Daily` since D-24 (no library call); every game over makes one
// external call to `Setup.report` (D-24, `docs/measures/baseline.md`, "After D-21/24").
// g to l: a Daily game over records its score in `Economy` (P8 E3): the economy read (from
// `Account` then, from `Setup.wiring` since D-25 E) and `Economy.record` add about 1.46M (1.11M on
// i). D-20 took the ranking out of g, k and l, and h (the closing move that did not rank) and j
// (the `tournament` view) out with it; the ceilings are those set when the ranking was there
// (`docs/measures/baseline.md`, "After D-20").
pub const CEILING_CLOSING_IN_DAY: u128 = 3672907;
// i: raised at D-24 to measured + 5 % (2,712,368; CORE's decision, reversed if the PM asks for
// savings): the external `Setup.report` call at game over that D-24 chose costs +181,280 over D-20
// (2,531,088).
pub const CEILING_CLOSING_AFTER: u128 = 2847987;
pub const CEILING_CLOSING_FULL_REPORT: u128 = 4018231;
pub const CEILING_GAME_OVER_ON_BUILD: u128 = 7774092;
// s: the game over on the last `discard` (D-24: measured 3,360,103 + 5 %; no figure before D-24).
pub const CEILING_GAME_OVER_ON_DISCARD: u128 = 3528109;
// m, n: spawns (P8 E3); o (the Tutorial spawn) left with the Tutorial (D-21). A Daily spawn pays
// `Economy.purchase` (swap, burn, Vault). G1 cut the deck walk of the spawn (about 32M).
pub const CEILING_SPAWN_DAILY: u128 = 18411921;
pub const CEILING_SPAWN_DAILY_REFERRED: u128 = 19174693;
// t to w: the Vault, vPAVED (P-56), each call by a holder who delegated to themselves (the votes'
// checkpoints included), after a paid spawn (its margin in the Vault, so the rate is above 1).
pub const CEILING_VAULT_DEPOSIT: u128 = 3903711;
pub const CEILING_VAULT_REDEEM: u128 = 3809165;
pub const CEILING_VAULT_WITHDRAW: u128 = 5499165;
pub const CEILING_VAULT_TRANSFER: u128 = 1583287;
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
