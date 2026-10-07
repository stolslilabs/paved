//! Packed constant tables of the plans (phase P5, PR P5-1).
//!
//! The layouts (`elements/layouts/*`) answer with arrays built by `match` at every call. These
//! tables hold the same facts as packed integers, one row per plan and one per area of a plan, in
//! the north-oriented frame of the plan. A placed tile is read by rotating indices, never by
//! building an array: `turns(orientation)` quarter turns move a spot or a direction `2 * turns`
//! places round the ring of eight (north-west, north, north-east, east, south-east, south,
//! south-west, west).
//!
//! Nothing in the runtime reads them yet: the structure state of P5-4 does. The tests at the end
//! generate every answer again from the layouts and compare, so a table never drifts from them.
//!
//! All values are the `u8` codes of the enums (`Spot`, `Direction`, `Area`, `Category`,
//! `Orientation`, `Plan`): spots 0 (none), 1 (center), 2..=9 (north-west to west); directions 0
//! (none), 1..=8 (north-west to west); areas 0 (none), 1..=9 (A to I); orientations 1..=4 (north,
//! east, south, west).
//!
//! Plan row (`u128`, low bits first):
//!
//! | Bits | Field |
//! |---|---|
//! | 0..36 | area of each spot 1..=9 (4 bits each) |
//! | 36..40 | number of start spots |
//! | 40..72 | start spots in `starts()` order (4 bits each, room for 8) |
//! | 72..76 | wonder spot (1 = center, 0 = none) |
//!
//! Area row (`u128`, low bits first):
//!
//! | Bits | Field |
//! |---|---|
//! | 0..3 | category |
//! | 3..7 | `record_index`: rank among the areas of the plan that have moves (15 = none) |
//! | 7..11 | number of moves |
//! | 11..75 | moves in `moves()` order (8 bits each: direction, then spot x 16) |
//! | 75..107 | half-edges per direction 1..=8 (4 bits each) |
//! | 107..116 | adjacent road areas (bit `area - 1`) |
//! | 116..125 | adjacent city areas (bit `area - 1`) |
//!
//! The adjacency is by area: the layouts give it by spot, and it is the same for every spot of an
//! area (checked by the tests). A wonder's half-edges have no spot (a move `(direction, None)`):
//! they only ask for the tile to exist.
//!
//! Rows are generated from the layouts by a script that is not part of the repository; the tests
//! are the check.

// Constants

pub const NO_RECORD: u8 = 15;
pub const NORTH_WEST: u8 = 1;
pub const NORTH: u8 = 2;
pub const NORTH_EAST: u8 = 3;
pub const EAST: u8 = 4;
pub const SOUTH_EAST: u8 = 5;
pub const SOUTH: u8 = 6;
pub const SOUTH_WEST: u8 = 7;
pub const WEST: u8 = 8;
/// Row of an area that has no spot in the plan: no category, no record, no move.
pub const ABSENT: u128 = 0x78;
pub const PLAN_COUNT: u8 = 19;
pub const AREA_COUNT: u8 = 9;

pub mod errors {
    pub const INVALID_ORIENTATION: felt252 = 'Tables: invalid orientation';
}

// Rows

/// Returns the row of a plan (0 for no plan).
pub fn plan_row(plan: u8) -> u128 {
    match plan {
        1 => 0x11111111111, // CCCCCCCCC
        2 => 0x712122211111, // CCCCCFFFC
        3 => 0x87614143211111, // CCCCCFRFC
        4 => 0x7313133312221, // CFFFCFFFC
        5 => 0x7313113111211, // FFCFFFCFF
        6 => 0x9313311111211, // FFCFFFFFC
        7 => 0x612112221111, // FFFFCCCFF
        8 => 0x712112111111, // FFFFFFCFF
        9 => 0x76134134312221, // RFFFRFCFR
        10 => 0x7133133312221, // RFFFRFFFR
        11 => 0x64214134443121, // RFRFCCCFR
        12 => 0x75214134333121, // RFRFFFCFR
        13 => 0x5213133333121, // RFRFFFFFR
        14 => 0x74214224213121, // RFRFRFCFF
        15 => 0x97654327867654321, // SFRFRFCFR
        16 => 0x9754326766654321, // SFRFRFFFR
        17 => 0x987654328987654321, // SFRFRFRFR
        18 => 0x1000000312222222221, // WFFFFFFFF
        19 => 0x1000009313322222221, // WFFFFFFFR
        _ => 0,
    }
}

/// Returns the row of an area of a plan (`ABSENT` when the plan has no such area).
pub fn area_row(plan: u8, area: u8) -> u128 {
    match plan {
        1 => area_row_1(area),
        2 => area_row_2(area),
        3 => area_row_3(area),
        4 => area_row_4(area),
        5 => area_row_5(area),
        6 => area_row_6(area),
        7 => area_row_7(area),
        8 => area_row_8(area),
        9 => area_row_9(area),
        10 => area_row_10(area),
        11 => area_row_11(area),
        12 => area_row_12(area),
        13 => area_row_13(area),
        14 => area_row_14(area),
        15 => area_row_15(area),
        16 => area_row_16(area),
        17 => area_row_17(area),
        18 => area_row_18(area),
        19 => area_row_19(area),
        _ => ABSENT,
    }
}

/// Area rows of `CCCCCCCCC`.
fn area_row_1(area: u8) -> u128 {
    match area {
        1 => 0x8080808000000002c1b4a39203,
        _ => ABSENT,
    }
}

