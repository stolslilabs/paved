// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::constants;
use paved::models::index::{Char, CharPosition};
use paved::types::spot::Spot;

mod errors {
    const ALREADY_REMOVED: felt252 = 'Char: Already removed';
    const NOT_PLACED: felt252 = 'Char: Not placed';
    const INVALID_TILE_ID: felt252 = 'Char: Invalid tile id';
    const INVALID_SPOT: felt252 = 'Char: Invalid spot';
}

#[generate_trait]
impl CharImpl of CharTrait {
    #[inline]
    fn new(
        game_id: u32, player_id: felt252, index: u8, tile_id: u32, spot: Spot, weight: u8, power: u8
    ) -> Char {
        // [Check] Tile id is valid
        assert(0 != tile_id, errors::INVALID_TILE_ID);
        // [Check] Position is valid
        assert(spot != Spot::None, errors::INVALID_SPOT);
        Char {
            game_id: game_id,
            player_id: player_id,
            index: index,
            tile_id: tile_id,
            spot: spot.into(),
            weight: weight,
            power: power,
        }
    }

    #[inline]
    fn remove(ref self: Char) {
        // [Check] Char not already removed
        self.assert_removeable();
        // [Effect] Update character
        self.tile_id = 0;
        self.spot = Spot::None.into();
        self.weight = 0;
        self.power = 0;
    }
}

impl CharIntoCharPosition of core::Into<Char, CharPosition> {
    #[inline]
    fn into(self: Char) -> CharPosition {
        CharPosition {
            game_id: self.game_id,
            tile_id: self.tile_id,
            spot: self.spot,
            player_id: self.player_id,
            index: self.index,
        }
    }
}

#[generate_trait]
impl CharAssert of AssertTrait {
    #[inline]
    fn assert_removeable(self: Char) {
        assert(0 != self.tile_id.into(), errors::ALREADY_REMOVED);
        assert(self.spot != Spot::None.into(), errors::NOT_PLACED);
    }
    #[inline]
    fn assert_placed(self: Char) {
        assert(0 != self.tile_id.into(), errors::NOT_PLACED);
        assert(self.spot != Spot::None.into(), errors::NOT_PLACED);
    }
}

impl ZeroableChar of core::Zeroable<Char> {
    #[inline]
    fn zero() -> Char {
        Char { game_id: 0, player_id: 0, index: 0, tile_id: 0, spot: 0, weight: 0, power: 0, }
    }

    #[inline]
    fn is_zero(self: Char) -> bool {
        0 == self.tile_id.into()
    }

    #[inline]
    fn is_non_zero(self: Char) -> bool {
        !self.is_zero()
    }
}

impl ZeroableCharPosition of core::Zeroable<CharPosition> {
    #[inline]
    fn zero() -> CharPosition {
        CharPosition { game_id: 0, tile_id: 0, spot: 0, player_id: 0, index: 0, }
    }

    #[inline]
    fn is_zero(self: CharPosition) -> bool {
        0 == self.player_id.into()
    }

    #[inline]
    fn is_non_zero(self: CharPosition) -> bool {
        !self.is_zero()
    }
}
