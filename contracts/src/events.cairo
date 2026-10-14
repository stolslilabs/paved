//! Events definition.
//!
//! Every contract declares `#[flat] PavedEvent: paved::events::Event` in its own event enum, so
//! these events are in its ABI; `Store::emit` writes them with the same keys and data.
//! Reference: `docs/architecture/native-storage.md`. D-20 removed `Sponsored` and `Claimed` (past
//! events, documented in `docs/architecture/public-interface.md`) and renamed the `tournament_id`
//! of `GameSpawned` and `GameOver` to `day_id`. Since D-25 E nothing deployed emits
//! `PlayerCreated`:
//! `Account` left the systems and a player is the caller's address, with no registration. The
//! variant stays declared (it never was emitted by a game contract) until the indexer, whose tests
//! read it from `Challenge`'s ABI, drops it (META); `public-interface.md` documents it as a past event.

use paved::models::game::Game;

#[derive(Drop, starknet::Event)]
pub enum Event {
    PlayerCreated: PlayerCreated,
    GameSpawned: GameSpawned,
    Built: Built,
    Discarded: Discarded,
    Scored: Scored,
    GameOver: GameOver,
}

/// Emitted by nothing deployed since D-25 E (`Account.create` was its only emitter).
#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct PlayerCreated {
    #[key]
    pub player_id: felt252,
    pub name: felt252,
    pub master: felt252,
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
