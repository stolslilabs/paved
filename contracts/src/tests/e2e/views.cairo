//! Public read-only views (`views.cairo`) and the event keys that lists rely on.
//! Reference: `docs/architecture/public-interface.md`.

use paved::constants;
use paved::models::tile::CENTER;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE, Systems, TestStore,
    TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::views::{
    BuilderView, IDailyViewDispatcher, IDailyViewDispatcherTrait, IGameViewDispatcher,
    IGameViewDispatcherTrait, MAX_PAGE, TILE_DISCARDED, TILE_HELD, TILE_PLACED,
};
use snforge_std::{EventSpyTrait, spy_events, start_cheat_block_timestamp_global};

const DAY: u64 = constants::DAILY_DURATION;

fn daily_views(systems: @Systems) -> IGameViewDispatcher {
    IGameViewDispatcher { contract_address: *systems.daily.contract_address }
}

fn tutorial_views(systems: @Systems) -> IGameViewDispatcher {
    IGameViewDispatcher { contract_address: *systems.tutorial.contract_address }
}

/// Sets the plan of the tile in hand, so the next build is known.
fn force_plan(store: TestStore, game_id: u32, player_id: felt252, plan: Plan) {
    let game = store.game(game_id);
    let builder = store.builder(game, player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
}

/// Builds tile 2 north of the starter (it closes the starter's city), then tile 3 on top, which
/// closes the north city of tile 2.
fn build_two(store: TestStore, systems: @Systems, game_id: u32, player_id: felt252) {
    let daily = *systems.daily;
    force_plan(store, game_id, player_id, Plan::FFCFFFCFF);
    daily.build(game_id, Orientation::North, CENTER, CENTER + 1);
    force_plan(store, game_id, player_id, Plan::FFCFFFCFF);
    daily.build(game_id, Orientation::North, CENTER, CENTER + 2);
    // [Check] The structure state agrees with the walks on the board (P5-4)
    check::assert_board_agrees(store, game_id);
}

// Game

#[test]
#[available_gas(l2_gas: 120734000)]
fn test_views_game_after_spawn() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let view = daily_views(@systems).game(context.game_id);
    let game = store.game(context.game_id);
    let tile = store.tile(game, 2);

    assert(view.id == context.game_id, 'Views: id');
    assert(view.player_id == context.player_id, 'Views: player');
    assert(view.mode == Mode::Daily.into(), 'Views: mode');
    assert(view.seed == game.seed, 'Views: seed');
    assert(view.score == 0, 'Views: score');
    assert(!view.over, 'Views: not over');
    assert(view.tile_count == 2, 'Views: tile count');
    assert(view.placed_count == 1, 'Views: placed count');
    assert(view.discarded_count == 0, 'Views: discarded count');
    assert(view.tile_id == 2, 'Views: tile id');
    assert(view.plan == tile.plan, 'Views: plan');
    assert(view.plan != 0, 'Views: plan set');
    assert(view.deck_size == 38, 'Views: deck size');
    assert(view.remaining_count == 36, 'Views: remaining');
    assert(view.start_time == 3 * DAY + 100, 'Views: start time');
    assert(view.end_time == 0, 'Views: end time');
    assert(view.day_id == 0, 'Views: day');
}

#[test]
#[available_gas(l2_gas: 121701000)]
fn test_views_game_player_answerable_without_any_build() {
    // The player is in `GameConfig`: a game that nobody built on still answers for its player,
    // and the builder facade holds the first drawn tile.
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    let views = daily_views(@systems);
    let view = views.game(context.game_id);
    assert(view.player_id == context.player_id, 'Views: player');
    assert(view.tile_count >= 2, 'Views: tile count');
    assert(view.placed_count == 1, 'Views: placed count');
    assert(view.discarded_count == 0, 'Views: discarded count');
    let builder = views.builder(context.game_id, context.player_id);
    assert(builder.tile_id == view.tile_count, 'Views: builder tile');
}

#[test]
#[available_gas(l2_gas: 183826000)]
fn test_views_game_after_builds_and_discard() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    build_two(store, @systems, context.game_id, context.player_id);
    systems.daily.discard(context.game_id);
    let view = daily_views(@systems).game(context.game_id);

    assert(view.score > 0, 'Views: city scored');
    assert(view.score == store.game(context.game_id).score, 'Views: score');
    assert(view.tile_count == 5, 'Views: tile count');
    assert(view.placed_count == 3, 'Views: placed count');
    assert(view.discarded_count == 1, 'Views: discarded count');
    assert(view.tile_id == 5, 'Views: tile id');
    assert(view.remaining_count == 33, 'Views: remaining');
}

