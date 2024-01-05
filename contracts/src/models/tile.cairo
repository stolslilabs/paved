// Core imports

use debug::PrintTrait;
use traits::{Into, TryInto};
use option::OptionTrait;

// Internal imports

use stolsli::models::orientation::Orientation;
use stolsli::models::layout::LayoutType;

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

