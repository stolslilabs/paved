//! Golden game of the Tutorial mode: the full scripted sequence, to its end.
//!
//! The tutorial places every tile by itself (`Deck::Tutorial` parameters), so the data is the plan
//! held before each step, whether the step builds or discards, and the score expected after it.
//! The expected values were recorded by running the code of the commit that introduced this file;
//! the final score matches the one pinned by `test_tutorial_e2e_scripted_run_is_deterministic`.

use paved::tests::golden::harness::{GoldenOutcome, TutorialStep, play_tutorial};
use paved::types::plan::Plan;

fn step(plan: Plan, discard: bool, score: u32) -> TutorialStep {
    TutorialStep { plan, discard, score }
}

#[test]
#[available_gas(l2_gas: 1325191842)]
fn test_golden_tutorial_full_sequence() {
    let steps = array![
        step(Plan::SFRFRFCFR, false, 0), step(Plan::CFFFCFFFC, false, 0),
        step(Plan::FFCFFFFFC, false, 1286), step(Plan::WFFFFFFFR, false, 1286),
        step(Plan::RFRFFFCFR, false, 2124), step(Plan::RFRFFFFFR, false, 2124),
        step(Plan::RFFFRFFFR, false, 2124), step(Plan::CCCCCCCCC, true, 2074),
        step(Plan::SFRFRFFFR, false, 5078),
    ];
    play_tutorial(
        'tutorial_full',
        steps.span(),
        GoldenOutcome { score: 5078, built: 8, discarded: 1, tile_count: 10, over: true },
    );
}
