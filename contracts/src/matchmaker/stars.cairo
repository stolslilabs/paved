//! The stars of an attack (#643, `docs/architecture/pvp-attacks.md`, section 7): shares of the
//! defender's village score at the attack's start. Pure, as `paved::matchmaker::crowns` holds the
//! crown curves.
//!
//! The thresholds are the measured 70 / 85 / 110 % (#637, open point 1; the note's proposal, built
//! while the owner rules): an amendment, for example the first guess of 80 / 90 / 100 %, is a
//! change of the three constants below.

/// The share of the target, in percent, that earns 1, 2 and 3 stars.
pub const ONE_STAR_PERCENT: u64 = 70;
pub const TWO_STARS_PERCENT: u64 = 85;
pub const THREE_STARS_PERCENT: u64 = 110;

/// The stars of `score` against `target`, the village's score at the start: 3 from
/// `THREE_STARS_PERCENT` of it, 2 from `TWO_STARS_PERCENT`, 1 from `ONE_STAR_PERCENT`, else 0. A
/// score of 0 earns no star, whatever the target (an attack that only discards wins nothing).
pub fn stars_of(score: u32, target: u32) -> u8 {
    if score == 0 {
        return 0;
    }
    let reached: u64 = score.into() * 100;
    let target: u64 = target.into();
    if reached >= target * THREE_STARS_PERCENT {
        3
    } else if reached >= target * TWO_STARS_PERCENT {
        2
    } else if reached >= target * ONE_STAR_PERCENT {
        1
    } else {
        0
    }
}
