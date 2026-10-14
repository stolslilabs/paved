//! Tile owners and majority scoring (D-19, P-47; D-19b), tested below the entry points: no entry
//! point lets two players build in one game, so the boards are written into storage
//! (`Store::set_tile`), the owners' seats into the tiles (`Tile.owner`), and the winner is asked
//! of the structure state on a closed root (`owners::structure_tally`, the forest scan,
//! `owners::wonder_tally`). Seats 1 to 3 have no player before a multiplayer mode
//! (`owners::player_of_seat`): the scoring path is reached with seat 0 winning, or with a tie.
//! The tie's effects go through the scoring path, `Game::assess_with` with the single-player skip
//! forced off.
//!
//! Boards (plans are written `Center, NW, N, NE, E, SE, S, SW, W`, see `types/plan.cairo`), far
//! from the starter unless said:
//! - road loop: the stop `SFRFRFFFR` (facing North) closes a loop of three curves through its
//!   north and east arms: a road of 5 nodes on 4 tiles (`e2e/forest.cairo`, "Once per move");
//! - city ring: `FFCFFFCFF` (facing North) closes a ring of five city tiles through its two caps:
//!   a city of 7 nodes on 6 tiles (the same file);
//! - corridors: two city corridors `CFFFCFFFC` (facing East) north of the starter, closed by two
//!   caps above and a copy of the starter below the second: the forest between the corridors has
//!   2 tiles, the corridors' own, and touches two closed cities of 3 tiles each
//!   (`e2e/forest.cairo`, "caps");
//! - wonders: nine wonders `WFFFFFFFF` in a 3 x 3 block: the one in the middle is closed.

use paved::events::{Event as PavedEvent, Scored};
use paved::models::game::GameTrait;
use paved::models::index::Tile;
use paved::models::tile::CENTER;
use paved::store::{StoreImpl, StoreTrait};
use paved::structure::forest::scan;
use paved::structure::owners::{
    TallyTrait, player_of, player_of_seat, structure_tally, wonder_tally,
};
use paved::structure::placement::{self, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of};
use paved::structure::state::StructuresTrait;
use paved::structure::tables;
use paved::systems::challenge::Challenge;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{TestStore, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    EventSpyAssertionsTrait, interact_with_state, load, map_entry_address, spy_events, test_address,
};

const OX: u32 = CENTER + 20;
const OY: u32 = CENTER + 20;
/// Seats: 0 is the game's player, 1 to 3 the others of a multiplayer game to come.
const ALICE: u8 = 1;
const BOB: u8 = 2;
const CAROL: u8 = 3;

fn tile(game_id: u32, id: u32, plan: Plan, orientation: Orientation, x: u32, y: u32) -> Tile {
    Tile { game_id, id, plan: plan.into(), orientation: orientation.into(), x, y, owner: 0 }
}

/// Writes `seat` as the owner of each of `ids`, into the tile (its refs kept).
fn own(store: TestStore, game_id: u32, ids: Span<u32>, seat: u8) {
    interact_with_state(
        store.contract,
        || {
            for id in ids {
                let (tile, refs) = StoreImpl::tile_with_refs(game_id, *id);
                StoreImpl::write_tile(Tile { owner: seat, ..tile }, refs);
            }
        },
    );
}

// Boards

/// The three curves of the road loop; `closing`: the stop too.
fn road_loop(store: TestStore, g: u32, closing: bool) -> Tile {
    store.set_tile(tile(g, 100, Plan::RFRFFFFFR, Orientation::South, OX, OY + 1));
    store.set_tile(tile(g, 101, Plan::RFRFFFFFR, Orientation::West, OX + 1, OY + 1));
    store.set_tile(tile(g, 102, Plan::RFRFFFFFR, Orientation::North, OX + 1, OY));
    let stop = tile(g, 103, Plan::SFRFRFFFR, Orientation::North, OX, OY);
    if closing {
        store.set_tile(stop);
    }
    stop
}

