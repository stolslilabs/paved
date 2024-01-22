// Core imports

use debug::PrintTrait;
use traits::{Into, TryInto};
use option::OptionTrait;

// Internal imports

use stolsli::constants;
use stolsli::types::orientation::Orientation;
use stolsli::types::area::{Area, AreaImpl};
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::plan::{Plan, PlanImpl};
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::move::{Move, MoveImpl};

// Constants

const CENTER: u32 = 0x7fffffff;

mod errors {
    const TILE_INVALID_NEIGHBOR: felt252 = 'Tile: invalid neighbor';
    const TILE_NO_NEIGHBORS: felt252 = 'Tile: no neighbors';
    const TILE_TOO_MUCH_NEIGHBORS: felt252 = 'Tile: too much neighbors';
    const TILE_NOT_PLACED: felt252 = 'Tile: not placed';
    const TILE_ALREADY_PLACED: felt252 = 'Tile: already placed';
    const TILE_CANNOT_PLACE: felt252 = 'Tile: cannot place';
    const TILE_DOES_NOT_EXIST: felt252 = 'Tile: does not exist';
    const TILE_ALREADY_EXISTS: felt252 = 'Tile: already exists';
    const INVALID_ORIENTATION: felt252 = 'Tile: invalid orientation';
    const INVALID_SPOT: felt252 = 'Tile: invalid spot';
    const TILE_ALREADY_EMPTY: felt252 = 'Tile: already empty';
}

#[derive(Model, Copy, Drop, Serde)]
struct Tile {
    #[key]
    game_id: u32,
    #[key]
    id: u32,
    builder_id: felt252,
    plan: u8,
    orientation: u8,
    x: u32,
    y: u32,
    occupied_spot: u8,
}

#[derive(Model, Copy, Drop, Serde)]
struct TilePosition {
    #[key]
    game_id: u32,
    #[key]
    x: u32,
    #[key]
    y: u32,
    tile_id: u32,
}

#[generate_trait]
impl TileImpl of TileTrait {
    #[inline(always)]
    fn new(game_id: u32, id: u32, builder_id: felt252, plan: Plan,) -> Tile {
        Tile {
            game_id,
            id,
            builder_id,
            plan: plan.into(),
            orientation: Orientation::None.into(),
            x: CENTER,
            y: CENTER,
            occupied_spot: Spot::None.into(),
        }
    }

    #[inline(always)]
    fn get_key(self: Tile, area: Area) -> felt252 {
        let key: u128 = area.into() + self.id.into() * constants::TWO_POW_8;
        key.into()
    }

    #[inline(always)]
    fn is_empty(self: Tile) -> bool {
        self.occupied_spot == Spot::None.into()
    }

    #[inline(always)]
    fn occupe(ref self: Tile, spot: Spot) {
        assert(spot != Spot::None, errors::INVALID_SPOT);
        self.occupied_spot = spot.into();
    }

    #[inline(always)]
    fn leave(ref self: Tile) {
        assert(!self.is_empty(), errors::TILE_ALREADY_EMPTY);
        self.occupied_spot = Spot::None.into();
    }

    fn can_place(self: Tile, ref neighbors: Array<Tile>) -> bool {
        // [Check] At least one neighbor
        assert(neighbors.len() > 0, errors::TILE_NO_NEIGHBORS);
        // [Check] No more than 4 neighbors
        assert(neighbors.len() <= 4, errors::TILE_TOO_MUCH_NEIGHBORS);
        // [Check] All neighbors are valid
        let layout: Layout = self.into();
        loop {
            match neighbors.pop_front() {
                Option::Some(neighbor) => {
                    // [Check] Neighbor is a neighbor and direction can be defined
                    let direction: Direction = self.reference_direction(neighbor);
                    assert(direction != Direction::None, errors::TILE_INVALID_NEIGHBOR);
                    // [Compute] Neighbor compatibility
                    if layout.is_compatible(neighbor.into(), direction) {
                        continue;
                    } else {
                        break false;
                    }
                },
                Option::None => { break true; },
            }
        }
    }

    #[inline(always)]
    fn place(ref self: Tile, orientation: Orientation, x: u32, y: u32, ref neighbors: Array<Tile>) {
        // [Check] Tile is not already placed
        self.assert_not_placed();
        // [Effect] Update tile orientation and position
        self.orientation = orientation.into();
        self.x = x;
        self.y = y;
        // [Check] Tile is valid
        self.assert_can_place(ref neighbors);
    }

    #[inline(always)]
    fn north_oriented_moves(self: Tile, at: Spot) -> Array<Move> {
        let orientation: Orientation = self.orientation.into();
        let spot: Spot = at.antirotate(orientation);
        let mut moves: Array<Move> = ArrayTrait::new();
        let plan: Plan = self.plan.into();
        plan.moves(spot)
    }

