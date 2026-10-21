//! Public read-only views for the client.
//!
//! The view structs are a published interface, independent of the storage layout: fields are only
//! appended, never removed, reordered or repurposed. Reference:
//! `docs/architecture/public-interface.md`. D-18 broke that promise once: `characters` and the
//! counters of `BuilderView` went with the characters; D-20 removed the `tournament` view and its
//! `TournamentView`, and renamed `GameView.tournament_id` to `day_id`.

use paved::constants;
use paved::day::day_id;
use paved::models::game::{Game, GameAssert, GameImpl};
use paved::seed::{SeedSource, TokenSeed};
use paved::store::{Store, StoreImpl};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::vrf::draw_salt;
use starknet::ContractAddress;

// Constants

/// Largest page `tiles` returns.
pub const MAX_PAGE: u32 = 64;

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
    pub day_id: u64,
    /// The first second at which `build` and `discard` revert with `'Game: expired'`: `start_time`
    /// + 24 h (S1, appended). `surrender` stays open after it.
    pub expires_at: u64,
}

/// The queue of a Challenge game and its next draw (#645, D-30, `IChallengeDraw::draw`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct DrawView {
    pub game_id: u32,
    /// The plans of the tiles `held + 1` and `held + 2` (0: none).
    pub next: u8,
    pub after: u8,
    /// The deck bitmap: a set bit is out of the deck (left out by the deck's walk, the starter,
    /// or drawn, the queue included), so the clear bits under the deck's total are the tiles
    /// still to draw. 0 once the deck's last tile is drawn (`draw_from_bitmap` empties it).
    pub tiles: u128,
    /// Whether the game draws from the VRF (spawned since #645, or moved to it by a move).
    pub vrf: bool,
    /// Whether the next build or discard of the game's player draws, and the salt it draws with
    /// (0 if not): the multicall then requests it first.
    pub draws: bool,
    pub salt: felt252,
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
}

/// The entry price of `Challenge`: the ERC20 `spawn` pulls from the player and the amount it pulls.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct PriceView {
    pub token: ContractAddress,
    pub amount: u256,
}

// Interfaces

/// Views of a game, on `Challenge`.
#[starknet::interface]
pub trait IGameView<TContractState> {
    fn game(self: @TContractState, game_id: u32) -> GameView;
    fn tiles(self: @TContractState, game_id: u32, from: u32, count: u32) -> Array<TileView>;
    fn builder(self: @TContractState, game_id: u32, player_id: felt252) -> BuilderView;
    /// The seed the game started with, before the deck's withdrawal and the first draw (S1): with
    /// `tiles` (every drawn tile, in draw order), what the client replays to predict the next
    /// draw. Reverts `'Game: does not exist'` for no game.
    fn initial_seed(self: @TContractState, game_id: u32) -> felt252;
}

/// Views of the Challenge days, on `Challenge` (`ITournamentView` before D-20).
#[starknet::interface]
pub trait IChallengeView<TContractState> {
    /// The day id of now: `block_timestamp / 86400` (`current_tournament_id` before D-20).
    fn current_day(self: @TContractState) -> u64;
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
            day_id: game.day_id,
            expires_at: game.expires_at(),
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
        BuilderView { game_id, player_id, tile_id: builder.tile_id, plan }
    }

    /// The initial seed of an existing game of the contract `contract`. A VRF game (#645) stores
    /// it and never changes it: the spawn's random (for a game moved to the VRF by a move, its
    /// seed at that move). A game spawned before has its token's seed (`TokenSeed`, D-23), the
    /// one the Sepolia `Challenge` used from its deployment (5dbc692b), computed, not stored.
    fn initial_seed(store: Store, contract: ContractAddress, game_id: u32) -> felt252 {
        let game = Self::existing_game(store, game_id);
        if game.is_vrf() {
            return game.seed;
        }
        let mode: Mode = game.mode.into();
        // [Info] The salt is the seed of a new game, 0 (`GameImpl::new`)
        TokenSeed { contract }.seed(mode, game.start_time, game_id, 0)
    }

    /// The queue of `game` and the draw of its next move, `index` from `GameImpl::move_draw`,
    /// salted with `kind`.
    fn draw(game: Game, index: Option<u32>, kind: felt252) -> DrawView {
        game.assert_exists();
        let (draws, salt) = match index {
            Option::Some(index) => (true, draw_salt(kind, game.id.into(), index)),
            Option::None => (false, 0),
        };
        DrawView {
            game_id: game.id,
            next: game.next_plan(),
            after: game.after_plan(),
            tiles: game.tiles,
            vrf: game.is_vrf(),
            draws,
            salt,
        }
    }

    fn current_day(time: u64) -> u64 {
        day_id(time, constants::CHALLENGE_DURATION)
    }

    /// The entry price of a Challenge game, from the same source as `spawn` (`Mode::price`).
    fn entry_price(token: ContractAddress) -> PriceView {
        PriceView { token, amount: Mode::Challenge.price().into() }
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
