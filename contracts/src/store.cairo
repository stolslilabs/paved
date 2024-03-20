//! Store struct and component management methods.

// Core imports

use core::debug::PrintTrait;

// Straknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Models imports

use paved::helpers::bitmap::Bitmap;
use paved::models::game::{Game, GameImpl};
use paved::models::player::{Player, PlayerName, PlayerImpl};
use paved::models::builder::{Builder, BuilderPosition, BuilderImpl};
use paved::models::team::{Team, TeamImpl};
use paved::models::tile::{Tile, TilePosition, TileImpl};
use paved::models::character::{Character, CharacterPosition, CharacterImpl};
use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::order::Order;

/// Store struct.
#[derive(Copy, Drop)]
struct Store {
    world: IWorldDispatcher,
}

/// Implementation of the `StoreTrait` trait for the `Store` struct.
#[generate_trait]
impl StoreImpl of StoreTrait {
    #[inline(always)]
    fn new(world: IWorldDispatcher) -> Store {
        Store { world: world }
    }

    #[inline(always)]
    fn game(self: Store, game_id: u32) -> Game {
        get!(self.world, game_id, (Game))
    }

    #[inline(always)]
    fn player(self: Store, player_id: felt252) -> Player {
        get!(self.world, player_id, (Player))
    }

    #[inline(always)]
    fn player_name(self: Store, player_name: felt252) -> PlayerName {
        get!(self.world, player_name, (PlayerName))
    }

    #[inline(always)]
    fn player_by_name(self: Store, player_name: felt252) -> Player {
        let player_name = self.player_name(player_name);
        get!(self.world, (player_name.id), (Player))
    }

    #[inline(always)]
    fn builder(self: Store, game: Game, player_id: felt252) -> Builder {
        get!(self.world, (game.id, player_id), (Builder))
    }

    #[inline(always)]
    fn builder_position(self: Store, game: Game, index: u32) -> BuilderPosition {
        get!(self.world, (game.id, index), (BuilderPosition))
    }

    #[inline(always)]
    fn team(self: Store, game: Game, order: Order) -> Team {
        let order_key: u8 = order.into();
        get!(self.world, (game.id, order_key), (Team))
    }

    #[inline(always)]
    fn tile(self: Store, game: Game, tile_id: u32) -> Tile {
        get!(self.world, (game.id, tile_id), (Tile))
    }

    #[inline(always)]
    fn tile_position(self: Store, game: Game, x: u32, y: u32) -> TilePosition {
        get!(self.world, (game.id, x, y), (TilePosition))
    }

    #[inline(always)]
    fn neighbors(self: Store, game: Game, x: u32, y: u32) -> Array<Tile> {
        // Avoid loop for gas efficiency
        let mut neighbors: Array<Tile> = array![];
        let north = self.tile_position(game, x, y + 1);
        if north.tile_id != 0 {
            neighbors.append(self.tile(game, north.tile_id));
        }
        let east = self.tile_position(game, x + 1, y);
        if east.tile_id != 0 {
            neighbors.append(self.tile(game, east.tile_id));
        }
        let south = self.tile_position(game, x, y - 1);
        if south.tile_id != 0 {
            neighbors.append(self.tile(game, south.tile_id));
        }
        let west = self.tile_position(game, x - 1, y);
        if west.tile_id != 0 {
            neighbors.append(self.tile(game, west.tile_id));
        }
        neighbors
    }

    #[inline(always)]
    fn neighborhood(self: Store, game: Game, x: u32, y: u32) -> Array<Tile> {
        // Avoid loop for gas efficiency
        let mut neighbors: Array<Tile> = self.neighbors(game, x, y);
        let northwest = self.tile_position(game, x - 1, y + 1);
        if northwest.tile_id != 0 {
            neighbors.append(self.tile(game, northwest.tile_id));
        }
        let northeast = self.tile_position(game, x + 1, y + 1);
        if northeast.tile_id != 0 {
            neighbors.append(self.tile(game, northeast.tile_id));
        }
        let southeast = self.tile_position(game, x + 1, y - 1);
        if southeast.tile_id != 0 {
            neighbors.append(self.tile(game, southeast.tile_id));
        }
        let southwest = self.tile_position(game, x - 1, y - 1);
        if southwest.tile_id != 0 {
            neighbors.append(self.tile(game, southwest.tile_id));
        }
        neighbors
    }

    #[inline(always)]
    fn character(self: Store, game: Game, player_id: felt252, role: Role) -> Character {
        let index: u8 = role.into();
        get!(self.world, (game.id, player_id, index), (Character))
    }

    #[inline(always)]
    fn character_position(self: Store, game: Game, tile: Tile, spot: Spot) -> CharacterPosition {
        let spot_u8: u8 = spot.into();
        get!(self.world, (game.id, tile.id, spot_u8), (CharacterPosition))
    }

    #[inline(always)]
    fn set_game(self: Store, game: Game) {
        set!(self.world, (game))
    }

    #[inline(always)]
    fn set_player(self: Store, player: Player) {
        set!(self.world, (player))
    }

    #[inline(always)]
    fn set_builder(self: Store, builder: Builder) {
        let position: BuilderPosition = builder.into();
        set!(self.world, (position));
        set!(self.world, (builder))
    }

    #[inline(always)]
    fn swap_builders(self: Store, game: Game, ref lhs: Builder, ref rhs: Builder) {
        let index = lhs.index;
        lhs.index = rhs.index;
        rhs.index = index;
        let lhs_position: BuilderPosition = lhs.into();
        let rhs_position: BuilderPosition = rhs.into();
        set!(self.world, (lhs_position));
        set!(self.world, (rhs_position));
        set!(self.world, (lhs));
        set!(self.world, (rhs))
    }

    #[inline(always)]
    fn remove_builder(self: Store, game: Game, ref builder: Builder) {
        let last_index = game.player_count - 1;
        builder.remove();
        // Skip if the last builder is removed
        if builder.index == last_index {
            set!(self.world, (builder));
            return;
        }
        let mut last_position = self.builder_position(game, last_index);
        let mut last_builder = self.builder(game, last_position.player_id);
        self.swap_builders(game, ref builder, ref last_builder);
    }

    #[inline(always)]
    fn set_team(self: Store, team: Team) {
        set!(self.world, (team))
    }

    #[inline(always)]
    fn set_tile(self: Store, tile: Tile) {
        // [Info] Tile is created when draw then build later and cannot be removed.
        if tile.orientation != Orientation::None.into() {
            let position: TilePosition = tile.into();
            set!(self.world, (position))
        }
        set!(self.world, (tile))
    }

    #[inline(always)]
    fn set_character(self: Store, character: Character) {
        // [Info] Character are created when placed and can be removed.
        let position: CharacterPosition = character.into();
        set!(self.world, (position));
        set!(self.world, (character))
    }
}
