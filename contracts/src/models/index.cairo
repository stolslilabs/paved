#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Game {
    #[key]
    id: u32,
    over: bool,
    discarded: u8,
    built: u8,
    tiles: u128,
    tile_count: u32,
    start_time: u64,
    end_time: u64,
    score: u32,
    seed: felt252,
    mode: u8,
    tournament_id: u64,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Player {
    #[key]
    id: felt252,
    name: felt252,
    master: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
struct Builder {
    #[key]
    game_id: u32,
    #[key]
    player_id: felt252,
    tile_id: u32,
    characters: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
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

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
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

#[derive(Model, Copy, Drop, Serde, IntrospectPacked)]
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