#[test]
#[available_gas(l2_gas: 189715000)]
fn test_views_game_closed_by_surrender() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    build_two(store, @systems, context.game_id, context.player_id);
    systems.daily.surrender(context.game_id);
    let views = daily_views(@systems);
    let view = views.game(context.game_id);

    assert(view.over, 'Views: over');
    assert(view.tile_id == 0, 'Views: no tile');
    assert(view.plan == 0, 'Views: no plan');
    assert(view.remaining_count == 0, 'Views: no remaining');
    assert(view.tile_count == 4, 'Views: tile count');
    assert(view.placed_count == 3, 'Views: placed count');
    assert(view.day_id == 3, 'Views: day');
    assert(view.end_time == 3 * DAY + 100, 'Views: end time');

    // The tile in hand at the surrender is held, neither placed nor discarded.
    let builder = views.builder(context.game_id, context.player_id);
    assert(builder.tile_id == 4, 'Views: builder tile');
    let tiles = views.tiles(context.game_id, 3, 1);
    assert(*tiles.at(0).status == TILE_HELD, 'Views: held');
}

#[test]
#[available_gas(l2_gas: 125970000)]
fn test_views_game_closed_by_last_tile() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    // Shrink the deck: the next discard ends the game.
    let mut game = store.game(context.game_id);
    game.tile_limit = 2;
    store.set_game(game);
    systems.daily.discard(context.game_id);
    let views = daily_views(@systems);
    let view = views.game(context.game_id);

    assert(view.over, 'Views: over');
    assert(view.tile_id == 0, 'Views: no tile');
    assert(view.discarded_count == 1, 'Views: discarded');
    assert(views.builder(context.game_id, context.player_id).tile_id == 0, 'Views: no hand');
    let tiles = views.tiles(context.game_id, 0, MAX_PAGE);
    assert(tiles.len() == 2, 'Views: tiles');
    assert(*tiles.at(1).status == TILE_DISCARDED, 'Views: discarded');
}

#[test]
#[available_gas(l2_gas: 81967000)]
fn test_views_game_tutorial() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    systems.tutorial.build(context.game_id);
    let views = tutorial_views(@systems);
    let view = views.game(context.game_id);

    assert(view.player_id == context.player_id, 'Views: player');
    assert(view.mode == Mode::Tutorial.into(), 'Views: mode');
    assert(view.deck_size == 10, 'Views: deck size');
    assert(view.day_id == 0, 'Views: no day');
    assert(view.placed_count == 2, 'Views: placed count');
    assert(view.tile_count == 3, 'Views: tile count');
    let tiles = views.tiles(context.game_id, 0, MAX_PAGE);
    assert(tiles.len() == 3, 'Views: tiles');
    assert(*tiles.at(1).status == TILE_PLACED, 'Views: placed');
    assert(*tiles.at(2).status == TILE_HELD, 'Views: held');
}

#[test]
#[available_gas(l2_gas: 71750000)]
fn test_views_game_tutorial_same_second_game_over() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    systems.tutorial.surrender(context.game_id);
    let view = tutorial_views(@systems).game(context.game_id);

    assert(view.over, 'Views: over');
    assert(view.start_time == 3 * DAY + 100, 'Views: start time');
    assert(view.day_id == 0, 'Views: no day');
    assert(view.end_time == 0, 'Views: no end time');
}

#[test]
#[should_panic(expected: 'Game: does not exist')]
fn test_views_game_missing() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    daily_views(@systems).game(context.game_id + 1);
}

#[test]
#[should_panic(expected: 'Game: does not exist')]
fn test_views_game_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::Daily);
    daily_views(@systems).game(0);
}

#[test]
#[should_panic(expected: 'Game: does not exist')]
fn test_views_game_missing_on_tutorial() {
    // Ids are per contract: Daily game 1 is not a Tutorial game.
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    tutorial_views(@systems).game(context.game_id);
}

// Tiles

