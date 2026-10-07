//! What a finished game reports to the quests and the achievements (`docs/architecture/quests.md`,
//! P7): the tally taken from the game at game over, and the entries built from it.
//!
//! Every task id is a constant: non-zero, distinct (also modulo 128), and at most 8 entries are
//! built (4 for the quests, 6 for the achievements), against the 16 of the package. Those are the
//! only two ways `progress_many` can revert in event mode (ruling P-23, quiver 0.2.0 @ 2e6bb77),
//! and both are decided by the array built here, so a game over cannot fail because of quests: the
//! unit tests below prove the bounds on every shape of report. The list of the accepted quests and
//! achievements is `list`.

use paved::constants;
use paved::models::game::{Game, GameImpl};
use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_quest::types::batch::TaskProgress as QuestProgress;

/// What a Daily game over reports, from the game and the rank it took in its tournament.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Tally {
    pub player_id: felt252,
    pub score: u32,
    /// 1 to 3 when the game took a place in its tournament, 0 otherwise (not placed, or ended
    /// after its tournament closed).
    pub rank: u8,
    pub structures: u8,
    pub forests: u8,
    pub wonders: u8,
    pub big: u8,
}

/// Marks an encoded tally: a move that does not end the game returns 0.
const OVER: u128 = 0x80000000000000000000000000000000;

/// The tally of a game that is over, in one `u128` (a move that does not end the game returns 0,
/// which costs nothing next to an `Option` of a struct): score (32 bits), rank, structures,
/// forests, wonders and big (8 bits each), and the `OVER` flag. The counters are clamped to the
/// widths of their `GameState` bits.
pub fn encode(game: Game, rank: u8) -> u128 {
    let t = tally(game, 0, rank);
    OVER
        + t.score.into()
        + t.rank.into() * 0x100000000
        + t.structures.into() * 0x10000000000
        + t.forests.into() * 0x1000000000000
        + t.wonders.into() * 0x100000000000000
        + t.big.into() * 0x10000000000000000
}

/// The tally of an encoded game over (a non-zero word), for `player_id`.
pub fn decode(word: u128, player_id: felt252) -> Tally {
    let low: u128 = word - OVER;
    Tally {
        player_id,
        score: (low & 0xffffffff).try_into().unwrap(),
        rank: ((low / 0x100000000) & 0xff).try_into().unwrap(),
        structures: ((low / 0x10000000000) & 0xff).try_into().unwrap(),
        forests: ((low / 0x1000000000000) & 0xff).try_into().unwrap(),
        wonders: ((low / 0x100000000000000) & 0xff).try_into().unwrap(),
        big: ((low / 0x10000000000000000) & 0xff).try_into().unwrap(),
    }
}

/// The tally of a game that is over. The counters are clamped to the widths of their `GameState`
/// bits, whatever the game holds.
pub fn tally(game: Game, player_id: felt252, rank: u8) -> Tally {
    Tally {
        player_id,
        score: game.score,
        rank,
        structures: game.structures(),
        forests: game.forests(),
        wonders: game.wonders(),
        big: game.big(),
    }
}

/// The non-zero `(task id, count)` pairs the quests count, in task order: tasks 1 to 4. A zero
/// count is dropped, not reported.
pub fn quest_counts(tally: Tally) -> Array<(u32, u32)> {
    let mut counts: Array<(u32, u32)> = array![];
    counts.append((constants::TASK_GAME_FINISHED, 1));
    push(ref counts, constants::TASK_STRUCTURE_SCORED, tally.structures.into());
    push(ref counts, constants::TASK_POINTS, tally.score);
    push(ref counts, constants::TASK_FOREST_SCORED, tally.forests.into());
    counts
}

/// The non-zero `(task id, count)` pairs the achievements count, in task order: tasks 1, 4, 5, 6,
/// 7 and 9 (task 8, the podium, is credited by the indexer).
pub fn achievement_counts(tally: Tally) -> Array<(u32, u32)> {
    let mut counts: Array<(u32, u32)> = array![];
    counts.append((constants::TASK_GAME_FINISHED, 1));
    push(ref counts, constants::TASK_FOREST_SCORED, tally.forests.into());
    push(ref counts, constants::TASK_WONDER_SCORED, tally.wonders.into());
    push(ref counts, constants::TASK_BIG_STRUCTURE, tally.big.into());
    if tally.score >= constants::HIGH_SCORE {
        counts.append((constants::TASK_HIGH_SCORE, 1));
    }
    if tally.rank == 1 {
        counts.append((constants::TASK_WIN, 1));
    }
    counts
}

#[inline(always)]
fn push(ref counts: Array<(u32, u32)>, task_id: u32, count: u32) {
    if count != 0 {
        counts.append((task_id, count));
    }
}

/// The entries of the quests' `progress_many`.
pub fn quest_entries(tally: Tally) -> Array<QuestProgress> {
    let mut entries: Array<QuestProgress> = array![];
    let mut counts = quest_counts(tally).span();
    while let Option::Some((task_id, count)) = counts.pop_front() {
        entries.append(QuestProgress { task_id: *task_id, count: *count });
    }
    entries
}