/// Area rows of `CCCCCFFFC`.
fn area_row_2(area: u8) -> u128 {
    match area {
        1 => 0x800080800000000002c4a39183,
        2 => 0x10000080000000000000000001b089,
        _ => ABSENT,
    }
}

/// Area rows of `CCCCCFRFC`.
fn area_row_3(area: u8) -> u128 {
    match area {
        1 => 0x800080800000000002c4a39183,
        2 => 0x102000800000000000000000023089,
        3 => 0x80000000000000000001b092,
        4 => 0x102000800000000000000000013099,
        _ => ABSENT,
    }
}

/// Area rows of `CFFFCFFFC`.
fn area_row_4(area: u8) -> u128 {
    match area {
        1 => 0x80008000000000000002c4a103,
        2 => 0x100000000080000000000000039089,
        3 => 0x10000080000000000000000001b091,
        _ => ABSENT,
    }
}

/// Area rows of `FFCFFFCFF`.
fn area_row_5(area: u8) -> u128 {
    match area {
        1 => 0x600080008000000000000002c4a101,
        2 => 0x8000000000000003908b,
        3 => 0x80000000000000000001b093,
        _ => ABSENT,
    }
}

/// Area rows of `FFCFFFFFC`.
fn area_row_6(area: u8) -> u128 {
    match area {
        1 => 0x600000808000000000000001b4a101,
        2 => 0x8000000000000003908b,
        3 => 0x8000000000000000000002c093,
        _ => ABSENT,
    }
}

/// Area rows of `FFFFCCCFF`.
fn area_row_7(area: u8) -> u128 {
    match area {
        1 => 0x200080000080000000000002c39101,
        2 => 0x808000000000000001b4a10b,
        _ => ABSENT,
    }
}

/// Area rows of `FFFFFFCFF`.
fn area_row_8(area: u8) -> u128 {
    match area {
        1 => 0x2000800080800000000002c4a39181,
        2 => 0x80000000000000000001b08b,
        _ => ABSENT,
    }
}

/// Area rows of `RFFFRFCFR`.
fn area_row_9(area: u8) -> u128 {
    match area {
        1 => 0x80008000000000000002c4a102,
        2 => 0x880008080000000000241239189,
        3 => 0x800880008000000000000003442111,
        4 => 0x80000000000000000001b09b,
        _ => ABSENT,
    }
}

/// Area rows of `RFFFRFFFR`.
fn area_row_10(area: u8) -> u128 {
    match area {
        1 => 0x80008000000000000002c4a102,
        2 => 0x880008080000000000241239189,
        3 => 0x88080800000000000034421b191,
        _ => ABSENT,
    }
}

/// Area rows of `RFRFCCCFR`.
fn area_row_11(area: u8) -> u128 {
    match area {
        1 => 0x80000080000000000002c39102,
        2 => 0x880000080000000000002441109,
        3 => 0x800880000080000000000003431111,
        4 => 0x808000000000000001b4a11b,
        _ => ABSENT,
    }
}

/// Area rows of `RFRFFFCFR`.
fn area_row_12(area: u8) -> u128 {
    match area {
        1 => 0x80000080000000000002c39102,
        2 => 0x880000080000000000002441109,
        3 => 0x800880008080000000000344a31191,
        4 => 0x80000000000000000001b09b,
        _ => ABSENT,
    }
}

/// Area rows of `RFRFFFFFR`.
fn area_row_13(area: u8) -> u128 {
    match area {
        1 => 0x80000080000000000002c39102,
        2 => 0x880000080000000000002441109,
        3 => 0x8808080800000000341b4a31211,
        _ => ABSENT,
    }
}

/// Area rows of `RFRFRFCFF`.
fn area_row_14(area: u8) -> u128 {
    match area {
        1 => 0x8080000000000004a39102,
        2 => 0x8008800080800000000002c4241189,
        3 => 0x800008080000000000001231111,
        4 => 0x80000000000000000001b09b,
        _ => ABSENT,
    }
}

/// Area rows of `SFRFRFCFR`.
fn area_row_15(area: u8) -> u128 {
    match area {
        1 => 0x7c,
        2 => 0x42080000080000000000002441101,
        3 => 0x8000000000000003908a,
        4 => 0xa000008080000000000001231111,
        5 => 0x800000000000000004a09a,
        6 => 0x4048080008000000000000003442121,
        7 => 0x80000000000000000001b0ab,
        8 => 0x8000000000000000000002c0b2,
        _ => ABSENT,
    }
}

/// Area rows of `SFRFRFFFR`.
fn area_row_16(area: u8) -> u128 {
    match area {
        1 => 0x7c,
        2 => 0x22080000080000000000002441101,
        3 => 0x8000000000000003908a,
        4 => 0xa000008080000000000001231111,
        5 => 0x800000000000000004a09a,
        6 => 0x28080808000000000000341b421a1,
        7 => 0x8000000000000000000002c0aa,
        _ => ABSENT,
    }
}

/// Area rows of `SFRFRFRFR`.
fn area_row_17(area: u8) -> u128 {
    match area {
        1 => 0x7c,
        2 => 0x82080000080000000000002441101,
        3 => 0x8000000000000003908a,
        4 => 0xa000008080000000000001231111,
        5 => 0x800000000000000004a09a,
        6 => 0x28000808000000000000002342121,
        7 => 0x80000000000000000001b0aa,
        8 => 0xa0080800000000000000003413131,
        9 => 0x8000000000000000000002c0ba,
        _ => ABSENT,
    }
}