/// The five tiles of the city ring; `closing`: the tile of two caps too.
fn city_ring(store: TestStore, g: u32, closing: bool) -> Tile {
    store.set_tile(tile(g, 100, Plan::FFFFCCCFF, Orientation::North, OX, OY + 1));
    store.set_tile(tile(g, 101, Plan::FFFFCCCFF, Orientation::East, OX + 1, OY + 1));
    store.set_tile(tile(g, 102, Plan::CFFFCFFFC, Orientation::East, OX + 1, OY));
    store.set_tile(tile(g, 103, Plan::FFFFCCCFF, Orientation::South, OX + 1, OY - 1));
    store.set_tile(tile(g, 104, Plan::FFFFCCCFF, Orientation::West, OX, OY - 1));
    let caps = tile(g, 105, Plan::FFCFFFCFF, Orientation::North, OX, OY);
    if closing {
        store.set_tile(caps);
    }
    caps
}

/// The corridors north of the starter (tile 1): the first corridor (100), the caps (101, 102),
/// the copy of the starter (103); `closing`: the second corridor (104) too.
fn corridors(store: TestStore, g: u32, closing: bool) -> Tile {
    store.set_tile(tile(g, 100, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1));
    store.set_tile(tile(g, 101, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 2));
    store.set_tile(tile(g, 102, Plan::FFFFFFCFF, Orientation::North, CENTER + 1, CENTER + 2));
    store.set_tile(tile(g, 103, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER));
    let second = tile(g, 104, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    if closing {
        store.set_tile(second);
    }
    second
}

/// The wonder in the middle (100) and seven of its neighbours (101 to 107, from the north-west
/// clockwise); `closing`: the eighth (108, west) too, which closes the wonder in the middle.
fn wonders(store: TestStore, g: u32, closing: bool) -> (Tile, Tile) {
    let w = Plan::WFFFFFFFF;
    let n = Orientation::North;
    let middle = tile(g, 100, w, n, OX, OY);
    store.set_tile(middle);
    store.set_tile(tile(g, 101, w, n, OX - 1, OY + 1));
    store.set_tile(tile(g, 102, w, n, OX, OY + 1));
    store.set_tile(tile(g, 103, w, n, OX + 1, OY + 1));
    store.set_tile(tile(g, 104, w, n, OX + 1, OY));
    store.set_tile(tile(g, 105, w, n, OX + 1, OY - 1));
    store.set_tile(tile(g, 106, w, n, OX, OY - 1));
    store.set_tile(tile(g, 107, w, n, OX - 1, OY - 1));
    let last = tile(g, 108, w, n, OX - 1, OY);
    if closing {
        store.set_tile(last);
    }
    (middle, last)
}

// The winner asked of the structure state

/// An area of `category` of the tile `tile_id` whose structure is closed, and its tile's refs.
fn closed_area(game_id: u32, tile_id: u32, category: Category) -> (Tile, u128, u8) {
    let (placed, refs) = StoreImpl::tile_with_refs(game_id, tile_id);
    let code: u8 = category.into();
    let mut structures = StructuresTrait::new(game_id);
    let mut area: u8 = 1;
    let mut found: u8 = 0;
    while area <= tables::AREA_COUNT && found == 0 {
        if tables::record_index(placed.plan, area) != tables::NO_RECORD
            && tables::category(placed.plan, area) == code {
            let (_, record) = structures.find(ref_of(refs, area));
            if open_of(record) == 0 {
                found = area;
            }
        }
        area += 1;
    }
    assert(found != 0, 'Test: no closed structure');
    (placed, refs, found)
}

/// The winning seat of the closed road or city of `category` on the tile `tile_id`, with the
/// tiles of `seat` it counted and all its tiles.
fn winner_of(
    store: TestStore, game_id: u32, tile_id: u32, category: Category, seat: u8,
) -> (Option<u8>, u32, u32) {
    interact_with_state(
        store.contract,
        || {
            let (placed, refs, area) = closed_area(game_id, tile_id, category);
            let mut structures = StructuresTrait::new(game_id);
            let mut tally = structure_tally(placed, refs, area, ref structures);
            (tally.winner(), tally.count(seat), tally.total)
        },
    )
}

/// The forest scan of the closed forest on the tile `tile_id`: whether a road around it is open,
/// its roads and cities, its winning seat, the tiles of `seat` and all its tiles.
fn forest_winner_of(
    store: TestStore, game_id: u32, tile_id: u32, seat: u8,
) -> (bool, u32, u32, Option<u8>, u32, u32) {
    interact_with_state(
        store.contract,
        || {
            let (placed, refs, area) = closed_area(game_id, tile_id, Category::Forest);
            let mut structures = StructuresTrait::new(game_id);
            let mut tally = Option::Some(TallyTrait::new());
            let (open_road, roads, cities) = scan(placed, refs, area, ref structures, ref tally);
            let mut counted = tally.expect('Test: no tally');
            (open_road, roads, cities, counted.winner(), counted.count(seat), counted.total)
        },
    )
}

/// The winning seat of the closed wonder of `wonder`, with the tiles of `seat` and all its tiles.
fn wonder_winner_of(
    store: TestStore, game_id: u32, wonder: Tile, seat: u8,
) -> (Option<u8>, u32, u32) {
    interact_with_state(
        store.contract,
        || {
            let mut structures = StructuresTrait::new(game_id);
            // [Info] The wonder tile as stored, with its seat
            let (wonder, _) = StoreImpl::tile_with_refs(game_id, wonder.id);
            let area = tables::wonder(wonder.plan);
            let area = tables::area_at(wonder.plan, area, wonder.orientation);
            let (_, refs) = StoreImpl::tile_with_refs(game_id, wonder.id);
            let (_, record) = structures.find(ref_of(refs, area));
            assert(open_of(record) == 0, 'Test: wonder not closed');
            let mut tally = wonder_tally(wonder, ref structures);
            (tally.winner(), tally.count(seat), tally.total)
        },
    )
}

// A clear majority, a tie of two and of three, a zero owner

/// City ring, Alice 4 tiles, Bob 2: Alice wins.
#[test]
fn test_owners_clear_majority() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    city_ring(store, g, true);
    own(store, g, array![100, 101, 102, 103].span(), ALICE);
    own(store, g, array![104, 105].span(), BOB);
    assert_eq!(winner_of(store, g, 105, Category::City, ALICE), (Option::Some(ALICE), 4, 6));
    assert_eq!(winner_of(store, g, 105, Category::City, BOB), (Option::Some(ALICE), 2, 6));
}

