#[derive(Clone, Copy, Drop)]
struct Builder {
    #[key]
    game_id: u64,
    #[key]
    id: felt252,
    name: felt252,
    score: u32,
    order: u8,
    tile_layout: u8,
    tile_count: u32,
}

#[generate_trait]
impl BuilderImpl of BuilderTrait {
    fn new(
        game_id: u64,
        id: felt252,
        name: felt252,
        tile_count: u32,
        score: u32,
        order: u8,
        tile_layout: u8
    ) -> Builder {
        Builder { game_id, id, name, tile_count, score, order, tile_layout, }
    }
}

