// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::constants;
use paved::models::index::{Character, CharacterPosition};
use paved::types::spot::Spot;

mod errors {
    const ALREADY_REMOVED: felt252 = 'Character: Already removed';
    const NOT_PLACED: felt252 = 'Character: Not placed';
    const INVALID_TILE_ID: felt252 = 'Character: Invalid tile id';
    const INVALID_SPOT: felt252 = 'Character: Invalid spot';
}

#[generate_trait]
impl CharacterImpl of CharacterTrait {
    #[inline(always)]
    fn new(
        game_id: u32, player_id: felt252, index: u8, tile_id: u32, spot: Spot, weight: u8, power: u8
    ) -> Character {
        // [Check] Tile id is valid
        assert(0 != tile_id, errors::INVALID_TILE_ID);
        // [Check] Position is valid
        assert(spot != Spot::None, errors::INVALID_SPOT);
        Character {
            game_id: game_id,
            player_id: player_id,
            index: index,
            tile_id: tile_id,
            spot: spot.into(),
            weight: weight,
            power: power,
        }
    }

    #[inline(always)]
    fn remove(ref self: Character) {
        // [Check] Character not already removed
        self.assert_removeable();
        // [Effect] Update character
        self.tile_id = 0;
        self.spot = Spot::None.into();
        self.weight = 0;
        self.power = 0;
    }
}

impl CharacterIntoCharacterPosition of core::Into<Character, CharacterPosition> {
    #[inline(always)]
    fn into(self: Character) -> CharacterPosition {
        CharacterPosition {
            game_id: self.game_id,
            tile_id: self.tile_id,
            spot: self.spot,
            player_id: self.player_id,
            index: self.index,
        }
    }
}

#[generate_trait]
impl CharacterAssert of AssertTrait {
    #[inline(always)]
    fn assert_removeable(self: Character) {
        assert(0 != self.tile_id.into(), errors::ALREADY_REMOVED);
        assert(self.spot != Spot::None.into(), errors::NOT_PLACED);
    }
    #[inline(always)]
    fn assert_placed(self: Character) {
        assert(0 != self.tile_id.into(), errors::NOT_PLACED);
        assert(self.spot != Spot::None.into(), errors::NOT_PLACED);
    }
}

impl ZeroableCharacter of core::Zeroable<Character> {
    #[inline(always)]
    fn zero() -> Character {
        Character { game_id: 0, player_id: 0, index: 0, tile_id: 0, spot: 0, weight: 0, power: 0, }
    }

    #[inline(always)]
    fn is_zero(self: Character) -> bool {
        0 == self.tile_id.into()
    }

    #[inline(always)]
    fn is_non_zero(self: Character) -> bool {
        !self.is_zero()
    }
}

impl ZeroableCharacterPosition of core::Zeroable<CharacterPosition> {
    #[inline(always)]
    fn zero() -> CharacterPosition {
        CharacterPosition { game_id: 0, tile_id: 0, spot: 0, player_id: 0, index: 0, }
    }

    #[inline(always)]
    fn is_zero(self: CharacterPosition) -> bool {
        0 == self.player_id.into()
    }

    #[inline(always)]
    fn is_non_zero(self: CharacterPosition) -> bool {
        !self.is_zero()
    }
}
