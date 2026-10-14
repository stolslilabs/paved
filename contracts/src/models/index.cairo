//! Plain structs of the game state. Fields that used to be Dojo keys come first; `store.cairo`
//! keys its maps by them.

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Game {
    pub id: u32,
    /// The player of the game, from `GameConfig`; the builder of the game is this player's.
    pub player_id: felt252,
    /// The tile in hand, from `GameState`: the `tile_id` of the builder.
    pub held_tile: u32,
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
    pub day_id: u64,
    pub tile_limit: u16,
    /// The four scoring counters (structures, forests, wonders, big structures scored), packed in
    /// 23 bits as `GameState` holds them: see `GameImpl::counts_of` and
    /// `docs/architecture/quests.md`.
    pub counts: u32,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Builder {
    pub game_id: u32,
    pub player_id: felt252,
    pub tile_id: u32,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Tile {
    pub game_id: u32,
    pub id: u32,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
    /// The seat of the player who placed the tile (D-19): 0 is the game's player, the only seat
    /// until a multiplayer mode (the starter tile and the tiles written before D-19 read 0).
    pub owner: u8,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct TilePosition {
    pub game_id: u32,
    pub x: u32,
    pub y: u32,
    pub tile_id: u32,
}
