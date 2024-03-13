// Internal imports

use stolsli::constants;

#[generate_trait]
impl TournamentImpl of TournamentTrait {
    #[inline(always)]
    fn compute_id(time: u64) -> u64 {
        time / constants::TOURNAMENT_DURATION
    }
}


#[cfg(test)]
mod tests {
    // Local imports

    use super::TournamentImpl;

    #[test]
    fn test_compute_id_zero() {
        let id = TournamentImpl::compute_id(0);
        assert(0 == id, 'Tournament: wrong id');
    }

    #[test]
    fn test_compute_id_today() {
        let time = 1710347593;
        let id = TournamentImpl::compute_id(time);
        assert(2827 == id, 'Tournament: wrong id');
    }
}

