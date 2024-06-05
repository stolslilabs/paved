#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct Game {
    #[key]
    id: u32,
    over: bool,
    tiles: u128,
    tile_count: u32,
    start_time: u64,
    score: u32,
    seed: felt252,
    mode: u8,
}

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct Player {
    #[key]
    id: felt252,
    name: felt252,
    score: u32,
    paved: u32,
    master: felt252,
}

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct Builder {
    #[key]
    game_id: u32,
    #[key]
    player_id: felt252,
    tile_id: u32,
    characters: u8,
}

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct Character {
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

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct CharacterPosition {
    #[key]
    game_id: u32,
    #[key]
    tile_id: u32,
    #[key]
    spot: u8,
    player_id: felt252,
    index: u8,
}

#[dojo::model]
#[derive(Model, Copy, Drop, Serde, IntrospectPacked)]
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

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
struct TilePosition {
    #[key]
    game_id: u32,
    #[key]
    x: u32,
    #[key]
    y: u32,
    tile_id: u32,
}

#[dojo::model]
#[derive(Copy, Drop, Serde, IntrospectPacked)]
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
