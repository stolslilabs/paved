// Core imports


// Internal imports

use paved::types::direction::{Direction, DirectionImpl};
use paved::types::orientation::Orientation;
use paved::types::spot::{Spot, SpotImpl};

pub mod errors {
    pub const INVALID_DIRECTION: felt252 = 'Move: Invalid direction';
}

#[derive(Copy, Drop)]
pub struct Move {
    pub direction: Direction,
    pub spot: Spot,
}

#[generate_trait]
pub impl MoveImpl of MoveTrait {
    #[inline]
    fn rotate(self: Move, orientation: Orientation) -> Move {
        let direction = self.direction.rotate(orientation);
        let spot = self.spot.rotate(orientation);
        Move { direction: direction, spot: spot }
    }

    #[inline]
    fn antirotate(self: Move, orientation: Orientation) -> Move {
        let direction = self.direction.antirotate(orientation);
        let spot = self.spot.antirotate(orientation);
        Move { direction: direction, spot: spot }
    }
}

#[cfg(test)]
pub mod tests {
    // Core imports


    // Local imports

    use super::{Move, MoveImpl, Direction, Spot, Orientation};

    #[test]
    fn test_move_rotate_from_north_at_north_west_to_north() {
        let move = Move { direction: Direction::North, spot: Spot::NorthWest };
        let rotated = move.rotate(Orientation::North);
        assert(rotated.direction == Direction::North, 'Move: rotate direction');
        assert(rotated.spot == Spot::NorthWest, 'Move: rotate spot');
    }

    #[test]
    fn test_move_rotate_from_north_at_north_west_to_east() {
        let move = Move { direction: Direction::North, spot: Spot::NorthWest };
        let rotated = move.rotate(Orientation::East);
        assert(rotated.direction == Direction::East, 'Move: rotate direction');
        assert(rotated.spot == Spot::NorthEast, 'Move: rotate spot');
    }
}
