//! Golden game of the Tutorial mode: the full scripted sequence, to its end.
//!
//! The tutorial places every tile by itself (`Deck::Tutorial` parameters), so the data is the plan
//! held before each step, whether the step builds or discards, and the score expected after it.
//! D-18b: the script lost its roles and spots (D-18), and the expected scores were derived from
//! the oracle's walks (`oracle::score`, a record run), not from the structure state; the replay
//! checks every build against the walks. The final score matches the one pinned by
//! `test_tutorial_e2e_scripted_run_is_deterministic`.

use paved::tests::golden::harness::{GoldenOutcome, TutorialStep, play_tutorial};
use paved::types::plan::Plan;

fn step(plan: Plan, discard: bool, score: u32) -> TutorialStep {
    TutorialStep { plan, discard, score }
}

#[test]
#[available_gas(l2_gas: 759630000)]
fn test_golden_tutorial_full_sequence() {
    let steps = array![
        step(Plan::SFRFRFCFR, false, 0), step(Plan::CFFFCFFFC, false, 0),
        step(Plan::FFCFFFFFC, false, 643), step(Plan::WFFFFFFFR, false, 643),
        step(Plan::RFRFFFCFR, false, 1062), step(Plan::RFRFFFFFR, false, 1062),
        step(Plan::RFFFRFFFR, false, 1062), step(Plan::CCCCCCCCC, true, 1012),
        step(Plan::SFRFRFFFR, false, 2794),
    ];
    play_tutorial(
        'tutorial_full',
        steps.span(),
        GoldenOutcome {
            score: 2794,
            built: 8,
            discarded: 1,
            tile_count: 10,
            over: true,
            top1_score: 0,
        },
    );
}