/// Area rows of `WFFFFFFFF`.
fn area_row_18(area: u8) -> u128 {
    match area {
        1 => 0x88888888403830282018100c05,
        2 => 0x8080808000000002c1b4a39209,
        _ => ABSENT,
    }
}

/// Area rows of `WFFFFFFFR`.
fn area_row_19(area: u8) -> u128 {
    match area {
        1 => 0x88888888403830282018100c05,
        2 => 0x21008080800000034241b4a39289,
        3 => 0x8000000000000000000002c092,
        _ => ABSENT,
    }
}

// Rotation

/// Quarter turns of an orientation (north is 0).
#[inline]
pub fn turns(orientation: u8) -> u8 {
    assert(orientation >= 1 && orientation <= 4, errors::INVALID_ORIENTATION);
    orientation - 1
}

/// Rotates a direction clockwise by `turns` quarter turns.
#[inline]
pub fn rotate_direction(direction: u8, turns: u8) -> u8 {
    if direction == 0 {
        0
    } else {
        (direction - 1 + 2 * turns) % 8 + 1
    }
}

/// Rotates a spot clockwise by `turns` quarter turns (the center and none stay).
#[inline]
pub fn rotate_spot(spot: u8, turns: u8) -> u8 {
    if spot < 2 {
        spot
    } else {
        (spot - 2 + 2 * turns) % 8 + 2
    }
}

/// Rotates a direction back from an orientation to the north-oriented frame.
#[inline]
pub fn antirotate_direction(direction: u8, turns: u8) -> u8 {
    rotate_direction(direction, (4 - turns) % 4)
}

/// Rotates a spot back from an orientation to the north-oriented frame.
#[inline]
pub fn antirotate_spot(spot: u8, turns: u8) -> u8 {
    rotate_spot(spot, (4 - turns) % 4)
}

/// Returns the opposite direction.
#[inline]
pub fn opposite(direction: u8) -> u8 {
    rotate_direction(direction, 2)
}

// Lookups

/// Returns 2 to the power `exponent` (below 128), by its bits.
#[inline]
fn pow2(exponent: u32) -> u128 {
    let mut weight: u128 = 1;
    if exponent & 1 != 0 {
        weight *= 2;
    }
    if exponent & 2 != 0 {
        weight *= 4;
    }
    if exponent & 4 != 0 {
        weight *= 16;
    }
    if exponent & 8 != 0 {
        weight *= 0x100;
    }
    if exponent & 16 != 0 {
        weight *= 0x10000;
    }
    if exponent & 32 != 0 {
        weight *= 0x100000000;
    }
    if exponent & 64 != 0 {
        weight *= 0x10000000000000000;
    }
    weight
}

/// Reads the bits of `value` from `shift` (a bit offset) under `mask`.
#[inline]
fn field(value: u128, shift: u32, mask: u128) -> u128 {
    (value / pow2(shift)) & mask
}

#[inline]
fn small(value: u128) -> u8 {
    value.try_into().unwrap()
}

/// Returns the area of a spot of a tile of `plan` placed with `orientation` (0 for none).
pub fn area_at(plan: u8, spot: u8, orientation: u8) -> u8 {
    if spot == 0 || spot > 9 {
        return 0;
    }
    let spot = antirotate_spot(spot, turns(orientation));
    small(field(plan_row(plan), 4 * (spot - 1).into(), 0xf))
}

/// Returns the number of start spots.
pub fn start_count(plan: u8) -> u8 {
    small(field(plan_row(plan), 36, 0xf))
}

/// Returns the start spot `index` (in `starts()` order), rotated by `orientation` (0 past the
/// last).
pub fn start(plan: u8, index: u8, orientation: u8) -> u8 {
    if index >= start_count(plan) {
        return 0;
    }
    let spot = small(field(plan_row(plan), 40 + 4 * index.into(), 0xf));
    rotate_spot(spot, turns(orientation))
}

/// Returns the wonder spot of the plan (1 for the center, 0 for none).
pub fn wonder(plan: u8) -> u8 {
    small(field(plan_row(plan), 72, 0xf))
}

/// Returns the category of an area (0 when the plan has no such area).
pub fn category(plan: u8, area: u8) -> u8 {
    small(field(area_row(plan, area), 0, 0x7))
}

/// Returns the record index of an area, or `NO_RECORD` when it has no move.
pub fn record_index(plan: u8, area: u8) -> u8 {
    small(field(area_row(plan, area), 3, 0xf))
}

/// Returns the number of areas of the plan that have moves, which is the number of records a tile
/// of this plan founds at most.
pub fn record_count(plan: u8) -> u8 {
    let mut count = 0;
    let mut area = 1;
    while area <= AREA_COUNT {
        if record_index(plan, area) != NO_RECORD {
            count += 1;
        }
        area += 1;
    }
    count
}

/// Returns the number of moves of an area.
pub fn move_count(plan: u8, area: u8) -> u8 {
    small(field(area_row(plan, area), 7, 0xf))
}

fn move_byte(plan: u8, area: u8, index: u8) -> u8 {
    small(field(area_row(plan, area), 11 + 8 * index.into(), 0xff))
}

