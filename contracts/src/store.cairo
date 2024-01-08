//! Store struct and component management methods.

// Straknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Models imports

use stolsli::models::game::{Game, GameImpl};
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};


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
    fn game(ref self: Store) -> Game {
        // TODO: Manage it for seasonal games
        let game_id: felt252 = 0.into();
        get!(self.world, game_id, (Game))
    }

    #[inline(always)]
    fn builder(ref self: Store, game: Game, address: ContractAddress) -> Builder {
        let builder_id: felt252 = address.into();
        get!(self.world, (game.id, builder_id), (Builder))
    }

    #[inline(always)]
    fn tile(ref self: Store, game: Game, tile_id: u32) -> Tile {
        get!(self.world, (game.id, tile_id), (Tile))
    }

    #[inline(always)]
    fn position(ref self: Store, game: Game, x: u32, y: u32) -> TilePosition {
        get!(self.world, (game.id, x, y), (TilePosition))
    }

    #[inline(always)]
    fn neighbors(ref self: Store, game: Game, x: u32, y: u32) -> Array<Tile> {
        // Avoid loop for gas efficiency
        let mut neighbors: Array<Tile> = array![];
        let north = self.position(game, x, y + 1);
        if north.tile_id != 0 {
            neighbors.append(self.tile(game, north.tile_id));
        }
        let east = self.position(game, x + 1, y);
        if east.tile_id != 0 {
            neighbors.append(self.tile(game, east.tile_id));
        }
        let south = self.position(game, x, y - 1);
        if south.tile_id != 0 {
            neighbors.append(self.tile(game, south.tile_id));
        }
        let west = self.position(game, x - 1, y);
        if west.tile_id != 0 {
            neighbors.append(self.tile(game, west.tile_id));
        }
        neighbors
    }

    #[inline(always)]
    fn set_game(ref self: Store, game: Game) {
        set!(self.world, (game))
    }

    #[inline(always)]
    fn set_builder(ref self: Store, builder: Builder) {
        set!(self.world, (builder))
    }

    #[inline(always)]
    fn set_tile(ref self: Store, tile: Tile) {
        let position = tile.position();
        if position.tile_id != 0 {
            set!(self.world, (position))
        }
        set!(self.world, (tile))
    }
}