    #[inline(always)]
    fn area(self: Tile, at: Spot) -> Area {
        let orientation: Orientation = self.orientation.into();
        let spot: Spot = at.antirotate(orientation);
        let plan: Plan = self.plan.into();
        plan.area(spot)
    }

    #[inline(always)]
    fn proxy_coordinates(self: Tile, direction: Direction) -> (u32, u32) {
        match direction {
            Direction::None => (self.x, self.y),
            Direction::NorthWest => (self.x - 1, self.y + 1),
            Direction::North => (self.x, self.y + 1),
            Direction::NorthEast => (self.x + 1, self.y + 1),
            Direction::East => (self.x + 1, self.y),
            Direction::SouthEast => (self.x + 1, self.y - 1),
            Direction::South => (self.x, self.y - 1),
            Direction::SouthWest => (self.x - 1, self.y - 1),
            Direction::West => (self.x - 1, self.y),
        }
    }
}

impl TileIntoPosition of Into<Tile, TilePosition> {
    #[inline(always)]
    fn into(self: Tile) -> TilePosition {
        let tile_id = if Orientation::None == self.orientation.into() {
            0 // Not placed
        } else {
            self.id
        };
        TilePosition { game_id: self.game_id, x: self.x, y: self.y, tile_id: tile_id, }
    }
}

impl TileIntoLayout of Into<Tile, Layout> {
    #[inline(always)]
    fn into(self: Tile) -> Layout {
        self.assert_is_placed();
        LayoutImpl::from(self.plan.into(), self.orientation.into())
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_is_placed(self: Tile) {
        assert(Orientation::None != self.orientation.into(), errors::TILE_NOT_PLACED);
    }

    #[inline(always)]
    fn assert_not_placed(self: Tile) {
        assert(Orientation::None == self.orientation.into(), errors::TILE_ALREADY_PLACED);
    }

    #[inline(always)]
    fn assert_can_place(self: Tile, ref neighbors: Array<Tile>) {
        assert(self.can_place(ref neighbors), errors::TILE_CANNOT_PLACE);
    }
}

#[generate_trait]
impl InternalImpl of InternalTrait {
    #[inline(always)]
    fn reference_direction(self: Tile, reference: Tile) -> Direction {
        if self.x == reference.x {
            if self.y + 1 == reference.y {
                return Direction::North;
            } else if self.y == reference.y + 1 {
                return Direction::South;
            } else {
                return Direction::None;
            }
        } else if self.y == reference.y {
            if self.x + 1 == reference.x {
                return Direction::East;
            } else if self.x == reference.x + 1 {
                return Direction::West;
            } else {
                return Direction::None;
            }
        } else {
            return Direction::None;
        }
    }

    #[inline(always)]
    fn is_neighbor(self: Tile, reference: Tile) -> bool {
        if self.x == reference.x {
            self.y + 1 == reference.y || self.y == reference.y + 1
        } else if self.y == reference.y {
            self.x + 1 == reference.x || self.x == reference.x + 1
        } else {
            false
        }
    }
}

impl ZeroableTile of Zeroable<Tile> {
    #[inline(always)]
    fn zero() -> Tile {
        Tile {
            game_id: 0, id: 0, builder_id: 0, plan: 0, orientation: 0, x: 0, y: 0, occupied_spot: 0
        }
    }

    #[inline(always)]
    fn is_zero(self: Tile) -> bool {
        self.builder_id == 0
    }

    #[inline(always)]
    fn is_non_zero(self: Tile) -> bool {
        !self.is_zero()
    }
}

impl ZeroableTilePosition of Zeroable<TilePosition> {
    #[inline(always)]
    fn zero() -> TilePosition {
        TilePosition { game_id: 0, x: 0, y: 0, tile_id: 0, }
    }

    #[inline(always)]
    fn is_zero(self: TilePosition) -> bool {
        self.tile_id == 0
    }

    #[inline(always)]
    fn is_non_zero(self: TilePosition) -> bool {
        !self.is_zero()
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{
        Tile, TileImpl, AssertImpl, InternalImpl, Layout, Orientation, Direction, Plan, CENTER
    };

    // Implemnentations

    #[generate_trait]
    impl TestImpl of TestTrait {
        #[inline(always)]
        fn from(plan: Plan, orientation: Orientation, x: u32, y: u32,) -> Tile {
            Tile {
                game_id: 0,
                id: 0,
                builder_id: 0,
                plan: plan.into(),
                orientation: orientation.into(),
                x: x,
                y: y,
                occupied_spot: 0,
            }
        }
    }

    #[test]
    fn test_tile_new() {
        let plan = Plan::RFRFCCCFR;
        let tile = TileImpl::new(0, 1, 2, plan);
        assert(tile.game_id == 0, 'Tile: game_id');
        assert(tile.id == 1, 'Tile: id');
        assert(tile.builder_id == 2, 'Tile: builder_id');
        assert(tile.plan == plan.into(), 'Tile: plan');
        assert(tile.orientation == Orientation::None.into(), 'Tile: orientation');
        assert(tile.x == CENTER, 'Tile: x');
        assert(tile.y == CENTER, 'Tile: y');
    }

    #[test]
    fn test_tile_is_placed() {
        let plan = Plan::RFFFRFCFR;
        let tile = TileImpl::new(1, 2, 3, plan);
        tile.assert_not_placed();
    }

    #[test]
    fn test_tile_layout() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let layout: Layout = tile.into(); // Check that it runs
    }

