// Core imports

// Internal imports

use paved::constants;
use paved::helpers::bitmap::Bitmap;
use paved::models::game::{Game, GameImpl};
pub use paved::models::index::Builder;
use paved::models::tile::{Tile, TileImpl};
use paved::store::{Store, StoreImpl};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;

pub mod errors {
    pub const BUILDER_DOES_NOT_EXIST: felt252 = 'Builder: does not exist';
    pub const BUILDER_ALREADY_EXIST: felt252 = 'Builder: already exist';
    pub const BUILDER_NOT_HOST: felt252 = 'Builder: is not host';
    pub const BUILDER_IS_HOST: felt252 = 'Builder: is host';
    pub const INVALID_ORDER: felt252 = 'Builder: invalid order';
    pub const ALREADY_HAS_TILE: felt252 = 'Builder: already has a tile';
    pub const CANNOT_DISCARD: felt252 = 'Builder: cannot discard';
    pub const CANNOT_BUILD: felt252 = 'Builder: cannot build';
    pub const NOTHING_TO_CLAIM: felt252 = 'Builder: nothing to claim';
    pub const ALREADY_CLAIMED: felt252 = 'Builder: already claimed';
    pub const CAST_U256_FELT: felt252 = 'Builder: cast u256 to felt';
}

#[generate_trait]
pub impl BuilderImpl of BuilderTrait {
    #[inline]
    fn new(game_id: u32, player_id: felt252) -> Builder {
        // [Return] Builder
        Builder { game_id, player_id, tile_id: 0 }
    }

    #[inline]
    fn nullify(ref self: Builder) {
        // [Effect] Nullify builder
        self.tile_id = 0;
    }

    #[inline]
    fn reveal(ref self: Builder, tile_id: u32, plan: Plan) -> Tile {
        // [Check] Can reveal
        self.assert_revealable();
        // [Effect] Update tile_id
        self.tile_id = tile_id;
        // [Return] New tile
        TileImpl::new(self.game_id, self.tile_id, plan.into())
    }

    #[inline]
    fn discard(ref self: Builder, ref game: Game) {
        // [Check] Have a tile to place
        self.assert_discardable();
        // [Effect] Substract penalty
        let mut malus = constants::DISCARD_POINTS;
        game.sub_score(ref malus);
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
    }

    #[inline]
    fn build(ref self: Builder, ref tile: Tile, orientation: Orientation, x: u32, y: u32) {
        // [Check] Have a tile to place
        self.assert_buildable();
        // [Effect] Place tile (the caller checks that it fits its neighbours)
        tile.settle(orientation, x, y);
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
    }
}

#[generate_trait]
pub impl BuilderAssert of AssertTrait {
    #[inline]
    fn assert_exists(self: Builder) {
        assert(self.is_non_zero(), errors::BUILDER_DOES_NOT_EXIST);
    }

    #[inline]
    fn assert_not_exists(self: Builder) {
        assert(self.is_zero(), errors::BUILDER_ALREADY_EXIST);
    }

    #[inline]
    fn assert_revealable(self: Builder) {
        assert(0 == self.tile_id.into(), errors::ALREADY_HAS_TILE);
    }

    #[inline]
    fn assert_discardable(self: Builder) {
        assert(0 != self.tile_id.into(), errors::CANNOT_DISCARD);
    }

    #[inline]
    fn assert_buildable(self: Builder) {
        assert(0 != self.tile_id.into(), errors::CANNOT_BUILD);
    }
}

#[generate_trait]
pub impl ZeroableBuilderImpl of ZeroableBuilderTrait {
    #[inline]
    fn zero() -> Builder {
        Builder { game_id: 0, player_id: 0, tile_id: 0 }
    }

    #[inline]
    fn is_zero(self: Builder) -> bool {
        0 == self.tile_id.into()
    }

    #[inline]
    fn is_non_zero(self: Builder) -> bool {
        !self.is_zero()
    }
}