/// Returns the direction of the move `index` of an area, rotated by `orientation` (0 past the
/// last).
pub fn move_direction(plan: u8, area: u8, index: u8, orientation: u8) -> u8 {
    if index >= move_count(plan, area) {
        return 0;
    }
    rotate_direction(move_byte(plan, area, index) % 16, turns(orientation))
}

/// Returns the spot of the move `index` of an area, rotated by `orientation` (0 for a half-edge
/// without spot, and past the last move).
pub fn move_spot(plan: u8, area: u8, index: u8, orientation: u8) -> u8 {
    if index >= move_count(plan, area) {
        return 0;
    }
    rotate_spot(move_byte(plan, area, index) / 16, turns(orientation))
}

/// Returns the number of half-edges of an area that leave towards `direction`, for a tile placed
/// with `orientation`.
pub fn half_edges(plan: u8, area: u8, direction: u8, orientation: u8) -> u8 {
    if direction == 0 || direction > 8 {
        return 0;
    }
    let direction = antirotate_direction(direction, turns(orientation));
    small(field(area_row(plan, area), 75 + 4 * (direction - 1).into(), 0xf))
}

// Row readers: the hot path reads an area row once and walks its moves byte by byte.

/// Returns the category of an area row.
#[inline(always)]
pub fn row_category(row: u128) -> u8 {
    small(row & 0x7)
}

/// Returns the record index of an area row (`NO_RECORD` when the area has no move).
#[inline(always)]
pub fn row_record_index(row: u128) -> u8 {
    small((row / 0x8) & 0xf)
}

/// Returns the number of moves of an area row.
#[inline(always)]
pub fn row_move_count(row: u128) -> u8 {
    small((row / 0x80) & 0xf)
}

/// Returns the moves of an area row, one byte per move from the low bits (direction, then spot x
/// 16), north-oriented.
#[inline(always)]
pub fn row_moves(row: u128) -> u128 {
    (row / 0x800) & 0xffffffffffffffff
}

/// Takes the first move of `moves` (as `row_moves` gives them): returns its direction and its spot
/// rotated by `turns` quarter turns, and the moves left.
#[inline]
pub fn next_move(moves: u128, turns: u8) -> (u8, u8, u128) {
    let byte = small(moves & 0xff);
    (rotate_direction(byte % 16, turns), rotate_spot(byte / 16, turns), moves / 0x100)
}

/// Returns the road areas adjacent to the area of a north-oriented area row, as a bitmap (bit
/// `area - 1`): the adjacency is by area, the same in every orientation.
#[inline(always)]
pub fn row_adjacent_roads(row: u128) -> u16 {
    ((row / 0x800000000000000000000000000) & 0x1ff).try_into().unwrap()
}

/// Returns the city areas adjacent to the area of a north-oriented area row, as a bitmap (bit
/// `area - 1`).
#[inline(always)]
pub fn row_adjacent_cities(row: u128) -> u16 {
    ((row / 0x100000000000000000000000000000) & 0x1ff).try_into().unwrap()
}

/// Returns the road areas adjacent to an area, as a bitmap (bit `area - 1`).
pub fn adjacent_roads(plan: u8, area: u8) -> u16 {
    field(area_row(plan, area), 107, 0x1ff).try_into().unwrap()
}

/// Returns the city areas adjacent to an area, as a bitmap (bit `area - 1`).
pub fn adjacent_cities(plan: u8, area: u8) -> u16 {
    field(area_row(plan, area), 116, 0x1ff).try_into().unwrap()
}

#[cfg(test)]
pub mod tests {
    // Local imports

    use paved::types::area::Area;
    use paved::types::category::Category;
    use paved::types::direction::{Direction, DirectionImpl};
    use paved::types::layout::{Layout, LayoutImpl as TypesLayoutImpl};
    use paved::types::move::{Move, MoveImpl};
    use paved::types::orientation::Orientation;
    use paved::types::plan::{Plan, PlanImpl};
    use paved::types::spot::{Spot, SpotImpl};
    use super::*;

    // Helpers

    fn plan_of(plan: u8) -> Plan {
        plan.into()
    }

    fn orientation_of(orientation: u8) -> Orientation {
        orientation.into()
    }

    fn spot_code(spot: Spot) -> u8 {
        spot.into()
    }

    fn area_code(area: Area) -> u8 {
        area.into()
    }

    fn category_code(category: Category) -> u8 {
        category.into()
    }

    /// Returns a spot (north-oriented frame) of the area of the plan, if it has one.
    fn spot_of_area(plan: u8, area: u8) -> Option<Spot> {
        let mut spot = 1_u8;
        let mut found = Option::None;
        while spot <= 9 {
            let candidate: Spot = spot.into();
            if area_code(plan_of(plan).area(candidate)) == area {
                found = Option::Some(candidate);
                break;
            }
            spot += 1;
        }
        found
    }

    /// Returns the areas (0 is none) of the layouts as a bitmap.
    fn areas_mask(spots: Array<Spot>, plan: Plan) -> u16 {
        let mut mask: u16 = 0;
        for spot in spots {
            let area = area_code(plan.area(spot));
            mask = mask | pow2_u16(area - 1);
        }
        mask
    }

    fn pow2_u16(exponent: u8) -> u16 {
        let mut value: u16 = 1;
        let mut i = 0;
        while i < exponent {
            value *= 2;
            i += 1;
        }
        value
    }

    // Rotation

