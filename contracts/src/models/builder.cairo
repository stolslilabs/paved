// Internal imports

use stolsli::constants;
use stolsli::helpers::bitmap::Bitmap;
use stolsli::types::plan::Plan;
use stolsli::types::order::Order;
use stolsli::types::orientation::Orientation;
use stolsli::types::role::{Role, RoleImpl};
use stolsli::types::spot::Spot;
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::category::Category;
use stolsli::models::tile::{Tile, TileImpl};
use stolsli::models::character::{Character, CharacterImpl};

mod errors {
    const INVALID_NAME: felt252 = 'Builder: Invalid name';
    const INVALID_ORDER: felt252 = 'Builder: Invalid order';
    const NO_TILES_LEFT: felt252 = 'Builder: No tiles left';
    const NO_CHARACTERS_LEFT: felt252 = 'Builder: No characters left';
    const ALREADY_PLACED: felt252 = 'Builder: Already placed';
    const CHARACTER_NOT_PLACED: felt252 = 'Builder: Character not placed';
    const ALREADY_HAS_TILE: felt252 = 'Builder: Already has a tile';
    const CANNOT_BUY: felt252 = 'Builder: Cannot buy';
    const CANNOT_DISCARD: felt252 = 'Builder: Cannot discard';
    const CANNOT_BUILD: felt252 = 'Builder: Cannot build';
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
    characters: u8,
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
            characters: 0,
        }
    }

    #[inline(always)]
    fn buy(ref self: Builder) {
        // [Check] Have a tile to place
        self.assert_buyable();
        // [Effect] Add one to the tile count
        self.tile_remaining += 1;
    }

    #[inline(always)]
    fn draw(ref self: Builder, tile_id: u32, plan: Plan) -> Tile {
        // [Check] Can draw
        self.assert_drawable();
        // [Effect] Remove tile from the tile count
        self.tile_remaining -= 1;
        // [Effect] Update tile_id
        self.tile_id = tile_id;
        // [Return] New tile
        TileImpl::new(self.game_id, self.tile_id, self.id, plan.into())
    }

    #[inline(always)]
    fn discard(ref self: Builder) {
        // [Check] Have a tile to place
        self.assert_discardable();
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
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
        self.assert_buildable();
        // [Effect] Place tile
        tile.place(orientation, x, y, ref neighbors);
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
    }

    #[inline(always)]
    fn place(ref self: Builder, role: Role, ref tile: Tile, spot: Spot) -> Character {
        // [Check] Available character
        let index: u8 = role.into();
        self.assert_available(index);
        // [Effect] Set character as placed
        let characters = Bitmap::set_bit_at(self.characters.into(), index.into(), true);
        self.characters = characters.try_into().unwrap();
        // [Effect] Update tile status
        tile.occupe(spot);
        // [Return] New character
        let layout: Layout = tile.into();
        let category: Category = layout.get_category(spot);
        let weight: u8 = role.weight(category);
        CharacterImpl::new(self.game_id, self.id, index.into(), tile.id, spot, weight)
    }

    #[inline(always)]
    fn recover(ref self: Builder, ref character: Character, ref tile: Tile) {
        // [Check] Recoverable
        let index: u8 = character.index;
        self.assert_recoverable(index);
        // [Effect] Collect character
        let characters = Bitmap::set_bit_at(self.characters.into(), index.into(), false);
        self.characters = characters.try_into().unwrap();
        // [Effect] Update character
        character.remove();
        // [Effect] Update tile status
        tile.leave();
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_buyable(self: Builder) {
        assert(constants::MAX_TILE_COUNT > self.tile_remaining.into(), errors::CANNOT_BUY);
    }

    #[inline(always)]
    fn assert_drawable(self: Builder) {
        assert(0 == self.tile_id.into(), errors::ALREADY_HAS_TILE);
        assert(0 != self.tile_remaining.into(), errors::NO_TILES_LEFT);
    }

    #[inline(always)]
    fn assert_discardable(self: Builder) {
        assert(0 != self.tile_id.into(), errors::CANNOT_DISCARD);
    }

    #[inline(always)]
    fn assert_buildable(self: Builder) {
        assert(0 != self.tile_id.into(), errors::CANNOT_BUILD);
    }

    #[inline(always)]
    fn assert_available(self: Builder, index: u8) {
        let placed = Bitmap::get_bit_at(self.characters.into(), index.into());
        assert(!placed, errors::ALREADY_PLACED);
    }

    #[inline(always)]
    fn assert_recoverable(self: Builder, index: u8) {
        let placed = Bitmap::get_bit_at(self.characters.into(), index.into());
        assert(placed, errors::CHARACTER_NOT_PLACED);
    }
}

impl ZeroableBuilderImpl of Zeroable<Builder> {
    #[inline(always)]
    fn zero() -> Builder {
        Builder {
            game_id: 0,
            id: 0,
            name: 0,
            order: 0,
            score: 0,
            tile_remaining: 0,
            tile_id: 0,
            characters: 0,
        }
    }

    #[inline(always)]
    fn is_zero(self: Builder) -> bool {
        0 == self.name
    }

    #[inline(always)]
    fn is_non_zero(self: Builder) -> bool {
        0 != self.name
    }
}
