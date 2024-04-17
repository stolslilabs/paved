//! Events definition.

#[derive(Drop, starknet::Event)]
struct Built {
    #[key]
    game_id: u32,
    tile_id: u32,
    x: u32,
    y: u32,
    player_id: felt252,
    player_name: felt252,
}

#[derive(Drop, starknet::Event)]
struct Discarded {
    #[key]
    game_id: u32,
    tile_id: u32,
    player_id: felt252,
    player_name: felt252,
    order_id: u8,
    points: u32,
}

#[derive(Drop, starknet::Event)]
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

#[derive(Drop, starknet::Event)]
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
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ScoredCity {
    #[key]
    game_id: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ScoredRoad {
    #[key]
    game_id: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ScoredWonder {
    #[key]
    game_id: u32,
    points: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ClosedForest {
    #[key]
    game_id: u32,
    tile_id: u32,
    tile_x: u32,
    tile_y: u32,
    points: u32,
    size: u32,
    roads: u32,
    cities: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ClosedCity {
    #[key]
    game_id: u32,
    tile_id: u32,
    tile_x: u32,
    tile_y: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ClosedRoad {
    #[key]
    game_id: u32,
    tile_id: u32,
    tile_x: u32,
    tile_y: u32,
    points: u32,
    size: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}

#[derive(Drop, starknet::Event)]
struct ClosedWonder {
    #[key]
    game_id: u32,
    tile_id: u32,
    tile_x: u32,
    tile_y: u32,
    points: u32,
    player_id: felt252,
    player_name: felt252,
    player_master: felt252,
    player_order_id: u8,
}
