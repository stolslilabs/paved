//! Events definition.

#[derive(Drop, Serde, starknet::Event)]
pub struct Built {
    #[key]
    pub game_id: u32,
    pub tile_id: u32,
    pub x: u32,
    pub y: u32,
    pub player_id: felt252,
    pub player_name: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct Discarded {
    #[key]
    pub game_id: u32,
    pub tile_id: u32,
    pub player_id: felt252,
    pub player_name: felt252,
    pub points: u32,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct GameOver {
    #[key]
    pub game_id: u32,
    #[key]
    pub tournament_id: u64,
    pub game_mode: u8,
    pub game_score: u32,
    pub game_start_time: u64,
    pub game_end_time: u64,
    pub player_id: felt252,
    pub player_name: felt252,
    pub player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct ScoredForest {
    #[key]
    pub game_id: u32,
    pub points: u32,
    pub size: u32,
    pub cities: u32,
    pub roads: u32,
    pub player_id: felt252,
    pub player_name: felt252,
    pub player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct ScoredCity {
    #[key]
    pub game_id: u32,
    pub points: u32,
    pub size: u32,
    pub player_id: felt252,
    pub player_name: felt252,
    pub player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct ScoredRoad {
    #[key]
    pub game_id: u32,
    pub points: u32,
    pub size: u32,
    pub player_id: felt252,
    pub player_name: felt252,
    pub player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
pub struct ScoredWonder {
    #[key]
    pub game_id: u32,
    pub points: u32,
    pub player_id: felt252,
    pub player_name: felt252,
    pub player_master: felt252,
}
