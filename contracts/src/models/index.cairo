//! Plain structs of the game state. Fields that used to be Dojo keys come first; `store.cairo`
//! keys its maps by them.

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Game {
    pub id: u32,
    /// The player of the game, from `GameConfig`; the builder of the game is this player's.
    pub player_id: felt252,
    /// The tile in hand, from `GameState`: the `tile_id` of the builder.
    pub held_tile: u32,
    /// The roles placed, from `GameState`: the `characters` of the builder.
    pub characters: u16,
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
    pub tile_limit: u16,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Player {
    pub id: felt252,
    pub name: felt252,
    pub master: felt252,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Builder {
    pub game_id: u32,
    pub player_id: felt252,
    pub tile_id: u32,
    pub characters: u16,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Char {
    pub game_id: u32,
    pub player_id: felt252,
    pub index: u8,
    pub tile_id: u32,
    pub spot: u8,
    pub weight: u8,
    pub power: u8,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Tile {
    pub game_id: u32,
    pub id: u32,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
    pub occupied_spot: u8,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct TilePosition {
    pub game_id: u32,
    pub x: u32,
    pub y: u32,
    pub tile_id: u32,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Tournament {
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