/// The entries of the achievements' `progress_many`.
pub fn achievement_entries(tally: Tally) -> Array<AchievementProgress> {
    let mut entries: Array<AchievementProgress> = array![];
    let mut counts = achievement_counts(tally).span();
    while let Option::Some((task_id, count)) = counts.pop_front() {
        entries.append(AchievementProgress { task_id: *task_id, count: *count });
    }
    entries
}

#[cfg(test)]
mod tests {
    use paved::constants;
    use super::{Tally, achievement_counts, achievement_entries, quest_counts, quest_entries};

    fn tally(score: u32, rank: u8, n: u8, f: u8, w: u8, b: u8) -> Tally {
        Tally { player_id: 'PLAYER', score, rank, structures: n, forests: f, wonders: w, big: b }
    }

    /// The bounds that decide whether `progress_many` can revert (P-23): at most 16 entries, no
    /// task id 0, ids distinct modulo 128 (the one-pass merge). Checked on one list.
    fn assert_list(counts: Array<(u32, u32)>, most: u32) {
        let mut counts = counts.span();
        assert!(counts.len() <= most, "report above its list");
        assert!(counts.len() <= 16, "report above the package bound");
        assert!(counts.len() >= 1, "game finished is always reported");
        let mut seen: u128 = 0;
        while let Option::Some((task_id, count)) = counts.pop_front() {
            assert!(*task_id != 0, "task id 0");
            assert!(*count != 0, "zero count");
            let (_, index) = DivRem::div_rem(*task_id, 128_u32.try_into().unwrap());
            let mut bit: u128 = 1;
            let mut i = 0;
            while i < index {
                bit *= 2;
                i += 1;
            }
            assert!(seen & bit == 0, "task id repeated modulo 128");
            seen = seen | bit;
        }
    }

    /// Both lists of a report, and the entries built from them.
    fn assert_bounds(report: Tally) {
        assert_list(quest_counts(report), constants::QUEST_ENTRIES);
        assert_list(achievement_counts(report), constants::ACHIEVEMENT_ENTRIES);
        assert_eq!(quest_entries(report).len(), quest_counts(report).len());
        assert_eq!(achievement_entries(report).len(), achievement_counts(report).len());
    }

    /// Every shape a closing move can produce: each rank, scores around the thresholds, every
    /// counter at zero, at one and at its maximum.
    #[test]
    #[available_gas(l2_gas: 143782418)]
    fn test_report_bounds_on_every_shape() {
        let scores = array![0, 1, constants::HIGH_SCORE - 1, constants::HIGH_SCORE, 0xffffffff];
        let ranks = array![0_u8, 1, 2, 3];
        let counters = array![0_u8, 1, 15];
        let mut s = scores.span();
        while let Option::Some(score) = s.pop_front() {
            let mut r = ranks.span();
            while let Option::Some(rank) = r.pop_front() {
                let mut a = counters.span();
                while let Option::Some(n) = a.pop_front() {
                    let mut b = counters.span();
                    while let Option::Some(f) = b.pop_front() {
                        assert_bounds(tally(*score, *rank, *n, *f, *n, *f));
                    }
                }
            }
        }
        // Every counter at the maximum of its width
        assert_bounds(
            tally(
                0xffffffff,
                1,
                constants::MAX_STRUCTURES,
                constants::MAX_FORESTS,
                constants::MAX_WONDERS,
                constants::MAX_BIG,
            ),
        );
    }

    /// The largest reports are 4 entries for the quests and 6 for the achievements, and a report
    /// with every count zero is the single entry of the finished game.
    #[test]
    #[available_gas(l2_gas: 94416)]
    fn test_report_extremes() {
        let most = tally(0xffffffff, 1, 127, 63, 15, 63);
        assert_eq!(quest_counts(most).len(), 4);
        assert_eq!(achievement_counts(most).len(), 6);
        let least = tally(0, 0, 0, 0, 0, 0);
        assert_eq!(quest_counts(least).len(), 1);
        assert_eq!(achievement_counts(least).len(), 1);
    }

    /// The task ids are the ones of the design and distinct.
    #[test]
    #[available_gas(l2_gas: 42063)]
    fn test_task_ids() {
        assert_eq!(constants::TASK_GAME_FINISHED, 1);
        assert_eq!(constants::TASK_STRUCTURE_SCORED, 2);
        assert_eq!(constants::TASK_POINTS, 3);
        assert_eq!(constants::TASK_FOREST_SCORED, 4);
        assert_eq!(constants::TASK_WONDER_SCORED, 5);
        assert_eq!(constants::TASK_BIG_STRUCTURE, 6);
        assert_eq!(constants::TASK_HIGH_SCORE, 7);
        assert_eq!(constants::TASK_PODIUM, 8);
        assert_eq!(constants::TASK_WIN, 9);
        assert_eq!(constants::TASK_TUTORIAL_FINISHED, 10);
    }
}
