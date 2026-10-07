//! Oriented plan tables (phase P5, PR P5-4): the facts of `tables.cairo` with the rotation of each
//! orientation already applied, so that the hot path of a move reads rows and never rotates.
//! `tables.cairo` turns spots and directions with index arithmetic, which costs tens of thousands
//! of L2 gas per lookup; these rows give the same answers for a constant-shift read (measured in
//! P5-4, `docs/measures/baseline.md`). Generated from the rows of `tables.cairo` by a script that
//! is not part of the repository; the tests at the end compare every answer with `tables.cairo`.
//!
//! Oriented plan row (`u128`, low bits first), for a tile of `plan` placed with `orientation`:
//!
//! | Bits | Field |
//! |---|---|
//! | 0..36 | area of each spot 1..=9 of the placed tile (4 bits each) |
//! | 36..40 | number of start spots |
//! | 40..104 | start spots in `starts()` order, rotated: 8 bits each, the spot then its area x 16 |
//! | 104..108 | the wonder's area (0 for none) |
//!
//! Oriented area row (`u128`): the area row of `tables.cairo` (category, record index, move count,
//! moves) with the direction and the spot of each move rotated; the half-edge and adjacency fields
//! are left out (0). The row readers of `tables.cairo` (`row_category`, `row_record_index`,
//! `row_move_count`, `row_moves`) read it; a move is read with `next_move`.

/// Returns the oriented plan row (0 for no plan or no orientation).
pub fn plan_row(plan: u8, orientation: u8) -> u128 {
    match plan {
        1 => plan_row_1(orientation),
        2 => plan_row_2(orientation),
        3 => plan_row_3(orientation),
        4 => plan_row_4(orientation),
        5 => plan_row_5(orientation),
        6 => plan_row_6(orientation),
        7 => plan_row_7(orientation),
        8 => plan_row_8(orientation),
        9 => plan_row_9(orientation),
        10 => plan_row_10(orientation),
        11 => plan_row_11(orientation),
        12 => plan_row_12(orientation),
        13 => plan_row_13(orientation),
        14 => plan_row_14(orientation),
        15 => plan_row_15(orientation),
        16 => plan_row_16(orientation),
        17 => plan_row_17(orientation),
        18 => plan_row_18(orientation),
        19 => plan_row_19(orientation),
        _ => 0,
    }
}

/// Returns the areas of the plan that have moves, in area order: 4 bits each from the low bits,
/// ended by 0 (the areas a tile of this plan places on the structure state).
pub fn record_areas(plan: u8) -> u128 {
    match plan {
        1 => 0x1, // CCCCCCCCC
        2 => 0x21, // CCCCCFFFC
        3 => 0x4321, // CCCCCFRFC
        4 => 0x321, // CFFFCFFFC
        5 => 0x321, // FFCFFFCFF
        6 => 0x321, // FFCFFFFFC
        7 => 0x21, // FFFFCCCFF
        8 => 0x21, // FFFFFFCFF
        9 => 0x4321, // RFFFRFCFR
        10 => 0x321, // RFFFRFFFR
        11 => 0x4321, // RFRFCCCFR
        12 => 0x4321, // RFRFFFCFR
        13 => 0x321, // RFRFFFFFR
        14 => 0x4321, // RFRFRFCFF
        15 => 0x8765432, // SFRFRFCFR
        16 => 0x765432, // SFRFRFFFR
        17 => 0x98765432, // SFRFRFRFR
        18 => 0x21, // WFFFFFFFF
        19 => 0x321, // WFFFFFFFR
        _ => 0,
    }
}

/// Returns the oriented area row (`tables::ABSENT` when the plan has no such area).
pub fn area_row(plan: u8, orientation: u8, area: u8) -> u128 {
    match plan {
        1 => area_row_1(orientation, area),
        2 => area_row_2(orientation, area),
        3 => area_row_3(orientation, area),
        4 => area_row_4(orientation, area),
        5 => area_row_5(orientation, area),
        6 => area_row_6(orientation, area),
        7 => area_row_7(orientation, area),
        8 => area_row_8(orientation, area),
        9 => area_row_9(orientation, area),
        10 => area_row_10(orientation, area),
        11 => area_row_11(orientation, area),
        12 => area_row_12(orientation, area),
        13 => area_row_13(orientation, area),
        14 => area_row_14(orientation, area),
        15 => area_row_15(orientation, area),
        16 => area_row_16(orientation, area),
        17 => area_row_17(orientation, area),
        18 => area_row_18(orientation, area),
        19 => area_row_19(orientation, area),
        _ => 0x78,
    }
}

