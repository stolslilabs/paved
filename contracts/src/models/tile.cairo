// Core imports

use debug::PrintTrait;
use traits::{Into, TryInto};
use option::OptionTrait;

// Internal imports

use stolsli::models::orientation::Orientation;
use stolsli::models::plan::Plan;
use stolsli::models::layout::{Layout, LayoutImpl};

// Constants

const CENTER: u32 = 0x7fffffff;

mod errors {
    const TILE_INVALID_NEIGHBOR: felt252 = 'Tile: invalid neighbor';
    const TILE_NO_NEIGHBORS: felt252 = 'Tile: no neighbors';
    const TILE_TOO_MUCH_NEIGHBORS: felt252 = 'Tile: too much neighbors';
    const TILE_NOT_PLACED: felt252 = 'Tile: not placed';
    const TILE_ALREADY_PLACED: felt252 = 'Tile: already placed';
    const TILE_CANNOT_PLACE: felt252 = 'Tile: cannot place';
    const INVALID_ORIENTATION: felt252 = 'Tile: invalid orientation';
}

#[derive(Model, Copy, Drop, Serde)]
struct Tile {
    #[key]
    game_id: u32,
    #[key]
    id: u32,
    builder_id: felt252,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
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
            game_id, id, builder_id, plan, orientation: Orientation::None, x: CENTER, y: CENTER,
        }
    }

    #[inline(always)]
    fn position(self: Tile) -> TilePosition {
        let tile_id = if self.orientation == Orientation::None {
            0 // Not placed
        } else {
            self.id
        };
        TilePosition { game_id: self.game_id, x: self.x, y: self.y, tile_id: tile_id, }
    }

    #[inline(always)]
    fn get_layout(self: Tile) -> Layout {
        self.assert_is_placed();
        LayoutImpl::from(self.plan, self.orientation)
    }

    fn can_place(self: Tile, ref neighbors: Array<Tile>) -> bool {
        // [Check] At least one neighbor
        assert(neighbors.len() > 0, errors::TILE_NO_NEIGHBORS);
        // [Check] No more than 4 neighbors
        assert(neighbors.len() <= 4, errors::TILE_TOO_MUCH_NEIGHBORS);
        // [Check] All neighbors are valid
        let layout = self.get_layout();
        loop {
            match neighbors.pop_front() {
                Option::Some(neighbor) => {
                    // [Check] Neighbor is a neighbor and direction can be defined
                    let direction: Orientation = self.reference_direction(neighbor);
                    assert(direction != Orientation::None, errors::TILE_INVALID_NEIGHBOR);
                    // [Compute] Neighbor compatibility
                    if layout.is_compatible(neighbor.get_layout(), direction) {
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
        // [Effect] Update tile orientation
        self.orientation = orientation;
        // [Check] Tile is valid
        self.assert_can_place(ref neighbors);
        // [Effect] Update tile position
        self.x = x;
        self.y = y;
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_is_placed(self: Tile) {
        assert(self.orientation != Orientation::None, errors::TILE_NOT_PLACED);
    }

    #[inline(always)]
    fn assert_not_placed(self: Tile) {
        assert(self.orientation == Orientation::None, errors::TILE_ALREADY_PLACED);
    }

    #[inline(always)]
    fn assert_can_place(self: Tile, ref neighbors: Array<Tile>) {
        assert(self.can_place(ref neighbors), errors::TILE_CANNOT_PLACE);
    }
}

#[generate_trait]
impl InternalImpl of InternalTrait {
    #[inline(always)]
    fn reference_direction(self: Tile, reference: Tile) -> Orientation {
        if self.x == reference.x {
            if self.y + 1 == reference.y {
                return Orientation::North;
            } else if self.y == reference.y + 1 {
                return Orientation::South;
            } else {
                return Orientation::None;
            }
        } else if self.y == reference.y {
            if self.x + 1 == reference.x {
                return Orientation::East;
            } else if self.x == reference.x + 1 {
                return Orientation::West;
            } else {
                return Orientation::None;
            }
        } else {
            return Orientation::None;
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

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Tile, TileImpl, AssertImpl, InternalImpl, Orientation, Plan, CENTER};

    // Implemnentations

    #[generate_trait]
    impl TestImpl of TestTrait {
        #[inline(always)]
        fn from(plan: Plan, orientation: Orientation, x: u32, y: u32,) -> Tile {
            Tile {
                game_id: 0, id: 0, builder_id: 0, plan: plan, orientation: orientation, x: x, y: y,
            }
        }
    }

    #[test]
    fn test_tile_new() {
        let plan = Plan::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 1, 2, plan);
        assert(tile.game_id == 0, 'Tile: game_id');
        assert(tile.id == 1, 'Tile: id');
        assert(tile.builder_id == 2, 'Tile: builder_id');
        assert(tile.plan == plan, 'Tile: plan');
        assert(tile.orientation == Orientation::None, 'Tile: orientation');
        assert(tile.x == CENTER, 'Tile: x');
        assert(tile.y == CENTER, 'Tile: y');
    }

    #[test]
    fn test_tile_is_placed() {
        let plan = Plan::RFFFFRFFCFFRF;
        let tile = TileImpl::new(1, 2, 3, plan);
        tile.assert_not_placed();
    }

    #[test]
    fn test_tile_layout() {
        let plan = Plan::RFRFFCCCCFFRF;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let layout = tile.get_layout(); // Check that it runs
    }

    #[test]
    fn test_tile_can_place() {
        let plan = Plan::RFRFFCCCCFFRF;
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
        let plan = Plan::RFRFFCCCCFFRF;
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
        let plan = Plan::RFRFFCCCCFFRF;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let mut neighbors: Array<Tile> = array![];
        tile.can_place(ref neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: too much neighbors',))]
    fn test_tile_can_place_revert_too_much_neighbors() {
        let plan = Plan::RFRFFCCCCFFRF;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        let neighbor = TestImpl::from(plan, Orientation::North, tile.x, tile.y + 1);
        let mut neighbors: Array<Tile> = array![neighbor, neighbor, neighbor, neighbor, neighbor];
        tile.can_place(ref neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: invalid neighbor',))]
    fn test_tile_can_place_revert_invalid_neighbors() {
        let plan = Plan::RFRFFCCCCFFRF;
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
        let plan = Plan::RFRFFCCCCFFRF;
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
        let plan = Plan::RFRFFCCCCFFRF;
        let tile = TestImpl::from(plan, Orientation::North, CENTER, CENTER);
        // North
        let north_tile = TestImpl::from(plan, Orientation::South, tile.x, tile.y + 1);
        assert(
            InternalImpl::reference_direction(tile, north_tile) == Orientation::North,
            'Tile: north neighbor'
        );
        // East
        let east_tile = TestImpl::from(plan, Orientation::East, tile.x + 1, tile.y);
        assert(
            InternalImpl::reference_direction(tile, east_tile) == Orientation::East,
            'Tile: east neighbor'
        );
        // South
        let south_tile = TestImpl::from(plan, Orientation::North, tile.x, tile.y - 1);
        assert(
            InternalImpl::reference_direction(tile, south_tile) == Orientation::South,
            'Tile: south neighbor'
        );
        // West
        let west_tile = TestImpl::from(plan, Orientation::West, tile.x - 1, tile.y);
        assert(
            InternalImpl::reference_direction(tile, west_tile) == Orientation::West,
            'Tile: west neighbor'
        );
        // Not a neighbor
        let not_a_neighbor = TestImpl::from(plan, Orientation::North, tile.x + 1, tile.y + 1);
        assert(
            InternalImpl::reference_direction(tile, not_a_neighbor) == Orientation::None,
            'Tile: not a neighbor'
        );
    }
}
