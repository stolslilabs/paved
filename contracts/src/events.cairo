//! Events definition.

#[derive(Drop, Serde, starknet::Event)]
struct Built {
    #[key]
    game_id: u32,
    tile_id: u32,
    x: u32,
    y: u32,
    player_id: felt252,
    player_name: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
struct Discarded {
    #[key]
    game_id: u32,
    tile_id: u32,
    player_id: felt252,
    player_name: felt252,
    points: u32,
}

#[derive(Drop, Serde, starknet::Event)]
struct GameOver {
    #[key]
    game_id: u32,
    #[key]
    tournament_id: u64,
    game_score: u32,
    game_start_time: u64,
    game_end_time: u64,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
struct ScoredForest {
    #[key]
    game_id: u32,
    points: u32,
    size: u32,
    cities: u32,
    roads: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
struct ScoredCity {
    #[key]
    game_id: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
struct ScoredRoad {
    #[key]
    game_id: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
}

#[derive(Drop, Serde, starknet::Event)]
struct ScoredWonder {
    #[key]
    game_id: u32,
    points: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
}
