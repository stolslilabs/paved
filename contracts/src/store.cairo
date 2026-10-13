//! Store struct and model access over native Starknet storage.
//!
//! The game state lives in `PavedStorage`, a storage node rooted at `selector!("paved")` in the
//! contract that runs the code. `Store` holds no state: every read and write goes to the storage of
//! the calling contract. Maps are keyed by the fields that were the Dojo model keys, keys are not
//! stored, and values are packed into whole felts (see `docs/architecture/native-storage.md`).

use paved::events::Event;
use paved::models::builder::Builder;
use paved::models::game::Game;
use paved::models::tile::{Tile, TileIntoPosition, TilePosition, ZeroableTile};
use paved::structure::placement;
use paved::types::orientation::Orientation;
use starknet::storage::{
    Map, Mutable, StorageAsPath, StorageBase, StoragePath, StoragePathEntry,
    StoragePointerReadAccess, StoragePointerWriteAccess,
};
use starknet::{ContractAddress, SyscallResultTrait};

// Constants

const TWO_POW_8: u128 = 0x100;
const TWO_POW_16: u128 = 0x10000;
const TWO_POW_40: u128 = 0x10000000000;
const TWO_POW_48: u128 = 0x1000000000000;
const TWO_POW_56: u128 = 0x100000000000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_72: u128 = 0x1000000000000000000;
const TWO_POW_88: u128 = 0x10000000000000000000000;
const TWO_POW_96: u128 = 0x1000000000000000000000000;
const TWO_POW_108: u128 = 0x1000000000000000000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const TWO_POW_88_FELT: felt252 = 0x10000000000000000000000;
const MASK_1: u128 = 0x1;
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

/// Four consecutive storage slots.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Slots4 {
    pub a: felt252,
    pub b: felt252,
    pub c: felt252,
    pub d: felt252,
}

