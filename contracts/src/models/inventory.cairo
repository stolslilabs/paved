// Internal imports

use stolsli::models::layout::{MAX_TILE_COUNT};

mod errors {
    const NO_TILES_LEFT: felt252 = 'Inventory: No tiles left';
    const NO_CHARACTERS_LEFT: felt252 = 'Inventory: No characters left';
    const NO_TILE_TO_PLACE: felt252 = 'Inventory: No tile to place';
    const ALREADY_HAVE_TILE: felt252 = 'Inventory: Already have a tile';
}

#[derive(Clone, Copy, Drop)]
struct Inventory {
    #[key]
    game_id: u64,
    #[key]
    builder_id: felt252,
    tile_type: u8,
    tile_count: u8,
    character_count: u8,
}

#[generate_trait]
impl InventoryImpl of InventoryTrait {
    fn new(game_id: u64, builder_id: felt252) -> Inventory {
        Inventory {
            game_id: game_id,
            builder_id: builder_id,
            tile_type: 0,
            tile_count: 0,
            character_count: 0,
        }
    }

    fn draw_tile(ref self: Inventory, seed: u256) {
        // [Check] Last one has been placed
        assert(0 == self.tile_type, errors::ALREADY_HAVE_TILE);
        // [Check] Enough tile left
        assert(0 < self.tile_count, errors::NO_TILES_LEFT);
        // [Effect] Remove tile from tile count
        self.tile_count -= 1;
        // [Effect] Set tile type
        let tile_type: u256 = seed % MAX_TILE_COUNT.into();
        self.tile_type = tile_type.try_into().unwrap();
    }
}