/// Oriented plan rows of `CCCCCCCCC`.
fn plan_row_1(orientation: u8) -> u128 {
    match orientation {
        1 => 0x111111111111,
        2 => 0x111111111111,
        3 => 0x111111111111,
        4 => 0x111111111111,
        _ => 0,
    }
}

/// Oriented area rows of `CCCCCCCCC`.
fn area_row_1(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c1b4a39203,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x392c1b4a203,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a392c1b203,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b4a392c203,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `CCCCCFFFC`.
fn plan_row_2(orientation: u8) -> u128 {
    match orientation {
        1 => 0x27112122211111,
        2 => 0x29112221111121,
        3 => 0x23112111112221,
        4 => 0x25112111222111,
        _ => 0,
    }
}

/// Oriented area rows of `CCCCCFFFC`.
fn area_row_2(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a39183,
            2 => 0x1b089,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b4a183,
            2 => 0x2c089,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c1b183,
            2 => 0x39089,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b392c183,
            2 => 0x4a089,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `CCCCCFRFC`.
fn plan_row_3(orientation: u8) -> u128 {
    match orientation {
        1 => 0x483726114143211111,
        2 => 0x423928114321111141,
        3 => 0x443322114111114321,
        4 => 0x463524114111432111,
        _ => 0,
    }
}

/// Oriented area rows of `CCCCCFRFC`.
fn area_row_3(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a39183,
            2 => 0x23089,
            3 => 0x1b092,
            4 => 0x13099,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b4a183,
            2 => 0x34089,
            3 => 0x2c092,
            4 => 0x24099,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c1b183,
            2 => 0x41089,
            3 => 0x39092,
            4 => 0x31099,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b392c183,
            2 => 0x12089,
            3 => 0x4a092,
            4 => 0x42099,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `CFFFCFFFC`.
fn plan_row_4(orientation: u8) -> u128 {
    match orientation {
        1 => 0x3723113133312221,
        2 => 0x3925113331222131,
        3 => 0x3327113122213331,
        4 => 0x3529113221333121,
        _ => 0,
    }
}

/// Oriented area rows of `CFFFCFFFC`.
fn area_row_4(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a103,
            2 => 0x39089,
            3 => 0x1b091,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b103,
            2 => 0x4a089,
            3 => 0x2c091,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c103,
            2 => 0x1b089,
            3 => 0x39091,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b39103,
            2 => 0x2c089,
            3 => 0x4a091,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `FFCFFFCFF`.
fn plan_row_5(orientation: u8) -> u128 {
    match orientation {
        1 => 0x3723113113111211,
        2 => 0x3925113311121111,
        3 => 0x3327113112111311,
        4 => 0x3529113211131111,
        _ => 0,
    }
}

/// Oriented area rows of `FFCFFFCFF`.
fn area_row_5(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a101,
            2 => 0x3908b,
            3 => 0x1b093,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b101,
            2 => 0x4a08b,
            3 => 0x2c093,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c101,
            2 => 0x1b08b,
            3 => 0x39093,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b39101,
            2 => 0x2c08b,
            3 => 0x4a093,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `FFCFFFFFC`.
fn plan_row_6(orientation: u8) -> u128 {
    match orientation {
        1 => 0x3923113311111211,
        2 => 0x3325113111121311,
        3 => 0x3527113112131111,
        4 => 0x3729113213111111,
        _ => 0,
    }
}

/// Oriented area rows of `FFCFFFFFC`.
fn area_row_6(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x1b4a101,
            2 => 0x3908b,
            3 => 0x2c093,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x2c1b101,
            2 => 0x4a08b,
            3 => 0x39093,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x392c101,
            2 => 0x1b08b,
            3 => 0x4a093,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x4a39101,
            2 => 0x2c08b,
            3 => 0x1b093,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `FFFFCCCFF`.
fn plan_row_7(orientation: u8) -> u128 {
    match orientation {
        1 => 0x26112112221111,
        2 => 0x28112222111111,
        3 => 0x22112211111221,
        4 => 0x24112111122211,
        _ => 0,
    }
}

/// Oriented area rows of `FFFFCCCFF`.
fn area_row_7(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c39101,
            2 => 0x1b4a10b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x394a101,
            2 => 0x2c1b10b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a1b101,
            2 => 0x392c10b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b2c101,
            2 => 0x4a3910b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `FFFFFFCFF`.
fn plan_row_8(orientation: u8) -> u128 {
    match orientation {
        1 => 0x27112112111111,
        2 => 0x29112211111111,
        3 => 0x23112111111211,
        4 => 0x25112111121111,
        _ => 0,
    }
}

/// Oriented area rows of `FFFFFFCFF`.
fn area_row_8(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a39181,
            2 => 0x1b08b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b4a181,
            2 => 0x2c08b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c1b181,
            2 => 0x3908b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b392c181,
            2 => 0x4a08b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFFFRFCFR`.
fn plan_row_9(orientation: u8) -> u128 {
    match orientation {
        1 => 0x473611234134312221,
        2 => 0x493811254431222131,
        3 => 0x433211274122213431,
        4 => 0x453411294221343121,
        _ => 0,
    }
}

/// Oriented area rows of `RFFFRFCFR`.
fn area_row_9(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a102,
            2 => 0x241239189,
            3 => 0x3442111,
            4 => 0x1b09b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b102,
            2 => 0x31234a189,
            3 => 0x4113111,
            4 => 0x2c09b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c102,
            2 => 0x42341b189,
            3 => 0x1224111,
            4 => 0x3909b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b39102,
            2 => 0x13412c189,
            3 => 0x2331111,
            4 => 0x4a09b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFFFRFFFR`.
fn plan_row_10(orientation: u8) -> u128 {
    match orientation {
        1 => 0x3711233133312221,
        2 => 0x3911253331222131,
        3 => 0x3311273122213331,
        4 => 0x3511293221333121,
        _ => 0,
    }
}

/// Oriented area rows of `RFFFRFFFR`.
fn area_row_10(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c4a102,
            2 => 0x241239189,
            3 => 0x34421b191,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x391b102,
            2 => 0x31234a189,
            3 => 0x41132c191,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a2c102,
            2 => 0x42341b189,
            3 => 0x122439191,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b39102,
            2 => 0x13412c189,
            3 => 0x23314a191,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFRFCCCFR`.
fn plan_row_11(orientation: u8) -> u128 {
    match orientation {
        1 => 0x463422114134443121,
        2 => 0x483624114444312131,
        3 => 0x423826114431213441,
        4 => 0x443228114121344431,
        _ => 0,
    }
}

/// Oriented area rows of `RFRFCCCFR`.
fn area_row_11(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c39102,
            2 => 0x2441109,
            3 => 0x3431111,
            4 => 0x1b4a11b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x394a102,
            2 => 0x3112109,
            3 => 0x4142111,
            4 => 0x2c1b11b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a1b102,
            2 => 0x4223109,
            3 => 0x1213111,
            4 => 0x392c11b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b2c102,
            2 => 0x1334109,
            3 => 0x2324111,
            4 => 0x4a3911b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFRFFFCFR`.
fn plan_row_12(orientation: u8) -> u128 {
    match orientation {
        1 => 0x473522114134333121,
        2 => 0x493724114433312131,
        3 => 0x433926114331213431,
        4 => 0x453328114121343331,
        _ => 0,
    }
}

/// Oriented area rows of `RFRFFFCFR`.
fn area_row_12(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c39102,
            2 => 0x2441109,
            3 => 0x344a31191,
            4 => 0x1b09b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x394a102,
            2 => 0x3112109,
            3 => 0x411b42191,
            4 => 0x2c09b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a1b102,
            2 => 0x4223109,
            3 => 0x122c13191,
            4 => 0x3909b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b2c102,
            2 => 0x1334109,
            3 => 0x233924191,
            4 => 0x4a09b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFRFFFFFR`.
fn plan_row_13(orientation: u8) -> u128 {
    match orientation {
        1 => 0x3522113133333121,
        2 => 0x3724113333312131,
        3 => 0x3926113331213331,
        4 => 0x3328113121333331,
        _ => 0,
    }
}

/// Oriented area rows of `RFRFFFFFR`.
fn area_row_13(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x2c39102,
            2 => 0x2441109,
            3 => 0x341b4a31211,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x394a102,
            2 => 0x3112109,
            3 => 0x412c1b42211,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x4a1b102,
            2 => 0x4223109,
            3 => 0x12392c13211,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x1b2c102,
            2 => 0x1334109,
            3 => 0x234a3924211,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `RFRFRFCFF`.
fn plan_row_14(orientation: u8) -> u128 {
    match orientation {
        1 => 0x473422114224213121,
        2 => 0x493624114421312221,
        3 => 0x433826114131222421,
        4 => 0x453228114122242131,
        _ => 0,
    }
}

/// Oriented area rows of `RFRFRFCFF`.
fn area_row_14(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x4a39102,
            2 => 0x2c4241189,
            3 => 0x1231111,
            4 => 0x1b09b,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x1b4a102,
            2 => 0x391312189,
            3 => 0x2342111,
            4 => 0x2c09b,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x2c1b102,
            2 => 0x4a2423189,
            3 => 0x3413111,
            4 => 0x3909b,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x392c102,
            2 => 0x1b3134189,
            3 => 0x4124111,
            4 => 0x4a09b,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `SFRFRFCFR`.
fn plan_row_15(orientation: u8) -> u128 {
    match orientation {
        1 => 0x897766554433227867654321,
        2 => 0x837968574635247765432861,
        3 => 0x857362594837267543286761,
        4 => 0x877564534239287328676541,
        _ => 0,
    }
}

/// Oriented area rows of `SFRFRFCFR`.
fn area_row_15(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x7c,
            2 => 0x2441101,
            3 => 0x3908a,
            4 => 0x1231111,
            5 => 0x4a09a,
            6 => 0x3442121,
            7 => 0x1b0ab,
            8 => 0x2c0b2,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x7c,
            2 => 0x3112101,
            3 => 0x4a08a,
            4 => 0x2342111,
            5 => 0x1b09a,
            6 => 0x4113121,
            7 => 0x2c0ab,
            8 => 0x390b2,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x7c,
            2 => 0x4223101,
            3 => 0x1b08a,
            4 => 0x3413111,
            5 => 0x2c09a,
            6 => 0x1224121,
            7 => 0x390ab,
            8 => 0x4a0b2,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x7c,
            2 => 0x1334101,
            3 => 0x2c08a,
            4 => 0x4124111,
            5 => 0x3909a,
            6 => 0x2331121,
            7 => 0x4a0ab,
            8 => 0x1b0b2,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `SFRFRFFFR`.
fn plan_row_16(orientation: u8) -> u128 {
    match orientation {
        1 => 0x7967554433226766654321,
        2 => 0x7369574635246665432761,
        3 => 0x7563594837266543276661,
        4 => 0x7765534239286327666541,
        _ => 0,
    }
}

/// Oriented area rows of `SFRFRFFFR`.
fn area_row_16(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x7c,
            2 => 0x2441101,
            3 => 0x3908a,
            4 => 0x1231111,
            5 => 0x4a09a,
            6 => 0x341b421a1,
            7 => 0x2c0aa,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x7c,
            2 => 0x3112101,
            3 => 0x4a08a,
            4 => 0x2342111,
            5 => 0x1b09a,
            6 => 0x412c131a1,
            7 => 0x390aa,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x7c,
            2 => 0x4223101,
            3 => 0x1b08a,
            4 => 0x3413111,
            5 => 0x2c09a,
            6 => 0x1239241a1,
            7 => 0x4a0aa,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x7c,
            2 => 0x1334101,
            3 => 0x2c08a,
            4 => 0x4124111,
            5 => 0x3909a,
            6 => 0x234a311a1,
            7 => 0x1b0aa,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `SFRFRFRFR`.
fn plan_row_17(orientation: u8) -> u128 {
    match orientation {
        1 => 0x99887766554433228987654321,
        2 => 0x93827968574635248765432981,
        3 => 0x95847362594837268543298761,
        4 => 0x97867564534239288329876541,
        _ => 0,
    }
}

/// Oriented area rows of `SFRFRFRFR`.
fn area_row_17(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x7c,
            2 => 0x2441101,
            3 => 0x3908a,
            4 => 0x1231111,
            5 => 0x4a09a,
            6 => 0x2342121,
            7 => 0x1b0aa,
            8 => 0x3413131,
            9 => 0x2c0ba,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x7c,
            2 => 0x3112101,
            3 => 0x4a08a,
            4 => 0x2342111,
            5 => 0x1b09a,
            6 => 0x3413121,
            7 => 0x2c0aa,
            8 => 0x4124131,
            9 => 0x390ba,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x7c,
            2 => 0x4223101,
            3 => 0x1b08a,
            4 => 0x3413111,
            5 => 0x2c09a,
            6 => 0x4124121,
            7 => 0x390aa,
            8 => 0x1231131,
            9 => 0x4a0ba,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x7c,
            2 => 0x1334101,
            3 => 0x2c08a,
            4 => 0x4124111,
            5 => 0x3909a,
            6 => 0x1231121,
            7 => 0x4a0aa,
            8 => 0x2342131,
            9 => 0x1b0ba,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `WFFFFFFFF`.
fn plan_row_18(orientation: u8) -> u128 {
    match orientation {
        1 => 0x100000000000023112222222221,
        2 => 0x100000000000025112222222221,
        3 => 0x100000000000027112222222221,
        4 => 0x100000000000029112222222221,
        _ => 0,
    }
}

/// Oriented area rows of `WFFFFFFFF`.
fn area_row_18(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x403830282018100c05,
            2 => 0x2c1b4a39209,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x100840383028201c05,
            2 => 0x392c1b4a209,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x201810084038302c05,
            2 => 0x4a392c1b209,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x302820181008403c05,
            2 => 0x1b4a392c209,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Oriented plan rows of `WFFFFFFFR`.
fn plan_row_19(orientation: u8) -> u128 {
    match orientation {
        1 => 0x100000000003923113322222221,
        2 => 0x100000000003325113222222321,
        3 => 0x100000000003527113222232221,
        4 => 0x100000000003729113223222221,
        _ => 0,
    }
}

/// Oriented area rows of `WFFFFFFFR`.
fn area_row_19(orientation: u8, area: u8) -> u128 {
    match orientation {
        1 => match area {
            1 => 0x403830282018100c05,
            2 => 0x34241b4a39289,
            3 => 0x2c092,
            _ => 0x78,
        },
        2 => match area {
            1 => 0x100840383028201c05,
            2 => 0x41312c1b4a289,
            3 => 0x39092,
            _ => 0x78,
        },
        3 => match area {
            1 => 0x201810084038302c05,
            2 => 0x1242392c1b289,
            3 => 0x4a092,
            _ => 0x78,
        },
        4 => match area {
            1 => 0x302820181008403c05,
            2 => 0x23134a392c289,
            3 => 0x1b092,
            _ => 0x78,
        },
        _ => 0x78,
    }
}

/// Returns the wonder's area of a plan (0 for none): the same in every orientation.
#[inline]
pub fn wonder_area(plan: u8) -> u8 {
    match plan {
        18 => 1, // WFFFFFFFF
        19 => 1, // WFFFFFFFR
        _ => 0,
    }
}
// Readers

/// Returns the area of `spot` (1..=9) from an oriented plan row (0 for no spot).
#[inline(always)]
pub fn area_of(row: u128, spot: u8) -> u8 {
    let area = match spot {
        0 => 0,
        1 => row & 0xf,
        2 => (row / 0x10) & 0xf,
        3 => (row / 0x100) & 0xf,
        4 => (row / 0x1000) & 0xf,
        5 => (row / 0x10000) & 0xf,
        6 => (row / 0x100000) & 0xf,
        7 => (row / 0x1000000) & 0xf,
        8 => (row / 0x10000000) & 0xf,
        9 => (row / 0x100000000) & 0xf,
        _ => 0,
    };
    area.try_into().unwrap()
}

/// Returns the number of start spots of an oriented plan row.
#[inline(always)]
pub fn start_count(row: u128) -> u8 {
    ((row / 0x1000000000) & 0xf).try_into().unwrap()
}

/// Returns the start spots of an oriented plan row, one byte each from the low bits (the spot,
/// then its area x 16).
#[inline(always)]
pub fn starts(row: u128) -> u128 {
    (row / 0x10000000000) & 0xffffffffffffffff
}

/// Takes the first start of `starts` (as `starts` gives them): returns its spot, its area and the
/// starts left.
#[inline(always)]
pub fn next_start(starts: u128) -> (u8, u8, u128) {
    let byte: u8 = (starts & 0xff).try_into().unwrap();
    (byte & 0xf, byte / 0x10, starts / 0x100)
}

/// Takes the first move of `moves` (the moves of an oriented area row, `tables::row_moves`):
/// returns its direction, its spot (0 for a wonder's half-edge) and the moves left.
#[inline(always)]
pub fn next_move(moves: u128) -> (u8, u8, u128) {
    let byte: u8 = (moves & 0xff).try_into().unwrap();
    (byte & 0xf, byte / 0x10, moves / 0x100)
}

#[cfg(test)]
mod tests {
    use paved::structure::tables;
    use super::{
        area_of, area_row, next_move, next_start, plan_row, record_areas, start_count, starts,
        wonder_area,
    };

    /// Every answer of the oriented rows equals the one of `tables.cairo` rotated by its index
    /// arithmetic, for every plan, orientation, spot, start, area and move.
    #[test]
    fn test_oriented_rows_equal_the_tables() {
        let mut plan: u8 = 1;
        while plan <= tables::PLAN_COUNT {
            assert_eq!(wonder_area(plan), tables::area_at(plan, tables::wonder(plan), 1));
            // Areas with moves, in area order
            let mut areas = record_areas(plan);
            let mut area: u8 = 1;
            while area <= tables::AREA_COUNT {
                if tables::record_index(plan, area) != tables::NO_RECORD {
                    let next: u8 = (areas & 0xf).try_into().unwrap();
                    assert_eq!(next, area);
                    areas = areas / 0x10;
                }
                area += 1;
            }
            assert_eq!(areas, 0);
            let mut orientation: u8 = 1;
            while orientation <= 4 {
                let row = plan_row(plan, orientation);
                let mut spot: u8 = 0;
                while spot <= 9 {
                    assert_eq!(area_of(row, spot), tables::area_at(plan, spot, orientation));
                    spot += 1;
                }
                assert_eq!(start_count(row), tables::start_count(plan));
                let mut list = starts(row);
                let mut index: u8 = 0;
                while index < start_count(row) {
                    let (spot, area, rest) = next_start(list);
                    assert_eq!(spot, tables::start(plan, index, orientation));
                    assert_eq!(area, tables::area_at(plan, spot, orientation));
                    list = rest;
                    index += 1;
                }
                assert_eq!(list, 0);
                let mut area: u8 = 1;
                while area <= tables::AREA_COUNT {
                    let oriented = area_row(plan, orientation, area);
                    let north = tables::area_row(plan, area);
                    assert_eq!(tables::row_category(oriented), tables::row_category(north));
                    assert_eq!(tables::row_record_index(oriented), tables::row_record_index(north));
                    assert_eq!(tables::row_move_count(oriented), tables::row_move_count(north));
                    let mut moves = tables::row_moves(oriented);
                    let mut index: u8 = 0;
                    while index < tables::row_move_count(oriented) {
                        let (direction, spot, rest) = next_move(moves);
                        assert_eq!(
                            direction, tables::move_direction(plan, area, index, orientation),
                        );
                        assert_eq!(spot, tables::move_spot(plan, area, index, orientation));
                        moves = rest;
                        index += 1;
                    }
                    assert_eq!(moves, 0);
                    area += 1;
                }
                orientation += 1;
            }
            plan += 1;
        }
        assert_eq!(plan_row(0, 1), 0);
        assert_eq!(plan_row(1, 0), 0);
        assert_eq!(area_row(20, 1, 1), tables::ABSENT);
    }
}
