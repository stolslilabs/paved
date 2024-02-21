// Internal imports

use stolsli::constants;
use stolsli::types::order::Order;

mod errors {
    const PLAYER_NOT_EXIST: felt252 = 'Player: Does not exist';
    const PLAYER_ALREADY_EXIST: felt252 = 'Player: Already exist';
    const INVALID_NAME: felt252 = 'Player: Invalid name';
    const INVALID_ORDER: felt252 = 'Player: Invalid order';
    const NO_TILES_LEFT: felt252 = 'Player: No tiles left';
    const TOO_MUCH_TILES: felt252 = 'Player: Too much tiles';
}

#[derive(Model, Copy, Drop, Serde)]
struct Player {
    #[key]
    id: felt252,
    name: felt252,
    order: u8,
    tile_remaining: u8,
}

#[generate_trait]
impl PlayerImpl of PlayerTrait {
    #[inline(always)]
    fn new(id: felt252, name: felt252, order: u8) -> Player {
        // [Check] Name is valid
        assert(name != 0, errors::INVALID_NAME);

        // [Check] Order is valid
        assert(Order::None != order.into(), errors::INVALID_ORDER);

        // [Return] Player
        Player { id, name, order, tile_remaining: constants::DEFAULT_TILES_COUNT, }
    }

    #[inline(always)]
    fn buy(ref self: Player, amount: u8) {
        // [Check] Have a tile to place
        self.assert_buyable();
        // [Effect] Add one to the tile count
        self.tile_remaining += amount;
    }

    #[inline(always)]
    fn rename(ref self: Player, name: felt252) {
        // [Check] Name is valid
        assert(name != 0, errors::INVALID_NAME);
        // [Effect] Change the name
        self.name = name;
    }

    #[inline(always)]
    fn reorder(ref self: Player, order: u8) {
        // [Check] Order is valid
        assert(Order::None != order.into(), errors::INVALID_ORDER);
        // [Effect] Change the order
        self.order = order;
    }

    #[inline(always)]
    fn draw(ref self: Player) {
        // [Check] Can draw
        self.assert_drawable();
        // [Effect] Remove tile from the tile count
        self.tile_remaining -= 1;
    }
}

#[generate_trait]
impl PlayerAssert of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Player) {
        assert(self.is_non_zero(), errors::PLAYER_NOT_EXIST);
    }

    #[inline(always)]
    fn assert_not_exists(self: Player) {
        assert(self.is_zero(), errors::PLAYER_ALREADY_EXIST);
    }

    #[inline(always)]
    fn assert_buyable(self: Player) {
        assert(constants::MAX_TILE_COUNT > self.tile_remaining.into(), errors::TOO_MUCH_TILES);
    }

    #[inline(always)]
    fn assert_drawable(self: Player) {
        assert(0 != self.tile_remaining.into(), errors::NO_TILES_LEFT);
    }
}

impl ZeroablePlayerImpl of Zeroable<Player> {
    #[inline(always)]
    fn zero() -> Player {
        Player { id: 0, name: 0, order: 0, tile_remaining: 0, }
    }

    #[inline(always)]
    fn is_zero(self: Player) -> bool {
        0 == self.name
    }

    #[inline(always)]
    fn is_non_zero(self: Player) -> bool {
        0 != self.name
    }
}
