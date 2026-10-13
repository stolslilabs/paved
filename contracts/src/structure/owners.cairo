//! Tile owners and majority scoring (D-19, P-47; D-19b): the winner of a closed structure.
//!
//! A tile's owner is the seat of the player who placed it, kept in the tile itself (`Tile.owner`,
//! bits 96 to 104 of its slot, `Store::tile_with_refs`). Seat 0 is the game's player: the only seat
//! until a multiplayer mode, and what the starter tile and every tile written before D-19 read. A
//! closed structure's points go to the seat with the most distinct tiles in it, and to nobody on a
//! tie (`Tally::winner` is then `None`):
//! - a road or a city: the tiles of its nodes, each tile once even when two of its areas are nodes
//!   of the structure (ruling 1), counted by a walk of the nodes (`structure_tally`);
//! - a forest: the tiles of its own nodes only (ruling 2), counted by the forest scan as it walks
//!   them (`forest::scan`);
//! - a wonder: the wonder tile and the 8 tiles around it (ruling 3), which are not nodes of its
//!   structure but are all placed when it closes (`wonder_tally`).
//!
//! The walks read the seat from the tile slots they read anyway, so the count adds no storage read
//! to a road, a city or a forest, and writes nothing. A winning seat becomes a player id in one
//! place, `player_of_seat`. In a game with one player every tile is seat 0, so the winner is the
//! player and the count is skipped (`Game::assess`, on `Mode::solo`): Daily scores as it did before
//! D-19.

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::tile::Tile;
use paved::store::StoreImpl;
use paved::structure::state::Structures;
use paved::structure::walk::{WalkerTrait, toward};

pub mod errors {
    pub const WONDER_OPEN: felt252 = 'Owners: wonder not closed';
    pub const SEAT_WITHOUT_PLAYER: felt252 = 'Owners: seat without player';
}

/// The player of `seat` in a game whose player is `player_id`: the one place where a seat becomes a
/// player id. Seat 0 is the game's player. No other seat has a player before a multiplayer mode,
/// which gives the seats of a game their players here; until then a build only ever places seat 0
/// (only the game's player builds, `Game::builder_of`), so no live path reaches another seat and
/// one reverts.
///
/// A game's `player_id` is never 0: it is the caller of `spawn`, and `builder_of` accepts no
/// player 0. So a winner is never confused with the 0 of a tie in `Scored`.
pub fn player_of_seat(player_id: felt252, seat: u8) -> felt252 {
    assert(seat == 0, errors::SEAT_WITHOUT_PLAYER);
    player_id
}

/// The player who wins with `winner` (a seat, or `None` on a tie, which gives 0: nobody).
pub fn player_of(player_id: felt252, winner: Option<u8>) -> felt252 {
    match winner {
        Option::Some(seat) => player_of_seat(player_id, seat),
        Option::None => 0,
    }
}

/// The distinct tiles of a structure per seat.
#[derive(Destruct)]
pub struct Tally {
    /// The tiles counted, by id.
    tiles: Felt252Dict<bool>,
    /// The tiles of each seat.
    counts: Felt252Dict<u32>,
    /// The seats met, in the order they were met.
    seats: Array<u8>,
    /// The distinct tiles counted.
    pub total: u32,
}

#[generate_trait]
pub impl TallyImpl of TallyTrait {
    fn new() -> Tally {
        Tally { tiles: Default::default(), counts: Default::default(), seats: array![], total: 0 }
    }

    /// Counts `tile` for its seat, once.
    fn add(ref self: Tally, tile: Tile) {
        let key: felt252 = tile.id.into();
        if self.tiles.get(key) {
            return;
        }
        self.tiles.insert(key, true);
        self.total += 1;
        let seat: felt252 = tile.owner.into();
        let count = self.counts.get(seat);
        if count == 0 {
            self.seats.append(tile.owner);
        }
        self.counts.insert(seat, count + 1);
    }

    /// The tiles counted for `seat`.
    fn count(ref self: Tally, seat: u8) -> u32 {
        self.counts.get(seat.into())
    }

    /// The seat with the most tiles, `None` when two or more share the most (nobody scores).
    fn winner(ref self: Tally) -> Option<u8> {
        let mut best: u8 = 0;
        let mut most: u32 = 0;
        let mut tie = false;
        let mut seats = self.seats.span();
        while let Option::Some(seat) = seats.pop_front() {
            let count = self.counts.get((*seat).into());
            if count > most {
                best = *seat;
                most = count;
                tie = false;
            } else if count == most {
                tie = true;
            }
        }
        if tie || most == 0 {
            Option::None
        } else {
            Option::Some(best)
        }
    }
}

/// The tiles of the closed road or city of `area` of `tile` (of refs `refs`), per seat: a walk of
/// its nodes, one tile counted once.
pub fn structure_tally(tile: Tile, refs: u128, area: u8, ref structures: Structures) -> Tally {
    let mut tally = TallyTrait::new();
    let mut walker = WalkerTrait::new(tile, refs, area, ref structures);
    while let Option::Some((node, _, node_area)) = walker.pop() {
        tally.add(node);
        walker.expand(node, node_area);
    }
    tally
}

/// The tiles of the closed wonder of `wonder` per seat: the wonder tile and the 8 tiles around it.
/// The tile the move builds is not in storage yet: it is taken from `structures`.
pub fn wonder_tally(wonder: Tile, ref structures: Structures) -> Tally {
    let game_id = structures.game_id;
    let built = structures.built;
    let mut tally = TallyTrait::new();
    tally.add(wonder);
    let mut direction: u8 = 1;
    while direction <= 8 {
        let (x, y) = toward(wonder.x, wonder.y, direction);
        let tile = if built.id != 0 && built.x == x && built.y == y {
            built
        } else {
            let (tile, _) = StoreImpl::tile_at(game_id, x, y);
            tile
        };
        // [Check] A closed wonder has its 8 positions taken
        assert(tile.id != 0, errors::WONDER_OPEN);
        tally.add(tile);
        direction += 1;
    }
    tally
}