    #[test]
    fn test_tile_can_place() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let north_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y + 1);
        let east_tile = TestImpl::from(plan, Orientation::East, tile.x + 1, tile.y);
        let south_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y - 1);
        let west_tile = TestImpl::from(plan, Orientation::East, tile.x - 1, tile.y);
        let mut neighbors: Array<Tile> = array![north_tile, east_tile, south_tile, west_tile];
        assert(tile.can_place(ref neighbors), 'Tile: valid neighbors');
    }

    #[test]
    fn test_tile_cannot_place() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let north_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y + 1);
        let east_tile = TestImpl::from(plan, Orientation::North, tile.x + 1, tile.y);
        let south_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y - 1);
        let west_tile = TestImpl::from(plan, Orientation::East, tile.x - 1, tile.y);
        let mut neighbors: Array<Tile> = array![north_tile, east_tile, south_tile, west_tile];
        assert(!tile.can_place(ref neighbors), 'Tile: invalid neighbors');
    }

    #[test]
    #[should_panic(expected: ('Tile: no neighbors',))]
    fn test_tile_can_place_revert_no_neighbors() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let mut neighbors: Array<Tile> = array![];
        tile.can_place(ref neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: too much neighbors',))]
    fn test_tile_can_place_revert_too_much_neighbors() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let neighbor = TestImpl::from(plan, Orientation::North, tile.x, tile.y + 1);
        let mut neighbors: Array<Tile> = array![neighbor, neighbor, neighbor, neighbor, neighbor];
        tile.can_place(ref neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: invalid neighbor',))]
    fn test_tile_can_place_revert_invalid_neighbors() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let invalid_north_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y + 2);
        let east_tile = TestImpl::from(plan, Orientation::East, tile.x + 1, tile.y);
        let south_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y - 1);
        let west_tile = TestImpl::from(plan, Orientation::West, tile.x - 1, tile.y);
        let mut neighbors: Array<Tile> = array![
            invalid_north_tile, east_tile, south_tile, west_tile
        ];
        tile.can_place(ref neighbors);
    }

    #[test]
    fn test_is_neighbor() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        // North
        let north_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y + 1);
        assert(InternalImpl::is_neighbor(tile, north_tile), 'Tile: north neighbor');
        // East
        let east_tile = TestImpl::from(plan, Orientation::East, tile.x + 1, tile.y);
        assert(InternalImpl::is_neighbor(tile, east_tile), 'Tile: east neighbor');
        // South
        let south_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y - 1);
        assert(InternalImpl::is_neighbor(tile, south_tile), 'Tile: south neighbor');
        // West
        let west_tile = TestImpl::from(plan, Orientation::West, tile.x - 1, tile.y);
        assert(InternalImpl::is_neighbor(tile, west_tile), 'Tile: west neighbor');
        // Not a neighbor
        let not_a_neighbor = TestImpl::from(plan, Orientation::North, tile.x + 1, tile.y + 1);
        assert(!InternalImpl::is_neighbor(tile, not_a_neighbor), 'Tile: not a neighbor');
    }

    #[test]
    fn test_reference_direction() {
        let plan = Plan::RFRFCCCFR;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        // North
        let north_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y + 1);
        assert(
            InternalImpl::reference_direction(tile, north_tile) == Direction::North,
            'Tile: north neighbor'
        );
        // East
        let east_tile = TestImpl::from(plan, Orientation::East, tile.x + 1, tile.y);
        assert(
            InternalImpl::reference_direction(tile, east_tile) == Direction::East,
            'Tile: east neighbor'
        );
        // South
        let south_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y - 1);
        assert(
            InternalImpl::reference_direction(tile, south_tile) == Direction::South,
            'Tile: south neighbor'
        );
        // West
        let west_tile = TestImpl::from(plan, Orientation::West, tile.x - 1, tile.y);
        assert(
            InternalImpl::reference_direction(tile, west_tile) == Direction::West,
            'Tile: west neighbor'
        );
        // Not a neighbor
        let not_a_neighbor = TestImpl::from(plan, Orientation::North, tile.x + 1, tile.y + 1);
        assert(
            InternalImpl::reference_direction(tile, not_a_neighbor) == Direction::None,
            'Tile: not a neighbor'
        );
    }
}