#[test]
#[available_gas(l2_gas: 184422000)]
fn test_views_tiles_whole_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    build_two(store, @systems, context.game_id, context.player_id);
    systems.daily.discard(context.game_id);
    let tiles = daily_views(@systems).tiles(context.game_id, 0, MAX_PAGE);

    assert(tiles.len() == 5, 'Views: length');
    let starter = *tiles.at(0);
    assert(starter.id == 1, 'Views: starter id');
    assert(starter.status == TILE_PLACED, 'Views: starter placed');
    assert(starter.plan == Plan::RFFFRFCFR.into(), 'Views: starter plan');
    assert(starter.orientation == Orientation::South.into(), 'Views: starter orientation');
    assert(starter.x == CENTER && starter.y == CENTER, 'Views: starter position');
    let second = *tiles.at(1);
    assert(second.id == 2, 'Views: second id');
    assert(second.status == TILE_PLACED, 'Views: second placed');
    assert(second.plan == Plan::FFCFFFCFF.into(), 'Views: second plan');
    assert(second.orientation == Orientation::North.into(), 'Views: second orientation');
    assert(second.x == CENTER && second.y == CENTER + 1, 'Views: second position');
    let third = *tiles.at(2);
    assert(third.status == TILE_PLACED, 'Views: third placed');
    assert(third.x == CENTER && third.y == CENTER + 2, 'Views: third position');
    let fourth = *tiles.at(3);
    assert(fourth.status == TILE_DISCARDED, 'Views: fourth discarded');
    assert(fourth.orientation == 0 && fourth.x == 0 && fourth.y == 0, 'Views: fourth off board');
    let fifth = *tiles.at(4);
    assert(fifth.id == 5, 'Views: fifth id');
    assert(fifth.status == TILE_HELD, 'Views: fifth held');
    assert(fifth.plan == daily_views(@systems).game(context.game_id).plan, 'Views: fifth plan');
}

#[test]
#[available_gas(l2_gas: 185440000)]
fn test_views_tiles_paging_edges() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    build_two(store, @systems, context.game_id, context.player_id);
    let views = daily_views(@systems);
    // 4 tiles: ids 1 to 4.

    // A page inside the range.
    let page = views.tiles(context.game_id, 1, 2);
    assert(page.len() == 2, 'Views: page length');
    assert(*page.at(0).id == 2 && *page.at(1).id == 3, 'Views: page ids');
    // A page cut at the end.
    let page = views.tiles(context.game_id, 2, 10);
    assert(page.len() == 2, 'Views: cut length');
    assert(*page.at(1).id == 4, 'Views: last id');
    // From the last tile.
    assert(views.tiles(context.game_id, 3, 1).len() == 1, 'Views: last page');
    // From beyond the end, or count zero: empty.
    assert(views.tiles(context.game_id, 4, 1).len() == 0, 'Views: at end');
    assert(views.tiles(context.game_id, 1000, 1).len() == 0, 'Views: beyond end');
    assert(views.tiles(context.game_id, 0xffffffff, 0xffffffff).len() == 0, 'Views: max from');
    assert(views.tiles(context.game_id, 0, 0).len() == 0, 'Views: count zero');
    // Count above the cap.
    assert(views.tiles(context.game_id, 0, 0xffffffff).len() == 4, 'Views: count capped');
}

#[test]
#[available_gas(l2_gas: 133223000)]
fn test_views_tiles_capped_at_max_page() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    // Pretend more tiles were drawn than one page holds; the extra ids read as empty tiles.
    let mut game = store.game(context.game_id);
    game.tile_count = MAX_PAGE + 10;
    store.set_game(game);
    let views = daily_views(@systems);

    assert(views.tiles(context.game_id, 0, MAX_PAGE + 1).len() == MAX_PAGE, 'Views: capped');
    let page = views.tiles(context.game_id, MAX_PAGE, MAX_PAGE);
    assert(page.len() == 10, 'Views: second page');
    assert(*page.at(9).id == MAX_PAGE + 10, 'Views: last id');
}

#[test]
#[should_panic(expected: 'Game: does not exist')]
fn test_views_tiles_missing_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    daily_views(@systems).tiles(context.game_id + 1, 0, 1);
}

// Builder

