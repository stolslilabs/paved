// Internal imports

use stolsli::constants;
use stolsli::models::layout::{MAX_LAYOUT_COUNT};
use stolsli::models::tile::{Tile, TileImpl};
use stolsli::models::order::Order;
use stolsli::models::orientation::Orientation;

mod errors {
    const INVALID_NAME: felt252 = 'Builder: Invalid name';
    const INVALID_ORDER: felt252 = 'Builder: Invalid order';
    const NO_TILES_LEFT: felt252 = 'Builder: No tiles left';
    const NO_CHARACTERS_LEFT: felt252 = 'Builder: No characters left';
    const NO_TILE_TO_PLACE: felt252 = 'Builder: No tile to place';
    const ALREADY_HAVE_TILE: felt252 = 'Builder: Already have a tile';
    const CANNOT_BUILD: felt252 = 'Builder: Cannot build';
    const CANNOT_DRAW: felt252 = 'Builder: Cannot draw';
}

#[derive(Model, Copy, Drop, Serde)]
struct Builder {
    #[key]
    game_id: u32,
    #[key]
    id: felt252,
    name: felt252,
    order: u8,
    score: u32,
    // Inventory
    tile_remaining: u8,
    tile_id: u32,
    character_remaining: u8,
}

#[generate_trait]
impl BuilderImpl of BuilderTrait {
    #[inline(always)]
    fn new(game_id: u32, id: felt252, name: felt252, order: u8,) -> Builder {
        // [Check] Name is valid
        assert(name != 0, errors::INVALID_NAME);

        // [Check] Order is valid
        assert(Order::None != order.into(), errors::INVALID_ORDER);

        // [Return] Builder
        Builder {
            game_id,
            id,
            name,
            order,
            score: 0,
            tile_remaining: constants::DEFAULT_TILES_COUNT,
            tile_id: 0,
            character_remaining: constants::DEFAULT_CHARACTERS_COUNT,
        }
    }

    #[inline(always)]
    fn draw(ref self: Builder, seed: u256, tile_id: u32) -> Tile {
        // [Check] Can draw
        self.assert_can_draw();
        // [Effect] Remove tile from tile count
        self.tile_remaining -= 1;
        // [Effect] Update tile_id
        self.tile_id = tile_id;
        // [Return] New tile
        let random: u256 = seed % MAX_LAYOUT_COUNT.into();
        let layout_type: u8 = random.try_into().unwrap() + 1;
        TileImpl::new(self.game_id, self.tile_id, self.id, layout_type.into())
    }

    #[inline(always)]
    fn build(
        ref self: Builder,
        ref tile: Tile,
        orientation: Orientation,
        x: u32,
        y: u32,
        ref neighbors: Array<Tile>
    ) {
        // [Check] Have a tile to place
        self.assert_can_build();
        // [Effect] Place tile
        tile.place(orientation, x, y, ref neighbors);
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_can_build(self: Builder) {
        assert(0 != self.tile_id.into(), errors::CANNOT_BUILD);
    }

    #[inline(always)]
    fn assert_can_draw(self: Builder) {
        assert(0 == self.tile_id.into(), errors::CANNOT_DRAW);
        assert(0 != self.tile_remaining.into(), errors::NO_TILES_LEFT);
    }
}
