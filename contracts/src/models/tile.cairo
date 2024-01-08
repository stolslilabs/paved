// Core imports

use debug::PrintTrait;
use traits::{Into, TryInto};
use option::OptionTrait;

// Internal imports

use stolsli::models::orientation::Orientation;
use stolsli::models::layout::{LayoutType, Layout, LayoutImpl};

mod errors {
    const TILE_INVALID_NEIGHBOR: felt252 = 'Tile: invalid neighbor';
    const TILE_NO_NEIGHBORS: felt252 = 'Tile: no neighbors';
    const TILE_TOO_MUCH_NEIGHBORS: felt252 = 'Tile: too much neighbors';
}

#[derive(Clone, Copy, Drop)]
struct Tile {
    #[key]
    game_id: u64,
    #[key]
    x: i32,
    #[key]
    y: i32,
    builder_id: felt252,
    layout_type: LayoutType,
    orientation: Orientation,
}

#[generate_trait]
impl TileImpl of TileTrait {
    fn new(
        game_id: u64,
        x: i32,
        y: i32,
        builder_id: felt252,
        layout_type: LayoutType,
        orientation: Orientation
    ) -> Tile {
        Tile {
            game_id: game_id,
            x: x,
            y: y,
            builder_id: builder_id,
            layout_type: layout_type,
            orientation: orientation,
        }
    }

    fn layout(self: Tile) -> Layout {
        LayoutImpl::from(self.layout_type, self.orientation)
    }

    fn is_valid(self: Tile, mut neighbors: Array<Tile>) -> bool {
        // [Check] At least one neighbor
        assert(neighbors.len() > 0, errors::TILE_NO_NEIGHBORS);
        // [Check] No more than 4 neighbors
        assert(neighbors.len() <= 4, errors::TILE_TOO_MUCH_NEIGHBORS);
        // [Check] All neighbors are valid
        let layout = self.layout();
        loop {
            match neighbors.pop_front() {
                Option::Some(neighbor) => {
                    // [Check] Neighbor is a neighbor and direction can be defined
                    let direction: Orientation = self.reference_direction(neighbor);
                    assert(direction != Orientation::None, errors::TILE_INVALID_NEIGHBOR);
                    // [Compute] Neighbor compatibility
                    if layout.is_compatible(neighbor.layout(), direction) {
                        continue;
                    } else {
                        break false;
                    }
                },
                Option::None => { break true; },
            }
        }
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

    use super::{Tile, TileImpl, InternalImpl, Orientation, LayoutType};

    #[test]
    fn test_tile_new() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let orientation = Orientation::North;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, orientation);
        assert(tile.game_id == 0, 'Tile: game_id');
        assert(tile.x == 0, 'Tile: x');
        assert(tile.y == 0, 'Tile: y');
        assert(tile.builder_id == 0, 'Tile: builder_id');
        assert(tile.layout_type == layout_type, 'Tile: layout_type');
        assert(tile.orientation == orientation, 'Tile: orientation');
    }

    #[test]
    fn test_tile_layout() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let orientation = Orientation::North;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, orientation);
        let layout = tile.layout(); // Check that it runs
    }

    #[test]
    fn test_tile_is_valid() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        let north_tile = TileImpl::new(0, 0, 1, 0, layout_type, Orientation::South);
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::East);
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::South);
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::East);
        let neighbors: Array<Tile> = array![north_tile, east_tile, south_tile, west_tile];
        assert(tile.is_valid(neighbors), 'Tile: valid neighbors');
    }

    #[test]
    fn test_tile_is_not_valid() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        let north_tile = TileImpl::new(0, 0, 1, 0, layout_type, Orientation::North);
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::North);
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::North);
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::East);
        let neighbors: Array<Tile> = array![north_tile, east_tile, south_tile, west_tile];
        assert(!tile.is_valid(neighbors), 'Tile: invalid neighbors');
    }

    #[test]
    #[should_panic(expected: ('Tile: no neighbors',))]
    fn test_tile_is_valid_revert_no_neighbors() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        let neighbors: Array<Tile> = array![];
        tile.is_valid(neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: too much neighbors',))]
    fn test_tile_is_valid_revert_too_much_neighbors() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        let north_tile = TileImpl::new(0, 0, 1, 0, layout_type, Orientation::North);
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::North);
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::North);
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::North);
        let neighbors: Array<Tile> = array![
            north_tile, east_tile, south_tile, west_tile, north_tile
        ];
        tile.is_valid(neighbors);
    }

    #[test]
    #[should_panic(expected: ('Tile: invalid neighbor',))]
    fn test_tile_is_valid_revert_invalid_neighbors() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        let invalid_north_tile = TileImpl::new(0, 0, 2, 0, layout_type, Orientation::North);
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::North);
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::North);
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::North);
        let neighbors: Array<Tile> = array![invalid_north_tile, east_tile, south_tile, west_tile];
        tile.is_valid(neighbors);
    }

    #[test]
    fn test_is_neighbor() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        // North
        let neighbor = TileImpl::new(0, 0, 1, 0, layout_type, Orientation::North);
        assert(InternalImpl::is_neighbor(tile, neighbor), 'Tile: north neighbor');
        // East
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::North);
        assert(InternalImpl::is_neighbor(tile, east_tile), 'Tile: east neighbor');
        // South
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::North);
        assert(InternalImpl::is_neighbor(tile, south_tile), 'Tile: south neighbor');
        // West
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::North);
        assert(InternalImpl::is_neighbor(tile, west_tile), 'Tile: west neighbor');
        // Not a neighbor
        let not_a_neighbor = TileImpl::new(0, 1, 1, 0, layout_type, Orientation::North);
        assert(!InternalImpl::is_neighbor(tile, not_a_neighbor), 'Tile: not a neighbor');
    }

    #[test]
    fn test_reference_direction() {
        let layout_type = LayoutType::RFRFFCCCCFFRF;
        let tile = TileImpl::new(0, 0, 0, 0, layout_type, Orientation::North);
        // North
        let north_tile = TileImpl::new(0, 0, 1, 0, layout_type, Orientation::North);
        assert(
            InternalImpl::reference_direction(tile, north_tile) == Orientation::North,
            'Tile: north neighbor'
        );
        // East
        let east_tile = TileImpl::new(0, 1, 0, 0, layout_type, Orientation::North);
        assert(
            InternalImpl::reference_direction(tile, east_tile) == Orientation::East,
            'Tile: east neighbor'
        );
        // South
        let south_tile = TileImpl::new(0, 0, -1, 0, layout_type, Orientation::North);
        assert(
            InternalImpl::reference_direction(tile, south_tile) == Orientation::South,
            'Tile: south neighbor'
        );
        // West
        let west_tile = TileImpl::new(0, -1, 0, 0, layout_type, Orientation::North);
        assert(
            InternalImpl::reference_direction(tile, west_tile) == Orientation::West,
            'Tile: west neighbor'
        );
        // Not a neighbor
        let not_a_neighbor = TileImpl::new(0, 1, 1, 0, layout_type, Orientation::North);
        assert(
            InternalImpl::reference_direction(tile, not_a_neighbor) == Orientation::None,
            'Tile: not a neighbor'
        );
    }
}