    #[test]
    fn test_tables_rotation_equals_the_types() {
        let mut orientation = 1_u8;
        while orientation <= 4 {
            let turns = turns(orientation);
            let mut code = 0_u8;
            while code <= 9 {
                let spot: Spot = code.into();
                let rotated = spot_code(spot.rotate(orientation_of(orientation)));
                let anti = spot_code(spot.antirotate(orientation_of(orientation)));
                // `Spot::rotate` of `None` with the orientation `None` is not reachable here
                let expected_rotated = if code == 0 {
                    0
                } else {
                    rotated
                };
                assert_eq!(rotate_spot(code, turns), expected_rotated);
                assert_eq!(antirotate_spot(code, turns), if code == 0 {
                    0
                } else {
                    anti
                });
                code += 1;
            }
            let mut code = 0_u8;
            while code <= 8 {
                let direction: Direction = code.into();
                let rotated: u8 = direction.rotate(orientation_of(orientation)).into();
                let anti: u8 = direction.antirotate(orientation_of(orientation)).into();
                assert_eq!(rotate_direction(code, turns), rotated);
                assert_eq!(antirotate_direction(code, turns), anti);
                let source: u8 = direction.source().into();
                assert_eq!(opposite(code), source);
                code += 1;
            }
            orientation += 1;
        }
    }

    // Equality with the layouts