/// City ring, Alice 3 tiles, Bob 3: nobody wins.
#[test]
fn test_owners_tie_of_two() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    city_ring(store, g, true);
    own(store, g, array![100, 101, 102].span(), ALICE);
    own(store, g, array![103, 104, 105].span(), BOB);
    assert_eq!(winner_of(store, g, 105, Category::City, ALICE), (Option::None, 3, 6));
}

/// City ring, Alice 2 tiles, Bob 2, Carol 2: nobody wins.
#[test]
fn test_owners_tie_of_three() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    city_ring(store, g, true);
    own(store, g, array![100, 105].span(), ALICE);
    own(store, g, array![101, 102].span(), BOB);
    own(store, g, array![103, 104].span(), CAROL);
    assert_eq!(winner_of(store, g, 105, Category::City, CAROL), (Option::None, 2, 6));
}

/// City ring, Bob 2 tiles, the other 4 with no seat written: they read seat 0, the game's player,
/// who wins; seat 0 is the game's player id.
#[test]
fn test_owners_zero_owner_is_the_game_player() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let player = context.player_id;
    city_ring(store, g, true);
    own(store, g, array![103, 104].span(), BOB);
    assert_eq!(winner_of(store, g, 105, Category::City, 0), (Option::Some(0), 4, 6));
    assert_eq!(player_of_seat(player, 0), player);
    assert_eq!(player_of(player, Option::Some(0)), player);
    assert_eq!(player_of(player, Option::None), 0);
}

