#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Game {
    #[key]
    id: u32,
    over: bool,
    claimed: bool,
    mode: u8,
    tile_count: u32,
    player_count: u8,
    tournament_id: u64,
    start_time: u64,
    end_time: u64,
    duration: u64,
    tiles: u128,
    players: u128,
    price: felt252,
    prize: felt252,
    name: felt252,
    seed: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Player {
    #[key]
    id: felt252,
    name: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Builder {
    #[key]
    game_id: u32,
    #[key]
    player_id: felt252,
    index: u8,
    characters: u8,
    discarded: u8,
    built: u8,
    score: u32,
    tile_id: u32,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Char {
    #[key]
    game_id: u32,
    #[key]
    player_id: felt252,
    #[key]
    index: u8,
    tile_id: u32,
    spot: u8,
    weight: u8,
    power: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct CharPosition {
    #[key]
    game_id: u32,
    #[key]
    tile_id: u32,
    #[key]
    spot: u8,
    player_id: felt252,
    index: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Tile {
    #[key]
    game_id: u32,
    #[key]
    id: u32,
    player_id: felt252,
    plan: u8,
    orientation: u8,
    x: u32,
    y: u32,
    occupied_spot: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct TilePosition {
    #[key]
    game_id: u32,
    #[key]
    x: u32,
    #[key]
    y: u32,
    tile_id: u32,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Tournament {
    #[key]
    id: u64,
    prize: felt252,
    top1_player_id: felt252,
    top2_player_id: felt252,
    top3_player_id: felt252,
    top1_score: u32,
    top2_score: u32,
    top3_score: u32,
    top1_claimed: bool,
    top2_claimed: bool,
    top3_claimed: bool,
}