/// Game state of a contract.
#[starknet::storage_node]
pub struct PavedStorage {
    /// Last game id given (Dojo: `world.uuid()`).
    pub game_count: u32,
    /// Dead since D-25 E (P-42): the `Account` contract that kept the players. Kept declared so
    /// that its address is never given to another field; never written or read again.
    pub account: ContractAddress,
    /// `GameConfig`: written once, at spawn.
    pub game_configs: Map<u32, Slots2>,
    /// `GameState`: written by every action.
    pub game_states: Map<u32, Slots2>,
    /// `GameEnd`: written once, when the game ends in time.
    pub game_ends: Map<u32, felt252>,
    /// Dead since D-25 E (P-42): a player's name and master, never written in a game contract
    /// (`Account` kept them). Kept declared, never read or written: a player is an address.
    pub players: Map<felt252, Slots2>,
    /// `Tile`: plan (bits 0..8), orientation (8..16), x (16..48), y (48..80), the dead occupied
    /// spot (80..88), the owner's seat (96..104, D-19), the refs (128..236); see `tile_with_refs`.
    pub tiles: Map<(u32, u32), felt252>,
    /// The tile at a position: its id (8 bits) and `POSITION_WONDER` when it holds a wonder, so
    /// that a move reads the tile of a diagonal neighbour only if it can score a wonder.
    pub tile_positions: Map<(u32, u32, u32), u32>,
    /// `Characters`: dead since D-18 (one slot per game, 16 bits per role, before D-18). Kept
    /// declared so that the layout stays as D-17 requires; never read or written.
    pub characters: Map<u32, felt252>,
    /// Dead since D-20 (P-42): `Tournament`, the prize and the claimed flags (bits 0 to 2), two
    /// slots per day. Kept declared so that its address is never given to another field; never
    /// read or written. The name keeps "tournament": storage names do not change.
    pub tournaments: Map<u64, Slots2>,
    /// Dead since D-20 (P-42): the ranking of a day, as the native leaderboard kept it (one word
    /// packing the three scores, then the players of ranks 1, 2 and 3). Kept declared, never read
    /// or written.
    pub rankings: Map<u64, Slots4>,
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
        game.day_id = (end.low / TWO_POW_64).try_into().unwrap();
        game
    }

    /// The game without its end (`end_time` and `day_id` are 0): `GameConfig` and
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
            day_id: 0,
            tile_limit: ((c.low / TWO_POW_72) & MASK_16).try_into().unwrap(),
            // [Info] Nothing is above the counters: the quotient is the 23 bits
            counts: (s.high / TWO_POW_88).try_into().unwrap(),
        }
    }

    /// The builder of `player_id`, read from `GameState` as it is now (a move that changes the
    /// builder through `set_builder` is seen by the next read). A facade: the builder of the game
    /// is its player's, anyone else gets the zero builder.
    fn builder(self: Store, game: Game, player_id: felt252) -> Builder {
        let config = storage().game_configs.entry(game.id).read();
        if player_id == 0 || player_id != config.a {
            return Builder { game_id: game.id, player_id, tile_id: 0 };
        }
        let state = storage().game_states.entry(game.id).read();
        let s: u256 = state.b.into();
        Builder {
            game_id: game.id,
            player_id,
            tile_id: ((s.high / TWO_POW_64) & MASK_8).try_into().unwrap(),
        }
    }

    fn tile(self: Store, game: Game, tile_id: u32) -> Tile {
        let (tile, _) = Self::tile_with_refs(game.id, tile_id);
        tile
    }

    /// The tile and its refs: the tile's fields are the low 128 bits of its slot, the refs of its
    /// nodes on the structure state (108 bits, see `structure/record.cairo`) the high bits. Bits 80
    /// to 88 held the occupied spot before D-18: dead, never read, written 0 with a new tile. Bits
    /// 88 to 96 are never stored (the tile id that `tile_slot_at` adds in memory). Bits 96 to 104
    /// hold the owner's seat (D-19), 0 for the game's player: a slot written before D-19 reads 0
    /// there, and a seat-0 tile packs bit for bit as before D-19.
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
            owner: ((word.low / TWO_POW_96) & MASK_8).try_into().unwrap(),
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
    /// (bits 88 to 96, unused in a slot), so that a caller that reads the same positions again
    /// keeps the word and decodes it with `tile_of_slot`. 0 when the position is empty.
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

    /// Writes the three records of a game: the facade for the tests. A move writes `GameState`
    /// through `set_game_state`.
    fn set_game(self: Store, game: Game) {
        self.set_game_config(game);
        self.set_game_state(game);
        if game.end_time != 0 || game.day_id != 0 {
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

    /// `GameState`: the seed and the hot fields, rewritten by every action. Bits 72 to 88 of the
    /// high half held the roles placed before D-18: dead, written 0.
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
            + game.counts.into() * TWO_POW_88;
        let slots = Slots2 { a: game.seed, b: game.tiles.into() + high.into() * TWO_POW_128 };
        storage().game_states.entry(game.id).write(slots);
    }

    /// `GameEnd`: the end time and the day id of a game that ended in time.
    fn set_game_end(self: Store, game: Game) {
        let word: u128 = game.end_time.into() + game.day_id.into() * TWO_POW_64;
        storage().game_ends.entry(game.id).write(word.into());
    }

    /// Writes the tile in hand of the builder into `GameState` (the dead bits 72 to 88 as 0).
    fn set_builder(self: Store, builder: Builder) {
        let state = storage().game_states.entry(builder.game_id).read();
        let s: u256 = state.b.into();
        // [Info] The counters (bit 88 up) are kept
        let kept: u128 = (s.high & (TWO_POW_64 - 1)) + (s.high / TWO_POW_88) * TWO_POW_88;
        let high: u128 = kept + builder.tile_id.into() * TWO_POW_64;
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
        storage().tiles.entry((tile.game_id, tile.id)).write(Self::tile_word(tile, refs));
    }

    /// The slot of a tile with its refs.
    fn tile_word(tile: Tile, refs: u128) -> felt252 {
        let word: u128 = tile.plan.into()
            + tile.orientation.into() * TWO_POW_8
            + tile.x.into() * TWO_POW_16
            + tile.y.into() * TWO_POW_48
            + tile.owner.into() * TWO_POW_96;
        assert(refs < TWO_POW_108, 'Tile: refs out of range');
        word.into() + refs.into() * TWO_POW_128
    }

    /// The slot of a tile as `tile_slot_at` gives it (with the id above the fields), for a tile
    /// that the move holds and has not written yet.
    fn tile_slot(tile: Tile, refs: u128) -> felt252 {
        Self::tile_word(tile, refs) + tile.id.into() * TWO_POW_88_FELT
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
