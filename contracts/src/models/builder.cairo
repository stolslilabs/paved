// Internal imports

use stolsli::constants;
use stolsli::helpers::bitmap::Bitmap;
use stolsli::store::{Store, StoreImpl};
use stolsli::types::plan::Plan;
use stolsli::types::order::Order;
use stolsli::types::orientation::Orientation;
use stolsli::types::role::{Role, RoleImpl, RoleAssert};
use stolsli::types::spot::Spot;
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::category::Category;
use stolsli::types::alliance::{Alliance, AllianceImpl, MULTIPLIER};
use stolsli::models::game::{Game, GameImpl};
use stolsli::models::team::{Team, TeamImpl};
use stolsli::models::tile::{Tile, TileImpl};
use stolsli::models::character::{Character, CharacterImpl};

mod errors {
    const BUILDER_DOES_NOT_EXIST: felt252 = 'Builder: Does not exist';
    const BUILDER_ALREADY_EXIST: felt252 = 'Builder: Already exist';
    const INVALID_ORDER: felt252 = 'Builder: Invalid order';
    const ALREADY_PLACED: felt252 = 'Builder: Already placed';
    const CHARACTER_NOT_PLACED: felt252 = 'Builder: Character not placed';
    const ALREADY_HAS_TILE: felt252 = 'Builder: Already has a tile';
    const CANNOT_DISCARD: felt252 = 'Builder: Cannot discard';
    const CANNOT_BUILD: felt252 = 'Builder: Cannot build';
    const NOTHING_TO_CLAIM: felt252 = 'Builder: Nothing to claim';
    const ALREADY_CLAIMED: felt252 = 'Builder: Already claimed';
}

#[derive(Model, Copy, Drop, Serde)]
struct Builder {
    #[key]
    game_id: u32,
    #[key]
    player_id: felt252,
    order: u8,
    score: u32,
    // Inventory
    tile_id: u32,
    characters: u8,
    // Rewards
    claimed: u256,
}

#[generate_trait]
impl BuilderImpl of BuilderTrait {
    #[inline(always)]
    fn new(game_id: u32, player_id: felt252, order: u8,) -> Builder {
        // [Check] Order is valid
        assert(Order::None != order.into(), errors::INVALID_ORDER);

        // [Return] Builder
        Builder { game_id, player_id, order, score: 0, tile_id: 0, characters: 0, claimed: 0, }
    }

    #[inline(always)]
    fn remove(ref self: Builder) {
        // [Effect] Remove builder
        self.order = 0;
    }

    #[inline(always)]
    fn reveal(ref self: Builder, tile_id: u32, plan: Plan) -> Tile {
        // [Check] Can reveal
        self.assert_revealable();
        // [Effect] Update tile_id
        self.tile_id = tile_id;
        // [Return] New tile
        TileImpl::new(self.game_id, self.tile_id, self.player_id, plan.into())
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
        // [Check] Character compatibility
        let layout: Layout = tile.into();
        let category: Category = layout.get_category(spot);
        role.assert_is_allowed(category);
        // [Effect] Set character as placed
        let characters = Bitmap::set_bit_at(self.characters.into(), index.into(), true);
        self.characters = characters.try_into().unwrap();
        // [Effect] Update tile status
        tile.occupe(spot);
        // [Return] New character
        let weight: u8 = role.weight(category);
        let power: u8 = role.power(category);
        CharacterImpl::new(self.game_id, self.player_id, index.into(), tile.id, spot, weight, power)
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

    #[inline(always)]
    fn claim(ref self: Builder, game: Game, ref store: Store) -> u256 {
        // [Compute] Claimable rewards
        let claimable: u256 = game.prize * self.score.into() / game.score.into();
        // [Check] Remaning claimable rewards
        assert(self.claimed < claimable, errors::ALREADY_CLAIMED);
        let remaining = claimable - self.claimed;
        self.claimed += remaining;
        // [Return] Claimable rewards
        remaining
    }
}

#[generate_trait]
impl BuilderAssert of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Builder) {
        assert(self.is_non_zero(), errors::BUILDER_DOES_NOT_EXIST);
    }

    #[inline(always)]
    fn assert_not_exists(self: Builder) {
        assert(self.is_zero(), errors::BUILDER_ALREADY_EXIST);
    }

    #[inline(always)]
    fn assert_revealable(self: Builder) {
        assert(0 == self.tile_id.into(), errors::ALREADY_HAS_TILE);
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
            game_id: 0, player_id: 0, order: 0, score: 0, tile_id: 0, characters: 0, claimed: 0,
        }
    }

    #[inline(always)]
    fn is_zero(self: Builder) -> bool {
        0 == self.order.into()
    }

    #[inline(always)]
    fn is_non_zero(self: Builder) -> bool {
        !self.is_zero()
    }
}