/// A seat other than 0 has no player before a multiplayer mode: mapping it reverts.
#[test]
#[should_panic(expected: 'Owners: seat without player')]
fn test_owners_other_seat_has_no_player_yet() {
    player_of_seat('PLAYER', ALICE);
}

// Ruling 1: each distinct tile once

/// City ring, 7 nodes on 6 tiles: Alice owns the tile of two caps (2 nodes) and two more tiles,
/// Bob three tiles. By nodes Alice would win, 4 to 3; by tiles it is a tie, 3 to 3: nobody wins.
#[test]
fn test_owners_ruling_1_city_counts_tiles_not_nodes() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    city_ring(store, g, true);
    own(store, g, array![105, 100, 101].span(), ALICE);
    own(store, g, array![102, 103, 104].span(), BOB);
    assert_eq!(winner_of(store, g, 105, Category::City, ALICE), (Option::None, 3, 6));
    assert_eq!(winner_of(store, g, 105, Category::City, BOB), (Option::None, 3, 6));
}

/// Road loop, 5 nodes on 4 tiles: Alice owns the stop (2 nodes) and one curve, Bob two curves.
/// By nodes Alice would win, 3 to 2; by tiles it is a tie, 2 to 2: nobody wins.
#[test]
fn test_owners_ruling_1_road_counts_tiles_not_nodes() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    road_loop(store, g, true);
    own(store, g, array![103, 100].span(), ALICE);
    own(store, g, array![101, 102].span(), BOB);
    assert_eq!(winner_of(store, g, 103, Category::Road, ALICE), (Option::None, 2, 4));
    // One curve given to Carol: Alice's 2 tiles (the stop's 2 nodes count once) against 1 and 1
    own(store, g, array![101].span(), CAROL);
    assert_eq!(winner_of(store, g, 103, Category::Road, ALICE), (Option::Some(ALICE), 2, 4));
}

// Ruling 2: a forest counts its own tiles only

/// Corridors: the forest's own tiles are the two corridors, Alice's; the caps and the copy of the
/// starter, Bob's, hold the two closed cities that give the forest its points, and the starter
/// (seat 0) holds one of them. Counting the cities' tiles Bob would win (3 to 2 and 1); the forest
/// counts its own: Alice wins, 2 tiles of 2.
#[test]
fn test_owners_ruling_2_forest_counts_its_own_tiles() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    corridors(store, g, true);
    own(store, g, array![100, 104].span(), ALICE);
    own(store, g, array![101, 102, 103].span(), BOB);
    assert_eq!(forest_winner_of(store, g, 104, ALICE), (false, 0, 2, Option::Some(ALICE), 2, 2));
    assert_eq!(forest_winner_of(store, g, 104, BOB), (false, 0, 2, Option::Some(ALICE), 0, 2));
}

// Ruling 3: a wonder counts its tile and the 8 around it

/// Wonders: 4 neighbours are Alice's, 4 Bob's; the wonder tile is Alice's and decides, 5 to 4.
#[test]
fn test_owners_ruling_3_the_wonder_tile_decides() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let (middle, _) = wonders(store, g, true);
    own(store, g, array![100, 101, 102, 103, 104].span(), ALICE);
    own(store, g, array![105, 106, 107, 108].span(), BOB);
    assert_eq!(wonder_winner_of(store, g, middle, ALICE), (Option::Some(ALICE), 5, 9));
    // The wonder tile given to Bob turns it, 5 to 4
    own(store, g, array![100].span(), BOB);
    assert_eq!(wonder_winner_of(store, g, middle, BOB), (Option::Some(BOB), 5, 9));
}

