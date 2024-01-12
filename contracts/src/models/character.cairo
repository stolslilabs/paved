// Internal imports

use stolsli::constants;
use stolsli::types::orientation::Orientation;
use stolsli::types::role::Role;

mod errors {
    const ALREADY_REMOVED: felt252 = 'Character: Already removed';
}

#[derive(Model, Copy, Drop, Serde)]
struct Character {
    #[key]
    game_id: u32,
    #[key]
    builder_id: felt252,
    #[key]
    index: u32,
    tile_id: u32,
    position: u8,
    role: u8,
}

#[derive(Model, Copy, Drop, Serde)]
struct CharacterPosition {
    #[key]
    game_id: u32,
    #[key]
    tile_id: u32,
    #[key]
    position: u8,
    builder_id: felt252,
    index: u32,
}

#[generate_trait]
impl CharacterImpl of CharacterTrait {
    #[inline(always)]
    fn new(
        game_id: u32,
        builder_id: felt252,
        index: u32,
        tile_id: u32,
        position: Orientation,
        role: Role
    ) -> Character {
        Character {
            game_id: game_id,
            builder_id: builder_id,
            index: index,
            tile_id: tile_id,
            position: position.into(),
            role: role.into(),
        }
    }

    #[inline(always)]
    fn remove(ref self: Character) {
        // [Check] Character not already removed
        self.assert_can_remove();
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
            position: self.position,
            builder_id: self.builder_id,
            index: self.index,
        }
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_can_remove(self: Character) {
        assert(0 != self.tile_id.into(), errors::ALREADY_REMOVED);
    }
}
