//! Store struct and model access over native Starknet storage.
//!
//! The game state lives in `PavedStorage`, a storage node rooted at `selector!("paved")` in the
//! contract that runs the code. `Store` holds no state: every read and write goes to the storage of
//! the calling contract. Maps are keyed by the fields that were the Dojo model keys, keys are not
//! stored, and values are packed into whole felts (see `docs/architecture/native-storage.md`).

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
use core::num::traits::Zero;
use starknet::{ContractAddress, SyscallResultTrait};

// Constants

const TWO_POW_8: u128 = 0x100;
const TWO_POW_16: u128 = 0x10000;
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_40: u128 = 0x10000000000;
const TWO_POW_48: u128 = 0x1000000000000;
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
    pub games: Map<u32, Slots3>,
    pub players: Map<felt252, Slots2>,
    pub builders: Map<(u32, felt252), felt252>,
    pub tiles: Map<(u32, u32), Slots2>,
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

    fn game(self: Store, game_id: u32) -> Game {
        let slots = storage().games.entry(game_id).read();
        let b: u256 = slots.b.into();
        let c: u256 = slots.c.into();
        let tile_count = b.high & MASK_32;
        let score = (b.high / TWO_POW_32) & MASK_32;
        let discarded = (b.high / TWO_POW_64) & MASK_8;
        let built = (b.high / TWO_POW_72) & MASK_8;
        let mode = (b.high / TWO_POW_80) & MASK_8;
        let over = (b.high / TWO_POW_88) & MASK_1;
        Game {
            id: game_id,
            over: over == 1,
            discarded: discarded.try_into().unwrap(),
            built: built.try_into().unwrap(),
            tiles: b.low,
            tile_count: tile_count.try_into().unwrap(),
            start_time: (c.low & MASK_64).try_into().unwrap(),
            end_time: (c.low / TWO_POW_64).try_into().unwrap(),
            score: score.try_into().unwrap(),
            seed: slots.a,
            mode: mode.try_into().unwrap(),
            tournament_id: (c.high & MASK_64).try_into().unwrap(),
            tile_limit: ((c.high / TWO_POW_64) & MASK_16).try_into().unwrap(),
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

    fn builder(self: Store, game: Game, player_id: felt252) -> Builder {
        let word: u256 = storage().builders.entry((game.id, player_id)).read().into();
        Builder {
            game_id: game.id,
            player_id,
            tile_id: (word.low & MASK_32).try_into().unwrap(),
            characters: ((word.low / TWO_POW_32) & MASK_8).try_into().unwrap(),
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
        let slots = storage().tiles.entry((game.id, tile_id)).read();
        let word: u256 = slots.b.into();
        Tile {
            game_id: game.id,
            id: tile_id,
            player_id: slots.a,
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

    fn set_game(self: Store, game: Game) {
        let over: u128 = if game.over {
            1
        } else {
            0
        };
        let high: u128 = game.tile_count.into()
            + game.score.into() * TWO_POW_32
            + game.discarded.into() * TWO_POW_64
            + game.built.into() * TWO_POW_72
            + game.mode.into() * TWO_POW_80
            + over * TWO_POW_88;
        let c_low: u128 = game.start_time.into() + game.end_time.into() * TWO_POW_64;
        let c_high: u128 = game.tournament_id.into() + game.tile_limit.into() * TWO_POW_64;
        let slots = Slots3 {
            a: game.seed,
            b: game.tiles.into() + high.into() * TWO_POW_128,
            c: c_low.into() + c_high.into() * TWO_POW_128,
        };
        storage().games.entry(game.id).write(slots);
    }

    fn set_player(self: Store, player: Player) {
        storage().players.entry(player.id).write(Slots2 { a: player.name, b: player.master });
    }

    fn set_builder(self: Store, builder: Builder) {
        let word: u128 = builder.tile_id.into() + builder.characters.into() * TWO_POW_32;
        storage().builders.entry((builder.game_id, builder.player_id)).write(word.into());
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
        storage()
            .tiles
            .entry((tile.game_id, tile.id))
            .write(Slots2 { a: tile.player_id, b: word.into() });
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
