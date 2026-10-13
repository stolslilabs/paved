//! Tile owners and majority scoring (D-19, P-47; D-19b): the winner of a closed structure.
//!
//! A tile's owner is the player who placed it (`Store::tile_owner`; 0, the game's player, for a
//! tile no build of another player placed). A closed structure's points go to the owner with the
//! most distinct tiles in it, and to nobody on a tie (`Tally::winner` is then 0):
//! - a road or a city: the tiles of its nodes, each tile once even when two of its areas are nodes
//!   of the structure (ruling 1), counted by a walk of the nodes (`structure_tally`);
//! - a forest: the tiles of its own nodes only (ruling 2), counted by the forest scan as it walks
//!   them (`forest::scan`);
//! - a wonder: the wonder tile and the 8 tiles around it (ruling 3), which are not nodes of its
//!   structure but are all placed when it closes (`wonder_tally`).
//!
//! The count runs only on the move that closes the structure, in memory: it writes nothing. In a
//! game with one player every tile is that player's, so the winner is the player and the count is
//! skipped (`Game::assess`, on `Mode::solo`): Daily and Tutorial score as they did before D-19.

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::tile::Tile;
use paved::store::StoreImpl;
use paved::structure::state::Structures;
use paved::structure::walk::{WalkerTrait, toward};

pub mod errors {
    pub const WONDER_OPEN: felt252 = 'Owners: wonder not closed';
}

/// The distinct tiles of a structure per owner.
#[derive(Destruct)]
pub struct Tally {
    game_id: u32,
    /// The game's player: the owner of a tile whose stored owner is 0.
    player_id: felt252,
    /// Whether the tiles are counted: a tally that is off counts nothing and its winner is the
    /// game's player (the single-player skip).
    on: bool,
    /// The tiles counted, by id.
    tiles: Felt252Dict<bool>,
    /// The tiles of each owner.
    counts: Felt252Dict<u32>,
    /// The owners met, in the order they were met.
    owners: Array<felt252>,
    /// The distinct tiles counted.
    pub total: u32,
}

#[generate_trait]
pub impl TallyImpl of TallyTrait {
    /// A tally of the tiles of a structure of game `game_id`, whose player is `player_id`.
    fn new(game_id: u32, player_id: felt252) -> Tally {
        Tally {
            game_id,
            player_id,
            on: true,
            tiles: Default::default(),
            counts: Default::default(),
            owners: array![],
            total: 0,
        }
    }

    /// A tally that counts nothing: its winner is `player_id`.
    fn off(game_id: u32, player_id: felt252) -> Tally {
        Tally {
            game_id,
            player_id,
            on: false,
            tiles: Default::default(),
            counts: Default::default(),
            owners: array![],
            total: 0,
        }
    }

    /// Counts the tile `tile_id` for its owner, once.
    fn add(ref self: Tally, tile_id: u32) {
        if !self.on {
            return;
        }
        let key: felt252 = tile_id.into();
        if self.tiles.get(key) {
            return;
        }
        self.tiles.insert(key, true);
        self.total += 1;
        let mut owner = StoreImpl::tile_owner(self.game_id, tile_id);
        if owner == 0 {
            owner = self.player_id;
        }
        let count = self.counts.get(owner);
        if count == 0 {
            self.owners.append(owner);
        }
        self.counts.insert(owner, count + 1);
    }

    /// The tiles counted for `owner` (the game's player for 0).
    fn count(ref self: Tally, owner: felt252) -> u32 {
        let owner = if owner == 0 {
            self.player_id
        } else {
            owner
        };
        self.counts.get(owner)
    }

    /// The owner with the most tiles, 0 when two or more share the most (nobody scores). The game's
    /// player when the tally is off.
    fn winner(ref self: Tally) -> felt252 {
        if !self.on {
            return self.player_id;
        }
        let mut best: felt252 = 0;
        let mut most: u32 = 0;
        let mut tie = false;
        let mut owners = self.owners.span();
        while let Option::Some(owner) = owners.pop_front() {
            let count = self.counts.get(*owner);
            if count > most {
                best = *owner;
                most = count;
                tie = false;
            } else if count == most {
                tie = true;
            }
        }
        if tie {
            0
        } else {
            best
        }
    }
}

/// The tiles of the closed road or city of `area` of `tile` (of refs `refs`), per owner: a walk of
/// its nodes, one tile counted once.
pub fn structure_tally(
    player_id: felt252, tile: Tile, refs: u128, area: u8, ref structures: Structures,
) -> Tally {
    let mut tally = TallyTrait::new(structures.game_id, player_id);
    let mut walker = WalkerTrait::new(tile, refs, area, ref structures);
    while let Option::Some((node, _, node_area)) = walker.pop() {
        tally.add(node.id);
        walker.expand(node, node_area);
    }
    tally
}

/// The tiles of the closed wonder of `wonder` per owner: the wonder tile and the 8 tiles around
/// it. The tile the move builds is not in storage yet: it is taken from `structures`.
pub fn wonder_tally(player_id: felt252, wonder: Tile, ref structures: Structures) -> Tally {
    let game_id = structures.game_id;
    let built = structures.built;
    let mut tally = TallyTrait::new(game_id, player_id);
    tally.add(wonder.id);
    let mut direction: u8 = 1;
    while direction <= 8 {
        let (x, y) = toward(wonder.x, wonder.y, direction);
        let tile_id = if built.id != 0 && built.x == x && built.y == y {
            built.id
        } else {
            StoreImpl::tile_id_at(game_id, x, y)
        };
        // [Check] A closed wonder has its 8 positions taken
        assert(tile_id != 0, errors::WONDER_OPEN);
        tally.add(tile_id);
        direction += 1;
    }
    tally
}
