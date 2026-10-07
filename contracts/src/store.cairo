//! Store struct and model access over native Starknet storage.
//!
//! The game state lives in `PavedStorage`, a storage node rooted at `selector!("paved")` in the
//! contract that runs the code. `Store` holds no state: every read and write goes to the storage of
//! the calling contract. Maps are keyed by the fields that were the Dojo model keys, keys are not
//! stored, and values are packed into whole felts (see `docs/architecture/native-storage.md`).

use core::num::traits::Zero;
use paved::events::Event;
use paved::models::builder::Builder;
use paved::models::character::{Char, CharIntoCharPosition, CharPosition};
use paved::models::game::Game;
use paved::models::player::Player;
use paved::models::tile::{Tile, TileIntoPosition, TilePosition};
use paved::models::tournament::Tournament;
use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use starknet::storage::{
    Map, Mutable, StorageAsPath, StorageBase, StoragePath, StoragePathEntry,
    StoragePointerReadAccess, StoragePointerWriteAccess,
};
use starknet::{ContractAddress, SyscallResultTrait};

// Constants

const TWO_POW_8: u128 = 0x100;
const TWO_POW_16: u128 = 0x10000;
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_40: u128 = 0x10000000000;
const TWO_POW_48: u128 = 0x1000000000000;
const TWO_POW_56: u128 = 0x100000000000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_72: u128 = 0x1000000000000000000;
const TWO_POW_80: u128 = 0x100000000000000000000;
const TWO_POW_88: u128 = 0x10000000000000000000000;
const TWO_POW_96: u128 = 0x1000000000000000000000000;
const TWO_POW_97: u128 = 0x2000000000000000000000000;
const TWO_POW_98: u128 = 0x4000000000000000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const MASK_1: u128 = 0x1;
const MASK_8: u128 = 0xff;
const MASK_16: u128 = 0xffff;
const MASK_32: u128 = 0xffffffff;
const MASK_64: u128 = 0xffffffffffffffff;

// Storage

/// Two consecutive storage slots.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Slots2 {
    pub a: felt252,
    pub b: felt252,
}

/// Three consecutive storage slots.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Slots3 {
    pub a: felt252,
    pub b: felt252,
    pub c: felt252,
}

/// Five consecutive storage slots.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Slots5 {
    pub a: felt252,
    pub b: felt252,
    pub c: felt252,
    pub d: felt252,
    pub e: felt252,
}

/// Game state of a contract.
#[starknet::storage_node]
pub struct PavedStorage {
    /// Last game id given (Dojo: `world.uuid()`).
    pub game_count: u32,
    /// `Account` contract that keeps the players; zero in `Account` itself.
    pub account: ContractAddress,
    /// `GameConfig`: written once, at spawn.
    pub game_configs: Map<u32, Slots2>,
    /// `GameState`: written by every action.
    pub game_states: Map<u32, Slots2>,
    /// `GameEnd`: written once, when the game ends in time.
    pub game_ends: Map<u32, felt252>,
    pub players: Map<felt252, Slots2>,
    pub tiles: Map<(u32, u32), felt252>,
    pub tile_positions: Map<(u32, u32, u32), u32>,
    pub characters: Map<(u32, felt252, u8), felt252>,
    pub character_positions: Map<(u32, u32, u8), Slots2>,
    pub tournaments: Map<u64, Slots5>,
}

#[inline(always)]
fn storage() -> StoragePath<Mutable<PavedStorage>> {
    let base: StorageBase<Mutable<PavedStorage>> = StorageBase {
        __base_address__: selector!("paved"),
    };
    base.as_path()
}

/// Store struct.
#[derive(Copy, Drop)]
pub struct Store {}

/// Implementation of the `StoreTrait` trait for the `Store` struct.
#[generate_trait]
pub impl StoreImpl of StoreTrait {
    #[inline(always)]
    fn new() -> Store {
        Store {}
    }

    /// Records the `Account` contract that keeps the players (game contracts only).
    fn initialize(self: Store, account: ContractAddress) {
        storage().account.write(account);
    }

    /// Returns a new game id (1 for the first game of the contract).
    fn uuid(self: Store) -> u32 {
        let game_id = storage().game_count.read() + 1;
        storage().game_count.write(game_id);
        game_id
    }

    fn emit(self: Store, event: Event) {
        let mut keys: Array<felt252> = array![];
        let mut data: Array<felt252> = array![];
        starknet::Event::append_keys_and_data(@event, ref keys, ref data);
        starknet::syscalls::emit_event_syscall(keys.span(), data.span()).unwrap_syscall();
    }

    /// The game with its end: the facade of the three game records, for the views and the tests.
    fn game(self: Store, game_id: u32) -> Game {
        let mut game = self.live_game(game_id);
        let end: u256 = storage().game_ends.entry(game_id).read().into();
        game.end_time = (end.low & MASK_64).try_into().unwrap();
        game.tournament_id = (end.low / TWO_POW_64).try_into().unwrap();
        game
    }

