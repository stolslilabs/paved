// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_caller_address, set_block_timestamp};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait, GameAssert};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::tile::{Tile, TileTrait, CENTER};
use paved::models::tournament::{TournamentImpl};
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::plan::Plan;
use paved::types::orientation::Orientation;

use paved::tests::setup::{
    setup,
    setup::{
        Mode, Systems, PLAYER, ANYONE, SOMEONE, NOONE, IERC20DispatcherTrait, IWeeklyDispatcherTrait
    }
};

#[test]
fn test_play_ranked_tournament_started() {
    // [Setup]
    let (world, _, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    // [Assert] Game
    let mut game = store.game(context.game_id);
    game.assert_started();
}

#[test]
fn test_play_ranked_tournament_claim() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);
    let time = 0;
    set_block_timestamp(time);

    // [Start]
    set_contract_address(ANYONE());
    let anyone_balance = context.token.balance_of(ANYONE());
    let game_id = systems.weekly.spawn();

    // [Draw & Build]
    let game = store.game(game_id);
    let builder = store.builder(game, context.anyone_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFCFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.weekly.build(game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.weekly.surrender(game_id);
    let top2_score = store.builder(game, context.anyone_id).score;

    // [Start]
    set_contract_address(SOMEONE());
    let someone_balance = context.token.balance_of(SOMEONE());
    let game_id = systems.weekly.spawn();

    // [Draw & Build]
    let game = store.game(game_id);
    let builder = store.builder(game, context.someone_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFCFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.weekly.build(game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.weekly.surrender(game_id);
    let top3_score = store.builder(game, context.someone_id).score;

    // [Start]
    set_contract_address(NOONE());
    let game_id = systems.weekly.spawn();

    // [Draw & Build]
    let game = store.game(game_id);
    let builder = store.builder(game, context.noone_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFCFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.weekly.build(game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.weekly.surrender(game_id);

    // [Start]
    set_contract_address(PLAYER());
    let player_balance = context.token.balance_of(PLAYER());
    let game_id = systems.weekly.spawn();

    // [Assert] Balance post creation
    let balance = context.token.balance_of(PLAYER());
    assert(
        balance + constants::WEEKLY_TOURNAMENT_PRICE.into() == player_balance,
        'Balance post creation'
    );

    // [Draw & Build]
    let game = store.game(game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFCFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.weekly.build(game_id, orientation, x, y, Role::Paladin, Spot::South);
    systems.weekly.surrender(game_id);
    let top1_score = store.builder(game, context.player_id).score;

    // [Assert] Tournament
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    let tournament = store.tournament(tournament_id);
    assert(tournament.prize == constants::WEEKLY_TOURNAMENT_PRICE * 5, 'Tournament prize');
    assert(tournament.top1_player_id == PLAYER().into(), 'Tournament top1_player_id');
    assert(tournament.top2_player_id == ANYONE().into(), 'Tournament top2_player_id');
    assert(tournament.top3_player_id == SOMEONE().into(), 'Tournament top3_player_id');
    assert(tournament.top1_score == top1_score, 'Tournament top1_score');
    assert(tournament.top2_score == top2_score, 'Tournament top2_score');
    assert(tournament.top3_score == top3_score, 'Tournament top3_score');

    // [Claim]
    set_block_timestamp(constants::WEEKLY_TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    let rank = 1;
    systems.weekly.claim(tournament_id, rank);

    // [Assert] Player balance
    let final_player = context.token.balance_of(PLAYER());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_player + constants::WEEKLY_TOURNAMENT_PRICE.into() == player_balance + reward,
        'Player balance post claim'
    );

    // [Claim]
    set_contract_address(ANYONE());
    set_block_timestamp(constants::WEEKLY_TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    let rank = 2;
    systems.weekly.claim(tournament_id, rank);

    // [Assert] Anyone balance
    let final_anyone = context.token.balance_of(ANYONE());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_anyone + constants::WEEKLY_TOURNAMENT_PRICE.into() == anyone_balance + reward,
        'Anyone balance post claim'
    );

    // [Claim]
    set_contract_address(SOMEONE());
    set_block_timestamp(constants::WEEKLY_TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    let rank = 3;
    systems.weekly.claim(tournament_id, rank);

    // [Assert] Someone balance
    let final_someone = context.token.balance_of(SOMEONE());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_someone + constants::WEEKLY_TOURNAMENT_PRICE.into() == someone_balance + reward,
        'Someone balance post claim'
    );

    // [Assert] Rewards
    assert(final_player > final_anyone && final_player > final_someone, 'Player reward');
    assert(final_anyone > final_someone, 'Anyone reward');
}

#[test]
#[should_panic(expected: ('Tournament: not over', 'ENTRYPOINT_FAILED',))]
fn test_play_ranked_tournament_claim_revert_not_over() {
    // [Setup]
    let (_, systems, _) = setup::spawn_game(Mode::Weekly);
    let time = 0;
    set_block_timestamp(time);

    // [Claim]
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    systems.weekly.claim(tournament_id, 1);
}

#[test]
#[should_panic(expected: ('Tournament: invalid player', 'ENTRYPOINT_FAILED',))]
fn test_play_ranked_tournament_claim_revert_invalid_player() {
    // [Setup]
    let (_, systems, _) = setup::spawn_game(Mode::Weekly);
    let time = 0;
    set_block_timestamp(time);

    // [Claim]
    set_block_timestamp(constants::WEEKLY_TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time, 604800);
    systems.weekly.claim(tournament_id, 1);
}