/// Wonders: Alice 3 tiles (the wonder's and two), Bob 3, the game's player 3 (seat 0, nothing
/// written): nobody wins.
#[test]
fn test_owners_ruling_3_three_way_tie() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let (middle, _) = wonders(store, g, true);
    own(store, g, array![100, 101, 102].span(), ALICE);
    own(store, g, array![103, 104, 105].span(), BOB);
    assert_eq!(wonder_winner_of(store, g, middle, ALICE), (Option::None, 3, 9));
    assert_eq!(wonder_winner_of(store, g, middle, 0), (Option::None, 3, 9));
}

// The scoring path with the single-player skip forced off. The move runs in the game contract's
// storage (`interact_with_state`); snforge gives its events the test's address.

/// Places `closing` (of seat `seat`) as a build does and assesses the move with the skip off
/// (`solo` false).
fn close(store: TestStore, game_id: u32, closing: Tile, seat: u8) {
    let closing = Tile { owner: seat, ..closing };
    interact_with_state(
        store.contract,
        || {
            let mut s = StoreImpl::new();
            let mut game = s.live_game(game_id);
            let around = NeighborhoodTrait::read(game_id, closing.x, closing.y);
            let mut structures = StructuresTrait::new(game_id);
            let refs = placement::place(ref structures, closing, @around);
            structures.track(closing, refs);
            game.assess_with(false, closing, refs, @around, ref structures, ref s);
            structures.flush(s);
            s.set_game_state(game);
        },
    );
}

fn scored(
    game_id: u32, player_id: felt252, category: Category, size: u32, points: u32,
) -> Challenge::Event {
    Challenge::Event::PavedEvent(
        PavedEvent::Scored(Scored { game_id, player_id, category: category.into(), size, points }),
    )
}

/// City ring, the skip off, Alice 2 tiles and seat 0 (the game's player) 4 with the closing tile:
/// the city scores for the game's player, 7 x 200 x 11763 / 10000 = 1646, its seat counted.
#[test]
#[available_gas(l2_gas: 114650353)]
fn test_owners_scoring_goes_to_the_winner() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let caps = city_ring(store, g, false);
    own(store, g, array![100, 101].span(), ALICE);
    let before = store.game(g);
    let mut spy = spy_events();
    close(store, g, caps, 0);
    spy
        .assert_emitted(
            @array![(test_address(), scored(g, context.player_id, Category::City, 7, 1646))],
        );
    let after = store.game(g);
    assert_eq!(after.score, before.score + 1646);
    assert_eq!(after.structures(), before.structures() + 1);
}

/// City ring, the skip off, Alice's majority: seat 1 has no player before a multiplayer mode, so
/// the move reverts in `player_of_seat`, the one place that mode changes.
#[test]
#[available_gas(l2_gas: 111298105)]
#[should_panic(expected: 'Owners: seat without player')]
fn test_owners_winning_seat_without_player_reverts() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let caps = city_ring(store, g, false);
    own(store, g, array![100, 101, 102, 103].span(), ALICE);
    close(store, g, caps, ALICE);
}

/// City ring, the skip off, a tie (Alice 3, Bob 3 with the closing tile): no points, `Scored`
/// with player 0 and points 0, and the structure still counts.
#[test]
#[available_gas(l2_gas: 115965399)]
fn test_owners_tie_scores_nothing_and_counts_the_city() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let caps = city_ring(store, g, false);
    own(store, g, array![100, 101, 102].span(), ALICE);
    own(store, g, array![103, 104].span(), BOB);
    let before = store.game(g);
    let mut spy = spy_events();
    close(store, g, caps, BOB);
    spy.assert_emitted(@array![(test_address(), scored(g, 0, Category::City, 7, 0))]);
    let after = store.game(g);
    assert_eq!(after.score, before.score);
    assert_eq!(after.structures(), before.structures() + 1);
}

