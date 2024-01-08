#[derive(Clone, Copy, Drop)]
struct Builder {
    #[key]
    game_id: u64,
    #[key]
    id: felt252,
    name: felt252,
    order: u8,
    score: u32,
}

#[generate_trait]
impl BuilderImpl of BuilderTrait {
    fn new(game_id: u64, id: felt252, name: felt252, order: u8, score: u32,) -> Builder {
        Builder { game_id, id, name, order, score, }
    }
}

