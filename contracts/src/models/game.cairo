#[derive(Clone, Copy, Drop)]
struct Game {
    #[key]
    game_id: u64,
    tile_count: u64,
}

#[generate_trait]
impl GameImpl of GameTrait {
    fn new(game_id: u64) -> Game {
        Game { game_id, tile_count: 0, }
    }
}

