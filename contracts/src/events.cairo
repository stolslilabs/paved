//! Events definition.
//!
//! Every contract declares `#[flat] PavedEvent: paved::events::Event` in its own event enum, so
//! these events are in its ABI; `Store::emit` writes them with the same keys and data.
//! Reference: `docs/architecture/native-storage.md`.

use paved::models::game::Game;
use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub enum Event {
    PlayerCreated: PlayerCreated,
    GameSpawned: GameSpawned,
    Built: Built,
    Discarded: Discarded,
    Scored: Scored,
    GameOver: GameOver,
    Sponsored: Sponsored,
    Claimed: Claimed,
}

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
    pub player_id: felt252,
    pub mode: u8,
    pub tournament_id: u64,
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
    pub role: u8,
    pub spot: u8,
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
    pub tournament_id: u64,
    pub player_id: felt252,
    pub mode: u8,
    pub score: u32,
    pub start_time: u64,
    pub end_time: u64,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Sponsored {
    #[key]
    pub tournament_id: u64,
    pub sponsor: ContractAddress,
    pub amount: felt252,
}

#[derive(Copy, Drop, Debug, PartialEq, Serde, starknet::Event)]
pub struct Claimed {
    #[key]
    pub tournament_id: u64,
    pub player_id: felt252,
    pub rank: u8,
    pub reward: u256,
}

/// The `GameOver` event of a game that is over.
pub fn game_over(game: Game, player_id: felt252) -> Event {
    Event::GameOver(
        GameOver {
            game_id: game.id,
            tournament_id: game.tournament_id,
            player_id,
            mode: game.mode,
            score: game.score,
            start_time: game.start_time,
            end_time: game.end_time,
        },
    )
}
