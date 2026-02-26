//! Store struct and component management methods.

// Straknet imports

use dojo::model::ModelStorage;
use dojo::world::{IWorldDispatcher, WorldStorage, WorldStorageTrait};

// Models imports

use paved::models::game::Game;
use paved::models::player::Player;
use paved::models::builder::Builder;
use paved::models::tile::{Tile, TilePosition, TileIntoPosition};
use paved::models::character::{Char, CharPosition, CharIntoCharPosition};
use paved::models::tournament::Tournament;
use paved::models::economy::{
    EconomyConfig, EconomyConfigTrait, EconomyState, EconomyStateTrait, EntrySettlement
};
use paved::models::index::{GameConfigTemplate, GameConfigSnapshot, ConfigPolicy};
use paved::helpers::config_validation::{RuntimeGameConfigTrait};
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;

/// Store struct.
#[derive(Copy, Drop)]
pub struct Store {
    world: WorldStorage,
}

/// Implementation of the `StoreTrait` trait for the `Store` struct.
#[generate_trait]
pub impl StoreImpl of StoreTrait {
    fn new(world: IWorldDispatcher) -> Store {
        Store { world: WorldStorageTrait::new(world, @"paved") }
    }

    fn game(self: Store, game_id: u32) -> Game {
        self.world.read_model(game_id)
    }

    fn player(self: Store, player_id: felt252) -> Player {
        self.world.read_model(player_id)
    }

    fn builder(self: Store, game: Game, player_id: felt252) -> Builder {
        self.world.read_model((game.id, player_id))
    }

    fn tournament(self: Store, tournament_id: u64) -> Tournament {
        self.world.read_model(tournament_id)
    }

    fn economy_config(self: Store) -> EconomyConfig {
        let config: EconomyConfig = self.world.read_model(1_u8);
        if config.id == 0 || (config.team_bps == 0 && config.burn_bps == 0) {
            return EconomyConfigTrait::default();
        }
        config
    }

    fn economy_state(self: Store) -> EconomyState {
        let state: EconomyState = self.world.read_model(1_u8);
        if state.id == 0 {
            return EconomyStateTrait::zero();
        }
        state
    }

    fn entry_settlement(self: Store, game_id: u32) -> EntrySettlement {
        self.world.read_model(game_id)
    }

    fn game_config_template(self: Store, template_id: u32) -> GameConfigTemplate {
        self.world.read_model(template_id)
    }

    fn game_config_snapshot(self: Store, game_id: u32) -> GameConfigSnapshot {
        self.world.read_model(game_id)
    }

    fn config_policy(self: Store) -> ConfigPolicy {
        let policy: ConfigPolicy = self.world.read_model(1_u8);
        if policy.max_duration == 0 {
            return RuntimeGameConfigTrait::default_policy();
        }
        policy
    }

    fn tile(self: Store, game: Game, tile_id: u32) -> Tile {
        self.world.read_model((game.id, tile_id))
    }

    fn tile_position(self: Store, game: Game, x: u32, y: u32) -> TilePosition {
        self.world.read_model((game.id, x, y))
    }

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

    fn character(self: Store, game: Game, player_id: felt252, role: Role) -> Char {
        let index: u8 = role.into();
        self.world.read_model((game.id, player_id, index))
    }

    fn character_position(self: Store, game: Game, tile: Tile, spot: Spot) -> CharPosition {
        let spot_u8: u8 = spot.into();
        self.world.read_model((game.id, tile.id, spot_u8))
    }

    fn set_game(self: Store, game: Game) {
        let mut world = self.world;
        world.write_model(@game);
    }

    fn set_player(self: Store, player: Player) {
        let mut world = self.world;
        world.write_model(@player);
    }

    fn set_builder(self: Store, builder: Builder) {
        let mut world = self.world;
        world.write_model(@builder);
    }

    fn set_tile(self: Store, tile: Tile) {
        let mut world = self.world;
        // [Info] Tile is created when draw then build later and cannot be removed.
        if tile.orientation != Orientation::None.into() {
            let position: TilePosition = tile.into();
            world.write_model(@position);
        }
        world.write_model(@tile);
    }

    fn set_character(self: Store, character: Char) {
        let mut world = self.world;
        // [Info] Char are created when placed and can be removed.
        let position: CharPosition = character.into();
        world.write_model(@position);
        world.write_model(@character);
    }

    fn set_tournament(self: Store, tournament: Tournament) {
        let mut world = self.world;
        world.write_model(@tournament);
    }

    fn set_economy_config(self: Store, config: EconomyConfig) {
        let mut world = self.world;
        world.write_model(@config);
    }

    fn set_economy_state(self: Store, state: EconomyState) {
        let mut world = self.world;
        world.write_model(@state);
    }

    fn set_entry_settlement(self: Store, settlement: EntrySettlement) {
        let mut world = self.world;
        world.write_model(@settlement);
    }

    fn set_game_config_template(self: Store, template: GameConfigTemplate) {
        let mut world = self.world;
        world.write_model(@template);
    }

    fn set_game_config_snapshot(self: Store, snapshot: GameConfigSnapshot) {
        let mut world = self.world;
        world.write_model(@snapshot);
    }

    fn set_config_policy(self: Store, policy: ConfigPolicy) {
        let mut world = self.world;
        world.write_model(@policy);
    }
}
