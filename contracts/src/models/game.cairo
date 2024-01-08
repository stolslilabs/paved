#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    piece_count: u32,
    tile_count: u32,
}

#[generate_trait]
impl GameImpl of GameTrait {
    fn new(id: u32) -> Game {
        Game { id, piece_count: 0, tile_count: 0, }
    }
}

