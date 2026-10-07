//! Public read-only views for the client.
//!
//! The view structs are a published interface, independent of the storage layout: fields are only
//! appended, never removed, reordered or repurposed. Reference:
//! `docs/architecture/public-interface.md`.

use paved::constants;
use paved::helpers::bitmap::Bitmap;
use paved::models::game::{Game, GameAssert, GameImpl};
use paved::models::tournament::{Tournament, TournamentTrait};
use paved::store::{Store, StoreImpl};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use starknet::ContractAddress;

// Constants

/// Largest page `tiles` returns.
pub const MAX_PAGE: u32 = 64;
/// Last tournament id whose end time fits in a `u64`: `(2^64 - 1) / 86400 - 1`.
pub const MAX_TOURNAMENT_ID: u64 = 213503982334600;
/// Characters of a player, one per role.
pub const CHARACTER_COUNT: u8 = 7;

pub const TILE_PLACED: u8 = 1;
pub const TILE_DISCARDED: u8 = 2;
pub const TILE_HELD: u8 = 3;

pub mod errors {
    pub const NOT_GAME_PLAYER: felt252 = 'View: not the game player';
}

// Views

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct GameView {
    pub id: u32,
    pub player_id: felt252,
    pub mode: u8,
    pub seed: felt252,
    pub score: u32,
    pub over: bool,
    pub tile_count: u32,
    pub placed_count: u32,
    pub discarded_count: u32,
    pub tile_id: u32,
    pub plan: u8,
    pub remaining_count: u32,
    pub deck_size: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub tournament_id: u64,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct TileView {
    pub id: u32,
    pub status: u8,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct BuilderView {
    pub game_id: u32,
    pub player_id: felt252,
    pub tile_id: u32,
    pub plan: u8,
    pub placed_count: u8,
    pub available_count: u8,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct CharacterView {
    pub role: u8,
    pub placed: bool,
    pub tile_id: u32,
    pub x: u32,
    pub y: u32,
    pub spot: u8,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct TournamentView {
    pub id: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub over: bool,
    pub prize: u256,
    pub top1_player_id: felt252,
    pub top1_score: u32,
    pub top1_claimed: bool,
    pub top2_player_id: felt252,
    pub top2_score: u32,
    pub top2_claimed: bool,
    pub top3_player_id: felt252,
    pub top3_score: u32,
    pub top3_claimed: bool,
}

/// The entry price of `Daily`: the ERC20 `spawn` pulls from the player and the amount it pulls.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct PriceView {
    pub token: ContractAddress,
    pub amount: u256,
}

// Interfaces

/// Views of a game, on `Daily` and `Tutorial`.
#[starknet::interface]
pub trait IGameView<TContractState> {
    fn game(self: @TContractState, game_id: u32) -> GameView;
    fn tiles(self: @TContractState, game_id: u32, from: u32, count: u32) -> Array<TileView>;
    fn builder(self: @TContractState, game_id: u32, player_id: felt252) -> BuilderView;
    fn characters(self: @TContractState, game_id: u32, player_id: felt252) -> Array<CharacterView>;
}

/// Views of the Daily tournaments, on `Daily`.
#[starknet::interface]
pub trait ITournamentView<TContractState> {
    fn tournament(self: @TContractState, id: u64) -> TournamentView;
    fn current_tournament_id(self: @TContractState) -> u64;
    fn entry_price(self: @TContractState) -> PriceView;
}

// Implementations

#[generate_trait]
pub impl ViewsImpl of ViewsTrait {
    fn game(store: Store, game_id: u32) -> GameView {
        let game = Self::existing_game(store, game_id);
        let (tile_id, plan) = if game.over {
            (0, 0)
        } else {
            (game.tile_count, store.tile(game, game.tile_count).plan)
        };
        let remaining_count = if game.over {
            0
        } else {
            game.tile_limit.into() - game.tile_count
        };
        GameView {
            id: game.id,
            player_id: Self::game_player(store, game),
            mode: game.mode,
            seed: game.seed,
            score: game.score,
            over: game.over,
            tile_count: game.tile_count,
            placed_count: game.built.into() + 1,
            discarded_count: game.discarded.into(),
            tile_id,
            plan,
            remaining_count,
            deck_size: game.tile_limit.into(),
            start_time: game.start_time,
            end_time: game.end_time,
            tournament_id: game.tournament_id,
        }
    }

    fn tiles(store: Store, game_id: u32, from: u32, count: u32) -> Array<TileView> {
        let game = Self::existing_game(store, game_id);
        let mut tiles: Array<TileView> = array![];
        if from >= game.tile_count {
            return tiles;
        }
        let mut count = if count > MAX_PAGE {
            MAX_PAGE
        } else {
            count
        };
        if count > game.tile_count - from {
            count = game.tile_count - from;
        }
        let builder = game.builder_of(game.player_id);
        let none: u8 = Orientation::None.into();
        let mut tile_id = from + 1;
        let last = from + count;
        while tile_id <= last {
            let tile = store.tile(game, tile_id);
            let status = if tile.orientation != none {
                TILE_PLACED
            } else if tile.id == builder.tile_id {
                TILE_HELD
            } else {
                TILE_DISCARDED
            };
            let (x, y) = if status == TILE_PLACED {
                (tile.x, tile.y)
            } else {
                (0, 0)
            };
            tiles
                .append(
                    TileView {
                        id: tile.id, status, plan: tile.plan, orientation: tile.orientation, x, y,
                    },
                );
            tile_id += 1;
        }
        tiles
    }

    fn builder(store: Store, game_id: u32, player_id: felt252) -> BuilderView {
        let game = Self::existing_game(store, game_id);
        Self::assert_game_player(store, game, player_id);
        let builder = game.builder_of(player_id);
        let plan = if builder.tile_id == 0 {
            0
        } else {
            store.tile(game, builder.tile_id).plan
        };
        let mut placed_count: u8 = 0;
        let mut index: u8 = 1;
        while index <= CHARACTER_COUNT {
            if Bitmap::get_bit_at(builder.characters, index) {
                placed_count += 1;
            }
            index += 1;
        }
        BuilderView {
            game_id,
            player_id,
            tile_id: builder.tile_id,
            plan,
            placed_count,
            available_count: CHARACTER_COUNT - placed_count,
        }
    }

    fn characters(store: Store, game_id: u32, player_id: felt252) -> Array<CharacterView> {
        let game = Self::existing_game(store, game_id);
        Self::assert_game_player(store, game, player_id);
        let builder = game.builder_of(player_id);
        let roles = array![
            Role::Lord, Role::Lady, Role::Adventurer, Role::Paladin, Role::Pilgrim, Role::Woodsman,
            Role::Herdsman,
        ];
        let mut characters: Array<CharacterView> = array![];
        for role in roles {
            let index: u8 = role.into();
            let view = if Bitmap::get_bit_at(builder.characters, index) {
                let character = store.character(game, player_id, role);
                let tile = store.tile(game, character.tile_id);
                CharacterView {
                    role: index,
                    placed: true,
                    tile_id: character.tile_id,
                    x: tile.x,
                    y: tile.y,
                    spot: character.spot,
                }
            } else {
                CharacterView { role: index, placed: false, tile_id: 0, x: 0, y: 0, spot: 0 }
            };
            characters.append(view);
        }
        characters
    }

    fn tournament(store: Store, id: u64, time: u64) -> TournamentView {
        // [Check] Beyond the last day a u64 time can end: a zeroed view, no revert
        if id > MAX_TOURNAMENT_ID {
            return TournamentView {
                id,
                start_time: 0,
                end_time: 0,
                over: false,
                prize: 0,
                top1_player_id: 0,
                top1_score: 0,
                top1_claimed: false,
                top2_player_id: 0,
                top2_score: 0,
                top2_claimed: false,
                top3_player_id: 0,
                top3_score: 0,
                top3_claimed: false,
            };
        }
        let tournament: Tournament = store.tournament(id);
        let duration = constants::DAILY_TOURNAMENT_DURATION;
        let end_time = (id + 1) * duration;
        TournamentView {
            id,
            start_time: id * duration,
            end_time,
            over: time >= end_time,
            prize: tournament.prize.into(),
            top1_player_id: tournament.top1_player_id,
            top1_score: tournament.top1_score,
            top1_claimed: tournament.top1_claimed,
            top2_player_id: tournament.top2_player_id,
            top2_score: tournament.top2_score,
            top2_claimed: tournament.top2_claimed,
            top3_player_id: tournament.top3_player_id,
            top3_score: tournament.top3_score,
            top3_claimed: tournament.top3_claimed,
        }
    }

    fn current_tournament_id(time: u64) -> u64 {
        TournamentTrait::compute_id(time, constants::DAILY_TOURNAMENT_DURATION)
    }

    /// The entry price of a Daily game, from the same source as `spawn` (`Mode::price`).
    fn entry_price(token: ContractAddress) -> PriceView {
        PriceView { token, amount: Mode::Daily.price().into() }
    }

    fn existing_game(store: Store, game_id: u32) -> Game {
        let game = store.game(game_id);
        game.assert_exists();
        game
    }

    /// The player of a game: the one `GameConfig` records at spawn.
    fn game_player(store: Store, game: Game) -> felt252 {
        game.player_id
    }

    fn assert_game_player(store: Store, game: Game, player_id: felt252) {
        assert(player_id != 0, errors::NOT_GAME_PLAYER);
        assert(Self::game_player(store, game) == player_id, errors::NOT_GAME_PLAYER);
    }
}
