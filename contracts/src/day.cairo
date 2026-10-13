//! The day id (D-20): `time / duration`, the day a Daily game is spawned in and counts for. It
//! keys the daily seed (`Mode::seed`), `GameSpawned.day_id`, `GameOver.day_id` and
//! `current_day()`. It reads no storage. Was `TournamentImpl::compute_id` before D-20.

#[inline]
pub fn day_id(time: u64, duration: u64) -> u64 {
    time / duration
}