/// Corridors, the skip off: the second corridor (seat 0) closes the forest (one tile Alice's, one
/// seat 0's: a tie) and the city of the second corridor (three tiles of seat 0). The forest scores
/// nothing, emits `Scored` with player 0 and points 0, and still counts; the city scores for the
/// game's player, 3 x 200 x 10721 / 10000 = 643.
#[test]
#[available_gas(l2_gas: 112309016)]
fn test_owners_tie_scores_nothing_and_counts_the_forest() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let second = corridors(store, g, false);
    own(store, g, array![100].span(), ALICE);
    let before = store.game(g);
    let mut spy = spy_events();
    close(store, g, second, 0);
    spy
        .assert_emitted(
            @array![
                (test_address(), scored(g, 0, Category::Forest, 2, 0)),
                (test_address(), scored(g, context.player_id, Category::City, 3, 643)),
            ],
        );
    let after = store.game(g);
    assert_eq!(after.score, before.score + 643);
    assert_eq!(after.forests(), before.forests() + 1);
    assert_eq!(after.structures(), before.structures() + 1);
}

/// Wonders, the skip off: the eighth neighbour closes the wonder in the middle, three ways tied
/// (Alice 3, Bob 3, Carol 3 with the closing tile): no points, `Scored` with player 0 and points
/// 0, and the wonder still counts.
#[test]
#[available_gas(l2_gas: 141770624)]
fn test_owners_tie_scores_nothing_and_counts_the_wonder() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let (_, last) = wonders(store, g, false);
    own(store, g, array![100, 101, 102].span(), ALICE);
    own(store, g, array![103, 104, 105].span(), BOB);
    own(store, g, array![106, 107].span(), CAROL);
    let before = store.game(g);
    let mut spy = spy_events();
    close(store, g, last, CAROL);
    spy.assert_emitted(@array![(test_address(), scored(g, 0, Category::Wonder, 0, 0))]);
    let after = store.game(g);
    assert_eq!(after.score, before.score);
    assert_eq!(after.wonders(), before.wonders() + 1);
}

/// The skip on (a Daily game, `assess`): the same tie as above scores for the game's player, its
/// seats never read.
#[test]
#[available_gas(l2_gas: 111940138)]
fn test_owners_single_player_skips_the_count() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let p = context.player_id;
    let caps = city_ring(store, g, false);
    own(store, g, array![100, 101, 102].span(), ALICE);
    own(store, g, array![103, 104].span(), BOB);
    let caps = Tile { owner: BOB, ..caps };
    assert!(store.game(g).solo());
    let mut spy = spy_events();
    interact_with_state(
        store.contract,
        || {
            let mut s = StoreImpl::new();
            let mut game = s.live_game(g);
            let around = NeighborhoodTrait::read(g, caps.x, caps.y);
            let mut structures = StructuresTrait::new(g);
            let refs = placement::place(ref structures, caps, @around);
            structures.track(caps, refs);
            game.assess(caps, refs, @around, ref structures, ref s);
            structures.flush(s);
            s.set_game_state(game);
        },
    );
    spy.assert_emitted(@array![(test_address(), scored(g, p, Category::City, 7, 1646))]);
}