    /// The game without its end (`end_time` and `tournament_id` are 0): `GameConfig` and
    /// `GameState`, which is all a move needs.
    fn live_game(self: Store, game_id: u32) -> Game {
        let config = storage().game_configs.entry(game_id).read();
        let state = storage().game_states.entry(game_id).read();
        let c: u256 = config.b.into();
        let s: u256 = state.b.into();
        let over = (s.high / TWO_POW_56) & MASK_1;
        Game {
            id: game_id,
            player_id: config.a,
            held_tile: ((s.high / TWO_POW_64) & MASK_8).try_into().unwrap(),
            characters: ((s.high / TWO_POW_72) & MASK_16).try_into().unwrap(),
            over: over == 1,
            discarded: ((s.high / TWO_POW_40) & MASK_8).try_into().unwrap(),
            built: ((s.high / TWO_POW_48) & MASK_8).try_into().unwrap(),
            tiles: s.low,
            tile_count: (s.high & MASK_8).try_into().unwrap(),
            start_time: ((c.low / TWO_POW_8) & MASK_64).try_into().unwrap(),
            end_time: 0,
            score: ((s.high / TWO_POW_8) & MASK_32).try_into().unwrap(),
            seed: state.a,
            mode: (c.low & MASK_8).try_into().unwrap(),
            tournament_id: 0,
            tile_limit: ((c.low / TWO_POW_72) & MASK_16).try_into().unwrap(),
        }
    }

    fn player(self: Store, player_id: felt252) -> Player {
        let account = storage().account.read();
        if account.is_non_zero() {
            return IAccountDispatcher { contract_address: account }.player(player_id);
        }
        let slots = storage().players.entry(player_id).read();
        Player { id: player_id, name: slots.a, master: slots.b }
    }

    /// The builder of `player_id`, read from `GameState` as it is now (a move that changes the
    /// builder through `set_builder` is seen by the next read). A facade: the builder of the game
    /// is its player's, anyone else gets the zero builder.
    fn builder(self: Store, game: Game, player_id: felt252) -> Builder {
        let config = storage().game_configs.entry(game.id).read();
        if player_id == 0 || player_id != config.a {
            return Builder { game_id: game.id, player_id, tile_id: 0, characters: 0 };
        }
        let state = storage().game_states.entry(game.id).read();
        let s: u256 = state.b.into();
        Builder {
            game_id: game.id,
            player_id,
            tile_id: ((s.high / TWO_POW_64) & MASK_8).try_into().unwrap(),
            characters: ((s.high / TWO_POW_72) & MASK_16).try_into().unwrap(),
        }
    }

    fn tournament(self: Store, tournament_id: u64) -> Tournament {
        let slots = storage().tournaments.entry(tournament_id).read();
        let word: u256 = slots.e.into();
        Tournament {
            id: tournament_id,
            prize: slots.a,
            top1_player_id: slots.b,
            top2_player_id: slots.c,
            top3_player_id: slots.d,
            top1_score: (word.low & MASK_32).try_into().unwrap(),
            top2_score: ((word.low / TWO_POW_32) & MASK_32).try_into().unwrap(),
            top3_score: ((word.low / TWO_POW_64) & MASK_32).try_into().unwrap(),
            top1_claimed: (word.low / TWO_POW_96) & MASK_1 == 1,
            top2_claimed: (word.low / TWO_POW_97) & MASK_1 == 1,
            top3_claimed: (word.low / TWO_POW_98) & MASK_1 == 1,
        }
    }

    fn tile(self: Store, game: Game, tile_id: u32) -> Tile {
        let word: u256 = storage().tiles.entry((game.id, tile_id)).read().into();
        Tile {
            game_id: game.id,
            id: tile_id,
            plan: (word.low & MASK_8).try_into().unwrap(),
            orientation: ((word.low / TWO_POW_8) & MASK_8).try_into().unwrap(),
            x: ((word.low / TWO_POW_16) & MASK_32).try_into().unwrap(),
            y: ((word.low / TWO_POW_48) & MASK_32).try_into().unwrap(),
            occupied_spot: ((word.low / TWO_POW_80) & MASK_8).try_into().unwrap(),
        }
    }

    fn tile_position(self: Store, game: Game, x: u32, y: u32) -> TilePosition {
        let tile_id = storage().tile_positions.entry((game.id, x, y)).read();
        TilePosition { game_id: game.id, x, y, tile_id }
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
        let word: u256 = storage().characters.entry((game.id, player_id, index)).read().into();
        Char {
            game_id: game.id,
            player_id,
            index,
            tile_id: (word.low & MASK_32).try_into().unwrap(),
            spot: ((word.low / TWO_POW_32) & MASK_8).try_into().unwrap(),
            weight: ((word.low / TWO_POW_40) & MASK_8).try_into().unwrap(),
            power: ((word.low / TWO_POW_48) & MASK_8).try_into().unwrap(),
        }
    }

