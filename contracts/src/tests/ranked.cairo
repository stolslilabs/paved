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
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{
    setup, setup::{Systems, PLAYER, ANYONE, SOMEONE, NOONE, IERC20DispatcherTrait}
};

#[test]
fn test_play_ranked_tournament_started() {
    // [Setup]
    let (world, _, context) = setup::spawn_game();
    let store = StoreTrait::new(world);

    // [Assert] Game
    let mut game = store.game(context.game_id);
    game.assert_started();
}

#[test]
fn test_play_ranked_tournament_claim() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let time = 0;
    set_block_timestamp(time);

    // [Start]
    set_contract_address(ANYONE());
    let anyone_balance = context.erc20.balance_of(ANYONE());
    let game_id = systems.host.create(world);

    // [Draw & Build]
    let mut game = store.game(game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFFFRFCFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.play.surrender(world, game_id);
    let top2_score = store.game(game_id).score;

    // [Start]
    set_contract_address(SOMEONE());
    let someone_balance = context.erc20.balance_of(SOMEONE());
    let game_id = systems.host.create(world);

    // [Draw & Build]
    let mut game = store.game(game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFFFRFCFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.play.surrender(world, game_id);
    let top3_score = store.game(game_id).score;

    // [Start]
    set_contract_address(NOONE());
    let game_id = systems.host.create(world);

    // [Draw & Build]
    let mut game = store.game(game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFFFRFCFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, game_id, orientation, x, y, Role::Lord, Spot::South);
    systems.play.surrender(world, game_id);

    // [Start]
    set_contract_address(PLAYER());
    let player_balance = context.erc20.balance_of(PLAYER());
    let game_id = systems.host.create(world);

    // [Assert] Balance post creation
    let balance = context.erc20.balance_of(PLAYER());
    assert(balance + constants::TOURNAMENT_PRICE.into() == player_balance, 'Balance post creation');

    // [Draw & Build]
    let mut game = store.game(game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFFFRFCFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, game_id, orientation, x, y, Role::Paladin, Spot::South);
    systems.play.surrender(world, game_id);
    let top1_score = store.game(game_id).score;

    // [Assert] Tournament
    let tournament_id = TournamentImpl::compute_id(time);
    let tournament = store.tournament(tournament_id);
    assert(tournament.prize == constants::TOURNAMENT_PRICE * 5, 'Tournament prize');
    assert(tournament.top1_player_id == PLAYER().into(), 'Tournament top1_player_id');
    assert(tournament.top2_player_id == ANYONE().into(), 'Tournament top2_player_id');
    assert(tournament.top3_player_id == SOMEONE().into(), 'Tournament top3_player_id');
    assert(tournament.top1_score == top1_score, 'Tournament top1_score');
    assert(tournament.top2_score == top2_score, 'Tournament top2_score');
    assert(tournament.top3_score == top3_score, 'Tournament top3_score');

    // [Claim]
    set_block_timestamp(constants::TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time);
    let rank = 1;
    systems.host.claim(world, tournament_id, rank);

    // [Assert] Player balance
    let final_player = context.erc20.balance_of(PLAYER());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_player + constants::TOURNAMENT_PRICE.into() == player_balance + reward,
        'Player balance post claim'
    );

    // [Claim]
    set_contract_address(ANYONE());
    set_block_timestamp(constants::TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time);
    let rank = 2;
    systems.host.claim(world, tournament_id, rank);

    // [Assert] Anyone balance
    let final_anyone = context.erc20.balance_of(ANYONE());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_anyone + constants::TOURNAMENT_PRICE.into() == anyone_balance + reward,
        'Anyone balance post claim'
    );

    // [Claim]
    set_contract_address(SOMEONE());
    set_block_timestamp(constants::TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time);
    let rank = 3;
    systems.host.claim(world, tournament_id, rank);

    // [Assert] Someone balance
    let final_someone = context.erc20.balance_of(SOMEONE());
    let tournament = store.tournament(tournament_id);
    let reward = tournament.reward(rank);
    assert(
        final_someone + constants::TOURNAMENT_PRICE.into() == someone_balance + reward,
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
    let (world, systems, _) = setup::spawn_game();
    let time = 0;
    set_block_timestamp(time);

    // [Claim]
    let tournament_id = TournamentImpl::compute_id(time);
    systems.host.claim(world, tournament_id, 1);
}

#[test]
#[should_panic(expected: ('Tournament: invalid player', 'ENTRYPOINT_FAILED',))]
fn test_play_ranked_tournament_claim_revert_invalid_player() {
    // [Setup]
    let (world, systems, _) = setup::spawn_game();
    let time = 0;
    set_block_timestamp(time);

    // [Claim]
    set_block_timestamp(constants::TOURNAMENT_DURATION);
    let tournament_id = TournamentImpl::compute_id(time);
    systems.host.claim(world, tournament_id, 1);
}
