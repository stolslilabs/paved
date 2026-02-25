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
    pub config_id: u64,
    pub entry_price: felt252,
    pub duration_seconds: u64,
    pub deck_id: u8,
    pub tile_limit: u16,
    pub allow_discard: bool,
    pub allow_surrender: bool,
    pub entry_multiplier_fp: u32,
    pub entry_supply_snapshot: felt252,
    pub entry_target_snapshot: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct GameConfigTemplate {
    #[key]
    pub template_id: u32,
    pub config_id: u64,
    pub mode: u8,
    pub deck_id: u8,
    pub entry_price: felt252,
    pub duration_seconds: u64,
    pub tile_limit: u16,
    pub seed_policy: u8,
    pub scoring_profile_id: u16,
    pub character_profile_id: u16,
    pub allow_discard: bool,
    pub allow_surrender: bool,
    pub private_game: bool,
    pub access_root: felt252,
    pub metadata_uri_hash: felt252,
    pub enabled: bool,
    pub version: u16,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct GameConfigSnapshot {
    #[key]
    pub game_id: u32,
    pub template_id: u32,
    pub config_id: u64,
    pub mode: u8,
    pub deck_id: u8,
    pub entry_price: felt252,
    pub duration_seconds: u64,
    pub tile_limit: u16,
    pub seed_policy: u8,
    pub scoring_profile_id: u16,
    pub character_profile_id: u16,
    pub allow_discard: bool,
    pub allow_surrender: bool,
    pub private_game: bool,
    pub access_root: felt252,
    pub metadata_uri_hash: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct ConfigPolicy {
    #[key]
    pub id: u8,
    pub min_duration: u64,
    pub max_duration: u64,
    pub max_entry_price: felt252,
    pub allow_custom_config: bool,
    pub allow_private_games: bool,
    pub admin: felt252,
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
    pub top1_game_id: u32,
    pub top1_multiplier_fp: u32,
    pub top2_player_id: felt252,
    pub top2_game_id: u32,
    pub top2_multiplier_fp: u32,
    pub top3_player_id: felt252,
    pub top3_game_id: u32,
    pub top3_multiplier_fp: u32,
    pub top1_score: u32,
    pub top2_score: u32,
    pub top3_score: u32,
    pub top1_claimed: bool,
    pub top2_claimed: bool,
    pub top3_claimed: bool,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct EconomyConfig {
    #[key]
    pub id: u8,
    pub target_mode: u8,
    pub target_fixed: felt252,
    pub target_a: felt252,
    pub target_b: felt252,
    pub target_t0: u64,
    pub team_bps: u16,
    pub burn_bps: u16,
    pub max_multiplier_fp: u32,
    pub fp_scale: u32,
    pub manual_target_override: bool,
    pub target_override: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct EconomyState {
    #[key]
    pub id: u8,
    pub last_snapshot_time: u64,
    pub last_supply: felt252,
    pub last_target: felt252,
    pub last_multiplier_fp: u32,
    pub total_minted: felt252,
    pub total_burned: felt252,
    pub total_team_alloc: felt252,
}

#[derive(Copy, Drop, Serde, IntrospectPacked)]
#[dojo::model]
pub struct EntrySettlement {
    #[key]
    pub game_id: u32,
    pub entry_amount: felt252,
    pub team_amount: felt252,
    pub burn_amount: felt252,
    pub settled: bool,
}