    fn character_position(self: Store, game: Game, tile: Tile, spot: Spot) -> CharPosition {
        let spot_u8: u8 = spot.into();
        let slots = storage().character_positions.entry((game.id, tile.id, spot_u8)).read();
        let index: u256 = slots.b.into();
        CharPosition {
            game_id: game.id,
            tile_id: tile.id,
            spot: spot_u8,
            player_id: slots.a,
            index: index.low.try_into().unwrap(),
        }
    }

    /// Writes the three records of a game: the facade for the tests. A move writes `GameState`
    /// through `set_game_state`.
    fn set_game(self: Store, game: Game) {
        self.set_game_config(game);
        self.set_game_state(game);
        if game.end_time != 0 || game.tournament_id != 0 {
            self.set_game_end(game);
        }
    }

    /// `GameConfig`: the player, the mode, the start time and the tile limit. Written at spawn.
    fn set_game_config(self: Store, game: Game) {
        let b: u128 = game.mode.into()
            + game.start_time.into() * TWO_POW_8
            + game.tile_limit.into() * TWO_POW_72;
        storage().game_configs.entry(game.id).write(Slots2 { a: game.player_id, b: b.into() });
    }

    /// `GameState`: the seed and the hot fields, rewritten by every action.
    fn set_game_state(self: Store, game: Game) {
        let over: u128 = if game.over {
            1
        } else {
            0
        };
        let high: u128 = game.tile_count.into()
            + game.score.into() * TWO_POW_8
            + game.discarded.into() * TWO_POW_40
            + game.built.into() * TWO_POW_48
            + over * TWO_POW_56
            + game.held_tile.into() * TWO_POW_64
            + game.characters.into() * TWO_POW_72;
        let slots = Slots2 { a: game.seed, b: game.tiles.into() + high.into() * TWO_POW_128 };
        storage().game_states.entry(game.id).write(slots);
    }

    /// `GameEnd`: the end time and the tournament of a game that ended in time.
    fn set_game_end(self: Store, game: Game) {
        let word: u128 = game.end_time.into() + game.tournament_id.into() * TWO_POW_64;
        storage().game_ends.entry(game.id).write(word.into());
    }

    fn set_player(self: Store, player: Player) {
        storage().players.entry(player.id).write(Slots2 { a: player.name, b: player.master });
    }

    /// Writes the tile in hand and the roles placed of the builder into `GameState`.
    fn set_builder(self: Store, builder: Builder) {
        let state = storage().game_states.entry(builder.game_id).read();
        let s: u256 = state.b.into();
        let kept: u128 = s.high & (TWO_POW_64 - 1);
        let high: u128 = kept
            + builder.tile_id.into() * TWO_POW_64
            + builder.characters.into() * TWO_POW_72;
        storage()
            .game_states
            .entry(builder.game_id)
            .write(Slots2 { a: state.a, b: s.low.into() + high.into() * TWO_POW_128 });
    }

    fn set_tile(self: Store, tile: Tile) {
        // [Info] Tile is created when draw then build later and cannot be removed.
        if tile.orientation != Orientation::None.into() {
            let position: TilePosition = tile.into();
            storage()
                .tile_positions
                .entry((position.game_id, position.x, position.y))
                .write(position.tile_id);
        }
        let word: u128 = tile.plan.into()
            + tile.orientation.into() * TWO_POW_8
            + tile.x.into() * TWO_POW_16
            + tile.y.into() * TWO_POW_48
            + tile.occupied_spot.into() * TWO_POW_80;
        storage().tiles.entry((tile.game_id, tile.id)).write(word.into());
    }

    fn set_character(self: Store, character: Char) {
        // [Info] Char are created when placed and can be removed.
        let position: CharPosition = character.into();
        storage()
            .character_positions
            .entry((position.game_id, position.tile_id, position.spot))
            .write(Slots2 { a: position.player_id, b: position.index.into() });
        let word: u128 = character.tile_id.into()
            + character.spot.into() * TWO_POW_32
            + character.weight.into() * TWO_POW_40
            + character.power.into() * TWO_POW_48;
        storage()
            .characters
            .entry((character.game_id, character.player_id, character.index))
            .write(word.into());
    }

    fn set_tournament(self: Store, tournament: Tournament) {
        let mut word: u128 = tournament.top1_score.into()
            + tournament.top2_score.into() * TWO_POW_32
            + tournament.top3_score.into() * TWO_POW_64;
        if tournament.top1_claimed {
            word += TWO_POW_96;
        }
        if tournament.top2_claimed {
            word += TWO_POW_97;
        }
        if tournament.top3_claimed {
            word += TWO_POW_98;
        }
        let slots = Slots5 {
            a: tournament.prize,
            b: tournament.top1_player_id,
            c: tournament.top2_player_id,
            d: tournament.top3_player_id,
            e: word.into(),
        };
        storage().tournaments.entry(tournament.id).write(slots);
    }
}
