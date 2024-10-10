// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::constants;
use paved::store::{Store, StoreImpl};
use paved::types::plan::Plan;
use paved::types::orientation::Orientation;
use paved::types::role::{Role, RoleImpl, RoleAssert};
use paved::types::spot::Spot;
use paved::types::layout::{Layout, LayoutImpl};
use paved::types::category::Category;
use paved::models::game::{Game, GameImpl};
use paved::models::player::{Player, PlayerImpl};
use paved::models::tile::{Tile, TileImpl, TileIntoLayout};
use paved::models::character::{Char, CharImpl};
use paved::models::index::Builder;
use paved::helpers::bitmap::Bitmap;

mod errors {
    const BUILDER_DOES_NOT_EXIST: felt252 = 'Builder: does not exist';
    const BUILDER_ALREADY_EXIST: felt252 = 'Builder: already exist';
    const BUILDER_NOT_HOST: felt252 = 'Builder: is not host';
    const BUILDER_IS_HOST: felt252 = 'Builder: is host';
    const ALREADY_PLACED: felt252 = 'Builder: already placed';
    const CHARACTER_NOT_PLACED: felt252 = 'Builder: character not placed';
    const ALREADY_HAS_TILE: felt252 = 'Builder: already has a tile';
    const CANNOT_DISCARD: felt252 = 'Builder: cannot discard';
    const CANNOT_BUILD: felt252 = 'Builder: cannot build';
}

#[generate_trait]
impl BuilderImpl of BuilderTrait {
    #[inline]
    fn new(game_id: u32, player_id: felt252, index: u8) -> Builder {
        // [Return] Builder
        Builder {
            game_id, player_id, index, characters: 0, discarded: 0, built: 0, score: 1, tile_id: 0,
        }
    }

    #[inline]
    fn nullify(ref self: Builder) {
        // [Effect] Nullify builder
        self.characters = 0;
        self.discarded = 0;
        self.built = 0;
        self.score = 0;
        self.tile_id = 0;
    }

    #[inline]
    fn reveal(ref self: Builder, tile_id: u32, plan: Plan) -> Tile {
        // [Check] Can reveal
        self.assert_revealable();
        // [Effect] Update tile_id
        self.tile_id = tile_id;
        // [Return] New tile
        TileImpl::new(self.game_id, self.tile_id, self.player_id, plan.into())
    }

    #[inline]
    fn discard(ref self: Builder) {
        // [Check] Have a tile to place
        self.assert_discardable();
        // [Effect] Substract penalty
        let malus = constants::DISCARD_POINTS;
        self.score -= core::cmp::min(self.score, malus);
        // [Effect] Increment discarded count
        self.discarded += 1;
        // [Effect] Remove tile from tile count
        self.tile_id = 0;
    }

    #[inline]
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

    #[inline]
    fn place(ref self: Builder, role: Role, ref tile: Tile, spot: Spot) -> Char {
        // [Check] Available character
        let index: u8 = role.into();
        self.assert_available(index);
        // [Check] Char compatibility
        let layout: Layout = tile.into();
        let category: Category = layout.get_category(spot);
        role.assert_is_allowed(category);
        // [Effect] Set character as placed
        self.characters = Bitmap::set_bit_at(self.characters, index.into(), true);
        // [Effect] Update tile status
        tile.occupe(spot);
        // [Return] New character
        let weight: u8 = role.weight(category);
        let power: u8 = role.power(category);
        CharImpl::new(self.game_id, self.player_id, index.into(), tile.id, spot, weight, power)
    }

    #[inline]
    fn recover(ref self: Builder, ref character: Char, ref tile: Tile) {
        // [Check] Recoverable
        let index: u8 = character.index;
        self.assert_recoverable(index);
        // [Effect] Collect character
        self.characters = Bitmap::set_bit_at(self.characters, index.into(), false);
        // [Effect] Update character
        character.remove();
        // [Effect] Update tile status
        tile.leave();
    }
}

#[generate_trait]
impl BuilderAssert of AssertTrait {
    #[inline]
    fn assert_exists(self: Builder) {
        assert(self.is_non_zero(), errors::BUILDER_DOES_NOT_EXIST);
    }

    #[inline]
    fn assert_not_exists(self: Builder) {
        assert(self.is_zero(), errors::BUILDER_ALREADY_EXIST);
    }

    #[inline(always)]
    fn assert_host(self: Builder) {
        assert(self.index == 0, errors::BUILDER_NOT_HOST);
    }

    #[inline(always)]
    fn assert_not_host(self: Builder) {
        assert(self.index != 0, errors::BUILDER_IS_HOST);
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

    #[inline]
    fn assert_available(self: Builder, index: u8) {
        let placed = Bitmap::get_bit_at(self.characters, index.into());
        assert(!placed, errors::ALREADY_PLACED);
    }

    #[inline]
    fn assert_recoverable(self: Builder, index: u8) {
        let placed = Bitmap::get_bit_at(self.characters, index.into());
        assert(placed, errors::CHARACTER_NOT_PLACED);
    }
}

impl ZeroableBuilderImpl of core::Zeroable<Builder> {
    #[inline]
    fn zero() -> Builder {
        Builder {
            game_id: 0,
            player_id: 0,
            index: 0,
            characters: 0,
            discarded: 0,
            built: 0,
            score: 0,
            tile_id: 0,
        }
    }

    #[inline]
    fn is_zero(self: Builder) -> bool {
        0 == self.score.into()
    }

    #[inline]
    fn is_non_zero(self: Builder) -> bool {
        !self.is_zero()
    }
}