/// Wonders, the skip off, the wonder tile placed last: it closes on its own placement (its 8
/// neighbours are there), the first arm of `assess_with` (a start spot of the built tile). Seat 0
/// (the game's player) holds the wonder tile and 4 neighbours, Alice 4: the wonder scores 900 for
/// the game's player, its tile counted.
#[test]
#[available_gas(l2_gas: 141425689)]
fn test_owners_wonder_closing_on_its_own_placement() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let w = Plan::WFFFFFFFF;
    let n = Orientation::North;
    store.set_tile(tile(g, 101, w, n, OX - 1, OY + 1));
    store.set_tile(tile(g, 102, w, n, OX, OY + 1));
    store.set_tile(tile(g, 103, w, n, OX + 1, OY + 1));
    store.set_tile(tile(g, 104, w, n, OX + 1, OY));
    store.set_tile(tile(g, 105, w, n, OX + 1, OY - 1));
    store.set_tile(tile(g, 106, w, n, OX, OY - 1));
    store.set_tile(tile(g, 107, w, n, OX - 1, OY - 1));
    store.set_tile(tile(g, 108, w, n, OX - 1, OY));
    own(store, g, array![101, 103, 105, 107].span(), ALICE);
    let before = store.game(g);
    let mut spy = spy_events();
    close(store, g, tile(g, 100, w, n, OX, OY), 0);
    spy
        .assert_emitted(
            @array![(test_address(), scored(g, context.player_id, Category::Wonder, 0, 900))],
        );
    let after = store.game(g);
    assert_eq!(after.score, before.score + 900);
    assert_eq!(after.wonders(), before.wonders() + 1);
}

/// The same board, Alice holding 5 neighbours: her majority (5 to 4) reaches the seat that has no
/// player yet, so the count did run on the wonder tile's own closure.
#[test]
#[available_gas(l2_gas: 135552772)]
#[should_panic(expected: 'Owners: seat without player')]
fn test_owners_wonder_closing_on_its_own_placement_counts_its_seats() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let w = Plan::WFFFFFFFF;
    let n = Orientation::North;
    store.set_tile(tile(g, 101, w, n, OX - 1, OY + 1));
    store.set_tile(tile(g, 102, w, n, OX, OY + 1));
    store.set_tile(tile(g, 103, w, n, OX + 1, OY + 1));
    store.set_tile(tile(g, 104, w, n, OX + 1, OY));
    store.set_tile(tile(g, 105, w, n, OX + 1, OY - 1));
    store.set_tile(tile(g, 106, w, n, OX, OY - 1));
    store.set_tile(tile(g, 107, w, n, OX - 1, OY - 1));
    store.set_tile(tile(g, 108, w, n, OX - 1, OY));
    own(store, g, array![101, 102, 103, 105, 107].span(), ALICE);
    close(store, g, tile(g, 100, w, n, OX, OY), 0);
}

// The tile's slot (D-19): seat 0 packs as before D-19

/// The slot of a placed tile of a Daily game (seat 0) is the D-18 packing, bit for bit: plan,
/// orientation, x, y in the low 80 bits, the refs from bit 128, nothing else; a seat goes to bits
/// 96 to 104, and nowhere else. Read at the raw address of the `tiles` map of the `paved` storage
/// node.
#[test]
fn test_owners_seat_zero_slot_is_the_d18_packing() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let g = context.game_id;
    let built = city_ring(store, g, true);
    let (refs, word) = interact_with_state(
        store.contract,
        || {
            let (_, refs) = StoreImpl::tile_with_refs(g, built.id);
            (refs, StoreImpl::tile_word(built, refs))
        },
    );
    // D-18's packing (`Store::tile_word` at 7d04872): no term for the seat
    let plan: u256 = built.plan.into();
    let orientation: u256 = built.orientation.into();
    let x: u256 = built.x.into();
    let y: u256 = built.y.into();
    let d18: u256 = plan
        + orientation * 0x100
        + x * 0x10000
        + y * 0x1000000000000
        + refs.into() * 0x100000000000000000000000000000000;
    let map = core::pedersen::pedersen(selector!("paved"), selector!("tiles"));
    let raw = *load(
        store.contract, map_entry_address(map, array![g.into(), built.id.into()].span()), 1,
    )
        .at(0);
    let raw: u256 = raw.into();
    assert_eq!(raw, d18);
    let word: u256 = word.into();
    assert_eq!(word, d18);
    // A seat moves bits 96 to 104 only
    let seated: u256 = interact_with_state(
        store.contract, || StoreImpl::tile_word(Tile { owner: 0xff, ..built }, refs).into(),
    );
    assert_eq!(seated - d18, 0xff * 0x1000000000000000000000000);
}