/// D-18: the builder view is the tile in hand, four fields; it no longer counts characters.
#[test]
#[available_gas(l2_gas: 148836000)]
fn test_views_builder_is_the_tile_in_hand() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let views = daily_views(@systems);

    let builder = views.builder(context.game_id, context.player_id);
    let expected = BuilderView {
        game_id: context.game_id,
        player_id: context.player_id,
        tile_id: 2,
        plan: store.tile(store.game(context.game_id), 2).plan,
    };
    assert(builder == expected, 'Views: builder');

    // After a build, the tile in hand is the next one drawn
    force_plan(store, context.game_id, context.player_id, Plan::FFCFFFCFF);
    systems.daily.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
    let builder = views.builder(context.game_id, context.player_id);
    assert(builder.tile_id == 3, 'Views: next tile');
    assert(builder.plan == store.tile(store.game(context.game_id), 3).plan, 'Views: next plan');
}

#[test]
#[should_panic(expected: 'View: not the game player')]
fn test_views_builder_other_player() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    daily_views(@systems).builder(context.game_id, SOMEONE().into());
}

// The day (D-20: `current_day`, `GameView.day_id`; the `tournament` view is gone)

#[test]
#[available_gas(l2_gas: 197263000)]
fn test_views_current_day_and_the_day_of_a_game() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let days = IDailyViewDispatcher { contract_address: systems.daily.contract_address };
    assert(days.current_day() == 3, 'Views: current day');
    assert(daily_views(@systems).game(context.game_id).day_id == 0, 'Views: no day before end');

    build_two(store, @systems, context.game_id, context.player_id);
    systems.daily.surrender(context.game_id);
    assert(daily_views(@systems).game(context.game_id).day_id == 3, 'Views: day of the game');

    start_cheat_block_timestamp_global(4 * DAY);
    assert(days.current_day() == 4, 'Views: next day');
    assert(daily_views(@systems).game(context.game_id).day_id == 3, 'Views: day kept');
}

#[test]
#[available_gas(l2_gas: 117998000)]
fn test_views_entry_price_equals_the_spawn_debit() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let days = IDailyViewDispatcher { contract_address: systems.daily.contract_address };
    let price = days.entry_price();
    assert(price.token == context.token.contract_address, 'Views: price token');
    assert(price.amount > 0, 'Views: price amount');

    let player_before = context.token.balance_of(PLAYER());
    systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    assert(player_before - context.token.balance_of(PLAYER()) == price.amount, 'Views: debit');
}

// Events

#[test]
#[available_gas(l2_gas: 190861000)]
fn test_views_events_keys_carry_the_player() {
    start_cheat_block_timestamp_global(3 * DAY + 100);
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let mut spy = spy_events();
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    // Close a city so the final score is not zero.
    build_two(store, @systems, game_id, context.player_id);
    start_cheat_block_timestamp_global(3 * DAY + 200);
    systems.daily.surrender(game_id);
    let score = store.game(game_id).score;
    assert(score > 0, 'Views: scored');
    let player: felt252 = PLAYER().into();

    let mut spawned = false;
    let mut over = false;
    for item in spy.get_events().events {
        let (from, event) = item;
        if from != systems.daily.contract_address {
            continue;
        }
        let keys = event.keys.span();
        if *keys.at(0) == selector!("GameSpawned") {
            assert(keys.len() == 3, 'Views: spawned keys');
            assert(*keys.at(1) == game_id.into(), 'Views: spawned game key');
            assert(*keys.at(2) == player, 'Views: spawned player key');
            spawned = true;
        } else if *keys.at(0) == selector!("GameOver") {
            assert(keys.len() == 4, 'Views: over keys');
            assert(*keys.at(1) == game_id.into(), 'Views: over game key');
            assert(*keys.at(2) == player, 'Views: over player key');
            assert(*keys.at(3) == 3, 'Views: over day key');
            // Data: mode, score, start_time, end_time.
            let data = event.data.span();
            assert(data.len() == 4, 'Views: over data');
            let mode: u8 = Mode::Daily.into();
            assert(*data.at(0) == mode.into(), 'Views: over mode');
            assert(*data.at(1) == score.into(), 'Views: over score');
            assert(*data.at(2) == (3 * DAY + 100).into(), 'Views: over start');
            assert(*data.at(3) == (3 * DAY + 200).into(), 'Views: over end');
            over = true;
        }
    }
    assert(spawned && over, 'Views: events found');
    assert(context.player_id == player, 'Views: player id');
}