    #[test]
    fn test_tables_spots_starts_and_wonder_equal_the_layouts() {
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let layout_plan = plan_of(plan);
            assert_eq!(wonder(plan), spot_code(layout_plan.wonder()));
            let starts = layout_plan.starts();
            assert_eq!(start_count(plan).into(), starts.len());
            let mut orientation = 1_u8;
            while orientation <= 4 {
                // Areas of the spots of the oriented tile, as `Tile::area` answers.
                let mut spot = 0_u8;
                while spot <= 9 {
                    let at: Spot = spot.into();
                    let north = at.antirotate(orientation_of(orientation));
                    let expected = if spot == 0 {
                        0
                    } else {
                        area_code(layout_plan.area(north))
                    };
                    assert_eq!(area_at(plan, spot, orientation), expected);
                    spot += 1;
                }
                // Start spots, rotated as `Game::assess` rotates them.
                let mut index = 0_u8;
                let mut spots = starts.span();
                while let Option::Some(north) = spots.pop_front() {
                    let expected = spot_code((*north).rotate(orientation_of(orientation)));
                    assert_eq!(start(plan, index, orientation), expected);
                    index += 1;
                }
                assert_eq!(start(plan, index, orientation), 0);
                orientation += 1;
            }
            plan += 1;
        }
    }

    #[test]
    fn test_tables_categories_equal_the_layouts() {
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut orientation = 1_u8;
            while orientation <= 4 {
                let layout: Layout = TypesLayoutImpl::from(
                    plan_of(plan), orientation_of(orientation),
                );
                let mut spot = 1_u8;
                while spot <= 9 {
                    let at: Spot = spot.into();
                    let area = area_at(plan, spot, orientation);
                    assert(area != 0, 'Tables: spot without area');
                    assert_eq!(category(plan, area), category_code(layout.get_category(at)));
                    spot += 1;
                }
                orientation += 1;
            }
            // An area that no spot reaches is absent.
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                if spot_of_area(plan, area).is_none() {
                    assert_eq!(area_row(plan, area), ABSENT);
                    assert_eq!(category(plan, area), 0);
                    assert_eq!(record_index(plan, area), NO_RECORD);
                    assert_eq!(move_count(plan, area), 0);
                }
                area += 1;
            }
            plan += 1;
        }
    }

    #[test]
    fn test_tables_moves_and_half_edges_equal_the_layouts() {
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let layout_plan = plan_of(plan);
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                // Every spot of the area gives the same moves (north-oriented frame)
                let mut spot = 1_u8;
                let mut first: Option<Spot> = Option::None;
                while spot <= 9 {
                    let at: Spot = spot.into();
                    if area_code(layout_plan.area(at)) == area {
                        let moves = layout_plan.moves(at);
                        assert_eq!(move_count(plan, area).into(), moves.len());
                        match first {
                            Option::None => { first = Option::Some(at); },
                            Option::Some(reference) => {
                                // The same answer as the first spot, move by move
                                let mut a = layout_plan.moves(reference).span();
                                let mut b = moves.span();
                                while let Option::Some(m) = a.pop_front() {
                                    let n = b.pop_front().unwrap();
                                    assert(*m.direction == *n.direction, 'Tables: spot moves');
                                    assert(*m.spot == *n.spot, 'Tables: spot moves');
                                }
                            },
                        }
                    }
                    spot += 1;
                }
                match first {
                    Option::None => { assert_eq!(move_count(plan, area), 0); },
                    Option::Some(at) => {
                        let moves = layout_plan.moves(at);
                        let mut orientation = 1_u8;
                        while orientation <= 4 {
                            let o = orientation_of(orientation);
                            let mut index = 0_u8;
                            let mut span = moves.span();
                            while let Option::Some(north_move) = span.pop_front() {
                                let rotated: Move = (*north_move).rotate(o);
                                let direction: u8 = rotated.direction.into();
                                assert_eq!(
                                    move_direction(plan, area, index, orientation), direction,
                                );
                                assert_eq!(
                                    move_spot(plan, area, index, orientation),
                                    spot_code(rotated.spot),
                                );
                                index += 1;
                            }
                            assert_eq!(move_direction(plan, area, index, orientation), 0);
                            assert_eq!(move_spot(plan, area, index, orientation), 0);
                            // Half-edges per direction: the moves that leave that way
                            let mut direction = 1_u8;
                            while direction <= 8 {
                                let mut expected = 0_u8;
                                let mut span = moves.span();
                                while let Option::Some(north_move) = span.pop_front() {
                                    let d: u8 = (*north_move).rotate(o).direction.into();
                                    if d == direction {
                                        expected += 1;
                                    }
                                }
                                assert_eq!(
                                    half_edges(plan, area, direction, orientation), expected,
                                );
                                direction += 1;
                            }
                            orientation += 1;
                        }
                    },
                }
                area += 1;
            }
            plan += 1;
        }
    }

    #[test]
    fn test_tables_records_and_adjacency_equal_the_layouts() {
        let mut plan = 1_u8;
        let mut max_records = 0_u8;
        while plan <= PLAN_COUNT {
            let layout_plan = plan_of(plan);
            let mut rank = 0_u8;
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                match spot_of_area(plan, area) {
                    Option::None => {},
                    Option::Some(first) => {
                        // Record index: the rank among the areas that have moves.
                        if layout_plan.moves(first).len() > 0 {
                            assert_eq!(record_index(plan, area), rank);
                            rank += 1;
                        } else {
                            assert_eq!(record_index(plan, area), NO_RECORD);
                        }
                        // Adjacency: the same answer for every spot of the area.
                        let mut spot = 1_u8;
                        while spot <= 9 {
                            let at: Spot = spot.into();
                            if area_code(layout_plan.area(at)) == area {
                                let roads = areas_mask(layout_plan.adjacent_roads(at), layout_plan);
                                let cities = areas_mask(
                                    layout_plan.adjacent_cities(at), layout_plan,
                                );
                                assert_eq!(adjacent_roads(plan, area), roads);
                                assert_eq!(adjacent_cities(plan, area), cities);
                                // The readers of a row (the forest scan) give the same bitmaps
                                assert_eq!(row_adjacent_roads(area_row(plan, area)), roads);
                                assert_eq!(row_adjacent_cities(area_row(plan, area)), cities);
                            }
                            spot += 1;
                        }
                    },
                }
                area += 1;
            }
            assert_eq!(record_count(plan), rank);
            if rank > max_records {
                max_records = rank;
            }
            plan += 1;
        }
        // `sfrfrfrfr` has eight areas with moves: a second slot of five records.
        assert_eq!(max_records, 8);
    }

    // Symmetry of the move relation (design, "Assumption to prove first")
    //
    // A move leaves an area towards a neighbouring tile and lands on a spot of it. The walks follow
    // it as a directed edge; a union is not directed. For two tiles that a placement accepts, side
    // by side, every move with a spot from an area `a` of the first tile into an area `b` of the
    // second must have a move of `b` back into `a`, and the other way round. Half-edges without
    // spot (a wonder's) ask only for the tile to exist and have no area to land on: they are left
    // out.

    /// Returns the moves with a spot of a tile that leave towards `direction`, as `area * 16 +
    /// spot`
    /// (from the tables, which the tests above prove equal to the layouts for every plan,
    /// orientation, area and spot). Asserts on the way that no move with a spot leaves on a
    /// diagonal: a move with a spot crosses a side of the tile, never a corner.
    fn edge(plan: u8, orientation: u8, direction: u8) -> Array<u8> {
        let turns = turns(orientation);
        let mut edge: Array<u8> = array![];
        let mut area = 1_u8;
        while area <= AREA_COUNT {
            let row = area_row(plan, area);
            let moves: u32 = field(row, 7, 0xf).try_into().unwrap();
            let mut index = 0;
            while index < moves {
                let byte = small(field(row, 11 + 8 * index, 0xff));
                let spot = rotate_spot(byte / 16, turns);
                let leaves = rotate_direction(byte % 16, turns);
                if spot != 0 {
                    // Sides are the even codes: north 2, east 4, south 6, west 8
                    assert(leaves % 2 == 0, 'Tables: diagonal move');
                    if leaves == direction {
                        edge.append(area * 16 + spot);
                    }
                }
                index += 1;
            }
            area += 1;
        }
        edge
    }

    /// Returns the area of each spot 0..=9 of a tile `plan` facing `orientation`.
    fn area_map(plan: u8, orientation: u8) -> Array<u8> {
        let mut map: Array<u8> = array![];
        let mut spot = 0_u8;
        while spot <= 9 {
            map.append(area_at(plan, spot, orientation));
            spot += 1;
        }
        map
    }

    /// Returns whether one of the moves of `edge_back` (the moves of a tile that look back) lands
    /// on `area` of the other tile (given by its `map`) from `landing`.
    fn answered(edge_back: @Array<u8>, landing: u8, area: u8, map: @Array<u8>) -> bool {
        let mut found = false;
        let mut i = 0;
        while i < edge_back.len() {
            let entry = *edge_back.at(i);
            if entry / 16 == landing && *map.at((entry % 16).into()) == area {
                found = true;
                break;
            }
            i += 1;
        }
        found
    }

    /// Counts the asymmetric pairs between two tiles side by side: a move of one into an area of
    /// the other that the other does not answer with a move back into the first area. `out` holds
    /// the moves of a tile towards the other, `back` the moves of the other towards it, `map` the
    /// areas of each spot, `cats` the category of each area. Asserts that both ends of each
    /// answered pair have the same category: a structure never spans two categories.
    fn table_asymmetries(
        cats1: @Array<u8>,
        out1: @Array<u8>,
        map1: @Array<u8>,
        cats2: @Array<u8>,
        back2: @Array<u8>,
        map2: @Array<u8>,
    ) -> u32 {
        let mut count = 0;
        let mut i = 0;
        while i < out1.len() {
            let entry = *out1.at(i);
            let landing = *map2.at((entry % 16).into());
            if !answered(back2, landing, entry / 16, map1) {
                println!("asymmetric: first tile entry {} -> second tile area {}", entry, landing);
                count += 1;
            } else {
                assert_eq!(*cats1.at((entry / 16).into()), *cats2.at(landing.into()));
            }
            i += 1;
        }
        let mut i = 0;
        while i < back2.len() {
            let entry = *back2.at(i);
            let landing = *map1.at((entry % 16).into());
            if !answered(out1, landing, entry / 16, map2) {
                println!("asymmetric: second tile entry {} -> first tile area {}", entry, landing);
                count += 1;
            } else {
                assert_eq!(*cats2.at((entry / 16).into()), *cats1.at(landing.into()));
            }
            i += 1;
        }
        count
    }

    /// Counts the areas of the second tile whose number of moves with a spot towards the first
    /// tile differs from the number of moves of the first tile that land on that area (and the
    /// same the other way round). The structure state closes the half-edges of a neighbour from
    /// the moves of the new tile, so the two counts must be equal area by area.
    fn half_edge_mismatches(
        out1: @Array<u8>, map1: @Array<u8>, back2: @Array<u8>, map2: @Array<u8>,
    ) -> u32 {
        // An area with no move towards the other tile and a move landing on it is an asymmetric
        // pair already: only the areas that the moves leave from are counted here.
        let mut count = 0;
        let mut i = 0;
        while i < back2.len() {
            let area = *back2.at(i) / 16;
            if count_from(back2, area) != count_landing(out1, area, map2) {
                println!("half-edges: second tile area {}", area);
                count += 1;
            }
            i += 1;
        }
        let mut i = 0;
        while i < out1.len() {
            let area = *out1.at(i) / 16;
            if count_from(out1, area) != count_landing(back2, area, map1) {
                println!("half-edges: first tile area {}", area);
                count += 1;
            }
            i += 1;
        }
        count
    }

    /// Returns the number of moves of `edge` that leave from `area`.
    fn count_from(edge: @Array<u8>, area: u8) -> u32 {
        let mut count = 0;
        let mut i = 0;
        while i < edge.len() {
            if *edge.at(i) / 16 == area {
                count += 1;
            }
            i += 1;
        }
        count
    }

    /// Returns the number of moves of `edge` that land on `area` of the other tile.
    fn count_landing(edge: @Array<u8>, area: u8, map: @Array<u8>) -> u32 {
        let mut count = 0;
        let mut i = 0;
        while i < edge.len() {
            if *map.at((*edge.at(i) % 16).into()) == area {
                count += 1;
            }
            i += 1;
        }
        count
    }

    /// Returns the category of the spot of each plan and orientation that faces `side` (a direction
    /// code), at `(plan - 1) * 4 + orientation - 1`. A placement accepts two tiles side by side
    /// when the categories of the two spots that face each other are equal
    /// (`Layout::is_compatible`).
    fn facing_categories(side: u8) -> Array<u8> {
        let spot = side + 1;
        let mut categories: Array<u8> = array![];
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut orientation = 1_u8;
            while orientation <= 4 {
                categories.append(category(plan, area_at(plan, spot, orientation)));
                orientation += 1;
            }
            plan += 1;
        }
        categories
    }

    #[test]
    fn test_tables_compatibility_equals_the_layouts() {
        let mut layouts: Array<Layout> = array![];
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut orientation = 1_u8;
            while orientation <= 4 {
                layouts.append(TypesLayoutImpl::from(plan_of(plan), orientation_of(orientation)));
                orientation += 1;
            }
            plan += 1;
        }
        let mut sides = array![
            Direction::North, Direction::East, Direction::South, Direction::West,
        ];
        while let Option::Some(direction) = sides.pop_front() {
            let code: u8 = direction.into();
            let facing = facing_categories(code);
            let opposite_facing = facing_categories(opposite(code));
            let mut i1 = 0_u32;
            while i1 < layouts.len() {
                let mut i2 = 0_u32;
                while i2 < layouts.len() {
                    let expected = (*layouts.at(i1)).is_compatible(*layouts.at(i2), direction);
                    assert_eq!(*facing.at(i1) == *opposite_facing.at(i2), expected);
                    i2 += 1;
                }
                i1 += 1;
            }
        }
    }

    /// Runs the symmetry check of every pair of tiles that a placement accepts on one side, the
    /// first tile facing `o1`. Returns (accepted placements, asymmetric pairs).
    fn symmetry_on_side(direction: Direction, o1: u8) -> (u32, u32) {
        let code: u8 = direction.into();
        let facing = facing_categories(code);
        let opposite_facing = facing_categories(opposite(code));
        let mut maps: Array<Array<u8>> = array![];
        let mut outs: Array<Array<u8>> = array![];
        let mut backs: Array<Array<u8>> = array![];
        let mut cats: Array<Array<u8>> = array![];
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut row: Array<u8> = array![0];
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                row.append(category(plan, area));
                area += 1;
            }
            cats.append(row);
            let mut orientation = 1_u8;
            while orientation <= 4 {
                maps.append(area_map(plan, orientation));
                outs.append(edge(plan, orientation, code));
                backs.append(edge(plan, orientation, opposite(code)));
                orientation += 1;
            }
            plan += 1;
        }
        let mut accepted = 0;
        let mut asymmetric = 0;
        let mut p1 = 1_u8;
        while p1 <= PLAN_COUNT {
            let i1: u32 = ((p1 - 1) * 4 + o1 - 1).into();
            let mut p2 = 1_u8;
            while p2 <= PLAN_COUNT {
                let mut o2 = 1_u8;
                while o2 <= 4 {
                    let i2: u32 = ((p2 - 1) * 4 + o2 - 1).into();
                    // The check that `Tile::can_place` makes for each neighbour
                    if *facing.at(i1) == *opposite_facing.at(i2) {
                        accepted += 1;
                        asymmetric +=
                            table_asymmetries(
                                cats.at((p1 - 1).into()),
                                outs.at(i1),
                                maps.at(i1),
                                cats.at((p2 - 1).into()),
                                backs.at(i2),
                                maps.at(i2),
                            );
                        asymmetric +=
                            half_edge_mismatches(
                                outs.at(i1), maps.at(i1), backs.at(i2), maps.at(i2),
                            );
                    }
                    o2 += 1;
                }
                p2 += 1;
            }
            p1 += 1;
        }
        println!(
            "side {} facing {}: {} accepted placements, {} asymmetric pairs",
            code,
            o1,
            accepted,
            asymmetric,
        );
        (accepted, asymmetric)
    }

    /// Moves without a spot are the wonder's, and the wonder has only those, one per direction:
    /// the structure state counts them as half-edges that only ask for a tile.
    #[test]
    fn test_tables_spotless_moves_are_the_wonders() {
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                let is_wonder = category(plan, area) == category_code(Category::Wonder);
                let moves = move_count(plan, area);
                if is_wonder {
                    assert_eq!(moves, 8);
                    assert_eq!(area_at(plan, wonder(plan), 1), area);
                }
                let mut index = 0_u8;
                while index < moves {
                    assert_eq!(move_spot(plan, area, index, 1) == 0, is_wonder);
                    index += 1;
                }
                let mut direction = 1_u8;
                while is_wonder && direction <= 8 {
                    assert_eq!(half_edges(plan, area, direction, 1), 1);
                    direction += 1;
                }
                area += 1;
            }
            assert_eq!(half_edges(plan, 1, 9, 1), 0);
            plan += 1;
        }
    }

    /// The row readers of the hot path answer as the lookups by plan and area.
    #[test]
    fn test_tables_row_readers_equal_the_lookups() {
        let mut plan = 1_u8;
        while plan <= PLAN_COUNT {
            let mut area = 1_u8;
            while area <= AREA_COUNT {
                let row = area_row(plan, area);
                assert_eq!(row_category(row), category(plan, area));
                assert_eq!(row_record_index(row), record_index(plan, area));
                assert_eq!(row_move_count(row), move_count(plan, area));
                let mut orientation = 1_u8;
                while orientation <= 4 {
                    let mut moves = row_moves(row);
                    let mut index = 0_u8;
                    while index < row_move_count(row) {
                        let (direction, spot, rest) = next_move(moves, turns(orientation));
                        assert_eq!(direction, move_direction(plan, area, index, orientation));
                        assert_eq!(spot, move_spot(plan, area, index, orientation));
                        moves = rest;
                        index += 1;
                    }
                    assert_eq!(moves, 0);
                    orientation += 1;
                }
                area += 1;
            }
            plan += 1;
        }
    }

    fn assert_symmetric(direction: Direction, o1: u8) {
        let (accepted, asymmetric) = symmetry_on_side(direction, o1);
        assert(accepted > 0, 'Tables: no placement');
        assert_eq!(asymmetric, 0);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_north_facing_north() {
        assert_symmetric(Direction::North, 1);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_north_facing_east() {
        assert_symmetric(Direction::North, 2);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_north_facing_south() {
        assert_symmetric(Direction::North, 3);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_north_facing_west() {
        assert_symmetric(Direction::North, 4);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_east_facing_north() {
        assert_symmetric(Direction::East, 1);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_east_facing_east() {
        assert_symmetric(Direction::East, 2);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_east_facing_south() {
        assert_symmetric(Direction::East, 3);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_east_facing_west() {
        assert_symmetric(Direction::East, 4);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_south_facing_north() {
        assert_symmetric(Direction::South, 1);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_south_facing_east() {
        assert_symmetric(Direction::South, 2);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_south_facing_south() {
        assert_symmetric(Direction::South, 3);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_south_facing_west() {
        assert_symmetric(Direction::South, 4);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_west_facing_north() {
        assert_symmetric(Direction::West, 1);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_west_facing_east() {
        assert_symmetric(Direction::West, 2);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_west_facing_south() {
        assert_symmetric(Direction::West, 3);
    }

    #[test]
    fn test_tables_move_relation_is_symmetric_west_facing_west() {
        assert_symmetric(Direction::West, 4);
    }
}
