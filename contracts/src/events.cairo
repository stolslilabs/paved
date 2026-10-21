//! Events definition.
//!
//! Every contract declares `#[flat] PavedEvent: paved::events::Event` in its own event enum, so
//! these events are in its ABI; `Store::emit` writes them with the same keys and data.
//! Reference: `docs/architecture/native-storage.md`. D-20 removed `Sponsored` and `Claimed` (past
//! events, documented in `docs/architecture/public-interface.md`) and renamed the `tournament_id`
//! of `GameSpawned` and `GameOver` to `day_id`. D-25 E took `Account` out of the systems (a player
//! is the caller's address, with no registration), and D-23 removed its `PlayerCreated`, which no
//! game contract ever emitted: a past event, documented in `public-interface.md`.

use paved::models::game::{Game, GameImpl};
use paved::store::{Store, StoreImpl};

#[derive(Drop, starknet::Event)]
pub enum Event {
    GameSpawned: GameSpawned,
    Built: Built,
    Discarded: Discarded,
    Scored: Scored,
    GameOver: GameOver,
    Queued: Queued,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct GameSpawned {
    #[key]
    pub game_id: u32,
    #[key]
    pub player_id: felt252,
    pub mode: u8,
    pub day_id: u64,
    pub start_time: u64,
    pub price: felt252,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Built {
    #[key]
    pub game_id: u32,
    pub player_id: felt252,
    pub tile_id: u32,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Discarded {
    #[key]
    pub game_id: u32,
    pub player_id: felt252,
    pub tile_id: u32,
    pub plan: u8,
    pub points: u32,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Scored {
    #[key]
    pub game_id: u32,
    pub player_id: felt252,
    pub category: u8,
    pub size: u32,
    pub points: u32,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct GameOver {
    #[key]
    pub game_id: u32,
    #[key]
    pub player_id: felt252,
    #[key]
    pub day_id: u64,
    pub mode: u8,
    pub score: u32,
    pub start_time: u64,
    pub end_time: u64,
}

/// A tile drawn into a game's queue (#645, D-30): `tile_id` is the id it takes when it comes into
/// the hand. A spawn emits three (the tile in hand and the next two), a move that draws one.
#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Queued {
    #[key]
    pub game_id: u32,
    pub tile_id: u32,
    pub plan: u8,
}

/// The `GameOver` event of a game that is over.
pub fn game_over(game: Game, player_id: felt252) -> Event {
    Event::GameOver(
        GameOver {
            game_id: game.id,
            player_id,
            day_id: game.day_id,
            mode: game.mode,
            score: game.score,
            start_time: game.start_time,
            end_time: game.end_time,
        },
    )
}

/// Emits a `Queued` for each tile `GameImpl::advance` drew: from `first` to the queue's last tile,
/// the tile in hand (`plan`) and the two next ones, skipping a slot left empty at the deck's end.
pub fn emit_queued(store: Store, game: Game, plan: u8, first: u32) {
    let hand = game.held_tile;
    let mut tile_id = first;
    while tile_id <= hand + 2 {
        let tile_plan = if tile_id == hand {
            plan
        } else if tile_id == hand + 1 {
            game.next_plan()
        } else {
            game.after_plan()
        };
        if tile_plan != 0 {
            store.emit(Event::Queued(Queued { game_id: game.id, tile_id, plan: tile_plan }));
        }
        tile_id += 1;
    };
}
