//! Store struct and model access over native Starknet storage.
//!
//! The game state lives in `PavedStorage`, a storage node rooted at `selector!("paved")` in the
//! contract that runs the code. `Store` holds no state: every read and write goes to the storage of
//! the calling contract. Maps are keyed by the fields that were the Dojo model keys, keys are not
//! stored, and values are packed into whole felts (see `docs/architecture/native-storage.md`).

use core::num::traits::Zero;
use paved::events::Event;
use paved::models::builder::Builder;
use paved::models::character::Char;
use paved::models::game::Game;
use paved::models::player::Player;
use paved::models::tile::{Tile, TileIntoPosition, TilePosition, ZeroableTile};
use paved::models::tournament::Tournament;
use paved::structure::placement;
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
const TWO_POW_108: u128 = 0x1000000000000000000000000000;
const TWO_POW_112: u128 = 0x10000000000000000000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const TWO_POW_88_FELT: felt252 = 0x10000000000000000000000;
const MASK_1: u128 = 0x1;
const MASK_4: u128 = 0xf;
const MASK_8: u128 = 0xff;
const MASK_16: u128 = 0xffff;
const MASK_32: u128 = 0xffffffff;
const MASK_64: u128 = 0xffffffffffffffff;

/// Flag of a position that holds a wonder tile, above the 8 bits of the tile id.
const POSITION_WONDER: u32 = 0x100;
/// The wonder plans (`WFFFFFFFF`, `WFFFFFFFR`) are the last two plan codes
/// (`test_store_wonder_plans_are_the_last_codes`).
const FIRST_WONDER_PLAN: u8 = 18;

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
    /// The tile at a position: its id (8 bits) and `POSITION_WONDER` when it holds a wonder, so
    /// that a move reads the tile of a diagonal neighbour only if it can score a wonder.
    pub tile_positions: Map<(u32, u32, u32), u32>,
    /// `Characters`: one slot per game, 16 bits per role (role `r` at bits `16 r`).
    pub characters: Map<u32, felt252>,
    pub tournaments: Map<u64, Slots5>,
    /// `Structures`: the record pages, one or two slots per placed tile (`slot` 0 or 1), four
    /// records of 48 bits per slot (see `structure/record.cairo`).
    pub structures: Map<(u32, u32, u8), felt252>,
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
        let (tile, _) = Self::tile_with_refs(game.id, tile_id);
        tile
    }

    /// The tile and its refs: the tile's fields are the low 128 bits of its slot, the refs of its
    /// nodes on the structure state (108 bits, see `structure/record.cairo`) the high bits.
    fn tile_with_refs(game_id: u32, tile_id: u32) -> (Tile, u128) {
        let word = storage().tiles.entry((game_id, tile_id)).read();
        Self::decode_tile(game_id, tile_id, word.into())
    }

    #[inline(always)]
    fn decode_tile(game_id: u32, tile_id: u32, word: u256) -> (Tile, u128) {
        let tile = Tile {
            game_id,
            id: tile_id,
            plan: (word.low & MASK_8).try_into().unwrap(),
            orientation: ((word.low / TWO_POW_8) & MASK_8).try_into().unwrap(),
            x: ((word.low / TWO_POW_16) & MASK_32).try_into().unwrap(),
            y: ((word.low / TWO_POW_48) & MASK_32).try_into().unwrap(),
            occupied_spot: ((word.low / TWO_POW_80) & MASK_8).try_into().unwrap(),
        };
        (tile, word.high)
    }

    fn tile_position(self: Store, game: Game, x: u32, y: u32) -> TilePosition {
        let value = storage().tile_positions.entry((game.id, x, y)).read();
        TilePosition { game_id: game.id, x, y, tile_id: value % POSITION_WONDER }
    }

    /// The tile at a position and its refs, the zero tile (and no refs) when the position is
    /// empty.
    fn tile_at(game_id: u32, x: u32, y: u32) -> (Tile, u128) {
        let value = storage().tile_positions.entry((game_id, x, y)).read();
        if value == 0 {
            return (ZeroableTile::zero(), 0);
        }
        Self::tile_with_refs(game_id, value % POSITION_WONDER)
    }

    /// The slot of the tile at a position with the tile's id in the 8 bits above the tile's fields
    /// (bits 88 to 96, unused in a slot), so that a caller that reads the same positions again keeps
    /// the word and decodes it with `tile_of_slot`. 0 when the position is empty.
    fn tile_slot_at(game_id: u32, x: u32, y: u32) -> felt252 {
        let value = storage().tile_positions.entry((game_id, x, y)).read();
        if value == 0 {
            return 0;
        }
        let tile_id = value % POSITION_WONDER;
        let word = storage().tiles.entry((game_id, tile_id)).read();
        word + tile_id.into() * TWO_POW_88_FELT
    }

    /// The tile and its refs of a slot from `tile_slot_at`.
    fn tile_of_slot(game_id: u32, slot: felt252) -> (Tile, u128) {
        let word: u256 = slot.into();
        let tile_id: u32 = ((word.low / TWO_POW_88) & MASK_8).try_into().unwrap();
        Self::decode_tile(game_id, tile_id, word)
    }

    /// Whether a position is taken and, if its tile holds a wonder, the tile and its refs (the
    /// zero tile otherwise: nothing else of a diagonal neighbour matters to a move).
    fn wonder_at(game_id: u32, x: u32, y: u32) -> (bool, Tile, u128) {
        let value = storage().tile_positions.entry((game_id, x, y)).read();
        if value == 0 {
            return (false, ZeroableTile::zero(), 0);
        }
        if value < POSITION_WONDER {
            return (true, ZeroableTile::zero(), 0);
        }
        let (tile, refs) = Self::tile_with_refs(game_id, value - POSITION_WONDER);
        (true, tile, refs)
    }

    /// A slot of the record page of a tile (0 when nothing was written there).
    fn structure_slot(self: Store, game_id: u32, tile_id: u32, slot: u8) -> felt252 {
        storage().structures.entry((game_id, tile_id, slot)).read()
    }

    fn set_structure_slot(self: Store, game_id: u32, tile_id: u32, slot: u8, word: felt252) {
        storage().structures.entry((game_id, tile_id, slot)).write(word);
    }

    /// The character of `role`, read from the `Characters` slot of the game: zero (`tile_id` 0)
    /// when the role is not placed. `player_id` is the one asked for, as it was a key before.
    fn character(self: Store, game: Game, player_id: felt252, role: Role) -> Char {
        let word: u256 = storage().characters.entry(game.id).read().into();
        let index: u8 = role.into();
        Self::unpack_character(game.id, player_id, index, word.low)
    }

    /// The character that stands on `spot` of `tile`: the facade the walks use. One slot read,
    /// the roles are scanned in order. Zero when no character stands there.
    fn character_at(self: Store, game: Game, tile: Tile, spot: Spot) -> Char {
        let word: u256 = storage().characters.entry(game.id).read().into();
        let spot_u8: u8 = spot.into();
        let mut index: u8 = 1;
        let mut found: Char = Char {
            game_id: game.id,
            player_id: game.player_id,
            index: 0,
            tile_id: 0,
            spot: 0,
            weight: 0,
            power: 0,
        };
        while index <= 7 {
            let character = Self::unpack_character(game.id, game.player_id, index, word.low);
            if character.tile_id == tile.id && character.spot == spot_u8 {
                found = character;
                break;
            }
            index += 1;
        }
        found
    }

    /// A role entry of the `Characters` word: `tile_id u8, spot u4, weight u2, power u2`.
    fn unpack_character(game_id: u32, player_id: felt252, index: u8, low: u128) -> Char {
        let entry = (low / Self::role_shift(index)) & MASK_16;
        Char {
            game_id,
            player_id,
            index,
            tile_id: (entry & MASK_8).try_into().unwrap(),
            spot: ((entry / 0x100) & MASK_4).try_into().unwrap(),
            weight: ((entry / 0x1000) & 0x3).try_into().unwrap(),
            power: ((entry / 0x4000) & 0x3).try_into().unwrap(),
        }
    }

    /// `2^(16 r)`, the position of role `r` in the `Characters` word.
    fn role_shift(index: u8) -> u128 {
        if index == 0 {
            1
        } else if index == 1 {
            TWO_POW_16
        } else if index == 2 {
            TWO_POW_32
        } else if index == 3 {
            TWO_POW_48
        } else if index == 4 {
            TWO_POW_64
        } else if index == 5 {
            TWO_POW_80
        } else if index == 6 {
            TWO_POW_96
        } else {
            assert(index == 7, 'Char: Invalid role');
            TWO_POW_112
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

    /// Writes a tile and keeps its refs. A placed tile that has no refs yet (the starter tile at
    /// spawn, a board written by a test) is placed on the structure state here, as a build places
    /// it, so the records always cover every placed tile. A tile whose refs are stored is placed:
    /// its plan, orientation and position are the ones its records were built from, so they must
    /// not change.
    fn set_tile(self: Store, tile: Tile) {
        // [Info] Tile is created when draw then build later and cannot be removed.
        if tile.orientation == Orientation::None.into() {
            Self::write_tile(tile, 0);
            return;
        }
        let word: u256 = storage().tiles.entry((tile.game_id, tile.id)).read().into();
        let refs = if word.high == 0 {
            placement::place_alone(tile)
        } else {
            let unchanged = (word.low & MASK_8) == tile.plan.into()
                && ((word.low / TWO_POW_8) & MASK_8) == tile.orientation.into()
                && ((word.low / TWO_POW_16) & MASK_32) == tile.x.into()
                && ((word.low / TWO_POW_48) & MASK_32) == tile.y.into();
            assert(unchanged, 'Tile: placement is fixed');
            word.high
        };
        self.set_placed_tile(tile, refs);
    }

    /// Writes a placed tile with its refs, and its position.
    fn set_placed_tile(self: Store, tile: Tile, refs: u128) {
        let position: TilePosition = tile.into();
        let wonder = if tile.plan >= FIRST_WONDER_PLAN {
            POSITION_WONDER
        } else {
            0
        };
        storage()
            .tile_positions
            .entry((position.game_id, position.x, position.y))
            .write(position.tile_id + wonder);
        Self::write_tile(tile, refs);
    }

    /// Writes the slot of a tile with its refs (its position is not written).
    fn write_tile(tile: Tile, refs: u128) {
        let word: u128 = tile.plan.into()
            + tile.orientation.into() * TWO_POW_8
            + tile.x.into() * TWO_POW_16
            + tile.y.into() * TWO_POW_48
            + tile.occupied_spot.into() * TWO_POW_80;
        assert(refs < TWO_POW_108, 'Tile: refs out of range');
        let word: felt252 = word.into() + refs.into() * TWO_POW_128;
        storage().tiles.entry((tile.game_id, tile.id)).write(word);
    }

    /// The `Characters` word of a game (the 16 bits of each role).
    fn characters_word(game_id: u32) -> u128 {
        let word: u256 = storage().characters.entry(game_id).read().into();
        word.low
    }

    fn set_characters_word(game_id: u32, word: u128) {
        storage().characters.entry(game_id).write(word.into());
    }

    /// `word` with the entry of the role of `character` replaced by it.
    fn with_character(word: u128, character: Char) -> u128 {
        // [Info] Char are created when placed and can be removed (the entry is then zero).
        let entry: u128 = character.tile_id.into()
            + character.spot.into() * 0x100
            + character.weight.into() * 0x1000
            + character.power.into() * 0x4000;
        assert(character.tile_id < 0x100 && character.spot < 0x10, 'Char: Out of range');
        assert(character.weight < 4 && character.power < 4, 'Char: Out of range');
        let shift = Self::role_shift(character.index);
        let old = (word / shift) & MASK_16;
        word - old * shift + entry * shift
    }

    /// Writes one role of the `Characters` slot of the game (read, replace the 16 bits, write).
    fn set_character(self: Store, character: Char) {
        let word = Self::characters_word(character.game_id);
        Self::set_characters_word(character.game_id, Self::with_character(word, character));
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

#[cfg(test)]
mod tests {
    use paved::structure::{oriented, tables};
    use super::FIRST_WONDER_PLAN;

    /// The position flag reads the plan code: it holds a wonder exactly when the plan has a wonder
    /// area.
    #[test]
    fn test_store_wonder_plans_are_the_last_codes() {
        let mut plan: u8 = 1;
        while plan <= tables::PLAN_COUNT {
            assert_eq!(plan >= FIRST_WONDER_PLAN, oriented::wonder_area(plan) != 0);
            plan += 1;
        }
    }
}
