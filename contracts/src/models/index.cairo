#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Game {
    #[key]
    pub id: u32,
    pub over: bool,
    pub discarded: u8,
    pub built: u8,
    pub tiles: u128,
    pub tile_count: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub score: u32,
    pub seed: felt252,
    pub mode: u8,
    pub tournament_id: u64,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Player {
    #[key]
    pub id: felt252,
    pub name: felt252,
    pub master: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Builder {
    #[key]
    pub game_id: u32,
    #[key]
    pub player_id: felt252,
    pub tile_id: u32,
    pub characters: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Char {
    #[key]
    pub game_id: u32,
    #[key]
    pub player_id: felt252,
    #[key]
    pub index: u8,
    pub tile_id: u32,
    pub spot: u8,
    pub weight: u8,
    pub power: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct CharPosition {
    #[key]
    pub game_id: u32,
    #[key]
    pub tile_id: u32,
    #[key]
    pub spot: u8,
    pub player_id: felt252,
    pub index: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Tile {
    #[key]
    pub game_id: u32,
    #[key]
    pub id: u32,
    pub player_id: felt252,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
    pub occupied_spot: u8,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct TilePosition {
    #[key]
    pub game_id: u32,
    #[key]
    pub x: u32,
    #[key]
    pub y: u32,
    pub tile_id: u32,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct Tournament {
    #[key]
    pub id: u64,
    pub prize: felt252,
    pub top1_player_id: felt252,
    pub top2_player_id: felt252,
    pub top3_player_id: felt252,
    pub top1_score: u32,
    pub top2_score: u32,
    pub top3_score: u32,
    pub top1_claimed: bool,
    pub top2_claimed: bool,
    pub top3_claimed: bool,
}
