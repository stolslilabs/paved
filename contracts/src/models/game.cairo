#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    tile_count: u32,
}

#[generate_trait]
impl GameImpl of GameTrait {
    fn new(id: u32) -> Game {
        Game { id, tile_count: 0, }
    }

    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }
}

