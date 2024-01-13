// Internal imports

use stolsli::constants;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;

mod errors {
    const ALREADY_REMOVED: felt252 = 'Character: Already removed';
    const INVALID_TILE_ID: felt252 = 'Character: Invalid tile id';
    const INVALID_DIRECTION: felt252 = 'Character: Invalid direction';
}

#[derive(Model, Copy, Drop, Serde)]
struct Character {
    #[key]
    game_id: u32,
    #[key]
    builder_id: felt252,
    #[key]
    index: u8,
    tile_id: u32,
    spot: u8,
    role: u8,
}

#[derive(Model, Copy, Drop, Serde)]
struct CharacterPosition {
    #[key]
    game_id: u32,
    #[key]
    tile_id: u32,
    #[key]
    spot: u8,
    builder_id: felt252,
    index: u8,
}

#[generate_trait]
impl CharacterImpl of CharacterTrait {
    #[inline(always)]
    fn new(
        game_id: u32, builder_id: felt252, index: u8, tile_id: u32, spot: Spot, role: Role
    ) -> Character {
        // [Check] Tile id is valid
        assert(0 != tile_id, errors::INVALID_TILE_ID);
        // [Check] Position is valid
        assert(spot != Spot::None, errors::INVALID_DIRECTION);
        // [Check] Role is valid
        Character {
            game_id: game_id,
            builder_id: builder_id,
            index: index,
            tile_id: tile_id,
            spot: spot.into(),
            role: role.into(),
        }
    }

    #[inline(always)]
    fn remove(ref self: Character) {
        // [Check] Character not already removed
        self.assert_removeable();
        // [Effect] Update character
        self.tile_id = 0;
    }
}

impl CharacterIntoCharacterPosition of Into<Character, CharacterPosition> {
    #[inline(always)]
    fn into(self: Character) -> CharacterPosition {
        CharacterPosition {
            game_id: self.game_id,
            tile_id: self.tile_id,
            spot: self.spot,
            builder_id: self.builder_id,
            index: self.index,
        }
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_removeable(self: Character) {
        assert(0 != self.tile_id.into(), errors::ALREADY_REMOVED);
    }
}

impl ZeroableCharacterPosition of Zeroable<CharacterPosition> {
    #[inline(always)]
    fn zero() -> CharacterPosition {
        CharacterPosition { game_id: 0, tile_id: 0, spot: 0, builder_id: 0, index: 0, }
    }

    #[inline(always)]
    fn is_zero(self: CharacterPosition) -> bool {
        0 == self.builder_id.into()
    }

    #[inline(always)]
    fn is_non_zero(self: CharacterPosition) -> bool {
        !self.is_zero()
    }
}
