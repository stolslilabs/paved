//! Store struct and component management methods.

// Core imports

use debug::PrintTrait;

// Straknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Models imports

use stolsli::models::game::{Game, GameImpl};
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};
use stolsli::models::character::{Character, CharacterPosition, CharacterImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::direction::Direction;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;

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
    fn builder(self: Store, game: Game, builder_id: felt252) -> Builder {
        get!(self.world, (game.id, builder_id), (Builder))
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
    fn character(self: Store, game: Game, builder_id: felt252, role: Role) -> Character {
        let index: u8 = role.into();
        get!(self.world, (game.id, builder_id, index), (Character))
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
    fn set_builder(self: Store, builder: Builder) {
        set!(self.world, (builder))
    }

    #[inline(always)]
    fn set_tile(self: Store, tile: Tile) {
        if tile.orientation != Orientation::None.into() {
            let position: TilePosition = tile.into();
            set!(self.world, (position))
        }
        set!(self.world, (tile))
    }

    #[inline(always)]
    fn set_character(self: Store, character: Character) {
        if character.tile_id != 0 {
            let position: CharacterPosition = character.into();
            set!(self.world, (position))
        }
        set!(self.world, (character))
    }
}
